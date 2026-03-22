import { ROOM_STATUS, createRoom, joinRoom, leaveRoom, canStartGame, commitDirection, settleRound, getScoreboard, finishGame, pickAsset, getRoom, COMMIT_WINDOW_SECONDS } from './roomEngine.js';
import { fetchLatestPrices, getLatestPrices } from './pythClient.js';
import { verifyToken, getUserById, makePublicUser } from './authService.js';
import {
  joinQuickRoyale, leaveQuickRoyale, commitQR,
  checkAutoStart, getQRState, serializeQRState, initQuickRoyale, QR_PHASE,
} from './quickRoyale.js';
import {
  createTournament, joinTournament, leaveTournament,
  canStartTournament, buildBracket, runTournament,
  getTournament, serializeTournament, commitTournamentMatch,
  getPublicTournaments, initTournamentEngine,
} from './tournamentEngine.js';

const timers = new Map();

// Track active socket per userId — kick old connection when same user reconnects
const userSockets = new Map(); // userId → socketId

export function initSocketServer(io) {
  initQuickRoyale(io);
  initTournamentEngine(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        const user = getUserById(payload.userId);
        if (user) { socket.user = user; return next(); }
      }
    }
    const guestName = socket.handshake.auth?.guestName;
    if (guestName) {
      socket.user = { id: `guest_${socket.id}`, username: `guest_${socket.id.slice(0, 6)}`, displayName: guestName.trim().slice(0, 20) || 'Guest', avatar: null, isGuest: true };
      return next();
    }
    next(new Error('Authentication required'));
  });

  io.on('connection', async (socket) => {
    const user = socket.user;

    // Handle reconnection — transfer room membership from old socket to new one
    if (!user.isGuest) {
      const prevSocketId = userSockets.get(user.id);
      if (prevSocketId && prevSocketId !== socket.id) {
        const prevSocket = io.sockets.sockets.get(prevSocketId);
        if (prevSocket) {
          // Transfer room state — AWAIT socket.join (it's async in socket.io v4)
          if (prevSocket.currentRoomId) {
            socket.currentRoomId = prevSocket.currentRoomId;
            socket.currentMode = prevSocket.currentMode || 'room';
            await socket.join(prevSocket.currentRoomId);
            console.log(`[Socket] Transferred room ${prevSocket.currentRoomId} to new socket for ${user.displayName}`);
          }
          if (prevSocket.currentTournamentId) {
            socket.currentTournamentId = prevSocket.currentTournamentId;
            await socket.join(`tournament:${prevSocket.currentTournamentId}`);
          }
          prevSocket.currentRoomId = null;
          prevSocket.currentTournamentId = null;
          prevSocket.disconnect(true);
        }
      }
      userSockets.set(user.id, socket.id);
    }

    console.log(`[Socket] Connected: ${user.displayName} (${socket.id})`);

    // ── Custom Rooms ──────────────────────────────────────────────────────────
    socket.on('room:create', async (options, cb) => {
      try {
        const room = createRoom({ hostUserId: user.id, hostUsername: user.username, ...options });
        await socket.join(room.id);
        joinRoom(room.id, { userId: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar });
        socket.currentRoomId = room.id;
        socket.currentMode = 'room';
        console.log(`[Room] Created: ${room.id} by ${user.displayName} (${room.rounds} rounds, ${room.roundDuration}s)`);
        cb({ ok: true, room: serializeRoom(room) });
      } catch (err) { cb({ ok: false, error: err.message }); }
    });

    socket.on('room:join', async ({ roomId, password }, cb) => {
      try {
        const room = joinRoom(roomId, { userId: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, password });
        await socket.join(roomId);
        socket.currentRoomId = roomId;
        socket.currentMode = 'room';

        const isRejoining = room.status !== ROOM_STATUS.WAITING;

        if (!isRejoining) {
          // New player — notify others
          io.to(roomId).emit('room:playerJoined', {
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            playerCount: room.players.size,
          });
        }

        // Return full serialized room including current status so client can sync
        cb({ ok: true, room: serializeRoom(room) });
      } catch (err) { cb({ ok: false, error: err.message }); }
    });

    socket.on('room:leave', () => handleRoomLeave(socket, io));

    // Sync current room state on demand (for reconnected players)
    socket.on('room:sync', (_, cb) => {
      const roomId = socket.currentRoomId;
      if (!roomId) return cb?.({ ok: false, error: 'Not in a room' });
      const room = getRoom(roomId);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });
      cb?.({ ok: true, room: serializeRoom(room) });
    });

    socket.on('game:start', (_, cb) => {
      const roomId = socket.currentRoomId;
      if (!roomId) return cb?.({ ok: false, error: 'Not in a room' });
      const room = getRoom(roomId);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });
      try { canStartGame(room, user.id); } catch (err) { return cb?.({ ok: false, error: err.message }); }

      cb?.({ ok: true });

      // Send game:starting directly to host socket as backup
      // (in case room broadcast is missed due to socket join race)
      socket.emit('game:starting', {
        totalRounds: room.rounds,
        players: Array.from(room.players.values()).map(p => ({ userId: p.userId, displayName: p.displayName, avatar: p.avatar }))
      });

      startGame(io, room);
    });

    socket.on('game:commit', ({ direction, currentPrice }, cb) => {
      const roomId = socket.currentRoomId;
      const room = getRoom(roomId);
      if (!room) return cb?.({ ok: false, error: 'Not in a room' });
      try {
        commitDirection(room, user.id, direction, currentPrice);
        // Return personal entry price to client so chart can show it
        const pred = Array.from(room.players.get(user.id)?.predictions || []).find(p => p.round === room.currentRound);
        cb?.({ ok: true, personalEntryPrice: pred?.personalEntryPrice });
        const committed = countCommitted(room);
        io.to(roomId).emit('game:commitUpdate', { committed, total: countActive(room) });
      } catch (err) { cb?.({ ok: false, error: err.message }); }
    });

    // ── Quick Royale ──────────────────────────────────────────────────────────
    socket.on('qr:join', (_, cb) => {
      const result = joinQuickRoyale(user.id, user.displayName, user.avatar);
      if (!result.ok) return cb?.({ ok: false, error: result.error });
      socket.join('quick-royale');
      socket.currentMode = 'quickroyale';
      checkAutoStart();
      cb?.({ ok: true, state: serializeQRState() });
      io.to('quick-royale').emit('qr:playerJoined', { displayName: user.displayName, playerCount: getQRState().players.size });
    });

    socket.on('qr:leave', () => handleQRLeave(socket, io));

    socket.on('qr:commit', ({ direction, currentPrice }, cb) => {
      const result = commitQR(user.id, direction, currentPrice);
      if (!result.ok) return cb?.({ ok: false, error: result.error });
      cb?.({ ok: true, personalEntryPrice: result.personalEntryPrice });
      const state = getQRState();
      const committed = countQRCommitted(state);
      io.to('quick-royale').emit('qr:commitUpdate', { committed, total: state.players.size });
    });

    socket.on('qr:getState', (_, cb) => {
      cb?.({ ok: true, state: serializeQRState() });
    });

    // ── Tournament ────────────────────────────────────────────────────────────
    socket.on('tournament:create', (options, cb) => {
      try {
        const t = createTournament({ hostUserId: user.id, hostUsername: user.displayName, ...options });
        joinTournament(t.id, { userId: user.id, displayName: user.displayName, avatar: user.avatar });
        socket.join(`tournament:${t.id}`);
        socket.currentTournamentId = t.id;
        socket.currentMode = 'tournament';
        cb({ ok: true, tournament: serializeTournament(t) });
      } catch (err) { cb({ ok: false, error: err.message }); }
    });

    socket.on('tournament:join', ({ tournamentId, password }, cb) => {
      try {
        const { t, autoStart } = joinTournament(tournamentId, { userId: user.id, displayName: user.displayName, avatar: user.avatar, password });
        socket.join(`tournament:${tournamentId}`);
        socket.currentTournamentId = tournamentId;
        socket.currentMode = 'tournament';

        const playerCount = t.players.size;
        const players = Array.from(t.players.values()).map(p => ({ userId: p.userId, displayName: p.displayName, avatar: p.avatar }));

        io.to(`tournament:${tournamentId}`).emit('tournament:playerJoined', {
          displayName: user.displayName, playerCount, players,
          // Broadcast whether manual start is now available (half+ joined)
          canStart: playerCount >= Math.ceil(t.size / 2),
          isFull: playerCount >= t.size,
        });

        cb({ ok: true, tournament: serializeTournament(t) });

        // Auto-start when tournament is completely full
        if (autoStart) {
          setTimeout(() => {
            if (t.status === 'registration') {
              io.to(`tournament:${tournamentId}`).emit('tournament:autoStarting', { countdown: 5 });
              // 5-second countdown then start
              let count = 5;
              const cInterval = setInterval(() => {
                count--;
                io.to(`tournament:${tournamentId}`).emit('tournament:autoStartTick', { remaining: count });
                if (count <= 0) {
                  clearInterval(cInterval);
                  if (t.status === 'registration') {
                    buildBracket(t);
                    io.to(`tournament:${tournamentId}`).emit('tournament:started', serializeTournament(t));
                    runTournament(t).catch(err => console.error('[Tournament] Error:', err));
                  }
                }
              }, 1000);
            }
          }, 500);
        }
      } catch (err) { cb({ ok: false, error: err.message }); }
    });

    socket.on('tournament:leave', () => handleTournamentLeave(socket, io));

    socket.on('tournament:start', ({ tournamentId } = {}, cb) => {
      // Accept tournamentId from client OR fall back to socket's stored id
      const tId = tournamentId || socket.currentTournamentId;
      const t = getTournament(tId);
      if (!t) return cb?.({ ok: false, error: 'Tournament not found' });
      // Any player in the tournament can start (not just host) — preset tournaments have system host
      if (t.status !== 'registration') return cb?.({ ok: false, error: 'Tournament already started' });
      if (t.players.size < 2) return cb?.({ ok: false, error: 'Need at least 2 players' });
      buildBracket(t);
      cb?.({ ok: true, tournament: serializeTournament(t) });
      runTournament(t).catch(err => console.error('[Tournament] Error:', err));
    });

    socket.on('tournament:commit', ({ matchId, direction }, cb) => {
      const tId = socket.currentTournamentId;
      if (!tId) return cb?.({ ok: false, error: 'Not in a tournament' });
      const result = commitTournamentMatch(tId, user.id, direction, matchId);
      if (!result.ok) return cb?.({ ok: false, error: result.error });
      cb?.({ ok: true });
      io.to(`tournament:${tId}`).emit('tournament:commitUpdate', { matchId, userId: user.id, displayName: user.displayName });
    });

    socket.on('tournament:getState', ({ tournamentId }, cb) => {
      const t = getTournament(tournamentId);
      if (!t) return cb?.({ ok: false, error: 'Not found' });
      cb?.({ ok: true, tournament: serializeTournament(t) });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!user.isGuest && userSockets.get(user.id) === socket.id) {
        userSockets.delete(user.id);
      }
      if (socket.currentMode === 'room') handleRoomLeave(socket, io);
      if (socket.currentMode === 'quickroyale') handleQRLeave(socket, io);
      if (socket.currentMode === 'tournament') handleTournamentLeave(socket, io);
      console.log(`[Socket] Disconnected: ${user.displayName}`);
    });
  });
}

