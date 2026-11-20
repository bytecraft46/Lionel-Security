import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import { getAccessToken } from './http';

let socket = null;

// Module-level registries: components subscribe before the socket exists and
// still receive every event once connectSocket() creates it.
const handlers = new Map();
const statusSubscribers = new Set();

function dispatch(event, payload) {
  handlers.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch {
      /* a broken subscriber must not break the rest */
    }
  });
}

function notifyStatus(connected) {
  statusSubscribers.forEach((handler) => {
    try {
      handler(connected);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function connectSocket() {
  const token = getAccessToken();
  if (!token) return null;
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
  });
  socket.onAny((event, payload) => dispatch(event, payload));
  socket.on('connect', () => notifyStatus(true));
  socket.on('disconnect', () => notifyStatus(false));
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  notifyStatus(false);
}

export function getSocket() {
  return socket;
}

/** Keep the socket handshake token in step with a rotated access token. */
export function refreshSocketAuth() {
  if (!socket) return;
  socket.auth = { token: getAccessToken() };
}

if (typeof window !== 'undefined') {
  window.addEventListener('lionel:token-refreshed', refreshSocketAuth);
}

/** Subscribe to a server event without stale-closure re-subscription churn. */
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (payload) => handlerRef.current?.(payload);
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(listener);
    return () => {
      const listeners = handlers.get(event);
      if (!listeners) return;
      listeners.delete(listener);
      if (!listeners.size) handlers.delete(event);
    };
  }, [event]);
}

export function useSocketStatus(onStatus) {
  const handlerRef = useRef(onStatus);
  handlerRef.current = onStatus;
  useEffect(() => {
    const listener = (connected) => handlerRef.current?.(connected);
    statusSubscribers.add(listener);
    listener(Boolean(socket?.connected));
    return () => statusSubscribers.delete(listener);
  }, []);
}
