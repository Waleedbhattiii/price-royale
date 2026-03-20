export default function Scoreboard({ scoreboard, currentRound, totalRounds, myUserId, gamePhase }) {
  return (
    <div className="scoreboard card">
      <div className="sb-header">
        <span className="sb-title">SCOREBOARD</span>
        {gamePhase !== 'lobby' && (
          <span className="sb-round tag tag-cyan">
            {currentRound > 0 ? `R${currentRound}/${totalRounds}` : 'LOBBY'}
          </span>
        )}
      </div>

      {scoreboard.length === 0 ? (
        <div className="sb-empty">Waiting for players...</div>
      ) : (
        <div className="sb-list">
          {scoreboard.map((p, i) => {
            const isMe = p.userId === myUserId;
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div key={p.userId} className={`sb-row ${isMe ? 'my-row' : ''} ${p.eliminated ? 'eliminated' : ''}`}>
                <span className="sb-rank">
                  {i < 3 ? medals[i] : <span className="mono text-dim">{i + 1}</span>}
                </span>
                <div className="sb-player">
                  <div className="sb-name">
                    {p.displayName}
                    {isMe && <span className="you-tag">YOU</span>}
                  </div>
                  {p.streak > 1 && (
                    <div className="sb-streak">🔥 {p.streak} streak</div>
                  )}
                </div>
                <span className="sb-pts mono">{p.points.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .scoreboard { padding: 14px; }
        .sb-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .sb-title {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3);
        }
        .sb-empty { font-size: 13px; color: var(--tx3); text-align: center; padding: 16px 0; }
        .sb-list { display: flex; flex-direction: column; gap: 2px; max-height: 420px; overflow-y: auto; }

        .sb-row {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: 6px;
          transition: background 0.15s;
        }
        .sb-row:hover { background: var(--bg3); }
        .sb-row.my-row {
          background: var(--cyan-dim);
          border: 1px solid rgba(56,189,248,0.2);
        }
        .sb-row.eliminated { opacity: 0.4; }

        .sb-rank { width: 24px; text-align: center; font-size: 14px; flex-shrink: 0; }
        .sb-player { flex: 1; min-width: 0; }
        .sb-name {
          font-size: 13px; font-weight: 500; color: var(--tx1);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          display: flex; align-items: center; gap: 5px;
        }
        .you-tag {
          font-size: 9px; font-weight: 700; font-family: var(--font-display);
          letter-spacing: 1px;
          background: var(--cyan); color: var(--bg);
          border-radius: 3px; padding: 1px 4px;
        }
        .sb-streak { font-size: 11px; color: var(--amber); margin-top: 1px; }
        .sb-pts { font-size: 13px; font-weight: 700; color: var(--cyan); flex-shrink: 0; }
      `}</style>
    </div>
  );
}
