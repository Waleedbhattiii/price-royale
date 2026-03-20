import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import mongoose from 'mongoose';
import { isDBConnected } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// ─── Mongoose Schema ──────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  id:              { type: String, required: true, unique: true },
  username:        { type: String, required: true, unique: true },
  displayName:     { type: String, required: true },
  passwordHash:    { type: String, default: null },
  discordId:       { type: String, default: null },
  discordUsername: { type: String, default: null },
  avatar:          { type: String, default: null },
  stats: {
    totalPoints:        { type: Number, default: 0 },
    gamesPlayed:        { type: Number, default: 0 },
    gamesWon:           { type: Number, default: 0 },
    correctPredictions: { type: Number, default: 0 },
    totalPredictions:   { type: Number, default: 0 },
    bestStreak:         { type: Number, default: 0 },
    roomsCreated:       { type: Number, default: 0 },
  },
  badges:      { type: Array, default: [] },
  gameHistory: { type: Array, default: [] },
  createdAt:   { type: Number, default: () => Date.now() },
});

let UserModel;
try { UserModel = mongoose.model('User'); }
catch { UserModel = mongoose.model('User', userSchema); }

// ─── In-memory cache (always used, DB is source of truth) ────────────────────

const memUsers = new Map();        // username → user
const memDiscordIndex = new Map(); // discordId → username

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUsername(u) {
  return u.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function makePublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    discordLinked: !!user.discordId,
    stats: user.stats || {},
    badges: user.badges || [],
    rank: getRank(user.stats?.totalPoints || 0),
    createdAt: user.createdAt,
  };
}

export function getRank(points) {
  if (points >= 15000) return { title: 'Price Prophet', tier: 4 };
  if (points >= 5000)  return { title: 'Oracle Reader', tier: 3 };
  if (points >= 1000)  return { title: 'Chartist', tier: 2 };
  return { title: 'Rookie Trader', tier: 1 };
}

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ─── Load from MongoDB into memory on startup ─────────────────────────────────

export async function loadUsers() {
  if (!isDBConnected()) {
    console.log('[Auth] No MongoDB — using in-memory storage only');
    return;
  }
  try {
    const all = await UserModel.find({}).lean();
    for (const u of all) {
      memUsers.set(u.username, u);
      if (u.discordId) memDiscordIndex.set(u.discordId, u.username);
    }
    console.log(`[Auth] Loaded ${all.length} users from MongoDB`);
  } catch (err) {
    console.error('[Auth] Failed to load users:', err.message);
  }
}

// ─── Save — writes to memory + DB ────────────────────────────────────────────

