import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, pricesApi } from '../lib/client.js';

export const COMMIT_WINDOW = 30;

export function useGame(toast) {
  const [room, setRoom] = useState(null);
  const [gamePhase, setGamePhase] = useState('lobby');
  const [roundData, setRoundData] = useState(null);
  const [scoreboard, setScoreboard] = useState([]);
  const [roundResult, setRoundResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [commitWindowOpen, setCommitWindowOpen] = useState(true);
  const [commitCount, setCommitCount] = useState({ committed: 0, total: 0 });
  const [myCommit, setMyCommit] = useState(null);
  const [myEntryPrice, setMyEntryPrice] = useState(null);
  const [commitExpired, setCommitExpired] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [events, setEvents] = useState([]);

  const timerRef = useRef(null);
  const roundDataRef = useRef(null);
  const myCommitRef = useRef(null);
  const isInLobbyRef = useRef(false);
  const handlersRegistered = useRef(false);

  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const addEvent = useCallback((msg, type = 'info') => {
    setEvents(prev => [{ id: Date.now() + Math.random(), msg, type, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  // Keep isInLobbyRef in sync
  useEffect(() => {
    isInLobbyRef.current = (gamePhase === 'lobby' && !!room);
  }, [gamePhase, room?.id]);

  // Register socket handlers — retry until socket is available
  // This handles the race between socket connection and component mount
  useEffect(() => {
    function registerHandlers() {
      const socket = getSocket();
      if (!socket) return false;
      if (handlersRegistered.current) return true;

      const handlers = {
        'room:playerJoined': ({ displayName, playerCount }) => {
          addEvent(`${displayName} joined`, 'join');
          toastRef.current?.info(`${displayName} joined`);
          setRoom(prev => prev ? { ...prev, playerCount } : prev);
        },
        'room:playerLeft': ({ displayName, playerCount }) => {
          addEvent(`${displayName} left`, 'leave');
          setRoom(prev => prev ? { ...prev, playerCount } : prev);
        },
        'game:starting': ({ totalRounds, players }) => {
          console.log('[Game] game:starting received');
          setGamePhase('starting');
          setGameHistory([]);
          addEvent(`🚀 Game starting! ${players.length} players, ${totalRounds} rounds`, 'system');
          toastRef.current?.info(`Game starting — ${players.length} players!`);
        },
        'round:start': (data) => {
          console.log('[Game] round:start received', data.round);
          roundDataRef.current = data;
          myCommitRef.current = null;
          setGamePhase('commit');
          setRoundData(data);
          setRoundResult(null);
          setMyCommit(null);
          setMyEntryPrice(null);
          setCommitExpired(false);
          setCommitWindowOpen(true);
          setTimeLeft(data.duration);
          if (!data.commitWindow) data.commitWindow = 30;
          setScoreboard(data.scoreboard || []);
          setCommitCount({ committed: 0, total: data.scoreboard?.length || 0 });
          addEvent(`📊 Round ${data.round}/${data.totalRounds} — ${data.asset}`, 'round');
          toastRef.current?.info(`Round ${data.round} — ${data.commitWindow || 30}s to predict!`, { duration: 2500 });

          clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
          }, 1000);
        },
        'round:tick': ({ remaining, committed, total, inCommitWindow }) => {
          setTimeLeft(remaining);
          setCommitCount({ committed, total });
          if (typeof inCommitWindow !== 'undefined') setCommitWindowOpen(!!inCommitWindow);
        },
        'round:commitWindowClosed': () => {
          setCommitWindowOpen(false);
          setCommitExpired(true);
          toastRef.current?.warn('Commit window closed!', { duration: 2000 });
          addEvent('🔒 Commit window closed — watching chart...', 'system');
        },
        'round:settling': () => {
          console.log('[Game] round:settling received');
          setGamePhase('reveal');
          setRoundResult(null);
          clearInterval(timerRef.current);
          addEvent('⏳ Settling with Pyth oracle...', 'system');
        },
        'round:result': (data) => {
          console.log('[Game] round:result received');
          setGamePhase('reveal');
          setRoundResult(data);
          setScoreboard(data.scoreboard || []);
          setGameHistory(prev => [...prev, data]);
          const dir = data.correctDirection;
          addEvent(
            dir ? `${data.asset} → ${dir} — CI: ${data.ciMultiplier}x` : `${data.asset} — TIE`,
            dir === 'UP' ? 'up' : dir === 'DOWN' ? 'down' : 'tie'
          );
        },
        'game:commitUpdate': ({ committed, total }) => {
          setCommitCount({ committed, total });
        },
        'game:finished': ({ scoreboard, winner }) => {
          setGamePhase('finished');
          setScoreboard(scoreboard);
          clearInterval(timerRef.current);
          addEvent(`🏆 Game over! Winner: ${winner?.displayName} with ${winner?.points} pts`, 'win');
          toastRef.current?.success(`${winner?.displayName} wins! 🏆`, { duration: 5000 });
        },
      };

      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event); // remove any stale handler first
        socket.on(event, handler);
      }

      // Also handle reconnect — re-sync room state
      socket.on('reconnect', () => {
        const s = getSocket();
        if (!s) return;
        s.emit('room:sync', {}, (res) => {
          if (res?.ok && res.room) {
            setRoom(res.room);
            if (res.room.status === 'starting' || res.room.status === 'active') {
              setGamePhase('starting');
            }
          }
        });
      });

      handlersRegistered.current = true;
      console.log('[Game] Socket handlers registered');
      return true;
    }

    // Try immediately
    if (registerHandlers()) return;

    // If socket not ready yet, retry every 200ms until it is
    const retryInterval = setInterval(() => {
      if (registerHandlers()) clearInterval(retryInterval);
    }, 200);

    return () => {
      clearInterval(retryInterval);
      clearInterval(timerRef.current);
      handlersRegistered.current = false;
      const socket = getSocket();
      if (socket) {
        ['room:playerJoined','room:playerLeft','game:starting','round:start',
         'round:tick','round:commitWindowClosed','round:settling','round:result',
         'game:commitUpdate','game:finished','reconnect'].forEach(e => socket.off(e));
      }
    };
  }, []); // mount/unmount only

  // Poll room playerCount while in lobby
  useEffect(() => {
    if (gamePhase !== 'lobby' || !room) return;
    const socket = getSocket();
    if (!socket) return;

    const interval = setInterval(() => {
      if (!isInLobbyRef.current) return;
      socket.emit('room:sync', {}, (res) => {
        if (!isInLobbyRef.current) return;
        if (res?.ok && res.room && res.room.playerCount) {
          setRoom(prev => {
            if (!prev) return prev;
            if (prev.playerCount !== res.room.playerCount) {
              return { ...prev, playerCount: res.room.playerCount };
            }
            return prev;
          });
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [gamePhase, room?.id]);

  const createRoom = useCallback((options) => {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('room:create', options, (res) => {
        if (res.ok) { setRoom(res.room); setGamePhase('lobby'); resolve(res.room); }
        else reject(new Error(res.error));
      });
    });
  }, []);

  const joinRoom = useCallback((roomId, password) => {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('room:join', { roomId, password }, (res) => {
        if (res.ok) {
          setRoom(res.room);
          if (res.room.status === 'active' || res.room.status === 'starting') {
            setGamePhase('starting');
          } else {
            setGamePhase('lobby');
          }
          resolve(res.room);
        }
        else reject(new Error(res.error));
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    isInLobbyRef.current = false;
    const socket = getSocket();
    if (socket) socket.emit('room:leave');
    setRoom(null);
    setGamePhase('lobby');
    setRoundData(null);
    setRoundResult(null);
    setScoreboard([]);
    setEvents([]);
    roundDataRef.current = null;
    myCommitRef.current = null;
    clearInterval(timerRef.current);
  }, []);

  const startGame = useCallback(() => {
    isInLobbyRef.current = false; // stop polling immediately
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      if (!socket) return reject(new Error('Not connected'));
      socket.emit('game:start', {}, (res) => {
        if (res?.ok) resolve();
        else {
          isInLobbyRef.current = true; // restore on error
          reject(new Error(res?.error || 'Failed to start'));
        }
      });
    });
  }, []);

  const commitPrediction = useCallback(async (direction) => {
    const socket = getSocket();
    if (!socket) throw new Error('Not connected');
    if (myCommitRef.current) throw new Error('Already committed');

    const asset = roundDataRef.current?.asset;
    let currentPrice = null;
    if (asset) {
      try {
        const prices = await pricesApi.latest();
        currentPrice = prices[asset]?.price || null;
      } catch {}
    }

    return new Promise((resolve, reject) => {
      socket.emit('game:commit', { direction, currentPrice }, (res) => {
        if (res?.ok) {
          myCommitRef.current = direction;
          setMyCommit(direction);
          const entryPrice = res.personalEntryPrice || currentPrice;
          setMyEntryPrice(entryPrice);
          toastRef.current?.info(
            `Locked ${direction === 'UP' ? '▲ UP' : '▼ DOWN'}${entryPrice ? ` @ $${entryPrice.toFixed(2)}` : ''}`,
            { duration: 2000 }
          );
          resolve({ personalEntryPrice: entryPrice });
        } else {
          reject(new Error(res?.error || 'Commit failed'));
        }
      });
    });
  }, []);

  return {
    room, setRoom,
    gamePhase, setGamePhase,
    roundData,
    scoreboard,
    roundResult,
    timeLeft,
    commitWindowOpen,
    commitCount,
    myCommit,
    myEntryPrice,
    commitExpired,
    gameHistory,
    events,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    commitPrediction,
  };
}
