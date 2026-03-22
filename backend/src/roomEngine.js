import { v4 as uuidv4 } from 'uuid';
import { fetchSettlementPrice, FEED_NAMES } from './pythClient.js';
import { updateUserStats, addGameToHistory, getUserById } from './authService.js';

// ─── Constants ───────────────────────────────────────────────────────────────
export const ROOM_STATUS = {
  WAITING: 'waiting',     // lobby, waiting for players
  STARTING: 'starting',   // countdown before first round
  COMMIT: 'commit',       // players picking direction
  REVEAL: 'reveal',       // showing result
  FINISHED: 'finished',   // game over
};

export const DIRECTION = { UP: 'UP', DOWN: 'DOWN' };

// Commit window: first 30s of any round. After this, selection expires.
// Remaining time = watch phase where chart keeps running.
export const COMMIT_WINDOW_SECONDS = 30;

const BASE_POINTS = 100;
const SPEED_BONUS_MAX = 50;
const STREAK_BONUS = 20;

// ─── In-memory room store ─────────────────────────────────────────────────────
const rooms = new Map(); // roomId → room

// ─── Room factory ─────────────────────────────────────────────────────────────
export function createRoom({ hostUserId, hostUsername, name, isPublic, password, maxPlayers, rounds, roundDuration, assetRotation, pointMode }) {
  const roomId = generateRoomCode();

  const room = {
    id: roomId,
    name: name || `${hostUsername}'s Room`,
    hostUserId,
    hostUsername,
    isPublic: !!isPublic,
    password: password || null,
    maxPlayers: Math.min(Math.max(maxPlayers || 50, 2), 500),
    rounds: Math.min(Math.max(rounds || 5, 1), 10),
    roundDuration: [15, 30, 60, 90].includes(roundDuration) ? roundDuration : 60,
    assetRotation: assetRotation || 'random', // 'random' | 'ETH/USD' | 'BTC/USD' | 'SOL/USD'
    pointMode: pointMode === 'highstakes' ? 'highstakes' : 'standard', // standard=1x, highstakes=2x

    status: ROOM_STATUS.WAITING,
    players: new Map(),   // userId → playerState
    currentRound: 0,
    rounds_data: [],      // history of each round result
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    shareUrl: null,

    // round state
    currentAsset: null,
    roundStartTime: null,
    commitDeadline: null,
    roundTimer: null,
  };

  rooms.set(roomId, room);
  return room;
}

// ─── Join room ────────────────────────────────────────────────────────────────
export function joinRoom(roomId, { userId, username, displayName, avatar, password }) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === ROOM_STATUS.FINISHED) throw new Error('Game has ended');
  if (room.password && room.password !== password) throw new Error('Wrong room password');

  // If player is already in room (reconnecting) — just return the room
  if (room.players.has(userId)) return room;

  // New player joining — only allowed when WAITING
  if (room.status !== ROOM_STATUS.WAITING) throw new Error('Game already in progress — ask host for a new room');
  if (room.players.size >= room.maxPlayers) throw new Error('Room is full');

  room.players.set(userId, {
    userId, username, displayName, avatar,
    points: 0, streak: 0, bestStreak: 0,
    predictions: [],
    eliminated: false,
    joinedAt: Date.now(),
  });

  return room;
}

// ─── Leave room ───────────────────────────────────────────────────────────────
export function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.delete(userId);

  // Clean up empty waiting rooms
  if (room.players.size === 0 && room.status === ROOM_STATUS.WAITING) {
    rooms.delete(roomId);
  }
}

// ─── Start game ───────────────────────────────────────────────────────────────
export function canStartGame(room, requestingUserId) {
  if (room.hostUserId !== requestingUserId) throw new Error('Only the host can start the game');
  if (room.status !== ROOM_STATUS.WAITING) throw new Error('Game already started');
  if (room.players.size < 2) throw new Error('Need at least 2 players to start');
}

// ─── Commit direction ─────────────────────────────────────────────────────────
export function commitDirection(room, userId, direction, currentPrice) {
  if (room.status !== ROOM_STATUS.COMMIT) throw new Error('Not in commit phase');
  if (!Object.values(DIRECTION).includes(direction)) throw new Error('Invalid direction');

  const player = room.players.get(userId);
  if (!player) throw new Error('Not in this room');
  if (player.eliminated) throw new Error('You are eliminated');

  const existing = player.predictions.find(p => p.round === room.currentRound);
  if (existing) throw new Error('Already committed this round');

  const commitTime = Date.now() - room.roundStartTime;

  // Enforce commit window — after COMMIT_WINDOW_SECONDS, selection expires
  if (commitTime > COMMIT_WINDOW_SECONDS * 1000) {
    throw new Error('Commit window has closed');
  }

  // Personal entry price = Pyth price at moment player commits (passed from client via server)
  // Falls back to round start price if not provided
  const personalEntryPrice = currentPrice || room.rounds_data[room.currentRound - 1]?.entryPrice || 0;

  player.predictions.push({
    round: room.currentRound,
    direction,
    correct: null,
    pointsEarned: 0,
    commitTime,
    personalEntryPrice, // each player's own entry price
  });
}

