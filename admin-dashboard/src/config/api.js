const DEFAULT_ORIGIN = 'http://localhost:5015';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_ORIGIN
).replace(/\/$/, '');

export const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL || API_BASE_URL
).replace(/\/$/, '');

export const STORAGE_KEYS = {
  access: 'lionel_access_token',
  refresh: 'lionel_refresh_token',
  user: 'lionel_user',
};