// ─── Custom Room Game Loop ────────────────────────────────────────────────────
async function startGame(io, room) {
  room.status = ROOM_STATUS.STARTING;
  room.startedAt = Date.now();
  room.currentRound = 0;

  // Broadcast to room channel
  io.to(room.id).emit('game:starting', {
    totalRounds: room.rounds,
    players: Array.from(room.players.values()).map(p => ({ userId: p.userId, displayName: p.displayName, avatar: p.avatar }))
  });

  // Wait for clients to process game:starting before first round
  await delay(2000);
  await runNextRound(io, room);
}

async function runNextRound(io, room) {
  if (room.status === ROOM_STATUS.FINISHED) return;
  room.currentRound += 1;
  if (room.currentRound > room.rounds) return endGame(io, room);

  const asset = pickAsset(room);
  room.currentAsset = asset;
  let entryPrice = 0;
  try { await fetchLatestPrices(); entryPrice = getLatestPrices()[asset]?.price || 0; } catch {}

  room.rounds_data.push({ round: room.currentRound, asset, entryPrice, startedAt: Date.now(), exitPrice: null, correctDirection: null, results: [], settledAt: null });
  room.status = ROOM_STATUS.COMMIT;
  room.roundStartTime = Date.now();
  room.commitDeadline = Date.now() + room.roundDuration * 1000;

  io.to(room.id).emit('round:start', {
    round: room.currentRound, totalRounds: room.rounds, asset, entryPrice,
    duration: room.roundDuration, commitWindow: COMMIT_WINDOW_SECONDS,
    deadline: room.commitDeadline, scoreboard: getScoreboard(room),
  });

  let remaining = room.roundDuration;
  const tickInterval = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      const inCommitWindow = remaining > (room.roundDuration - COMMIT_WINDOW_SECONDS);
      io.to(room.id).emit('round:tick', { remaining, committed: countCommitted(room), total: countActive(room), inCommitWindow });
    }
    // Broadcast when commit window closes
    if (remaining === room.roundDuration - COMMIT_WINDOW_SECONDS) {
      io.to(room.id).emit('round:commitWindowClosed', { round: room.currentRound });
    }
  }, 1000);

  const roundTimer = setTimeout(async () => {
    clearInterval(tickInterval);
    if (room.status !== ROOM_STATUS.COMMIT) return;
    room.status = ROOM_STATUS.REVEAL;
    io.to(room.id).emit('round:settling', { round: room.currentRound, asset });
    let settlement;
    try { settlement = await settleRound(room); } catch { settlement = { correctDirection: null, entryPrice, exitPrice: entryPrice, ciMultiplier: 1, results: [] }; }
    io.to(room.id).emit('round:result', { round: room.currentRound, asset, entryPrice, exitPrice: settlement.exitPrice, correctDirection: settlement.correctDirection, ciMultiplier: settlement.ciMultiplier, results: settlement.results, scoreboard: getScoreboard(room) });
    await delay(5000);
    if (room.currentRound < room.rounds) await runNextRound(io, room);
    else endGame(io, room);
  }, room.roundDuration * 1000);

  const existing = timers.get(room.id);
  if (existing?.roundTimer) clearTimeout(existing.roundTimer);
  if (existing?.tickInterval) clearInterval(existing.tickInterval);
  timers.set(room.id, { roundTimer, tickInterval });
}

