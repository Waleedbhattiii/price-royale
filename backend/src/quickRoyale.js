// Quick Royale — always-on public room that auto-starts when enough players are ready
// Acts as a persistent singleton room that resets after each game

import { fetchLatestPrices, getLatestPrices } from './pythClient.js';
import { updateUserStats, addGameToHistory, getUserById } from './authService.js';

const QUICK_ROYALE_ID = 'QUICK';
const MIN_PLAYERS = 2;
const COUNTDOWN_SECONDS = 15; // countdown before auto-start after min players reached
const ROUNDS = 5;
const ROUND_DURATION = 60;
const COMMIT_WINDOW = 30; // first 30s: commit phase. rest: watch phase.

export const QR_PHASE = {
  WAITING:  'waiting',   // waiting for players
  COUNTDOWN:'countdown', // countdown to auto-start
  COMMIT:   'commit',    // round in progress
  REVEAL:   'reveal',    // showing round result
  FINISHED: 'finished',  // game done — resets after delay
};

// Singleton state
let state = makeInitialState();

function makeInitialState() {
  return {
    id: QUICK_ROYALE_ID,
    phase: QR_PHASE.WAITING,
    players: new Map(),      // userId → playerState
    currentRound: 0,
    totalRounds: ROUNDS,
    roundDuration: ROUND_DURATION,
    rounds_data: [],
    currentAsset: null,
    roundStartTime: null,
    countdownRemaining: 0,
    scoreboard: [],
    winner: null,
  };
}

function makePlayer(userId, displayName, avatar) {
  return {
    userId, displayName, avatar,
    points: 0,
    streak: 0,
    bestStreak: 0,
    predictions: [],
    joinedAt: Date.now(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getQRState() { return state; }

export function getQRPlayerCount() { return state.players.size; }

export function joinQuickRoyale(userId, displayName, avatar) {
  if (state.phase === QR_PHASE.FINISHED) return { ok: false, error: 'Game just ended, resetting shortly...' };
  if (state.players.has(userId)) return { ok: true, alreadyIn: true };
  state.players.set(userId, makePlayer(userId, displayName, avatar));
  return { ok: true };
}

export function leaveQuickRoyale(userId) {
  state.players.delete(userId);
}

export function commitQR(userId, direction, currentPrice) {
  if (state.phase !== QR_PHASE.COMMIT) return { ok: false, error: 'Not in commit phase' };
  const player = state.players.get(userId);
  if (!player) return { ok: false, error: 'Not in Quick Royale' };
  const already = player.predictions.find(p => p.round === state.currentRound);
  if (already) return { ok: false, error: 'Already committed' };

  const commitTime = Date.now() - state.roundStartTime;
  if (commitTime > COMMIT_WINDOW * 1000) return { ok: false, error: 'Commit window has closed' };

  const personalEntryPrice = currentPrice || state.rounds_data[state.currentRound - 1]?.entryPrice || 0;

  player.predictions.push({
    round: state.currentRound,
    direction,
    correct: null,
    pointsEarned: 0,
    commitTime,
    personalEntryPrice,
  });
  return { ok: true, personalEntryPrice };
}

export function getQRScoreboard() {
  return Array.from(state.players.values())
    .sort((a, b) => b.points - a.points)
    .map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      displayName: p.displayName,
      avatar: p.avatar,
      points: p.points,
      streak: p.streak,
    }));
}

export function serializeQRState() {
  return {
    id: QUICK_ROYALE_ID,
    phase: state.phase,
    playerCount: state.players.size,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    roundDuration: state.roundDuration,
    currentAsset: state.currentAsset,
    roundStartTime: state.roundStartTime,
    countdownRemaining: state.countdownRemaining,
    scoreboard: getQRScoreboard(),
    winner: state.winner,
  };
}

// ─── Game loop (called from socketServer) ────────────────────────────────────

