import { io } from 'socket.io-client';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Axios client ─────────────────────────────────────────────────────────────
export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Socket client (singleton — one connection per browser tab) ───────────────
let socket = null;
let _connectAuth = null; // remember last auth so we can reconnect with same creds

export function getSocket() {
  return socket;
}

export function connectSocket(token, guestName) {
  const auth = token ? { token } : { guestName };

  // Already connected with same credentials — reuse
  if (socket?.connected && JSON.stringify(_connectAuth) === JSON.stringify(auth)) {
    return socket;
  }

  // If there's a stale socket, kill it cleanly before making a new one
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  _connectAuth = auth;

  socket = io(BASE_URL, {
    auth,
    // Reconnection: try 10 times with exponential backoff, max 10s delay
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Force websocket — avoids polling fallback creating extra connections
    transports: ['websocket'],
    // Timeout before giving up on a connection attempt
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    // If the server forced disconnect, don't auto-reconnect silently
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  socket.on('reconnect', (attempt) => {
    console.log('[Socket] Reconnected after', attempt, 'attempts');
  });

  socket.on('reconnect_failed', () => {
    console.error('[Socket] Reconnection failed after all attempts');
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    _connectAuth = null;
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login:    (data) => api.post('/auth/login', data).then(r => r.data),
  me:       ()     => api.get('/auth/me').then(r => r.data),
  discordUrl: ()   => `${BASE_URL}/auth/discord`,
};

// ─── Prices API ───────────────────────────────────────────────────────────────
export const pricesApi = {
  latest: () => api.get('/prices').then(r => r.data),
  history: (feed) => feed
    ? api.get(`/prices/history/${encodeURIComponent(feed)}`).then(r => r.data)
    : api.get('/prices/history').then(r => r.data),
};

// ─── Rooms API ────────────────────────────────────────────────────────────────
export const roomsApi = {
  list: () => api.get('/rooms').then(r => r.data),
  get:  (id) => api.get(`/rooms/${id}`).then(r => r.data),
};

// ─── Leaderboard API ──────────────────────────────────────────────────────────
export const leaderboardApi = {
  get: (limit = 50) => api.get(`/leaderboard?limit=${limit}`).then(r => r.data),
};
