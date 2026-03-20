// Tournament Mode — bracket-style, single elimination
// Supports 4, 8, 16, 32 players
// Each match: 1 round, loser eliminated, winner advances

import { v4 as uuidv4 } from 'uuid';
import { fetchLatestPrices, getLatestPrices } from './pythClient.js';
import { updateUserStats, addGameToHistory, getUserById } from './authService.js';

export const TOURNAMENT_STATUS = {
  REGISTRATION: 'registration', // waiting for players to join
  IN_PROGRESS:  'in_progress',  // bracket running
  FINISHED:     'finished',
};

export const MATCH_STATUS = {
  PENDING:   'pending',   // not started yet
  ACTIVE:    'active',    // commit phase
  SETTLING:  'settling',  // fetching price
  DONE:      'done',      // result known
};

const ROUND_DURATION = 45; // seconds per match
const VALID_SIZES = [4, 8, 16, 32];

const tournaments = new Map(); // tournamentId → tournament

// ─── Pre-seeded public tournaments (always available) ─────────────────────────
const PRESET_TOURNAMENTS = [
  { id: 'T4',  name: 'Duel Arena',      size: 4,  description: '4 players · Fast bracket · ~3 min' },
  { id: 'T8',  name: 'Crypto Clash',    size: 8,  description: '8 players · Classic bracket · ~6 min' },
  { id: 'T16', name: 'Oracle League',   size: 16, description: '16 players · Full bracket · ~12 min' },
  { id: 'T32', name: 'Price Royale Pro',size: 32, description: '32 players · Mega bracket · ~20 min' },
];

export function initPresetTournaments() {
  for (const preset of PRESET_TOURNAMENTS) {
    if (!tournaments.has(preset.id)) {
      tournaments.set(preset.id, {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        hostUserId: 'system',
        hostUsername: 'System',
        size: preset.size,
        isPublic: true,
        password: null,
        isPreset: true,
        status: TOURNAMENT_STATUS.REGISTRATION,
        players: new Map(),
        bracket: null,
        currentRound: 0,
        totalRounds: Math.log2(preset.size),
        createdAt: Date.now(),
        finishedAt: null,
        winner: null,
      });
    }
  }
  console.log('[Tournament] Pre-seeded 4 public tournaments');
}

export function createTournament({ hostUserId, hostUsername, name, size, isPublic, password }) {
  const validSize = VALID_SIZES.includes(size) ? size : 8;
  const id = uuidv4().slice(0, 8).toUpperCase();

  const tournament = {
    id,
    name: name || `${hostUsername}'s Tournament`,
    hostUserId,
    hostUsername,
    size: validSize,
    isPublic: !!isPublic,
    password: password || null,
    status: TOURNAMENT_STATUS.REGISTRATION,
    players: new Map(),    // userId → { userId, displayName, avatar, seed }
    bracket: null,         // built when tournament starts
    currentRound: 0,       // 1-indexed bracket round
    totalRounds: Math.log2(validSize),
    createdAt: Date.now(),
    finishedAt: null,
    winner: null,
  };

  tournaments.set(id, tournament);
  return tournament;
}

export function joinTournament(tournamentId, { userId, displayName, avatar, password }) {
  const t = tournaments.get(tournamentId);
  if (!t) throw new Error('Tournament not found');
  if (t.status !== TOURNAMENT_STATUS.REGISTRATION) throw new Error('Tournament already started');
  if (t.players.size >= t.size) throw new Error('Tournament is full');
  if (t.password && t.password !== password) throw new Error('Wrong password');
  if (t.players.has(userId)) return { t, autoStart: false }; // already in

  t.players.set(userId, { userId, displayName, avatar, seed: t.players.size + 1, eliminated: false, wins: 0 });

  // Auto-start when all slots filled
  const autoStart = t.players.size >= t.size;
  return { t, autoStart };
}