let _io = null;
let countdownTimer = null;
let roundTimer = null;
let tickInterval = null;

export function initQuickRoyale(io) {
  _io = io;
  console.log('[QuickRoyale] Ready — waiting for players');
}

// Called whenever a player joins or ready-checks change
export function checkAutoStart() {
  if (state.phase !== QR_PHASE.WAITING && state.phase !== QR_PHASE.COUNTDOWN) return;

  if (state.players.size >= MIN_PLAYERS && state.phase === QR_PHASE.WAITING) {
    startCountdown();
  } else if (state.players.size < MIN_PLAYERS && state.phase === QR_PHASE.COUNTDOWN) {
    cancelCountdown();
  }
}

function startCountdown() {
  state.phase = QR_PHASE.COUNTDOWN;
  state.countdownRemaining = COUNTDOWN_SECONDS;

  broadcast('qr:countdown', {
    seconds: COUNTDOWN_SECONDS,
    playerCount: state.players.size,
  });

  countdownTimer = setInterval(() => {
    state.countdownRemaining -= 1;
    broadcast('qr:countdownTick', { remaining: state.countdownRemaining, playerCount: state.players.size });

    if (state.countdownRemaining <= 0) {
      clearInterval(countdownTimer);
      if (state.players.size >= MIN_PLAYERS) {
        startGame();
      } else {
        state.phase = QR_PHASE.WAITING;
        broadcast('qr:waitingForPlayers', { playerCount: state.players.size });
      }
    }
  }, 1000);
}

function cancelCountdown() {
  clearInterval(countdownTimer);
  state.phase = QR_PHASE.WAITING;
  broadcast('qr:waitingForPlayers', { playerCount: state.players.size });
}

async function startGame() {
  state.phase = QR_PHASE.COMMIT;
  state.currentRound = 0;
  state.rounds_data = [];
  // Reset all player scores for new game
  for (const p of state.players.values()) {
    p.points = 0; p.streak = 0; p.bestStreak = 0; p.predictions = [];
  }
  broadcast('qr:gameStarting', { totalRounds: state.totalRounds, playerCount: state.players.size });
  await delay(2000);
  runNextRound();
}

async function runNextRound() {
  state.currentRound += 1;
  if (state.currentRound > state.totalRounds) return endGame();

  // Pick random asset
  const assets = ['ETH/USD', 'BTC/USD', 'SOL/USD'];
  state.currentAsset = assets[Math.floor(Math.random() * assets.length)];

  await fetchLatestPrices();
  const prices = getLatestPrices();
  const entryPrice = prices[state.currentAsset]?.price || 0;

  state.rounds_data.push({ round: state.currentRound, asset: state.currentAsset, entryPrice, results: [] });
  state.phase = QR_PHASE.COMMIT;
  state.roundStartTime = Date.now();

  broadcast('qr:roundStart', {
    round: state.currentRound,
    totalRounds: state.totalRounds,
    asset: state.currentAsset,
    entryPrice,
    duration: state.roundDuration,
    commitWindow: COMMIT_WINDOW,
    scoreboard: getQRScoreboard(),
    startedAt: Date.now(),
  });

  let remaining = state.roundDuration;
  tickInterval = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      const inCommitWindow = remaining > (state.roundDuration - COMMIT_WINDOW);
      broadcast('qr:tick', { remaining, committed: countCommitted(), total: state.players.size, inCommitWindow });
    }
    if (remaining === state.roundDuration - COMMIT_WINDOW) {
      broadcast('qr:commitWindowClosed', { round: state.currentRound });
    }
  }, 1000);

  roundTimer = setTimeout(async () => {
    clearInterval(tickInterval);
    state.phase = QR_PHASE.REVEAL;
    broadcast('qr:settling', { round: state.currentRound });

    const settlement = await settleQRRound();
    broadcast('qr:roundResult', { ...settlement, scoreboard: getQRScoreboard() });

    await delay(5000);
    runNextRound();
  }, state.roundDuration * 1000);
}

