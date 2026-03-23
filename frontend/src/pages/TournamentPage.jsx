import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, api } from '../lib/client.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';
import CountdownTimer from '../components/CountdownTimer.jsx';
import PriceChart from '../components/PriceChart.jsx';
import RoundResult from '../components/RoundResult.jsx';

const VIEW = { LOBBY: 'lobby', WAITING: 'waiting', PLAYING: 'playing' };

export default function TournamentPage({ onLeave }) {
  const { user } = useAuth();
  const toast = useToast();

  const [view, setView] = useState(VIEW.LOBBY);
  const [tournament, setTournament] = useState(null);
  const [publicList, setPublicList] = useState([]);
  const [loadingId, setLoadingId] = useState(null);

  // Waiting room state
  const [autoStartCountdown, setAutoStartCountdown] = useState(null); // null = no countdown
  const [canStart, setCanStart] = useState(false);

  // Playing state
  const [activeMatch, setActiveMatch] = useState(null);
  const [myCommit, setMyCommit] = useState(null);
  const [myEntryPrice, setMyEntryPrice] = useState(null);
  const [matchTimeLeft, setMatchTimeLeft] = useState(45);
  const [matchResult, setMatchResult] = useState(null);
  const [isEliminated, setIsEliminated] = useState(false);
  const [champion, setChampion] = useState(null);

  const [events, setEvents] = useState([]);

  // Refs to avoid stale closures in socket handlers
  const activeMatchRef = useRef(null);
  const myCommitRef = useRef(null);
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const addEvent = useCallback((msg, type = 'info') => {
    setEvents(prev => [{ id: Date.now() + Math.random(), msg, type }, ...prev].slice(0, 20));
  }, []);

  // Poll public list
  useEffect(() => {
    loadList();
    const interval = setInterval(loadList, 4000);
    return () => clearInterval(interval);
  }, []);

  function loadList() {
    api.get('/tournaments').then(r => setPublicList(r.data)).catch(() => {});
  }

  // Register ALL socket handlers ONCE — same pattern as QuickRoyalePage
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlers = {
      'tournament:playerJoined': ({ displayName, playerCount, players, canStart: cs, isFull }) => {
        addEvent(`${displayName} joined`, 'join');
        toastRef.current?.info(`${displayName} joined`);
        setTournament(prev => prev ? { ...prev, playerCount, players } : prev);
        setCanStart(!!cs);
        loadList();
        if (isFull) addEvent('🔥 Tournament full! Auto-starting...', 'system');
      },
      'tournament:playerLeft': ({ displayName, playerCount }) => {
        addEvent(`${displayName} left`, 'leave');
        setTournament(prev => prev ? { ...prev, playerCount } : prev);
        setCanStart(false);
        setAutoStartCountdown(null);
        loadList();
      },
      'tournament:autoStarting': ({ countdown }) => {
        setAutoStartCountdown(countdown);
        addEvent(`⚡ Full! Auto-starting in ${countdown}s...`, 'system');
        toastRef.current?.success(`Tournament full! Starting in ${countdown}s`);
      },
      'tournament:autoStartTick': ({ remaining }) => {
        setAutoStartCountdown(remaining);
      },
      'tournament:started': (t) => {
        setTournament(t);
        setView(VIEW.PLAYING);
        setAutoStartCountdown(null);
        addEvent('🏆 Bracket locked — battle begins!', 'system');
        toastRef.current?.success('Tournament started!');
      },
      'tournament:roundStarting': ({ round, totalRounds }) => {
        addEvent(`⚔️ Round ${round}/${totalRounds}`, 'round');
      },
      'tournament:matchStart': (data) => {
        const isMe = data.player1?.userId === user?.id || data.player2?.userId === user?.id;
        if (isMe) {
          activeMatchRef.current = data;
          myCommitRef.current = null;
          setActiveMatch(data);
          setMyCommit(null);
          setMyEntryPrice(null);
          setMatchResult(null);
          setMatchTimeLeft(data.duration || 45);
          const opp = data.player1?.userId === user?.id ? data.player2?.displayName : data.player1?.displayName;
          addEvent(`⚔️ Your match vs ${opp} — ${data.asset}`, 'round');
          toastRef.current?.warn(`Match vs ${opp}! Predict ${data.asset}`, { duration: 4000 });
        }
      },
      'tournament:matchResult': (data) => {
        const isMe = data.winner?.userId === user?.id || data.loser?.userId === user?.id;
        if (isMe) {
          const won = data.winner?.userId === user?.id;
          setMatchResult(data);
          if (!won) {
            setIsEliminated(true);
            toastRef.current?.error('❌ Eliminated.', { duration: 3000 });
            addEvent('❌ You were eliminated', 'lose');
          } else {
            toastRef.current?.success('✅ You advanced!', { duration: 3000 });
            addEvent('✅ You advanced to next round!', 'win');
          }
          // Clear active match after 5s
          setTimeout(() => { setActiveMatch(null); activeMatchRef.current = null; }, 5000);
        }
        setTournament(prev => prev ? { ...prev } : prev);
      },
      'tournament:roundFinished': ({ round, bracket }) => {
        setTournament(prev => prev ? { ...prev, bracket, currentRound: round } : prev);
      },
      'tournament:finished': ({ winner, bracket }) => {
        setTournament(prev => prev ? { ...prev, status: 'finished', winner, bracket } : prev);
        setChampion(winner);
        if (winner?.userId === user?.id) toastRef.current?.success('🏆 You won the tournament!', { duration: 6000 });
        else toastRef.current?.info(`Winner: ${winner?.displayName} 🏆`, { duration: 5000 });
        addEvent(`🏆 Champion: ${winner?.displayName}`, 'win');
        loadList();
      },
      'tournament:reset': () => { loadList(); },
      'tournament:commitUpdate': ({ displayName }) => {
        addEvent(`${displayName} committed`, 'info');
      },
    };

    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
    return () => {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
    };
  }, []); // Register ONCE

  // Match countdown
  useEffect(() => {
    if (!activeMatch) return;
    const interval = setInterval(() => setMatchTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [activeMatch?.id]);

  function handleJoin(tournamentId) {
    const socket = getSocket();
    if (!socket) return;
    setLoadingId(tournamentId);
    socket.emit('tournament:join', { tournamentId }, (res) => {
      setLoadingId(null);
      if (res.ok) {
        setTournament(res.tournament);
        setView(VIEW.WAITING);
        setCanStart((res.tournament.playerCount || 0) >= Math.ceil(res.tournament.size / 2));
        toast.success(`Joined ${res.tournament.name}!`);
        loadList();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleStart() {
    const socket = getSocket();
    if (!socket || !tournament) return;
    socket.emit('tournament:start', { tournamentId: tournament.id }, (res) => {
      if (!res?.ok) toast.error(res?.error || 'Could not start');
    });
  }

  function handleLeave() {
    const socket = getSocket();
    if (socket) socket.emit('tournament:leave');
    setTournament(null);
    setView(VIEW.LOBBY);
    setActiveMatch(null);
    setMatchResult(null);
    setIsEliminated(false);
    setChampion(null);
    setAutoStartCountdown(null);
    activeMatchRef.current = null;
    loadList();
  }

  async function handleCommit(direction) {
    if (!activeMatchRef.current || myCommitRef.current) return;
    const socket = getSocket();
    if (!socket) return;

    // Fetch live price at commit moment
    let currentPrice = null;
    const match = activeMatchRef.current;
    if (match?.asset) {
      try {
        const res = await api.get('/prices');
        currentPrice = res.data[match.asset]?.price || null;
      } catch {}
    }

    socket.emit('tournament:commit', { matchId: match.id, direction, currentPrice }, (res) => {
      if (res?.ok) {
        myCommitRef.current = direction;
        setMyCommit(direction);
        // Use server-confirmed personal entry price if returned, else use our local fetch
        const entryPrice = res.personalEntryPrice || currentPrice;
        setMyEntryPrice(entryPrice);
        toastRef.current?.info(`Locked: ${direction === 'UP' ? '▲ UP' : '▼ DOWN'}${entryPrice ? ` @ $${entryPrice.toFixed(2)}` : ''}`, { duration: 1800 });
      } else {
        toast.error(res?.error || 'Could not commit');
      }
    });
  }

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (view === VIEW.LOBBY) {
    return (
      <div className="tp-page">
        <div className="tp-hero">
          <div className="tp-hero-icon">🏆</div>
          <div className="tp-hero-title">TOURNAMENT MODE</div>
          <div className="tp-hero-sub">Bracket-style single elimination · Join a room · Auto-starts when full</div>
        </div>

        <div className="tp-grid">
          {publicList.length === 0 ? (
            <div className="card tp-empty">Loading tournaments...</div>
          ) : publicList.map(t => {
            const isOpen = t.status === 'registration';
            const isRunning = t.status === 'in_progress';
            const isDone = t.status === 'finished';
            const isFull = t.playerCount >= t.size;
            const pct = (t.playerCount / t.size) * 100;

            return (
              <div key={t.id} className={`card tp-room ${isRunning ? 'running' : ''} ${isDone ? 'done' : ''}`}>
                <div className="tp-room-top">
                  <div className="tp-room-name">{t.name}</div>
                  <span className={`tag ${isRunning ? 'tag-amber' : isDone ? 'tag-red' : isFull ? 'tag-amber' : 'tag-green'}`}>
                    {isRunning ? '⚔️ Live' : isDone ? '✓ Done' : isFull ? '🔥 Full' : '● Open'}
                  </span>
                </div>

                {t.description && <div className="tp-room-desc text-dim">{t.description}</div>}

                {/* Player fill bar */}
                <div>
                  <div className="tp-fill-bar">
                    <div className="tp-fill-inner" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 5 }}>
                    <span className="mono text-cyan" style={{ fontWeight: 700, fontSize: 20 }}>{t.playerCount}</span>
                    <span className="text-dim" style={{ fontSize: 14 }}>&nbsp;/ {t.size} players</span>
                    {isOpen && !isFull && (
                      <span className="text-green" style={{ fontSize: 12, marginLeft: 10 }}>
                        {t.size - t.playerCount} spot{t.size - t.playerCount !== 1 ? 's' : ''} left
                      </span>
                    )}
                  </div>
                </div>

                {/* Round dots */}
                <div className="tp-rounds">
                  {Array.from({ length: Math.log2(t.size) }).map((_, i) => (
                    <div key={i} className={`tp-dot ${i < (t.currentRound || 0) ? 'done' : ''}`} />
                  ))}
                  <span className="text-dim" style={{ fontSize: 11 }}>{Math.log2(t.size)} rounds</span>
                </div>

                <div className="tp-actions">
                  {isOpen && !isFull && (
                    <button className="btn btn-primary" style={{ flex: 1, padding: '9px 0' }}
                      onClick={() => handleJoin(t.id)} disabled={!!loadingId}>
                      {loadingId === t.id ? 'Joining...' : 'Join →'}
                    </button>
                  )}
                  {isFull && isOpen && <div className="tp-status-text text-amber">🔥 Full — starting shortly</div>}
                  {isRunning && <div className="tp-status-text text-amber">⚔️ Battle in progress...</div>}
                  {isDone && <div className="tp-status-text text-dim">✓ Resetting soon...</div>}
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onLeave}>← Back to Lobby</button>
        <TpStyles />
      </div>
    );
  }

  // ── WAITING ROOM ──────────────────────────────────────────────────────────
  if (view === VIEW.WAITING && tournament) {
    const playerCount = tournament.playerCount || 0;
    const size = tournament.size;
    const pct = (playerCount / size) * 100;

    return (
      <div className="tp-page">
        <div className="card tp-waiting-card">
          <div className="tp-wait-title">🏆 {tournament.name}</div>
          {tournament.description && <div className="text-dim" style={{ fontSize: 13 }}>{tournament.description}</div>}

          {/* Auto-start countdown */}
          {autoStartCountdown !== null && (
            <div className="tp-autostart-banner">
              <span style={{ fontSize: 28 }}>⚡</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--amber)' }}>STARTING IN</div>
                <div className="mono text-amber" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>{autoStartCountdown}</div>
              </div>
            </div>
          )}

          {/* Player slots */}
          <div className="tp-slot-grid">
            {Array.from({ length: size }).map((_, i) => {
              const p = tournament.players?.[i];
              return (
                <div key={i} className={`tp-slot ${p ? 'filled' : 'empty'}`}>
                  {p ? (
                    <>
                      {p.avatar
                        ? <img src={p.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                        : <div className="tp-slot-initial">{p.displayName[0].toUpperCase()}</div>
                      }
                      <span className="tp-slot-name">{p.displayName}</span>
                      {p.userId === user?.id && <span className="you-tag">YOU</span>}
                    </>
                  ) : (
                    <span className="text-dim" style={{ fontSize: 11 }}>Empty</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Fill bar */}
          <div style={{ width: '100%' }}>
            <div className="tp-fill-bar">
              <div className="tp-fill-inner" style={{ width: `${pct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, fontSize: 14 }}>
              <span className="mono text-cyan" style={{ fontWeight: 700 }}>{playerCount}</span>
              <span className="text-dim">&nbsp;/ {size} players joined</span>
            </div>
          </div>

          {/* Status / Start button */}
          {autoStartCountdown === null && (
            <>
              {playerCount < size ? (
                <div className="text-dim" style={{ fontSize: 13, textAlign: 'center' }}>
                  Waiting for {size - playerCount} more player{size - playerCount !== 1 ? 's' : ''}...
                  Auto-starts when full
                </div>
              ) : null}
              {canStart && playerCount < size && (
                <button className="btn btn-primary" style={{ minWidth: 240 }} onClick={handleStart}>
                  ▶ Start Now ({playerCount} / {size} players)
                </button>
              )}
            </>
          )}

          <div className="text-dim" style={{ fontSize: 12, textAlign: 'center' }}>
            Code: <span className="mono text-cyan">{tournament.id}</span> — share with friends!
          </div>
        </div>

        <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={handleLeave}>← Leave</button>
        <TpStyles />
      </div>
    );
  }

  // ── PLAYING ───────────────────────────────────────────────────────────────
  if (view === VIEW.PLAYING && tournament) {
    return (
      <div className="tp-page">
        <div className="card tp-play-header">
          <div>
            <div className="tp-play-title">{tournament.name}</div>
            <div className="text-dim" style={{ fontSize: 12, marginTop: 3 }}>
              Round {tournament.currentRound || '?'}/{tournament.totalRounds} · {tournament.players?.length} players
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {isEliminated && <span className="tag tag-red">Eliminated</span>}
            {tournament.status === 'finished' && <span className="tag tag-amber">Finished</span>}
            <button className="btn-ghost" onClick={handleLeave}>← Leave</button>
          </div>
        </div>

        <div className="tp-play-grid">
          {/* Left: bracket */}
          <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
            <div className="tp-section-label">BRACKET</div>
            <BracketView bracket={tournament.bracket} myUserId={user?.id} />
          </div>

          {/* Right: match area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Active match — QR style with chart */}
            {activeMatch && !isEliminated && !matchResult && (
              <div className="card tp-match animate-fade">
                <div className="tp-match-label">⚔️ YOUR MATCH</div>
                <div className="tp-match-vs">
                  <div className={`tp-match-player ${activeMatch.player1?.userId === user?.id ? 'me' : ''}`}>
                    {activeMatch.player1?.displayName}
                  </div>
                  <div className="tp-vs-text">VS</div>
                  <div className={`tp-match-player ${activeMatch.player2?.userId === user?.id ? 'me' : ''}`}>
                    {activeMatch.player2?.displayName}
                  </div>
                </div>

                {/* Live chart — same as Quick Royale */}
                <div style={{ width: '100%' }}>
                  <PriceChart
                    asset={activeMatch.asset}
                    entryPrice={activeMatch.entryPrice}
                    personalEntryPrice={myEntryPrice}
                    showEntryLine={!!myCommit}
                    roundStartTime={activeMatch.startedAt || Date.now()}
                  />
                </div>

                {/* Timer + buttons */}
                <div className="tp-predict-area">
                  <CountdownTimer total={activeMatch.duration || 45} remaining={matchTimeLeft} />

                  {!myCommit ? (
                    <div className="tp-predict-row">
                      <button className="btn btn-up" onClick={() => handleCommit('UP')}>▲ UP</button>
                      <span className="tp-vs-text">VS</span>
                      <button className="btn btn-down" onClick={() => handleCommit('DOWN')}>▼ DOWN</button>
                    </div>
                  ) : (
                    <div className={`tp-committed ${myCommit === 'UP' ? 'up' : 'down'}`}>
                      {myCommit === 'UP' ? '▲' : '▼'} Locked: <strong>{myCommit}</strong>
                      {myEntryPrice && (
                        <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 8 }}>
                          @ ${myEntryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Match result */}
            {matchResult && (
              <div className="animate-fade">
                <RoundResult
                  result={{
                    // correctDirection based on round start price (for display note only)
                    correctDirection: matchResult.exitPrice > matchResult.entryPrice ? 'UP' : matchResult.exitPrice < matchResult.entryPrice ? 'DOWN' : null,
                    exitPrice: matchResult.exitPrice,
                    entryPrice: matchResult.entryPrice,
                    ciMultiplier: 1,
                    results: [
                      {
                        userId: matchResult.winner?.userId,
                        correct: true,
                        pointsEarned: 100,
                        personalEntryPrice: matchResult.winner?.userId === user?.id
                          ? (myEntryPrice || matchResult.p1PersonalEntry || matchResult.p2PersonalEntry)
                          : null,
                      },
                      {
                        userId: matchResult.loser?.userId,
                        correct: false,
                        pointsEarned: 0,
                        personalEntryPrice: matchResult.loser?.userId === user?.id
                          ? (myEntryPrice || matchResult.p1PersonalEntry || matchResult.p2PersonalEntry)
                          : null,
                      },
                    ],
                    asset: matchResult.asset,
                  }}
                  myUserId={user?.id}
                  myCommit={myCommit}
                  myEntryPrice={myEntryPrice}
                />
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13 }} className="text-dim">
                  {matchResult.winner?.userId === user?.id ? '✅ Moving to next round...' : '💀 You have been eliminated'}
                </div>
              </div>
            )}

            {/* Waiting for match */}
            {!activeMatch && !matchResult && !isEliminated && tournament.status !== 'finished' && (
              <div className="card" style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 36 }}>⏳</div>
                <div className="text-dim">Waiting for your match...</div>
                <div className="text-dim" style={{ fontSize: 12 }}>Other matches are running</div>
              </div>
            )}

            {/* Eliminated spectator */}
            {isEliminated && !matchResult && (
              <div className="card" style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 40 }}>💀</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: 3, color: 'var(--red)' }}>ELIMINATED</div>
                <div className="text-dim">Watching remaining matches...</div>
              </div>
            )}

            {/* Champion */}
            {tournament.status === 'finished' && champion && (
              <div className="card" style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, borderColor: 'rgba(251,191,36,0.3)' }}>
                <div style={{ fontSize: 52 }}>🏆</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: 'var(--amber)' }}>CHAMPION</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--tx1)' }}>{champion.displayName}</div>
                {champion.userId === user?.id && (
                  <div style={{ color: 'var(--amber)', fontSize: 13 }}>🎉 That's you!</div>
                )}
              </div>
            )}

            {/* Event feed */}
            <div className="card" style={{ padding: 14 }}>
              <div className="tp-section-label">LIVE FEED</div>
              {events.length === 0
                ? <div className="text-dim" style={{ fontSize: 12 }}>Events will appear here...</div>
                : events.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }} className="animate-fade">
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5, display: 'block',
                      background: ev.type === 'win' ? 'var(--amber)' : ev.type === 'round' ? 'var(--cyan)' : ev.type === 'lose' ? 'var(--red)' : ev.type === 'join' ? 'var(--green)' : 'var(--tx3)',
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{ev.msg}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        <TpStyles />
      </div>
    );
  }

  return null;
}

// ── Bracket view ──────────────────────────────────────────────────────────────
function BracketView({ bracket, myUserId }) {
  if (!bracket?.length) {
    return <div className="text-dim" style={{ fontSize: 13, padding: '16px 0' }}>Building bracket...</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, minHeight: 60 }}>
      {bracket.map((round, ri) => (
        <div key={ri} style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700,
            letterSpacing: 2, color: 'var(--tx3)', textAlign: 'center',
            padding: '4px 0 8px', borderBottom: '1px solid var(--border)', marginBottom: 8,
          }}>
            {ri === bracket.length - 1 ? 'FINAL' : ri === bracket.length - 2 ? 'SEMI' : `R${ri + 1}`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
            {round.map(match => {
              const done = match.status === 'done';
              return (
                <div key={match.id} style={{
                  border: `1px solid ${done ? 'rgba(56,189,248,0.2)' : 'var(--border)'}`,
                  borderRadius: 6, overflow: 'hidden', fontSize: 11,
                }}>
                  {[match.player1, match.player2].map((p, pi) => {
                    const isWinner = done && match.winner?.userId === p?.userId;
                    const isLoser = done && match.loser?.userId === p?.userId;
                    const isMe = p?.userId === myUserId;
                    return (
                      <div key={pi}>
                        <div style={{
                          padding: '5px 8px', maxWidth: 112,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: isMe ? 'var(--cyan)' : isWinner ? 'var(--green)' : isLoser ? 'var(--tx3)' : 'var(--tx2)',
                          fontWeight: isWinner || isMe ? 700 : 400,
                          background: isWinner ? 'rgba(52,211,153,0.08)' : isLoser ? 'rgba(248,113,113,0.05)' : 'transparent',
                          textDecoration: isLoser ? 'line-through' : 'none',
                        }}>
                          {p?.displayName || <span style={{ color: 'var(--tx3)' }}>TBD</span>}
                        </div>
                        {pi === 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
                      </div>
                    );
                  })}
                  {match.asset && (
                    <div style={{ fontSize: 9, color: 'var(--tx3)', padding: '2px 8px', background: 'var(--bg3)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                      {match.asset}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TpStyles() {
  return (
    <style>{`
      .tp-page { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

      .tp-hero { text-align: center; padding: 4px 0 12px; }
      .tp-hero-icon { font-size: 44px; filter: drop-shadow(0 0 12px rgba(251,191,36,0.5)); }
      .tp-hero-title { font-family: var(--font-display); font-size: 28px; font-weight: 700; letter-spacing: 4px; color: var(--amber); text-shadow: 0 0 24px rgba(251,191,36,0.25); margin-top: 8px; }
      .tp-hero-sub { color: var(--tx3); font-size: 13px; margin-top: 6px; }

      .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .tp-empty { padding: 60px; text-align: center; color: var(--tx3); }

      .tp-room { padding: 20px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s; }
      .tp-room:hover { border-color: var(--border2); }
      .tp-room.running { border-color: rgba(251,191,36,0.3); }
      .tp-room.done { opacity: 0.5; }
      .tp-room-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .tp-room-name { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--tx1); }
      .tp-room-desc { font-size: 12px; color: var(--tx3); }
      .tp-fill-bar { height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
      .tp-fill-inner { height: 100%; background: var(--cyan); border-radius: 3px; transition: width 0.5s; box-shadow: 0 0 6px rgba(56,189,248,0.4); }
      .tp-rounds { display: flex; align-items: center; gap: 5px; }
      .tp-dot { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--border); background: var(--bg3); }
      .tp-dot.done { background: var(--green); border-color: var(--green); }
      .tp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .tp-status-text { font-size: 12px; font-family: var(--font-display); letter-spacing: 0.5px; padding: 4px 0; }

      /* Waiting */
      .tp-waiting-card { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 32px; max-width: 600px; margin: 0 auto; }
      .tp-wait-title { font-family: var(--font-display); font-size: 22px; font-weight: 700; letter-spacing: 2px; color: var(--amber); }
      .tp-autostart-banner {
        display: flex; align-items: center; gap: 16px;
        background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.4);
        border-radius: var(--radius); padding: 16px 28px;
        box-shadow: 0 0 24px rgba(251,191,36,0.15);
        animation: pulse-glow 1s ease-in-out infinite;
      }
      .tp-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; width: 100%; }
      .tp-slot { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 10px 6px; border-radius: var(--radius); min-height: 70px; justify-content: center; border: 1px solid var(--border); background: var(--bg3); }
      .tp-slot.filled { border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.04); }
      .tp-slot.empty { border-style: dashed; opacity: 0.4; }
      .tp-slot-initial { width: 32px; height: 32px; border-radius: 50%; background: var(--cyan-dim); color: var(--cyan); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
      .tp-slot-name { font-size: 11px; font-weight: 500; color: var(--tx1); text-align: center; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* Playing */
      .tp-play-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; flex-wrap: wrap; gap: 10px; }
      .tp-play-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 1px; color: var(--tx1); }
      .tp-play-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; align-items: start; }
      @media (max-width: 900px) { .tp-play-grid { grid-template-columns: 1fr; } }
      .tp-section-label { font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--tx3); margin-bottom: 12px; }

      .tp-match { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
      .tp-match-label { font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 3px; color: var(--amber); }
      .tp-match-vs { display: flex; align-items: center; gap: 10px; }
      .tp-match-player { font-size: 14px; font-weight: 600; color: var(--tx2); padding: 6px 12px; border-radius: var(--radius); border: 1px solid var(--border); }
      .tp-match-player.me { color: var(--cyan); border-color: var(--cyan); background: var(--cyan-dim); }
      .tp-vs-text { font-family: var(--font-display); font-size: 11px; font-weight: 700; color: var(--tx3); letter-spacing: 2px; }
      .tp-predict-area { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }
      .tp-predict-row { display: flex; align-items: center; gap: 16px; }
      .tp-committed { font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: 1px; padding: 10px 28px; border-radius: var(--radius); }
      .tp-committed.up { background: rgba(52,211,153,0.15); color: var(--green); border: 2px solid var(--green); }
      .tp-committed.down { background: rgba(248,113,113,0.15); color: var(--red); border: 2px solid var(--red); }

      @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 24px rgba(251,191,36,0.15); }
        50% { box-shadow: 0 0 40px rgba(251,191,36,0.3); }
      }
    `}</style>
  );
}