export function leaveTournament(tournamentId, userId) {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== TOURNAMENT_STATUS.REGISTRATION) return;
  t.players.delete(userId);
  if (t.players.size === 0) tournaments.delete(tournamentId);
}

export function canStartTournament(t, requestingUserId) {
  if (t.hostUserId !== requestingUserId) throw new Error('Only the host can start');
  if (t.status !== TOURNAMENT_STATUS.REGISTRATION) throw new Error('Already started');
  if (t.players.size < 2) throw new Error('Need at least 2 players');
}

// Build the bracket once tournament starts
export function buildBracket(t) {
  const playerList = Array.from(t.players.values());
  // Shuffle for seeding
  for (let i = playerList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerList[i], playerList[j]] = [playerList[j], playerList[i]];
  }

  // Pad to power of 2 with BYEs
  const targetSize = nextPow2(playerList.length);
  while (playerList.length < targetSize) playerList.push(null); // null = BYE

  // Build rounds
  const rounds = [];
  let roundPlayers = playerList;
  let roundNum = 1;

  while (roundPlayers.length > 1) {
    const matches = [];
    for (let i = 0; i < roundPlayers.length; i += 2) {
      matches.push({
        id: uuidv4().slice(0, 6),
        round: roundNum,
        matchIndex: matches.length,
        player1: roundPlayers[i],
        player2: roundPlayers[i + 1],
        status: roundNum === 1 ? MATCH_STATUS.PENDING : MATCH_STATUS.PENDING,
        winner: null,
        loser: null,
        entryPrice: null,
        exitPrice: null,
        asset: null,
        result: null,
      });
    }
    rounds.push(matches);
    // Next round: winners TBD (null placeholders)
    roundPlayers = matches.map(() => null);
    roundNum++;
  }

  t.bracket = rounds;
  t.totalRounds = rounds.length;

  // Auto-advance BYE matches immediately
  for (const match of rounds[0]) {
    if (match.player1 && !match.player2) {
      match.winner = match.player1;
      match.status = MATCH_STATUS.DONE;
      match.result = 'bye';
    } else if (!match.player1 && match.player2) {
      match.winner = match.player2;
      match.status = MATCH_STATUS.DONE;
      match.result = 'bye';
    } else if (!match.player1 && !match.player2) {
      match.status = MATCH_STATUS.DONE;
      match.result = 'bye';
    }
  }

  return rounds;
}

export function getTournament(id) { return tournaments.get(id) || null; }
export function getAllTournaments() { return tournaments; }

export function getPublicTournaments() {
  return Array.from(tournaments.values())
    .filter(t => t.isPublic)
    .map(serializeTournament);
}

export function serializeTournament(t) {
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    hostUsername: t.hostUsername,
    isPreset: !!t.isPreset,
    size: t.size,
    playerCount: t.players.size,
    isPublic: t.isPublic,
    hasPassword: !!t.password,
    status: t.status,
    currentRound: t.currentRound,
    totalRounds: t.totalRounds,
    createdAt: t.createdAt,
    players: Array.from(t.players.values()).map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      avatar: p.avatar,
      eliminated: p.eliminated,
      wins: p.wins,
    })),
    bracket: t.bracket,
    winner: t.winner,
  };
}

// ─── Tournament game loop ─────────────────────────────────────────────────────

let _io = null;
export function initTournamentEngine(io) { _io = io; }