async function settleQRRound() {
  await fetchLatestPrices();
  const prices = getLatestPrices();
  const exitPrice = prices[state.currentAsset]?.price || 0;
  const roundData = state.rounds_data[state.currentRound - 1];
  const entryPrice = roundData?.entryPrice || 0;

  // Overall round direction (based on round start price — used for display/summary)
  let roundDirection = null;
  if (exitPrice > entryPrice) roundDirection = 'UP';
  else if (exitPrice < entryPrice) roundDirection = 'DOWN';

  const results = [];
  for (const player of state.players.values()) {
    const pred = player.predictions.find(p => p.round === state.currentRound);
    if (!pred) { player.streak = 0; results.push({ userId: player.userId, correct: false, pointsEarned: 0 }); continue; }

    // Each player judged against their personal entry price (price at commit time)
    const personalEntry = pred.personalEntryPrice || entryPrice;
    let personalDirection = null;
    if (exitPrice > personalEntry) personalDirection = 'UP';
    else if (exitPrice < personalEntry) personalDirection = 'DOWN';

    const correct = personalDirection && pred.direction === personalDirection;
    if (correct) {
      const speedRatio = Math.max(0, 1 - pred.commitTime / (state.roundDuration * 1000));
      const pts = Math.round((100 + speedRatio * 50 + Math.min(player.streak, 5) * 20));
      player.points += pts;
      player.streak += 1;
      if (player.streak > player.bestStreak) player.bestStreak = player.streak;
      pred.correct = true; pred.pointsEarned = pts;
      results.push({ userId: player.userId, correct: true, pointsEarned: pts, direction: pred.direction, personalEntryPrice: pred.personalEntryPrice });
    } else {
      player.streak = 0; pred.correct = false;
      results.push({ userId: player.userId, correct: false, pointsEarned: 0, direction: pred.direction, personalEntryPrice: pred?.personalEntryPrice });
    }
  }

  roundData.exitPrice = exitPrice;
  roundData.correctDirection = roundDirection;
  roundData.results = results;

  return { round: state.currentRound, asset: state.currentAsset, entryPrice, exitPrice, correctDirection: roundDirection, results };
}

async function endGame() {
  state.phase = QR_PHASE.FINISHED;
  const scoreboard = getQRScoreboard();
  state.winner = scoreboard[0] || null;

  // Await all stat saves — this was the bug causing progress not to persist
  const saves = [];
  for (const player of state.players.values()) {
    const user = getUserById(player.userId);
    if (!user) continue;
    const correct = player.predictions.filter(p => p.correct).length;
    const won = player.userId === state.winner?.userId;
    saves.push(
      updateUserStats(player.userId, {
        pointsEarned: player.points, won, correct,
        total: player.predictions.length, streak: player.bestStreak
      }),
      addGameToHistory(player.userId, {
        roomId: QUICK_ROYALE_ID, roomName: 'Quick Royale',
        date: Date.now(), points: player.points,
        rank: scoreboard.find(s => s.userId === player.userId)?.rank,
        totalPlayers: state.players.size, won, rounds: state.totalRounds
      })
    );
  }
  await Promise.all(saves);
  console.log(`[QuickRoyale] Stats saved for ${saves.length / 2} players`);

  broadcast('qr:gameFinished', { scoreboard, winner: state.winner });

  // Reset after 15 seconds
  setTimeout(() => {
    state = makeInitialState();
    broadcast('qr:reset', { message: 'New game starting soon...' });
    console.log('[QuickRoyale] Reset — ready for new game');
  }, 15000);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function broadcast(event, data) {
  if (_io) _io.to('quick-royale').emit(event, data);
}
function countCommitted() {
  let n = 0;
  for (const p of state.players.values()) {
    if (p.predictions.some(pr => pr.round === state.currentRound)) n++;
  }
  return n;
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
