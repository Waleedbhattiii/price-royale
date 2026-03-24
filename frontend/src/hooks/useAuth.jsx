import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, connectSocket, disconnectSocket, getSocket } from '../lib/client.js';

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

  // For guests — keep user.id in sync with socket.id
  // Server assigns guest ID as `guest_${socket.id}` so we must match it
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const syncGuestId = () => {
      setUser(prev => {
        if (!prev?.isGuest) return prev;
        const newId = `guest_${socket.id}`;
        if (prev.id === newId) return prev; // no change needed
        return { ...prev, id: newId };
      });
    };

    socket.on('connect', syncGuestId);
    return () => socket.off('connect', syncGuestId);
  }, [user?.isGuest]);

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
    const socket = connectSocket(null, guestName);

    // Set user immediately with null ID — UI renders right away
    setUser({ id: null, displayName: guestName, isGuest: true, stats: {}, badges: [], gameHistory: [] });

    // Once socket connects, update ID to match server's guest_${socket.id}
    const onConnect = () => {
      setUser({ id: `guest_${socket.id}`, displayName: guestName, isGuest: true, stats: {}, badges: [], gameHistory: [] });
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.once('connect', onConnect);
    }
  }, []);

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