export async function runTournament(t) {
  t.status = TOURNAMENT_STATUS.IN_PROGRESS;
  tBroadcast(t.id, 'tournament:started', serializeTournament(t));

  for (let roundIdx = 0; roundIdx < t.bracket.length; roundIdx++) {
    t.currentRound = roundIdx + 1;
    const matches = t.bracket[roundIdx];

    tBroadcast(t.id, 'tournament:roundStarting', {
      round: t.currentRound,
      totalRounds: t.totalRounds,
      matches: matches.map(serializeMatch),
    });

    await delay(2000);

    // Run all matches in this round concurrently
    const pendingMatches = matches.filter(m => m.status === MATCH_STATUS.PENDING && m.player1 && m.player2);
    await Promise.all(pendingMatches.map(m => runMatch(t, m)));

    // Advance winners into next round
    if (roundIdx + 1 < t.bracket.length) {
      const nextRound = t.bracket[roundIdx + 1];
      let winnerIdx = 0;
      for (const nextMatch of nextRound) {
        const w1 = matches[winnerIdx * 2]?.winner || null;
        const w2 = matches[winnerIdx * 2 + 1]?.winner || null;
        nextMatch.player1 = w1;
        nextMatch.player2 = w2;
        // Auto-BYE if only one player
        if (w1 && !w2) { nextMatch.winner = w1; nextMatch.status = MATCH_STATUS.DONE; nextMatch.result = 'bye'; }
        if (!w1 && w2) { nextMatch.winner = w2; nextMatch.status = MATCH_STATUS.DONE; nextMatch.result = 'bye'; }
        winnerIdx++;
      }
    }

    tBroadcast(t.id, 'tournament:roundFinished', {
      round: t.currentRound,
      matches: matches.map(serializeMatch),
      bracket: t.bracket.map(r => r.map(serializeMatch)),
    });

    await delay(4000);
  }

  // Tournament over
  const finalMatch = t.bracket[t.bracket.length - 1][0];
  t.winner = finalMatch?.winner || null;
  t.status = TOURNAMENT_STATUS.FINISHED;
  t.finishedAt = Date.now();

  // Persist win for champion
  if (t.winner) {
    updateUserStats(t.winner.userId, { pointsEarned: 500, won: true, correct: 0, total: 0, streak: 0 });
    addGameToHistory(t.winner.userId, {
      roomId: t.id, roomName: `Tournament: ${t.name}`,
      date: t.finishedAt, points: 500, rank: 1,
      totalPlayers: t.players.size, won: true, rounds: t.totalRounds,
    });
  }

  tBroadcast(t.id, 'tournament:finished', { winner: t.winner, bracket: t.bracket.map(r => r.map(serializeMatch)) });

  // Reset preset tournaments after 30 seconds so they're always available
  if (t.isPreset) {
    setTimeout(() => {
      const preset = PRESET_TOURNAMENTS.find(p => p.id === t.id);
      if (preset) {
        tournaments.set(t.id, {
          id: preset.id, name: preset.name, description: preset.description,
          hostUserId: 'system', hostUsername: 'System',
          size: preset.size, isPublic: true, password: null, isPreset: true,
          status: TOURNAMENT_STATUS.REGISTRATION,
          players: new Map(), bracket: null,
          currentRound: 0, totalRounds: Math.log2(preset.size),
          createdAt: Date.now(), finishedAt: null, winner: null,
        });
        tBroadcast(t.id, 'tournament:reset', { id: t.id, name: preset.name });
        console.log(`[Tournament] Reset preset: ${preset.id}`);
      }
    }, 30000);
  }
}

