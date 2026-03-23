import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';
import CountdownTimer from '../components/CountdownTimer.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import RoundResult from '../components/RoundResult.jsx';
import EventFeed from '../components/EventFeed.jsx';
import PriceChart from '../components/PriceChart.jsx';

export default function GamePage({ game, onLeave }) {
  const { user } = useAuth();
  const toast = useToast();
  const {
    room, gamePhase, roundData, scoreboard, roundResult,
    timeLeft, commitWindowOpen, commitCount, myCommit, myEntryPrice, commitExpired, events,
    startGame, commitPrediction, leaveRoom,
  } = game;

  const isHost = room?.hostUserId === user?.id;
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    if (isStarting) return; // prevent double-click
    setIsStarting(true);
    try {
      await startGame();
      toast.success('Game starting!');
    } catch (err) {
      toast.error(err.message);
      setIsStarting(false); // only reset on error — success keeps button disabled
    }
  }

  async function handleCommit(direction) {
    try { await commitPrediction(direction); } catch (err) { toast.error(err.message); }
  }

  function handleLeave() {
    leaveRoom();
    onLeave();
  }

  if (!room) {
    return (
      <div className="game-empty">
        <div>No active room.</div>
        <button className="btn btn-primary" onClick={onLeave}>← Back to Lobby</button>
      </div>
    );
  }

  return (
    <div className="game-page">
      {/* Room Header */}
      <div className="game-header card">
        <div className="game-header-left">
          <div className="room-title">{room.name}</div>
          <div className="room-meta-row">
            <span className="tag tag-cyan">{room.id}</span>
            <span className="tag tag-purple">{room.rounds} rounds</span>
            <span className="tag tag-amber">{room.roundDuration}s</span>
            {room.pointMode === 'highstakes' && <span className="tag tag-red">2× Points</span>}
            <span className="text-dim" style={{ fontSize: 13 }}>{room.playerCount} players</span>
          </div>
        </div>
        <div className="game-header-right">
          {gamePhase === 'lobby' && isHost && (
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={(room.playerCount || 0) < 2 || isStarting}
            >
              {isStarting
                ? '⏳ Starting...'
                : (room.playerCount || 0) < 2
                  ? `Waiting for players (${room.playerCount || 0}/2)...`
                  : `🚀 Start Game (${room.playerCount} players)`}
            </button>
          )}
          {gamePhase === 'lobby' && !isHost && (
            <div className="waiting-host">
              <span className="blink-dot" />
              Waiting for host to start... ({room.playerCount || 0} players)
            </div>
          )}
          {gamePhase === 'finished' && (
            <button className="btn btn-primary" onClick={handleLeave}>← Back to Lobby</button>
          )}
          <button className="btn-ghost" onClick={handleLeave}>Leave</button>
        </div>
      </div>

      {/* Main grid */}
      <div className="game-grid">
        {/* Center column */}
        <div className="game-center">

          {/* Lobby waiting state */}
          {gamePhase === 'lobby' && (
            <div className="card card-glow lobby-waiting animate-fade">
              <div className="lobby-waiting-icon">🏟️</div>
              <div className="lobby-waiting-title">LOBBY</div>
              <div className="lobby-waiting-count">
                <span className="text-cyan mono" style={{ fontSize: 48, fontWeight: 700 }}>{room.playerCount}</span>
                <span className="text-dim"> / {room.maxPlayers} players</span>
              </div>
              <div className="text-dim" style={{ fontSize: 13 }}>
                Share code <span className="mono text-cyan">{room.id}</span> with friends
              </div>
              {!isHost && <div className="text-dim" style={{ fontSize: 13, marginTop: 8 }}>Waiting for <strong>{room.hostUsername}</strong> to start...</div>}
              {isHost && room.playerCount < 2 && (
                <div className="text-amber" style={{ fontSize: 13, marginTop: 8 }}>Need at least 2 players to start</div>
              )}
            </div>
          )}

          {/* Starting countdown */}
          {(gamePhase === 'starting' || gamePhase === 'lobby' && room.status === 'starting') && (
            <div className="card card-glow starting-screen animate-fade">
              <div className="starting-title">GET READY</div>
              <div className="starting-sub">Game is starting...</div>
              <div className="starting-players text-dim">{room.playerCount} players locked in</div>
            </div>
          )}

          {/* Active round */}
          {(gamePhase === 'commit' || gamePhase === 'reveal') && roundData && (
            <div className="round-arena animate-fade">
              {/* Round info bar */}
              <div className="round-info-bar card">
                <div className="round-label">
                  ROUND <span className="text-cyan">{roundData.round}</span> / {roundData.totalRounds}
                </div>
                <div className="round-asset">
                  <span className="asset-name">{roundData.asset}</span>
                  <span className="entry-price mono">
                    ${roundData.entryPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="commit-progress">
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    {commitCount.committed}/{commitCount.total} committed
                  </span>
                  <div className="commit-bar">
                    <div
                      className="commit-fill"
                      style={{ width: commitCount.total > 0 ? `${(commitCount.committed / commitCount.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Chart */}
              <PriceChart key={`${roundData.round}-${roundData.asset}`} asset={roundData.asset} entryPrice={roundData.entryPrice} personalEntryPrice={myEntryPrice} showEntryLine={!!myCommit} roundStartTime={roundData.startedAt || Date.now()} />

              {/* Prediction buttons */}
              {gamePhase === 'commit' && (
                <div className="predict-section">
                  <CommitTimer
                    totalDuration={roundData.duration}
                    commitWindow={roundData.commitWindow || 30}
                    timeLeft={timeLeft}
                    commitWindowOpen={commitWindowOpen}
                  />

                  {!myCommit && commitWindowOpen && (
                    <div className="predict-buttons">
                      <button className="btn btn-up" onClick={() => handleCommit('UP')}>▲ UP</button>
                      <div className="predict-or">VS</div>
                      <button className="btn btn-down" onClick={() => handleCommit('DOWN')}>▼ DOWN</button>
                    </div>
                  )}

                  {!myCommit && !commitWindowOpen && (
                    <div className="expired-state">
                      <div className="expired-icon">⏰</div>
                      <div className="expired-text">Commit window closed</div>
                      <div className="text-dim" style={{ fontSize: 13 }}>0 pts this round — watching chart...</div>
                    </div>
                  )}

                  {myCommit && (
                    <div className="committed-state">
                      <div className={`committed-badge ${myCommit === 'UP' ? 'up' : 'down'}`}>
                        {myCommit === 'UP' ? '▲' : '▼'} Locked <strong>{myCommit}</strong>
                        {myEntryPrice && (
                          <span className="entry-at"> @ ${myEntryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                        )}
                      </div>
                      <div className="text-dim" style={{ fontSize: 13 }}>
                        {commitWindowOpen ? 'Others still deciding...' : 'Chart running — waiting for settlement...'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Settling state */}
              {gamePhase === 'reveal' && !roundResult && (
                <div className="settling-state">
                  <div className="settling-spinner" />
                  <div className="text-dim">Fetching Pyth oracle price...</div>
                </div>
              )}

              {/* Round result */}
              {gamePhase === 'reveal' && roundResult && (
                <RoundResult result={roundResult} myUserId={user?.id} myCommit={myCommit} myEntryPrice={myEntryPrice} />
              )}
            </div>
          )}

          {/* Game finished */}
          {gamePhase === 'finished' && (
            <div className="game-over animate-fade">
              <FinalResults scoreboard={scoreboard} userId={user?.id} />
            </div>
          )}
        </div>

        {/* Right column: scoreboard + events */}
        <div className="game-sidebar">
          <Scoreboard
            scoreboard={scoreboard}
            currentRound={room.currentRound}
            totalRounds={room.rounds}
            myUserId={user?.id}
            gamePhase={gamePhase}
          />
          <EventFeed events={events} />
        </div>
      </div>

      <style>{`
        .game-page { display: flex; flex-direction: column; gap: 16px; max-width: 1300px; margin: 0 auto; }

        .game-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; flex-wrap: wrap; gap: 12px;
        }
        .room-title {
          font-family: var(--font-display); font-size: 20px; font-weight: 700;
          letter-spacing: 1px; color: var(--tx1); margin-bottom: 6px;
        }
        .room-meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .game-header-right { display: flex; align-items: center; gap: 10px; }

        .waiting-host {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: var(--tx2);
        }
        .blink-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--amber);
          animation: blink 1.2s ease-in-out infinite;
        }

        .game-grid {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .game-grid { grid-template-columns: 1fr; }
          .game-sidebar { display: flex; gap: 16px; }
        }

        .game-center { display: flex; flex-direction: column; gap: 12px; }
        .game-sidebar { display: flex; flex-direction: column; gap: 12px; }

        /* Lobby waiting */
        .lobby-waiting {
          display: flex; flex-direction: column; align-items: center;
          padding: 60px 40px; text-align: center; gap: 12px;
        }
        .lobby-waiting-icon { font-size: 56px; margin-bottom: 8px; }
        .lobby-waiting-title {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          letter-spacing: 4px; color: var(--tx3);
        }
        .lobby-waiting-count { display: flex; align-items: baseline; gap: 4px; }

        /* Starting */
        .starting-screen {
          display: flex; flex-direction: column; align-items: center;
          padding: 80px 40px; text-align: center; gap: 16px;
        }
        .starting-title {
          font-family: var(--font-display); font-size: 48px; font-weight: 700;
          letter-spacing: 6px; color: var(--cyan);
          text-shadow: 0 0 40px rgba(56,189,248,0.6);
          animation: pulse-glow 1s ease-in-out infinite;
        }
        .starting-sub { font-size: 16px; color: var(--tx2); }
        .starting-players { font-size: 14px; }

        /* Round arena */
        .round-arena { display: flex; flex-direction: column; gap: 12px; }

        .round-info-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; flex-wrap: wrap; gap: 12px;
        }
        .round-label {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          letter-spacing: 2px; text-transform: uppercase; color: var(--tx2);
        }
        .round-asset { display: flex; align-items: center; gap: 12px; }
        .asset-name {
          font-family: var(--font-display); font-size: 18px; font-weight: 700;
          letter-spacing: 1px; color: var(--tx1);
        }
        .entry-price { font-size: 20px; font-weight: 700; color: var(--cyan); }
        .commit-progress { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
        .commit-bar {
          width: 100px; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;
        }
        .commit-fill {
          height: 100%; background: var(--cyan); border-radius: 2px;
          transition: width 0.3s ease;
        }

        /* Predict */
        .predict-section {
          display: flex; flex-direction: column; align-items: center;
          gap: 24px; padding: 32px 20px;
          background: var(--card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); backdrop-filter: blur(8px);
        }
        .predict-buttons { display: flex; align-items: center; gap: 24px; }
        .predict-or {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          letter-spacing: 3px; color: var(--tx3);
        }
        .committed-state {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .committed-badge {
          font-family: var(--font-display); font-size: 18px; font-weight: 700;
          letter-spacing: 1px; padding: 12px 32px; border-radius: var(--radius);
        }
        .committed-badge.up {
          background: rgba(52,211,153,0.15); color: var(--green);
          border: 2px solid var(--green); box-shadow: var(--glow-green);
        }
        .committed-badge.down {
          background: rgba(248,113,113,0.15); color: var(--red);
          border: 2px solid var(--red); box-shadow: var(--glow-red);
        }

        /* Settling */
        .settling-state {
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; padding: 40px;
        }
        .settling-spinner {
          width: 40px; height: 40px; border-radius: 50%;
          border: 3px solid var(--border);
          border-top-color: var(--cyan);
          animation: spin 0.8s linear infinite;
        }

        /* Game over */
        .game-over { display: flex; flex-direction: column; gap: 16px; }
        .game-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; padding: 80px 20px; text-align: center; color: var(--tx2);
        }
        .expired-state {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 20px 32px;
          background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.2);
          border-radius: var(--radius);
        }
        .expired-icon { font-size: 28px; }
        .expired-text { font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: 2px; color: var(--red); }
        .entry-at { font-size: 14px; font-weight: 400; opacity: 0.8; margin-left: 6px; }
      `}</style>
    </div>
  );
}


// ─── CommitTimer: two-phase timer ────────────────────────────────────────────
// Phase 1 (cyan): commit window — player must pick UP/DOWN
// Phase 2 (purple dim): watch phase — chart keeps running, no input
function CommitTimer({ totalDuration, commitWindow, timeLeft, commitWindowOpen }) {
  const isInCommit = commitWindowOpen;
  const watchDuration = totalDuration - commitWindow;

  // During commit phase: count down from commitWindow
  // During watch phase: count down the remaining watch time
  const commitTimeLeft = Math.max(0, timeLeft - watchDuration);
  const watchTimeLeft = isInCommit ? watchDuration : Math.max(0, timeLeft);

  const commitPct = commitWindow > 0 ? (commitTimeLeft / commitWindow) * 100 : 0;
  const watchPct = watchDuration > 0 ? (watchTimeLeft / watchDuration) * 100 : 0;

  const urgent = isInCommit && commitTimeLeft <= 5;
  const warning = isInCommit && commitTimeLeft <= 10;
  const commitColor = urgent ? 'var(--red)' : warning ? 'var(--amber)' : 'var(--cyan)';

  return (
    <div className="commit-timer">
      {/* Dual progress bar */}
      <div className="ct-bars">
        <div className="ct-bar-wrap ct-commit">
          <div className="ct-bar-label">COMMIT</div>
          <div className="ct-bar">
            <div className="ct-fill" style={{
              width: `${commitPct}%`,
              background: commitColor,
              boxShadow: isInCommit ? `0 0 8px ${commitColor}` : 'none',
              transition: 'width 1s linear, background 0.3s',
            }} />
          </div>
          <div className="ct-time mono" style={{ color: isInCommit ? commitColor : 'var(--tx3)' }}>
            {isInCommit ? commitTimeLeft : '✓'}
          </div>
        </div>

        <div className="ct-divider">→</div>

        <div className="ct-bar-wrap ct-watch">
          <div className="ct-bar-label">WATCH</div>
          <div className="ct-bar">
            <div className="ct-fill" style={{
              width: `${watchPct}%`,
              background: 'var(--purple)',
              opacity: isInCommit ? 0.3 : 0.8,
              transition: 'width 1s linear, opacity 0.3s',
            }} />
          </div>
          <div className="ct-time mono" style={{ color: isInCommit ? 'var(--tx3)' : 'var(--purple)' }}>
            {isInCommit ? watchDuration : watchTimeLeft}
          </div>
        </div>
      </div>

      {/* Status label */}
      <div className="ct-status" style={{ color: isInCommit ? commitColor : 'var(--purple)' }}>
        {isInCommit
          ? urgent ? '⚡ DECIDE NOW!' : warning ? '⏳ HURRY UP!' : '🎯 PICK YOUR DIRECTION'
          : '👁 WATCHING — chart settling...'}
      </div>

      <style>{`
        .commit-timer { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; max-width: 400px; }
        .ct-bars { display: flex; align-items: center; gap: 10px; width: 100%; }
        .ct-bar-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .ct-bar-label { font-family: var(--font-display); font-size: 9px; font-weight: 700; letter-spacing: 2px; color: var(--tx3); }
        .ct-bar { height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
        .ct-fill { height: 100%; border-radius: 3px; }
        .ct-time { font-size: 14px; font-weight: 700; text-align: right; }
        .ct-divider { font-size: 12px; color: var(--tx3); margin-top: 10px; }
        .ct-status { font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

function FinalResults({ scoreboard, userId }) {
  const top3 = scoreboard.slice(0, 3);
  const myResult = scoreboard.find(p => p.userId === userId);

  return (
    <div className="final-results">
      <div className="final-title">GAME OVER</div>

      {/* Podium */}
      <div className="podium">
        {[1, 0, 2].map(idx => {
          const p = top3[idx];
          if (!p) return <div key={idx} className="podium-slot empty" />;
          const heights = ['120px', '160px', '90px'];
          const labels = ['🥈 2nd', '🥇 1st', '🥉 3rd'];
          const isMe = p.userId === userId;
          return (
            <div key={idx} className={`podium-slot ${isMe ? 'is-me' : ''}`}>
              <div className="podium-name">{p.displayName}</div>
              <div className="podium-pts mono">{p.points.toLocaleString()}</div>
              <div className="podium-bar" style={{ height: heights[idx] }}>
                <div className="podium-label">{labels[idx]}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full table */}
      <div className="card final-table">
        <div className="final-table-title">FULL STANDINGS</div>
        {scoreboard.map((p, i) => (
          <div key={p.userId} className={`final-row ${p.userId === userId ? 'my-row' : ''}`}>
            <span className="final-rank mono">{i + 1}</span>
            <span className="final-player">{p.displayName}</span>
            <span className="final-pts mono text-cyan">{p.points.toLocaleString()} pts</span>
          </div>
        ))}
      </div>

      <style>{`
        .final-results { display: flex; flex-direction: column; gap: 20px; }
        .final-title {
          font-family: var(--font-display); font-size: 42px; font-weight: 700;
          letter-spacing: 8px; text-align: center; color: var(--cyan);
          text-shadow: 0 0 40px rgba(56,189,248,0.5);
        }
        .podium {
          display: flex; align-items: flex-end; justify-content: center;
          gap: 8px; padding: 20px 0;
        }
        .podium-slot {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          width: 120px;
        }
        .podium-slot.empty { opacity: 0.2; }
        .podium-name {
          font-size: 13px; font-weight: 600; color: var(--tx1);
          text-align: center; max-width: 110px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .podium-pts { font-size: 15px; font-weight: 700; color: var(--cyan); }
        .podium-bar {
          width: 100%; background: var(--bg3); border: 1px solid var(--border2);
          border-radius: 6px 6px 0 0; display: flex;
          align-items: center; justify-content: center;
          transition: all 0.5s;
        }
        .podium-slot:nth-child(2) .podium-bar { background: rgba(56,189,248,0.15); border-color: var(--cyan); }
        .podium-slot.is-me .podium-bar { box-shadow: 0 0 20px rgba(56,189,248,0.3); }
        .podium-label { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--tx2); }

        .final-table { padding: 16px; }
        .final-table-title {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3); margin-bottom: 12px;
        }
        .final-row {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 0; border-bottom: 1px solid var(--border);
          font-size: 14px;
        }
        .final-row:last-child { border-bottom: none; }
        .final-row.my-row { background: var(--cyan-dim); border-radius: 6px; padding: 8px 10px; margin: 0 -10px; }
        .final-rank { width: 24px; color: var(--tx3); font-size: 12px; }
        .final-player { flex: 1; color: var(--tx1); font-weight: 500; }
        .final-pts { font-size: 14px; font-weight: 700; }
      `}</style>
    </div>
  );
}
