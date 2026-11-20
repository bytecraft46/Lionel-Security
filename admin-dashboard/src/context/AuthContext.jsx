import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearSession,
  fetchMe,
  getAccessToken,
  getStoredUser,
  login as loginRequest,
  logout as logoutRequest,
} from '../lib/http';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [booting, setBooting] = useState(() => Boolean(getAccessToken()));
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getAccessToken()) {
        setBooting(false);
        return;
      }
      try {
        const me = await fetchMe();
        if (active) setUser(me);
      } catch {
        clearSession();
        if (active) setUser(null);
      } finally {
        if (active) setBooting(false);
      }
    }
    restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onForcedLogout(event) {
      disconnectSocket();
      setUser(null);
      setNotice(
        event.detail === 'expired' ? 'Your session expired. Please sign in again.' : null,
      );
    }
    window.addEventListener('lionel:logout', onForcedLogout);
    return () => window.removeEventListener('lionel:logout', onForcedLogout);
  }, []);

  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
    return () => {
      /* socket lifecycle is managed explicitly on sign-out */
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      booting,
      notice,
      clearNotice: () => setNotice(null),
      async signIn(identifier, password) {
        const data = await loginRequest(identifier, password);
        connectSocket();
        setUser(data.user);
        return data.user;
      },
      async signOut() {
        await logoutRequest();
        disconnectSocket();
        setUser(null);
      },
    }),
    [user, booting, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
