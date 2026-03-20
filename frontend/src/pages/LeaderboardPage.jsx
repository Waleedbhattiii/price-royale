import { useState, useEffect } from 'react';
import { leaderboardApi } from '../lib/client.js';
import { useAuth } from '../hooks/useAuth.jsx';

const RANK_COLORS = {
  'Price Prophet': 'var(--amber)',
  'Oracle Reader': 'var(--purple)',
  'Chartist':      'var(--cyan)',
  'Rookie Trader': 'var(--tx3)',
};

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leaderboardApi.get(100).then(data => {
      setBoard(data);
      setLoading(false);
    }).catch(() => setLoading(false));

    const interval = setInterval(() => {
      leaderboardApi.get(100).then(setBoard).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const top3 = board.slice(0, 3);

  return (
    <div className="lb-page">
      <div className="lb-hero">
        <div className="lb-title">GLOBAL LEADERBOARD</div>
        <div className="lb-sub">Top traders ranked by total points</div>
      </div>

      {/* Podium — visual order: 2nd | 1st | 3rd */}
      {!loading && top3.length >= 1 && (
        <div className="lb-podium">
          {[1, 0, 2].map((rankIdx, position) => {
            const p = top3[rankIdx];
            if (!p) return <div key={rankIdx} className="podium-slot-lb empty" />;
            // Heights/labels/icons by visual position (0=left/2nd, 1=center/1st, 2=right/3rd)
            const heights = ['140px', '180px', '110px'];
            const labels  = ['2ND', '1ST', '3RD'];
            const icons   = ['🥈', '🥇', '🥉'];
            const colors  = ['var(--tx2)', 'var(--amber)', 'var(--tx3)'];
            const isMe = p.username === user?.username;
            return (
              <div key={rankIdx} className="podium-slot-lb">
                {isMe && <div className="podium-you">YOU</div>}
                <div className="podium-display-name">{p.displayName}</div>
                <div className="podium-rank-title" style={{ color: RANK_COLORS[p.rankTitle] }}>
                  {p.rankTitle}
                </div>
                <div className="podium-points mono">{p.totalPoints.toLocaleString()}</div>
                <div
                  className="podium-pillar"
                  style={{ height: heights[position], borderColor: colors[position] }}
                >
                  <div className="podium-icon" style={{ color: colors[position] }}>{icons[position]}</div>
                  <div className="podium-pos" style={{ color: colors[position] }}>{labels[position]}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="lb-card card">
        <div className="lb-table-header">
          <span className="lbth-rank">RANK</span>
          <span className="lbth-player">PLAYER</span>
          <span className="lbth-stat">POINTS</span>
          <span className="lbth-stat">GAMES</span>
          <span className="lbth-stat">WIN %</span>
        </div>

        {loading ? (
          <div className="lb-loading">Loading rankings...</div>
        ) : board.length === 0 ? (
          <div className="lb-loading">No players yet — be the first!</div>
        ) : (
          <div className="lb-rows">
            {board.map((p, i) => {
              const isMe = p.username === user?.username;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={p.username} className={`lb-row ${isMe ? 'lb-me' : ''}`}>
                  <span className="lb-rank">
                    {i < 3
                      ? <span style={{ fontSize: 18 }}>{medals[i]}</span>
                      : <span className="mono text-dim">{i + 1}</span>
                    }
                  </span>

                  <div className="lb-player-info">
                    <div className="lb-player-name">
                      {p.displayName}
                      {isMe && <span className="you-tag">YOU</span>}
                    </div>
                    <div className="lb-rank-title" style={{ color: RANK_COLORS[p.rankTitle] || 'var(--tx3)' }}>
                      {p.rankTitle}
                    </div>
                  </div>

                  <span className="lb-stat mono text-cyan">{p.totalPoints.toLocaleString()}</span>
                  <span className="lb-stat mono text-dim">{p.gamesPlayed}</span>
                  <span className={`lb-stat mono ${p.winRate >= 50 ? 'text-green' : 'text-dim'}`}>
                    {p.winRate}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .lb-page { max-width: 900px; margin: 0 auto; }

        .lb-hero { text-align: center; margin-bottom: 36px; }
        .lb-title {
          font-family: var(--font-display); font-size: 36px; font-weight: 700;
          letter-spacing: 6px; color: var(--tx1);
          text-shadow: 0 0 30px rgba(56,189,248,0.3);
        }
        .lb-sub { color: var(--tx3); font-size: 14px; margin-top: 6px; letter-spacing: 1px; }

        /* Podium */
        .lb-podium {
          display: flex; align-items: flex-end; justify-content: center;
          gap: 12px; margin-bottom: 36px; padding: 0 20px;
        }
        .podium-slot-lb {
          display: flex; flex-direction: column; align-items: center;
          gap: 6px; width: 160px; position: relative;
        }
        .podium-slot-lb.empty { opacity: 0.15; }
        .podium-you {
          position: absolute; top: -24px;
          background: var(--cyan); color: var(--bg);
          font-family: var(--font-display); font-size: 9px; font-weight: 700;
          letter-spacing: 2px; padding: 2px 8px; border-radius: 3px;
        }
        .podium-display-name {
          font-size: 14px; font-weight: 600; color: var(--tx1);
          text-align: center; max-width: 150px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .podium-rank-title { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
        .podium-points { font-size: 16px; font-weight: 700; color: var(--tx1); }
        .podium-pillar {
          width: 100%; border: 1px solid; border-radius: 8px 8px 0 0;
          background: var(--bg2); display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 4px;
        }
        .podium-icon { font-size: 28px; }
        .podium-pos {
          font-family: var(--font-display); font-size: 13px;
          font-weight: 700; letter-spacing: 2px;
        }

        /* Table */
        .lb-card { padding: 0; overflow: hidden; }
        .lb-table-header {
          display: grid; grid-template-columns: 60px 1fr repeat(3, 90px);
          padding: 12px 20px;
          background: var(--bg2); border-bottom: 1px solid var(--border);
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3);
        }
        .lbth-rank { text-align: center; }
        .lbth-stat { text-align: right; }
        .lb-loading { padding: 40px; text-align: center; color: var(--tx3); font-size: 14px; }
        .lb-rows { display: flex; flex-direction: column; }

        .lb-row {
          display: grid; grid-template-columns: 60px 1fr repeat(3, 90px);
          align-items: center; padding: 12px 20px;
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
        }
        .lb-row:last-child { border-bottom: none; }
        .lb-row:hover { background: var(--bg3); }
        .lb-me {
          background: var(--cyan-dim) !important;
          border-color: rgba(56,189,248,0.2) !important;
        }

        .lb-rank { text-align: center; }
        .lb-player-info {}
        .lb-player-name {
          font-size: 14px; font-weight: 500; color: var(--tx1);
          display: flex; align-items: center; gap: 6px;
        }
        .lb-rank-title { font-size: 11px; margin-top: 2px; }
        .lb-stat { text-align: right; font-size: 14px; font-weight: 600; }
      `}</style>
    </div>
  );
}
