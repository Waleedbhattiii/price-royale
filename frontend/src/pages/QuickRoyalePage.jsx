import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, api } from '../lib/client.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';
import RoundResult from '../components/RoundResult.jsx';
import PriceChart from '../components/PriceChart.jsx';

const PHASE = {
  LOBBY:     'lobby',
  WAITING:   'waiting',
  COUNTDOWN: 'countdown',
  COMMIT:    'commit',
  REVEAL:    'reveal',
  FINISHED:  'finished',
};

export default function QuickRoyalePage({ onLeave }) {
  const { user } = useAuth();
  const toast = useToast();

  const [phase, setPhase] = useState(PHASE.LOBBY);
  const [liveCount, setLiveCount] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [round, setRound] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [commitWindowOpen, setCommitWindowOpen] = useState(true);
  const [myCommit, setMyCommit] = useState(null);
  const [myEntryPrice, setMyEntryPrice] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [scoreboard, setScoreboard] = useState([]);
  const [winner, setWinner] = useState(null);
  const [committed, setCommitted] = useState(0);
  const [events, setEvents] = useState([]);

  // Use refs for values that socket handlers need to read — avoids stale closures
  const myCommitRef = useRef(null);
  const roundRef = useRef(null);

  const addEvent = useCallback((msg, type = 'info') => {
    setEvents(prev => [{ id: Date.now() + Math.random(), msg, type }, ...prev].slice(0, 20));
  }, []);

  // Poll live player count (even before joining)
  useEffect(() => {
    function fetchCount() {
      api.get('/quick-royale').then(r => setLiveCount(r.data.playerCount || 0)).catch(() => {});
    }
    fetchCount();
    const interval = setInterval(fetchCount, 4000);
    return () => clearInterval(interval);
  }, []);

  // Register ALL socket handlers ONCE on mount — never re-register conditionally
  // This is the critical fix: handlers must stay registered for the full lifetime
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlers = {
      'qr:playerJoined': ({ displayName, playerCount }) => {
        setPlayerCount(playerCount);
        setLiveCount(playerCount);
        addEvent(`${displayName} joined`, 'join');
      },
      'qr:playerLeft': ({ displayName, playerCount }) => {
        setPlayerCount(playerCount);
        setLiveCount(playerCount);
        addEvent(`${displayName} left`, 'leave');
      },
      'qr:countdown': ({ seconds, playerCount }) => {
        setPhase(PHASE.COUNTDOWN);
        setCountdown(seconds);
        setPlayerCount(playerCount);
        addEvent(`🚀 Starting in ${seconds}s — ${playerCount} players ready`, 'system');
        toast.info(`Game starting in ${seconds}s!`);
      },
      'qr:countdownTick': ({ remaining, playerCount }) => {
        setCountdown(remaining);
        setPlayerCount(playerCount);
      },
      'qr:waitingForPlayers': ({ playerCount }) => {
        setPhase(PHASE.WAITING);
        setPlayerCount(playerCount);
        addEvent('Countdown cancelled — need more players', 'system');
      },
      'qr:gameStarting': ({ playerCount }) => {
        setPlayerCount(playerCount);
        addEvent(`🎮 Game on! ${playerCount} players`, 'system');
      },
      'qr:roundStart': (data) => {
        roundRef.current = data;
        myCommitRef.current = null;
        setPhase(PHASE.COMMIT);
        setRound(data);
        setMyCommit(null);
        setMyEntryPrice(null);
        setCommitWindowOpen(true);
        setRoundResult(null);
        setTimeLeft(data.duration);
        setScoreboard(data.scoreboard || []);
        setCommitted(0);
        addEvent(`📊 Round ${data.round}/${data.totalRounds} — ${data.asset}`, 'round');
      },
      'qr:commitWindowClosed': () => {
        setCommitWindowOpen(false);
        addEvent('🔒 Commit window closed', 'system');
      },
      'qr:tick': ({ remaining, committed, total, inCommitWindow }) => {
        setTimeLeft(remaining);
        setCommitted(committed);
        if (typeof inCommitWindow !== 'undefined') setCommitWindowOpen(!!inCommitWindow);
      },
      'qr:settling': ({ round: roundNum }) => {
        console.log('[QR] Settling round', roundNum);
        setPhase(PHASE.REVEAL);
        setRoundResult(null); // clear old result while fetching
        addEvent('⏳ Settling...', 'system');
      },
      'qr:roundResult': (data) => {
        console.log('[QR] Round result received', data.round);
        setPhase(PHASE.REVEAL);
        setRoundResult(data);
        setScoreboard(data.scoreboard || []);
        addEvent(`${data.asset} → ${data.correctDirection || 'TIE'}`, data.correctDirection === 'UP' ? 'up' : 'down');
      },
      'qr:commitUpdate': ({ committed }) => {
        setCommitted(committed);
      },
      'qr:gameFinished': ({ scoreboard, winner }) => {
        setPhase(PHASE.FINISHED);
        setScoreboard(scoreboard);
        setWinner(winner);
        addEvent(`🏆 Winner: ${winner?.displayName}`, 'win');
        toast.success(`${winner?.displayName} wins! 🏆`, { duration: 5000 });
      },
      'qr:reset': () => {
        setPhase(PHASE.WAITING);
        setRound(null);
        roundRef.current = null;
        myCommitRef.current = null;
        setMyCommit(null);
        setMyEntryPrice(null);
        setRoundResult(null);
        setWinner(null);
        setScoreboard([]);
        addEvent('🔄 New game coming — stay ready!', 'system');
        toast.info('New Quick Royale starting soon!');
      },
    };

    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);

    // Cleanup: remove handlers when component unmounts
    return () => {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
      // Leave QR when navigating away
      socket.emit('qr:leave');
    };
  }, []); // ← Empty deps: register ONCE, never re-register

  function handleJoin() {
    const socket = getSocket();
    if (!socket) { toast.error('Not connected'); return; }

    socket.emit('qr:join', {}, (res) => {
      if (res?.ok) {
        const s = res.state;
        setPlayerCount(s.playerCount);
        setLiveCount(s.playerCount);
        setScoreboard(s.scoreboard || []);
        // Sync to current server phase
        if (s.phase === 'commit') setPhase(PHASE.COMMIT);
        else if (s.phase === 'countdown') { setPhase(PHASE.COUNTDOWN); setCountdown(s.countdownRemaining || 0); }
        else if (s.phase === 'finished') setPhase(PHASE.FINISHED);
        else setPhase(PHASE.WAITING);
        toast.success('Joined Quick Royale!');
      } else {
        toast.error(res?.error || 'Could not join');
      }
    });
  }

  function handleLeaveQR() {
    const socket = getSocket();
    if (socket) socket.emit('qr:leave');
    setPhase(PHASE.LOBBY);
    setRound(null);
    setMyCommit(null);
    roundRef.current = null;
    myCommitRef.current = null;
  }

  async function handleCommit(direction) {
    const socket = getSocket();
    if (!socket || !commitWindowOpen || myCommitRef.current) return;

    let currentPrice = null;
    const currentRound = roundRef.current;
    if (currentRound?.asset) {
      try {
        const res = await api.get('/prices');
        currentPrice = res.data[currentRound.asset]?.price || null;
      } catch {}
    }

    socket.emit('qr:commit', { direction, currentPrice }, (res) => {
      if (res?.ok) {
        myCommitRef.current = direction;
        setMyCommit(direction);
        setMyEntryPrice(res.personalEntryPrice || currentPrice);
        const price = res.personalEntryPrice || currentPrice;
        toast.info(`Locked: ${direction === 'UP' ? '▲ UP' : '▼ DOWN'}${price ? ` @ $${price.toFixed(2)}` : ''}`, { duration: 2000 });
      } else {
        toast.error(res?.error || 'Could not commit');
      }
    });
  }

  const myScore = scoreboard.find(p => p.userId === user?.id);

  // ── LOBBY SCREEN ──────────────────────────────────────────────────────────
  if (phase === PHASE.LOBBY) {
    return (
      <div className="qrl-page">
        <div className="qrl-hero card card-glow">
          <div className="qrl-hero-icon">⚡</div>
          <div className="qrl-hero-title">QUICK ROYALE</div>
          <div className="qrl-hero-sub">No setup. No waiting. Drop in, pick a direction, compete.</div>

          <div className="qrl-live-count">
            <span className="qrl-live-dot" />
            <span className="mono text-cyan" style={{ fontSize: 28, fontWeight: 700 }}>{liveCount}</span>
            <span className="text-dim" style={{ fontSize: 15 }}>&nbsp;players in lobby right now</span>
          </div>

          <div className="qrl-rules">
            {[
              ['⏱', '5 rounds, 60 seconds each'],
              ['🎯', '30s to commit UP or DOWN'],
              ['📊', 'Pyth oracle settles each round'],
              ['⚡', 'Wide confidence interval = bonus points'],
              ['🔄', 'Auto-resets after each game'],
            ].map(([icon, text]) => (
              <div key={text} className="qrl-rule">
                <span>{icon}</span>
                <span className="text-dim">{text}</span>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" style={{ fontSize: 16, padding: '14px 48px', marginTop: 8 }} onClick={handleJoin}>
            ⚡ Join Quick Royale
          </button>
          <button className="btn-ghost" onClick={onLeave} style={{ marginTop: 4 }}>← Back to Lobby</button>
        </div>
        <QrlStyles />
      </div>
    );
  }

  // ── IN GAME ───────────────────────────────────────────────────────────────
  return (
    <div className="qrl-game-page">
      <div className="qrl-game-header card">
        <div>
          <div className="qrl-game-title">⚡ QUICK ROYALE</div>
          <div className="qrl-game-meta">
            <span className="qrl-live-dot" style={{ width: 7, height: 7 }} />
            <span className="mono text-cyan">{playerCount}</span>
            <span className="text-dim">&nbsp;players</span>
            {myScore && (
              <>
                <span className="text-dim">·</span>
                <span className="text-dim">Your pts:</span>
                <span className="mono text-cyan" style={{ fontWeight: 700 }}>{myScore.points}</span>
              </>
            )}
          </div>
        </div>
        <button className="btn-ghost" onClick={handleLeaveQR}>← Leave</button>
      </div>

      <div className="qrl-grid">
        <div className="qrl-main">

          {/* WAITING */}
          {phase === PHASE.WAITING && (
            <div className="card card-glow qrl-waiting animate-fade">
              <div style={{ fontSize: 48 }}>🏟️</div>
              <div className="qrl-wait-title">WAITING FOR PLAYERS</div>
              <div>
                <span className="mono text-cyan" style={{ fontSize: 52, fontWeight: 700 }}>{playerCount}</span>
                <span className="text-dim" style={{ fontSize: 18 }}>&nbsp;/ 2 min to start</span>
              </div>
              <div className="text-dim" style={{ fontSize: 13 }}>Game auto-starts when 2+ players join</div>
            </div>
          )}

          {/* COUNTDOWN */}
          {phase === PHASE.COUNTDOWN && (
            <div className="card card-glow qrl-countdown animate-fade">
              <div className="qrl-countdown-label">GAME STARTS IN</div>
              <div className="qrl-countdown-num mono">{countdown}</div>
              <div className="text-dim">{playerCount} players ready</div>
              <div className="qrl-cdown-bar">
                <div className="qrl-cdown-fill" style={{ width: `${(countdown / 15) * 100}%` }} />
              </div>
            </div>
          )}

          {/* COMMIT PHASE */}
          {phase === PHASE.COMMIT && round && (
            <div className="qrl-round animate-fade">
              <div className="qrl-round-bar card">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--tx2)' }}>
                  ROUND <span className="text-cyan">{round.round}</span> / {round.totalRounds}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{round.asset}</span>
                  <span className="mono text-cyan" style={{ fontSize: 20, fontWeight: 700 }}>
                    ${round.entryPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="text-dim" style={{ fontSize: 12 }}>{committed}/{playerCount} committed</div>
              </div>

              <PriceChart
                asset={round.asset}
                entryPrice={round.entryPrice}
                personalEntryPrice={myEntryPrice}
                showEntryLine={!!myCommit}
                roundStartTime={round.startedAt || Date.now()}
              />

              <div className="card qrl-predict">
                <div className="qrl-phase-bar">
                  <div className="qrl-phase-commit" style={{ opacity: commitWindowOpen ? 1 : 0.4 }}>
                    <span style={{ color: commitWindowOpen ? 'var(--cyan)' : 'var(--tx3)', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>
                      {commitWindowOpen ? `⏱ ${timeLeft}s` : '✓ Locked'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 2, color: 'var(--tx3)' }}>COMMIT</span>
                  </div>
                  <div style={{ color: 'var(--tx3)', fontSize: 14 }}>→</div>
                  <div className="qrl-phase-watch" style={{ opacity: commitWindowOpen ? 0.4 : 1 }}>
                    <span style={{ color: !commitWindowOpen ? 'var(--purple)' : 'var(--tx3)', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>
                      {!commitWindowOpen ? `👁 ${timeLeft}s` : ''}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: 2, color: 'var(--tx3)' }}>WATCH</span>
                  </div>
                </div>

                {!myCommit && commitWindowOpen && (
                  <div className="qrl-btns">
                    <button className="btn btn-up" onClick={() => handleCommit('UP')}>▲ UP</button>
                    <div style={{ color: 'var(--tx3)', fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: 3 }}>VS</div>
                    <button className="btn btn-down" onClick={() => handleCommit('DOWN')}>▼ DOWN</button>
                  </div>
                )}

                {!myCommit && !commitWindowOpen && (
                  <div className="qrl-expired">
                    <span style={{ fontSize: 24 }}>⏰</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--red)', letterSpacing: 2 }}>WINDOW CLOSED</span>
                    <span className="text-dim" style={{ fontSize: 12 }}>0 pts this round — watching chart...</span>
                  </div>
                )}

                {myCommit && (
                  <div className={`qrl-locked ${myCommit === 'UP' ? 'up' : 'down'}`}>
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

          {/* SETTLING — show spinner while waiting for result */}
          {phase === PHASE.REVEAL && !roundResult && (
            <div className="card qrl-settling animate-fade">
              <div className="qrl-settle-spinner" />
              <div className="text-dim">Fetching Pyth oracle price...</div>
            </div>
          )}

          {/* ROUND RESULT */}
          {phase === PHASE.REVEAL && roundResult && (
            <RoundResult result={roundResult} myUserId={user?.id} myCommit={myCommit} myEntryPrice={myEntryPrice} />
          )}

          {/* FINISHED */}
          {phase === PHASE.FINISHED && (
            <div className="card card-glow qrl-finished animate-fade">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, letterSpacing: 6, color: 'var(--cyan)', textShadow: '0 0 30px rgba(56,189,248,0.5)' }}>GAME OVER</div>
              {winner && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 44 }}>🏆</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--amber)' }}>{winner.displayName}</div>
                  <div className="mono text-cyan" style={{ fontSize: 18, fontWeight: 700 }}>{winner.points?.toLocaleString()} pts</div>
                </div>
              )}
              <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scoreboard.map((p, i) => (
                  <div key={p.userId} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 6, fontSize: 14,
                    background: p.userId === user?.id ? 'var(--cyan-dim)' : 'var(--bg3)',
                    border: p.userId === user?.id ? '1px solid rgba(56,189,248,0.2)' : '1px solid var(--border)',
                  }}>
                    <span className="mono text-dim">{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{p.displayName}</span>
                    <span className="mono text-cyan" style={{ fontWeight: 700 }}>{p.points} pts</span>
                  </div>
                ))}
              </div>
              <div className="text-dim" style={{ fontSize: 13 }}>New game starting in ~15 seconds...</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="qrl-sidebar">
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', marginBottom: 10 }}>SCOREBOARD</div>
            {scoreboard.length === 0
              ? <div className="text-dim" style={{ fontSize: 13, padding: '8px 0' }}>Waiting for game...</div>
              : scoreboard.map((p, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const isMe = p.userId === user?.id;
                return (
                  <div key={p.userId} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px',
                    borderRadius: 6, marginBottom: 2,
                    background: isMe ? 'var(--cyan-dim)' : 'transparent',
                    border: isMe ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent',
                  }}>
                    <span style={{ width: 22, textAlign: 'center', fontSize: 13 }}>
                      {i < 3 ? medals[i] : <span className="mono text-dim">{i + 1}</span>}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.displayName} {isMe && <span className="you-tag">YOU</span>}
                    </span>
                    <span className="mono text-cyan" style={{ fontSize: 13, fontWeight: 700 }}>{p.points}</span>
                  </div>
                );
              })
            }
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', marginBottom: 10 }}>LIVE FEED</div>
            {events.length === 0
              ? <div className="text-dim" style={{ fontSize: 12 }}>Events will appear here...</div>
              : events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }} className="animate-fade">
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5, display: 'block',
                    background: ev.type === 'up' ? 'var(--green)' : ev.type === 'down' ? 'var(--red)' : ev.type === 'win' ? 'var(--amber)' : 'var(--cyan)',
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{ev.msg}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <QrlStyles />
    </div>
  );
}

