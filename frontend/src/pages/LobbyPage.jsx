import { useState, useEffect } from 'react';
import { roomsApi, pricesApi } from '../lib/client.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useToast } from '../hooks/useToast.jsx';

const ASSETS = ['ETH/USD', 'BTC/USD', 'SOL/USD'];

export default function LobbyPage({ game, onEnterRoom, onGoGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const [rooms, setRooms] = useState([]);
  const [prices, setPrices] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createError, setCreateError] = useState('');
  const [loading, setLoading] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: '',
    isPublic: true,
    password: '',
    maxPlayers: 50,
    rounds: 5,
    roundDuration: 60,
    assetRotation: 'random',
    pointMode: 'standard',
  });

  useEffect(() => {
    loadRooms();
    loadPrices();
    const interval = setInterval(() => { loadRooms(); loadPrices(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadRooms() {
    try { setRooms(await roomsApi.list()); } catch {}
  }

  async function loadPrices() {
    try { setPrices(await pricesApi.latest()); } catch {}
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setLoading(true);
    try {
      const room = await game.createRoom({
        ...createForm,
        name: createForm.name || `${user.displayName}'s Room`,
      });
      setShowCreate(false);
      toast.success(`Room "${room.name}" created!`);
      onEnterRoom(room);
      onGoGame();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinError('');
    setLoading(true);
    try {
      const room = await game.joinRoom(code, joinPassword || undefined);
      toast.success(`Joined room ${code}!`);
      onEnterRoom(room);
      onGoGame();
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickJoin(roomId) {
    setLoading(true);
    try {
      const room = await game.joinRoom(roomId);
      toast.success(`Joined "${room.name}"!`);
      onEnterRoom(room);
      onGoGame();
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const setCreate = (k, v) => setCreateForm(f => ({ ...f, [k]: v }));

  return (
    <div className="lobby">
      {/* Price ticker */}
      <div className="ticker-bar">
        {ASSETS.map(asset => {
          const p = prices[asset];
          return (
            <div key={asset} className="ticker-item">
              <span className="ticker-asset">{asset}</span>
              <span className="ticker-price mono">
                {p ? `$${p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </span>
              {p && <span className="ticker-ci text-dim">CI: {p.confBps?.toFixed(1)}bps</span>}
            </div>
          );
        })}
        <div className="ticker-pyth">⚡ Powered by Pyth</div>
      </div>

      <div className="lobby-grid">
        {/* Left: actions */}
        <div className="lobby-actions">
          <div className="card card-glow">
            <h2 className="section-title">Join the Battle</h2>
            <p className="section-sub">Predict asset prices, outscore opponents, climb the ranks.</p>

            <button className="btn btn-primary w-full" style={{ marginBottom: 12 }} onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? '✕ Cancel' : '+ Create Room'}
            </button>

            {showCreate && (
              <form onSubmit={handleCreate} className="create-form animate-fade">
                {createError && <div className="form-error">{createError}</div>}

                <div className="form-group">
                  <label className="form-label">Room Name</label>
                  <input className="form-input" placeholder={`${user.displayName}'s Room`} value={createForm.name} onChange={e => setCreate('name', e.target.value)} maxLength={40} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Rounds</label>
                    <select className="form-input" value={createForm.rounds} onChange={e => setCreate('rounds', +e.target.value)}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} Round{n>1?'s':''}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration</label>
                    <select className="form-input" value={createForm.roundDuration} onChange={e => setCreate('roundDuration', +e.target.value)}>
                      <option value={15}>15 sec</option>
                      <option value={30}>30 sec</option>
                      <option value={60}>60 sec</option>
                      <option value={90}>90 sec</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Asset</label>
                    <select className="form-input" value={createForm.assetRotation} onChange={e => setCreate('assetRotation', e.target.value)}>
                      <option value="random">🎲 Random</option>
                      {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Players</label>
                    <select className="form-input" value={createForm.maxPlayers} onChange={e => setCreate('maxPlayers', +e.target.value)}>
                      {[2,10,25,50,100,200,500].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Points Mode</label>
                    <select className="form-input" value={createForm.pointMode} onChange={e => setCreate('pointMode', e.target.value)}>
                      <option value="standard">Standard (1×)</option>
                      <option value="highstakes">High Stakes (2×)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Visibility</label>
                    <select className="form-input" value={createForm.isPublic ? 'public' : 'private'} onChange={e => setCreate('isPublic', e.target.value === 'public')}>
                      <option value="public">🌐 Public</option>
                      <option value="private">🔒 Private</option>
                    </select>
                  </div>
                </div>

                {!createForm.isPublic && (
                  <div className="form-group">
                    <label className="form-label">Room Password (optional)</label>
                    <input className="form-input" type="password" placeholder="Leave empty for link-only" value={createForm.password} onChange={e => setCreate('password', e.target.value)} />
                  </div>
                )}

                <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                  {loading ? 'Creating...' : '🚀 Launch Room'}
                </button>
              </form>
            )}

            <div className="divider">or join by code</div>

            <form onSubmit={handleJoin}>
              {joinError && <div className="form-error">{joinError}</div>}
              <div className="form-group">
                <input className="form-input mono" placeholder="ROOM CODE (6 chars)" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6} style={{ letterSpacing: '4px', textAlign: 'center', fontSize: 18 }} />
              </div>
              <div className="form-group">
                <input className="form-input" type="password" placeholder="Password (if required)" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} />
              </div>
              <button type="submit" className="btn w-full" style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--tx1)' }} disabled={loading || joinCode.length < 6}>
                Join Room →
              </button>
            </form>
          </div>

          {/* How it works */}
          <div className="card how-it-works">
            <div className="hiw-title">HOW IT WORKS</div>
            <div className="hiw-steps">
              {[
                ['📊', 'Live asset price shown'],
                ['⬆️⬇️', 'Predict UP or DOWN'],
                ['⚡', 'Pyth oracle settles'],
                ['🏆', 'Top scorer wins'],
              ].map(([icon, text], i) => (
                <div key={i} className="hiw-step">
                  <span className="hiw-num">{i+1}</span>
                  <span className="hiw-icon">{icon}</span>
                  <span className="hiw-text">{text}</span>
                </div>
              ))}
            </div>
            <div className="hiw-bonus">
              <span className="text-cyan">⚡ CI Bonus:</span>
              <span className="text-dim"> Wide Pyth confidence interval = bigger point multiplier for correct calls</span>
            </div>
          </div>
        </div>

        {/* Right: public rooms */}
        <div className="lobby-rooms">
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Open Rooms</h2>
            <span className="tag tag-cyan">{rooms.length} live</span>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-rooms">
              <div className="empty-icon">🏟️</div>
              <div>No open rooms yet</div>
              <div className="text-dim" style={{ fontSize: 13 }}>Be the first to create one!</div>
            </div>
          ) : (
            <div className="room-list">
              {rooms.map(room => (
                <div key={room.id} className="room-card card animate-fade">
                  <div className="room-header">
                    <div>
                      <div className="room-name">{room.name}</div>
                      <div className="room-host text-dim">by {room.hostUsername}</div>
                    </div>
                    <div className="room-tags">
                      {room.hasPassword && <span className="tag tag-amber">🔒</span>}
                      {room.pointMode === 'highstakes' && <span className="tag tag-red">2× Points</span>}
                    </div>
                  </div>

                  <div className="room-meta">
                    <span>{room.rounds} rounds</span>
                    <span>·</span>
                    <span>{room.roundDuration}s</span>
                    <span>·</span>
                    <span>{room.assetRotation === 'random' ? '🎲 Random' : room.assetRotation}</span>
                    <span>·</span>
                    <span className={room.players >= room.maxPlayers ? 'text-red' : 'text-green'}>
                      {room.players}/{room.maxPlayers}
                    </span>
                  </div>

                  <div className="room-code mono text-cyan">{room.id}</div>

                  <button
                    className="btn btn-primary w-full"
                    style={{ padding: '8px', fontSize: 13 }}
                    onClick={() => handleQuickJoin(room.id)}
                    disabled={loading || room.players >= room.maxPlayers}
                  >
                    {room.players >= room.maxPlayers ? 'Full' : 'Join →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .lobby { max-width: 1200px; margin: 0 auto; }

        .ticker-bar {
          display: flex;
          align-items: center;
          gap: 24px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 20px;
          margin-bottom: 24px;
          overflow-x: auto;
        }
        .ticker-item { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .ticker-asset { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1px; color: var(--tx2); }
        .ticker-price { font-size: 15px; font-weight: 700; color: var(--tx1); }
        .ticker-ci { font-size: 11px; }
        .ticker-pyth { margin-left: auto; font-size: 11px; color: var(--cyan); white-space: nowrap; opacity: 0.7; }

        .lobby-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .lobby-grid { grid-template-columns: 1fr; }
        }

        .section-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 1px;
          color: var(--tx1);
          margin-bottom: 6px;
        }
        .section-sub { font-size: 13px; color: var(--tx3); margin-bottom: 20px; }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .create-form { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 4px; margin-bottom: 16px; }

        .how-it-works {
          margin-top: 16px;
          background: var(--bg2);
        }
        .hiw-title {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          color: var(--tx3);
          margin-bottom: 12px;
        }
        .hiw-steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .hiw-step { display: flex; align-items: center; gap: 10px; }
        .hiw-num {
          width: 20px; height: 20px;
          background: var(--cyan-dim);
          color: var(--cyan);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; font-family: var(--font-mono);
          flex-shrink: 0;
        }
        .hiw-icon { font-size: 16px; }
        .hiw-text { font-size: 13px; color: var(--tx2); }
        .hiw-bonus { font-size: 12px; line-height: 1.5; padding-top: 10px; border-top: 1px solid var(--border); }

        .lobby-rooms {}
        .empty-rooms {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 60px 20px; color: var(--tx2); text-align: center;
        }
        .empty-icon { font-size: 48px; margin-bottom: 8px; }

        .room-list { display: flex; flex-direction: column; gap: 12px; }
        .room-card { transition: all 0.2s; }
        .room-card:hover { border-color: var(--border2); transform: translateY(-1px); }
        .room-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
        .room-name { font-family: var(--font-display); font-size: 16px; font-weight: 600; color: var(--tx1); }
        .room-host { font-size: 12px; margin-top: 2px; }
        .room-tags { display: flex; gap: 4px; }
        .room-meta {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: var(--tx3); margin-bottom: 8px;
        }
        .room-code {
          font-size: 13px; letter-spacing: 3px;
          margin-bottom: 10px; opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
