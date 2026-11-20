import { API_BASE_URL, STORAGE_KEYS } from '../config/api';

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function getAccessToken() {
  return localStorage.getItem(STORAGE_KEYS.access);
}

export function getRefreshToken() {
  return localStorage.getItem(STORAGE_KEYS.refresh);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession({ access_token, refresh_token, user }) {
  if (access_token) localStorage.setItem(STORAGE_KEYS.access, access_token);
  if (refresh_token) localStorage.setItem(STORAGE_KEYS.refresh, refresh_token);
  if (user) localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.access);
  localStorage.removeItem(STORAGE_KEYS.refresh);
  localStorage.removeItem(STORAGE_KEYS.user);
}

function notifyLogout(reason) {
  clearSession();
  window.dispatchEvent(new CustomEvent('lionel:logout', { detail: reason }));
}

let refreshInFlight = null;

async function refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError('Session expired.', 401);
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) throw new ApiError('Session expired.', response.status);
        const data = await response.json();
        storeSession(data);
        window.dispatchEvent(new CustomEvent('lionel:token-refreshed'));
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function api(path, options = {}) {
  const { method = 'GET', body, isForm = false, retry = true, signal } = options;
  const headers = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      signal,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the operations API.', 0);
  }

  const isAuthEndpoint = path.startsWith('/api/auth/');
  if (response.status === 401 && retry && !isAuthEndpoint && getRefreshToken()) {
    try {
      await refreshTokens();
      return api(path, { ...options, retry: false });
    } catch {
      notifyLogout('expired');
      throw new ApiError('Session expired. Please sign in again.', 401);
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !isAuthEndpoint) notifyLogout('expired');
    const message =
      (payload && typeof payload === 'object' && payload.error) ||
      (typeof payload === 'string' && payload) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

export async function downloadFile(path, filename) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError('Download failed.', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function login(identifier, password) {
  // A stale session must not turn a bad password into "session expired".
  clearSession();
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
    retry: false,
  });
  storeSession(data);
  return data;
}

export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    await api('/api/auth/logout', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
  } catch {
    /* sign-out locally regardless of server state */
  }
  clearSession();
}

export async function fetchMe() {
  const data = await api('/api/auth/me');
  storeSession({ user: data.user });
  return data.user;
}