async function saveUser(user) {
  memUsers.set(user.username, user);
  if (user.discordId) memDiscordIndex.set(user.discordId, user.username);

  if (isDBConnected()) {
    try {
      await UserModel.findOneAndUpdate(
        { id: user.id },
        { $set: user },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('[Auth] DB save failed:', err.message);
    }
  }
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getUserById(id) {
  for (const u of memUsers.values()) {
    if (u.id === id) return u;
  }
  return null;
}

export function getUserByUsername(username) {
  return memUsers.get(sanitizeUsername(username)) || null;
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser({ username, password, displayName }) {
  const clean = sanitizeUsername(username);
  if (!clean || clean.length < 3) throw new Error('Username must be at least 3 characters');
  if (clean.length > 20) throw new Error('Username max 20 characters');
  if (memUsers.has(clean)) throw new Error('Username already taken');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(), username: clean,
    displayName: displayName || username.trim(),
    passwordHash: hashed, discordId: null, discordUsername: null, avatar: null,
    stats: { totalPoints:0, gamesPlayed:0, gamesWon:0, correctPredictions:0, totalPredictions:0, bestStreak:0, roomsCreated:0 },
    badges: [], gameHistory: [], createdAt: Date.now(),
  };

  await saveUser(user);
  return { token: signToken(user.id), user: makePublicUser(user) };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser({ username, password }) {
  const user = getUserByUsername(username);
  if (!user) throw new Error('Invalid username or password');
  if (!user.passwordHash) throw new Error('This account uses Discord login');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid username or password');
  return { token: signToken(user.id), user: makePublicUser(user) };
}

// ─── Discord OAuth ────────────────────────────────────────────────────────────

export async function handleDiscordCallback(code) {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = process.env;

  const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
    new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT_URI }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const userRes = await axios.get('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
  });

  const discord = userRes.data;
  const discordId = discord.id;
  const avatar = discord.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${discord.avatar}.png` : null;

  // Check existing Discord account
  const existingUsername = memDiscordIndex.get(discordId);
  if (existingUsername) {
    const user = memUsers.get(existingUsername);
    if (user) return { token: signToken(user.id), user: makePublicUser(user), isNew: false };
  }

  // Create new account
  let baseUsername = sanitizeUsername(discord.username) || `user${discordId.slice(-6)}`;
  let finalUsername = baseUsername;
  let suffix = 1;
  while (memUsers.has(finalUsername)) finalUsername = `${baseUsername}${suffix++}`;

  const user = {
    id: uuidv4(), username: finalUsername,
    displayName: discord.global_name || discord.username,
    passwordHash: null, discordId, discordUsername: discord.username, avatar,
    stats: { totalPoints:0, gamesPlayed:0, gamesWon:0, correctPredictions:0, totalPredictions:0, bestStreak:0, roomsCreated:0 },
    badges: [], gameHistory: [], createdAt: Date.now(),
  };

  await saveUser(user);
  return { token: signToken(user.id), user: makePublicUser(user), isNew: true };
}

// ─── Stats update ─────────────────────────────────────────────────────────────

export async function updateUserStats(userId, { pointsEarned, won, correct, total, streak }) {
  const user = getUserById(userId);
  if (!user) return;

  user.stats.totalPoints        += pointsEarned;
  user.stats.gamesPlayed        += 1;
  if (won) user.stats.gamesWon  += 1;
  user.stats.correctPredictions += correct;
  user.stats.totalPredictions   += total;
  if (streak > user.stats.bestStreak) user.stats.bestStreak = streak;

  checkBadges(user);
  await saveUser(user);
}

export async function addGameToHistory(userId, gameRecord) {
  const user = getUserById(userId);
  if (!user) return;
  user.gameHistory.unshift(gameRecord);
  if (user.gameHistory.length > 50) user.gameHistory.pop();
  await saveUser(user);
}

function checkBadges(user) {
  const { stats, badges } = user;
  const has = (id) => badges.some(b => b.id === id);
  if (stats.bestStreak >= 5 && !has('streak_5'))   badges.push({ id:'streak_5',  label:'🔥 5-Round Streak',  earnedAt:Date.now() });
  if (stats.gamesWon >= 1  && !has('first_win'))   badges.push({ id:'first_win', label:'🏆 First Victory',   earnedAt:Date.now() });
  if (stats.gamesPlayed >= 10 && !has('veteran'))  badges.push({ id:'veteran',   label:'⚔️ Veteran Trader', earnedAt:Date.now() });
  if (stats.totalPoints >= 5000 && !has('oracle')) badges.push({ id:'oracle',    label:'🔮 Oracle Reader',   earnedAt:Date.now() });
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  const user = getUserById(payload.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function getLeaderboard(limit = 50) {
  return Array.from(memUsers.values())
    .sort((a, b) => (b.stats?.totalPoints || 0) - (a.stats?.totalPoints || 0))
    .slice(0, limit)
    .map((u, i) => ({
      rank: i + 1,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      totalPoints: u.stats?.totalPoints || 0,
      gamesPlayed: u.stats?.gamesPlayed || 0,
      gamesWon: u.stats?.gamesWon || 0,
      winRate: (u.stats?.gamesPlayed || 0) > 0
        ? Math.round(((u.stats?.gamesWon || 0) / u.stats.gamesPlayed) * 100)
        : 0,
      rankTitle: getRank(u.stats?.totalPoints || 0).title,
    }));
}