// ─── Settle round ─────────────────────────────────────────────────────────────
export async function settleRound(room) {
  const asset = room.currentAsset;
  let settlement;

  try {
    settlement = await fetchSettlementPrice(asset);
  } catch (err) {
    console.error('[Game] Settlement price fetch failed:', err.message);
    // Use last known price as fallback
    settlement = { price: 0, ciMultiplier: 1.0, name: asset };
  }

  const roundData = room.rounds_data[room.currentRound - 1];
  const roundEntryPrice = roundData.entryPrice; // fallback
  const exitPrice = settlement.price;

  // Overall round direction for display (based on round start price)
  let roundDirection = null;
  if (exitPrice > roundEntryPrice) roundDirection = DIRECTION.UP;
  else if (exitPrice < roundEntryPrice) roundDirection = DIRECTION.DOWN;

  const pointMultiplier = room.pointMode === 'highstakes' ? 2 : 1;
  const results = [];

  for (const [, player] of room.players) {
    if (player.eliminated) continue;

    const pred = player.predictions.find(p => p.round === room.currentRound);
    const committed = !!pred;

    // Each player judged against their personal entry price
    const personalEntry = pred?.personalEntryPrice || roundEntryPrice;
    let personalDirection = null;
    if (exitPrice > personalEntry) personalDirection = DIRECTION.UP;
    else if (exitPrice < personalEntry) personalDirection = DIRECTION.DOWN;

    const correct = committed && personalDirection && pred.direction === personalDirection;

    if (!committed) {
      player.streak = 0;
      results.push({ userId: player.userId, correct: false, pointsEarned: 0, direction: null });
      continue;
    }

    if (correct) {
      let pts = BASE_POINTS;
      const speedRatio = Math.max(0, 1 - pred.commitTime / (room.roundDuration * 1000));
      const speedBonus = Math.round(speedRatio * SPEED_BONUS_MAX);
      pts += speedBonus;
      player.streak += 1;
      if (player.streak > player.bestStreak) player.bestStreak = player.streak;
      const streakBonus = Math.min(player.streak - 1, 5) * STREAK_BONUS;
      pts += streakBonus;
      pts = Math.round(pts * settlement.ciMultiplier * pointMultiplier);
      player.points += pts;
      pred.correct = true;
      pred.pointsEarned = pts;
      results.push({ userId: player.userId, correct: true, pointsEarned: pts, direction: pred.direction, speedBonus, streakBonus, ciMultiplier: settlement.ciMultiplier, personalEntryPrice: pred.personalEntryPrice });
    } else {
      player.streak = 0;
      pred.correct = false;
      pred.pointsEarned = 0;
      results.push({ userId: player.userId, correct: false, pointsEarned: 0, direction: pred.direction, personalEntryPrice: pred?.personalEntryPrice });
    }
  }

  roundData.exitPrice = exitPrice;
  roundData.correctDirection = roundDirection;
  roundData.ciMultiplier = settlement.ciMultiplier;
  roundData.results = results;
  roundData.settledAt = Date.now();

  return { correctDirection: roundDirection, entryPrice: roundEntryPrice, exitPrice, ciMultiplier: settlement.ciMultiplier, results };
}

// ─── Get scoreboard snapshot ───────────────────────────────────────────────────
export function getScoreboard(room) {
  return Array.from(room.players.values())
    .sort((a, b) => b.points - a.points)
    .map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      avatar: p.avatar,
      points: p.points,
      streak: p.streak,
      eliminated: p.eliminated,
    }));
}

// ─── Finish game & persist stats ───────────────────────────────────────────────
export async function finishGame(room) {
  room.status = ROOM_STATUS.FINISHED;
  room.finishedAt = Date.now();

  const scoreboard = getScoreboard(room);
  const winner = scoreboard[0];

  // Await all stat saves so DB is written before function returns
  const saves = [];
  for (const player of room.players.values()) {
    const user = getUserById(player.userId);
    if (!user) continue;

    const correct = player.predictions.filter(p => p.correct).length;
    const total = player.predictions.length;
    const won = player.userId === winner?.userId;

    saves.push(
      updateUserStats(player.userId, {
        pointsEarned: player.points,
        won, correct, total,
        streak: player.bestStreak,
      }),
      addGameToHistory(player.userId, {
        roomId: room.id,
        roomName: room.name,
        date: room.finishedAt,
        points: player.points,
        rank: scoreboard.find(s => s.userId === player.userId)?.rank,
        totalPlayers: room.players.size,
        won,
        rounds: room.rounds,
      })
    );
  }

  await Promise.all(saves);
  console.log(`[Room] Stats saved for ${saves.length / 2} players`);

  return { scoreboard, winner };
}

// ─── Pick next asset ───────────────────────────────────────────────────────────
export function pickAsset(room) {
  if (room.assetRotation === 'random') {
    const options = FEED_NAMES;
    return options[Math.floor(Math.random() * options.length)];
  }
  return room.assetRotation;
}

// ─── Public room listing ───────────────────────────────────────────────────────
export function getPublicRooms() {
  return Array.from(rooms.values())
    .filter(r => r.isPublic && r.status === ROOM_STATUS.WAITING)
    .map(r => ({
      id: r.id,
      name: r.name,
      hostUsername: r.hostUsername,
      players: r.players.size,
      maxPlayers: r.maxPlayers,
      rounds: r.rounds,
      roundDuration: r.roundDuration,
      assetRotation: r.assetRotation,
      pointMode: r.pointMode,
      hasPassword: !!r.password,
      createdAt: r.createdAt,
    }));
}

export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

export function getAllRooms() {
  return rooms;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // Ensure unique
  if (rooms.has(code)) return generateRoomCode();
  return code;
}