function QrlStyles() {
  return (
    <style>{`
      .qrl-page { max-width: 560px; margin: 0 auto; }
      .qrl-hero { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 40px; text-align: center; }
      .qrl-hero-icon { font-size: 52px; filter: drop-shadow(0 0 16px var(--cyan)); }
      .qrl-hero-title { font-family: var(--font-display); font-size: 32px; font-weight: 700; letter-spacing: 5px; color: var(--cyan); text-shadow: 0 0 30px rgba(56,189,248,0.5); }
      .qrl-hero-sub { color: var(--tx2); font-size: 14px; max-width: 380px; line-height: 1.6; }
      .qrl-live-count { display: flex; align-items: center; gap: 10px; padding: 14px 24px; background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); }
      .qrl-live-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--green); animation: blink 1.5s infinite; display: block; flex-shrink: 0; }
      .qrl-rules { display: flex; flex-direction: column; gap: 8px; width: 100%; text-align: left; }
      .qrl-rule { display: flex; align-items: center; gap: 10px; font-size: 13px; }

      .qrl-game-page { display: flex; flex-direction: column; gap: 16px; max-width: 1100px; margin: 0 auto; }
      .qrl-game-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; flex-wrap: wrap; gap: 10px; }
      .qrl-game-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; letter-spacing: 2px; color: var(--cyan); }
      .qrl-game-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-top: 3px; }
      .qrl-grid { display: grid; grid-template-columns: 1fr 260px; gap: 16px; align-items: start; }
      @media (max-width: 860px) { .qrl-grid { grid-template-columns: 1fr; } }
      .qrl-main { display: flex; flex-direction: column; gap: 12px; }
      .qrl-sidebar { display: flex; flex-direction: column; gap: 12px; }

      .qrl-waiting { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 40px; text-align: center; }
      .qrl-wait-title { font-family: var(--font-display); font-size: 14px; font-weight: 700; letter-spacing: 4px; color: var(--tx3); }

      .qrl-countdown { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 40px; }
      .qrl-countdown-label { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 4px; color: var(--tx3); }
      .qrl-countdown-num { font-size: 88px; font-weight: 700; color: var(--cyan); line-height: 1; text-shadow: 0 0 40px rgba(56,189,248,0.6); animation: pulse-glow 1s ease-in-out infinite; }
      .qrl-cdown-bar { width: 180px; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden; }
      .qrl-cdown-fill { height: 100%; background: var(--cyan); border-radius: 2px; transition: width 1s linear; }

      .qrl-round { display: flex; flex-direction: column; gap: 12px; }
      .qrl-round-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; flex-wrap: wrap; gap: 8px; }
      .qrl-predict { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px; }
      .qrl-phase-bar { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 340px; }
      .qrl-phase-commit, .qrl-phase-watch { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
      .qrl-btns { display: flex; align-items: center; gap: 20px; }
      .qrl-expired { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 28px; background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.2); border-radius: var(--radius); }
      .qrl-locked { font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: 1px; padding: 12px 28px; border-radius: var(--radius); }
      .qrl-locked.up { background: rgba(52,211,153,0.15); color: var(--green); border: 2px solid var(--green); }
      .qrl-locked.down { background: rgba(248,113,113,0.15); color: var(--red); border: 2px solid var(--red); }

      .qrl-settling { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 60px 40px; }
      .qrl-settle-spinner { width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--cyan); animation: spin 0.8s linear infinite; }

      .qrl-finished { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 40px; }
    `}</style>
  );
}
