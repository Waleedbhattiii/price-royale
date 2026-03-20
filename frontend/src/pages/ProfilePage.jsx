import { useAuth } from '../hooks/useAuth.jsx';

const RANK_COLORS = {
  'Price Prophet': 'var(--amber)',
  'Oracle Reader': 'var(--purple)',
  'Chartist':      'var(--cyan)',
  'Rookie Trader': 'var(--tx3)',
};

const RANK_THRESHOLDS = [
  { title: 'Rookie Trader', min: 0,     max: 999,   color: 'var(--tx3)', icon: '🎯' },
  { title: 'Chartist',      min: 1000,  max: 4999,  color: 'var(--cyan)', icon: '📊' },
  { title: 'Oracle Reader', min: 5000,  max: 14999, color: 'var(--purple)', icon: '🔮' },
  { title: 'Price Prophet', min: 15000, max: Infinity, color: 'var(--amber)', icon: '⚡' },
];

function RankProgress({ totalPoints }) {
  const current = RANK_THRESHOLDS.findLast(r => totalPoints >= r.min) || RANK_THRESHOLDS[0];
  const next = RANK_THRESHOLDS[RANK_THRESHOLDS.indexOf(current) + 1];

  const pct = next
    ? Math.min(((totalPoints - current.min) / (next.min - current.min)) * 100, 100)
    : 100;

  return (
    <div className="rank-progress">
      <div className="rank-current">
        <span style={{ fontSize: 28 }}>{current.icon}</span>
        <div>
          <div className="rank-name" style={{ color: current.color }}>{current.title}</div>
          <div className="rank-pts mono text-dim">{totalPoints.toLocaleString()} pts</div>
        </div>
      </div>

      <div className="rank-bar-wrap">
        <div className="rank-bar">
          <div
            className="rank-bar-fill"
            style={{ width: `${pct}%`, background: current.color, boxShadow: `0 0 8px ${current.color}` }}
          />
        </div>
        {next && (
          <div className="rank-next text-dim">
            {(next.min - totalPoints).toLocaleString()} pts to <span style={{ color: next.color }}>{next.title}</span>
          </div>
        )}
        {!next && <div className="rank-next text-amber">MAX RANK ACHIEVED 🏆</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'var(--cyan)' }) {
  return (
    <div className="stat-card card">
      <div className="stat-value mono" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub text-dim">{sub}</div>}
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const { stats = {}, badges = [], gameHistory = [] } = user;

  const accuracy = stats.totalPredictions > 0
    ? Math.round((stats.correctPredictions / stats.totalPredictions) * 100)
    : 0;

  const winRate = stats.gamesPlayed > 0
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;

  return (
    <div className="profile-page">
      {/* Hero */}
      <div className="profile-hero card card-glow">
        <div className="profile-avatar-wrap">
          {user.avatar
            ? <img src={user.avatar} alt="" className="profile-avatar" />
            : <div className="profile-avatar-placeholder">{user.displayName[0].toUpperCase()}</div>
          }
          {user.discordLinked && (
            <div className="discord-badge" title="Discord linked">
              <svg width="14" height="14" viewBox="0 0 71 55" fill="#5865F2">
                <path d="M60.1 4.9A58.55 58.55 0 0 0 45.5.37a.22.22 0 0 0-.23.11 40.78 40.78 0 0 0-1.8 3.7 54.07 54.07 0 0 0-16.23 0 37.38 37.38 0 0 0-1.82-3.7.23.23 0 0 0-.23-.11 58.41 58.41 0 0 0-14.6 4.53.21.21 0 0 0-.1.08C1.44 19.3-.87 33.27.27 47.07a.24.24 0 0 0 .09.16 58.84 58.84 0 0 0 17.72 8.96.23.23 0 0 0 .25-.08 42.08 42.08 0 0 0 3.63-5.9.22.22 0 0 0-.12-.31 38.75 38.75 0 0 1-5.53-2.63.23.23 0 0 1-.02-.38c.37-.28.74-.57 1.1-.86a.22.22 0 0 1 .23-.03c11.6 5.3 24.14 5.3 35.6 0a.22.22 0 0 1 .23.03c.35.3.73.58 1.1.86a.23.23 0 0 1-.02.38 36.37 36.37 0 0 1-5.54 2.63.23.23 0 0 0-.12.31 47.25 47.25 0 0 0 3.63 5.9.23.23 0 0 0 .25.08 58.62 58.62 0 0 0 17.74-8.96.23.23 0 0 0 .09-.16c1.37-16-2.3-29.86-9.7-42.1a.18.18 0 0 0-.1-.08zM23.74 38.73c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.82 7.15-6.38 7.15zm23.6 0c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.8 7.15-6.38 7.15z"/>
              </svg>
            </div>
          )}
        </div>

        <div className="profile-info">
          <div className="profile-display-name">{user.displayName}</div>
          <div className="profile-username text-dim">@{user.username}</div>
          {user.isGuest && <span className="tag tag-amber" style={{ marginTop: 4 }}>Guest — stats not saved</span>}
        </div>

        <div className="profile-rank-wrap">
          <RankProgress totalPoints={stats.totalPoints || 0} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <StatCard label="Total Points" value={(stats.totalPoints || 0).toLocaleString()} color="var(--cyan)" />
        <StatCard label="Games Played" value={stats.gamesPlayed || 0} color="var(--purple)" />
        <StatCard label="Games Won" value={stats.gamesWon || 0} sub={`${winRate}% win rate`} color="var(--green)" />
        <StatCard label="Accuracy" value={`${accuracy}%`} sub={`${stats.correctPredictions || 0}/${stats.totalPredictions || 0} correct`} color="var(--amber)" />
        <StatCard label="Best Streak" value={`${stats.bestStreak || 0}🔥`} color="var(--amber)" />
        <StatCard label="Rooms Created" value={stats.roomsCreated || 0} color="var(--tx2)" />
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="card badges-section">
          <div className="section-heading">BADGES</div>
          <div className="badges-grid">
            {badges.map(badge => (
              <div key={badge.id} className="badge-item">
                <div className="badge-label">{badge.label}</div>
                <div className="badge-date text-dim">
                  {new Date(badge.earnedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {badges.length === 0 && (
        <div className="card badges-section badges-empty">
          <div className="section-heading">BADGES</div>
          <div className="text-dim" style={{ fontSize: 13, marginTop: 8 }}>
            Play games to earn badges — first win, streaks, and more!
          </div>
        </div>
      )}

      {/* Game history */}
      <div className="card history-section">
        <div className="section-heading">RECENT GAMES</div>
        {gameHistory.length === 0 ? (
          <div className="text-dim" style={{ fontSize: 13, padding: '16px 0' }}>No games played yet.</div>
        ) : (
          <div className="history-list">
            <div className="history-header">
              <span>ROOM</span>
              <span>RESULT</span>
              <span>RANK</span>
              <span>POINTS</span>
              <span>DATE</span>
            </div>
            {gameHistory.map((g, i) => (
              <div key={i} className={`history-row ${g.won ? 'won' : ''}`}>
                <span className="history-room">{g.roomName}</span>
                <span className={g.won ? 'text-green' : 'text-dim'}>
                  {g.won ? '🏆 Won' : `#${g.rank} / ${g.totalPlayers}`}
                </span>
                <span className="text-dim mono">#{g.rank}</span>
                <span className="mono text-cyan">+{g.points.toLocaleString()}</span>
                <span className="text-dim" style={{ fontSize: 12 }}>
                  {new Date(g.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .profile-page { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

        /* Hero */
        .profile-hero {
          display: flex; align-items: center; gap: 24px;
          padding: 28px; flex-wrap: wrap;
        }
        .profile-avatar-wrap { position: relative; flex-shrink: 0; }
        .profile-avatar {
          width: 80px; height: 80px; border-radius: 50%;
          border: 2px solid var(--border2); object-fit: cover;
        }
        .profile-avatar-placeholder {
          width: 80px; height: 80px; border-radius: 50%;
          background: var(--cyan-dim); border: 2px solid var(--border2);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 32px; font-weight: 700;
          color: var(--cyan);
        }
        .discord-badge {
          position: absolute; bottom: 0; right: 0;
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--bg2); border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center;
        }
        .profile-info { min-width: 0; }
        .profile-display-name {
          font-family: var(--font-display); font-size: 26px; font-weight: 700;
          letter-spacing: 1px; color: var(--tx1);
        }
        .profile-username { font-size: 14px; margin-top: 2px; }
        .profile-rank-wrap { flex: 1; min-width: 240px; }

        /* Rank progress */
        .rank-progress { display: flex; flex-direction: column; gap: 12px; }
        .rank-current { display: flex; align-items: center; gap: 12px; }
        .rank-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; }
        .rank-pts { font-size: 13px; margin-top: 2px; }
        .rank-bar-wrap { display: flex; flex-direction: column; gap: 6px; }
        .rank-bar {
          height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;
        }
        .rank-bar-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
        .rank-next { font-size: 12px; }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .stat-card { text-align: center; padding: 20px 12px; }
        .stat-value {
          font-size: 28px; font-weight: 700; line-height: 1;
          margin-bottom: 6px;
        }
        .stat-label {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 1.5px; text-transform: uppercase; color: var(--tx3);
        }
        .stat-sub { font-size: 11px; margin-top: 4px; }

        /* Badges */
        .badges-section { padding: 20px; }
        .badges-empty {}
        .section-heading {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3); margin-bottom: 14px;
        }
        .badges-grid { display: flex; flex-wrap: wrap; gap: 10px; }
        .badge-item {
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 14px;
          transition: border-color 0.2s;
        }
        .badge-item:hover { border-color: var(--border2); }
        .badge-label { font-size: 14px; font-weight: 500; color: var(--tx1); }
        .badge-date { font-size: 11px; margin-top: 3px; }

        /* History */
        .history-section { padding: 20px; }
        .history-list { display: flex; flex-direction: column; }
        .history-header {
          display: grid;
          grid-template-columns: 1fr 120px 60px 90px 90px;
          padding: 8px 10px;
          font-family: var(--font-display); font-size: 10px;
          font-weight: 700; letter-spacing: 1.5px; color: var(--tx3);
          border-bottom: 1px solid var(--border);
          margin-bottom: 4px;
        }
        .history-row {
          display: grid;
          grid-template-columns: 1fr 120px 60px 90px 90px;
          padding: 10px 10px;
          font-size: 13px;
          border-bottom: 1px solid var(--border);
          align-items: center;
          transition: background 0.15s;
        }
        .history-row:last-child { border-bottom: none; }
        .history-row:hover { background: var(--bg3); border-radius: 6px; }
        .history-row.won { background: rgba(52,211,153,0.04); }
        .history-room {
          color: var(--tx1); font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          padding-right: 12px;
        }
      `}</style>
    </div>
  );
}