async function runMatch(t, match) {
  const assets = ['ETH/USD', 'BTC/USD', 'SOL/USD'];
  match.asset = assets[Math.floor(Math.random() * assets.length)];
  match.status = MATCH_STATUS.ACTIVE;

  await fetchLatestPrices();
  const prices = getLatestPrices();
  match.entryPrice = prices[match.asset]?.price || 0;

  // Notify room of this specific match starting
  tBroadcast(t.id, 'tournament:matchStart', {
    matchId: match.id,
    round: match.round,
    player1: match.player1,
    player2: match.player2,
    asset: match.asset,
    entryPrice: match.entryPrice,
    duration: ROUND_DURATION,
  });

  // Commit phase
  await delay(ROUND_DURATION * 1000);

  match.status = MATCH_STATUS.SETTLING;
  tBroadcast(t.id, 'tournament:matchSettling', { matchId: match.id });

  await fetchLatestPrices();
  const exitPrices = getLatestPrices();
  match.exitPrice = exitPrices[match.asset]?.price || match.entryPrice;

  const priceWentUp = match.exitPrice > match.entryPrice;
  const priceWentDown = match.exitPrice < match.entryPrice;

  // Get predictions for both players
  const p1 = t.players.get(match.player1?.userId);
  const p2 = t.players.get(match.player2?.userId);
  const p1Pred = p1?.predictions?.find(pr => pr.matchId === match.id);
  const p2Pred = p2?.predictions?.find(pr => pr.matchId === match.id);

  const p1Correct = p1Pred && ((p1Pred.direction === 'UP' && priceWentUp) || (p1Pred.direction === 'DOWN' && priceWentDown));
  const p2Correct = p2Pred && ((p2Pred.direction === 'UP' && priceWentUp) || (p2Pred.direction === 'DOWN' && priceWentDown));

  let winner, loser, result;

  if (p1Correct && !p2Correct) {
    winner = match.player1; loser = match.player2; result = 'p1_correct';
  } else if (p2Correct && !p1Correct) {
    winner = match.player2; loser = match.player1; result = 'p2_correct';
  } else if (!priceWentUp && !priceWentDown) {
    // Tie — coinflip (seed-based for determinism)
    winner = match.player1; loser = match.player2; result = 'tie_coinflip';
  } else {
    // Both wrong or both right — coinflip
    winner = Math.random() > 0.5 ? match.player1 : match.player2;
    loser = winner === match.player1 ? match.player2 : match.player1;
    result = 'tiebreak';
  }

  match.winner = winner;
  match.loser = loser;
  match.result = result;
  match.status = MATCH_STATUS.DONE;

  // Mark loser as eliminated
  if (loser) {
    const loserPlayer = t.players.get(loser.userId);
    if (loserPlayer) loserPlayer.eliminated = true;
  }
  if (winner) {
    const winnerPlayer = t.players.get(winner.userId);
    if (winnerPlayer) { winnerPlayer.wins += 1; updateUserStats(winner.userId, { pointsEarned: 100, won: false, correct: 1, total: 1, streak: 0 }); }
  }

  tBroadcast(t.id, 'tournament:matchResult', {
    matchId: match.id,
    round: match.round,
    winner, loser, result,
    entryPrice: match.entryPrice,
    exitPrice: match.exitPrice,
    asset: match.asset,
    p1Direction: p1Pred?.direction || null,
    p2Direction: p2Pred?.direction || null,
  });
}

// Called from socketServer when a player commits in tournament
export function commitTournamentMatch(tournamentId, userId, direction, matchId) {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Tournament not found' };
  const player = t.players.get(userId);
  if (!player) return { ok: false, error: 'Not in this tournament' };
  if (!player.predictions) player.predictions = [];
  const already = player.predictions.find(p => p.matchId === matchId);
  if (already) return { ok: false, error: 'Already committed' };
  player.predictions.push({ matchId, direction, ts: Date.now() });
  return { ok: true };
}

function serializeMatch(m) {
  return {
    id: m.id,
    round: m.round,
    matchIndex: m.matchIndex,
    player1: m.player1 ? { userId: m.player1.userId, displayName: m.player1.displayName, avatar: m.player1.avatar } : null,
    player2: m.player2 ? { userId: m.player2.userId, displayName: m.player2.displayName, avatar: m.player2.avatar } : null,
    status: m.status,
    winner: m.winner ? { userId: m.winner.userId, displayName: m.winner.displayName } : null,
    loser: m.loser ? { userId: m.loser.userId, displayName: m.loser.displayName } : null,
    asset: m.asset,
    entryPrice: m.entryPrice,
    exitPrice: m.exitPrice,
    result: m.result,
  };
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function tBroadcast(tournamentId, event, data) {
  if (_io) _io.to(`tournament:${tournamentId}`).emit(event, data);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
