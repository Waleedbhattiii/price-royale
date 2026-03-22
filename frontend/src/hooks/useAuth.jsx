import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, connectSocket, disconnectSocket } from '../lib/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('pr_token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(({ user }) => { setUser(user); connectSocket(token); })
      .catch(() => { localStorage.removeItem('pr_token'); })
      .finally(() => setLoading(false));
  }, []);

  // Handle Discord OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Check both param names for compatibility
    const token = params.get('discord_token') || params.get('token');
    if (!token) return;
    localStorage.setItem('pr_token', token);
    authApi.me().then(({ user }) => {
      setUser(user);
      connectSocket(token);
      window.history.replaceState({}, '', '/');
      setLoading(false);
    }).catch(() => {
      localStorage.removeItem('pr_token');
      window.history.replaceState({}, '', '/');
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (credentials) => {
    const { token, user } = await authApi.login(credentials);
    localStorage.setItem('pr_token', token);
    setUser(user);
    connectSocket(token);
    return user;
  }, []);

  const register = useCallback(async (data) => {
    const { token, user } = await authApi.register(data);
    localStorage.setItem('pr_token', token);
    setUser(user);
    connectSocket(token);
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pr_token');
    setUser(null);
    disconnectSocket();
  }, []);

  const loginAsGuest = useCallback((guestName) => {
    connectSocket(null, guestName);
    setUser({ id: null, displayName: guestName, isGuest: true, stats: {}, badges: [], gameHistory: [] });
  }, []);

  // Refresh user data from server (e.g. after a game ends to get updated stats)
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('pr_token');
    if (!token) return;
    try {
      const { user } = await authApi.me();
      setUser(user);
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginAsGuest, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