async function endGame(io, room) {
  const { scoreboard, winner } = await finishGame(room);
  io.to(room.id).emit('game:finished', { scoreboard, winner, rounds: room.rounds_data });
  const t = timers.get(room.id);
  if (t?.roundTimer) clearTimeout(t.roundTimer);
  if (t?.tickInterval) clearInterval(t.tickInterval);
  timers.delete(room.id);
}

// ─── Leave helpers ────────────────────────────────────────────────────────────
function handleRoomLeave(socket, io) {
  const roomId = socket.currentRoomId;
  if (!roomId) return;
  const user = socket.user;
  leaveRoom(roomId, user.id);
  socket.leave(roomId);
  socket.currentRoomId = null;
  socket.currentMode = null;
  const room = getRoom(roomId);
  if (room) io.to(roomId).emit('room:playerLeft', { userId: user.id, displayName: user.displayName, playerCount: room.players.size });
}

function handleQRLeave(socket, io) {
  leaveQuickRoyale(socket.user.id);
  socket.leave('quick-royale');
  socket.currentMode = null;
  checkAutoStart();
  io.to('quick-royale').emit('qr:playerLeft', { displayName: socket.user.displayName, playerCount: getQRState().players.size });
}

function handleTournamentLeave(socket, io) {
  const tId = socket.currentTournamentId;
  if (!tId) return;
  leaveTournament(tId, socket.user.id);
  socket.leave(`tournament:${tId}`);
  socket.currentTournamentId = null;
  socket.currentMode = null;
  const t = getTournament(tId);
  if (t) io.to(`tournament:${tId}`).emit('tournament:playerLeft', { displayName: socket.user.displayName, playerCount: t.players.size });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function serializeRoom(room) {
  return { id: room.id, name: room.name, hostUserId: room.hostUserId, hostUsername: room.hostUsername, isPublic: room.isPublic, hasPassword: !!room.password, maxPlayers: room.maxPlayers, rounds: room.rounds, roundDuration: room.roundDuration, assetRotation: room.assetRotation, pointMode: room.pointMode, status: room.status, currentRound: room.currentRound, playerCount: room.players.size, players: Array.from(room.players.values()).map(p => ({ userId: p.userId, username: p.username, displayName: p.displayName, avatar: p.avatar, points: p.points, eliminated: p.eliminated })), createdAt: room.createdAt };
}
function countCommitted(room) { let n = 0; for (const p of room.players.values()) { if (!p.eliminated && p.predictions.some(pr => pr.round === room.currentRound)) n++; } return n; }
function countActive(room) { let n = 0; for (const p of room.players.values()) { if (!p.eliminated) n++; } return n; }
function countQRCommitted(state) { let n = 0; for (const p of state.players.values()) { if (p.predictions.some(pr => pr.round === state.currentRound)) n++; } return n; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
