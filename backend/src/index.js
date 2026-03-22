import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initSocketServer } from './socketServer.js';
import { fetchLatestPrices, getLatestPrices, getPriceHistory, PRICE_FEEDS, isPriceStale, getLastFetchAge } from './pythClient.js';
import {
  registerUser, loginUser, handleDiscordCallback,
  authMiddleware, getLeaderboard, getUserById, makePublicUser, loadUsers,
} from './authService.js';
import { getPublicRooms, getRoom } from './roomEngine.js';
import { serializeQRState } from './quickRoyale.js';
import { getPublicTournaments, getTournament, serializeTournament, initPresetTournaments } from './tournamentEngine.js';
import { connectDB } from './db.js';

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
});

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  ok: true,
  ts: Date.now(),
  pyth: {
    stale: isPriceStale(),
    lastFetchAge: Math.round(getLastFetchAge() / 1000), // seconds
    ok: getLastFetchAge() < 30000, // fresh if fetched in last 30s
  },
}));

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.post('/auth/register', async (req, res) => {
  try {
    const result = await registerUser(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: makePublicUser(req.user) });
});

// Discord OAuth redirect
app.get('/auth/discord', (req, res) => {
  const { DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI } = process.env;
  if (!DISCORD_CLIENT_ID) return res.status(500).json({ error: 'Discord OAuth not configured' });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Discord OAuth callback
app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${FRONTEND_URL}?auth_error=no_code`);

  try {
    const result = await handleDiscordCallback(code);
    // Redirect to frontend with token in URL param (frontend stores in localStorage)
    res.redirect(`${FRONTEND_URL}/?discord_token=${result.token}&new=${result.isNew}`);
  } catch (err) {
    console.error('[Discord OAuth]', err.message);
    res.redirect(`${FRONTEND_URL}?auth_error=discord_failed`);
  }
});

// ─── Price Routes ─────────────────────────────────────────────────────────────

app.get('/prices', async (req, res) => {
  try {
    const prices = await fetchLatestPrices();
    res.json(prices);
  } catch {
    res.json(getLatestPrices());
  }
});

app.get('/prices/history', (req, res) => {
  const history = {};
  for (const name of Object.keys(PRICE_FEEDS)) {
    history[name] = getPriceHistory(name);
  }
  res.json(history);
});

app.get('/prices/history/:feed', (req, res) => {
  const feed = decodeURIComponent(req.params.feed);
  res.json(getPriceHistory(feed));
});

// ─── Room Routes ──────────────────────────────────────────────────────────────

app.get('/rooms', (req, res) => {
  res.json(getPublicRooms());
});

app.get('/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  res.json({
    id: room.id,
    name: room.name,
    hostUsername: room.hostUsername,
    isPublic: room.isPublic,
    hasPassword: !!room.password,
    maxPlayers: room.maxPlayers,
    rounds: room.rounds,
    roundDuration: room.roundDuration,
    assetRotation: room.assetRotation,
    pointMode: room.pointMode,
    status: room.status,
    playerCount: room.players.size,
  });
});

// ─── Leaderboard ─────────────────────────────────────────────────────────────

app.get('/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  res.json(getLeaderboard(limit));
});

app.get('/profile/:username', (req, res) => {
  const { username } = req.params;
  // find user by username
  const leaderboard = getLeaderboard(1000);
  const entry = leaderboard.find(u => u.username === username.toLowerCase());
  if (!entry) return res.status(404).json({ error: 'User not found' });
  res.json(entry);
});

// ─── Quick Royale ─────────────────────────────────────────────────────────────

app.get('/quick-royale', (req, res) => {
  res.json(serializeQRState());
});

// ─── Tournaments ──────────────────────────────────────────────────────────────

app.get('/tournaments', (req, res) => {
  res.json(getPublicTournaments());
});

app.get('/tournaments/:id', (req, res) => {
  const t = getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  res.json(serializeTournament(t));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
initSocketServer(io);

// ─── Price polling ────────────────────────────────────────────────────────────
async function startPricePoller() {
  await fetchLatestPrices();
  console.log('[Pyth] Initial prices fetched');
  setInterval(async () => {
    await fetchLatestPrices();
  }, 3000); // Every 3 seconds
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`\n🚀 Price Royale Backend running on port ${PORT}`);
  console.log(`   Frontend: ${FRONTEND_URL}`);
  await connectDB();        // connect MongoDB (graceful fallback if unavailable)
  await loadUsers();        // load users into memory
  initPresetTournaments();
  await startPricePoller();
});
