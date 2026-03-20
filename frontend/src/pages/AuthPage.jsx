import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { authApi } from '../lib/client.js';

export default function AuthPage() {
  const { login, register, loginAsGuest } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | guest
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login({ username: form.username, password: form.password });
      else await register({ username: form.username, password: form.password, displayName: form.displayName || form.username });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGuest(e) {
    e.preventDefault();
    const name = guestName.trim();
    if (!name || name.length < 2) return setError('Enter a display name (min 2 chars)');
    loginAsGuest(name);
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-effect" />

      <div className="auth-container animate-slide">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">⚡</span>
          <div>
            <div className="auth-logo-title">PRICE ROYALE</div>
            <div className="auth-logo-sub">Pyth-Powered Price Prediction PvP</div>
          </div>
        </div>

        {/* Discord OAuth */}
        <a href={authApi.discordUrl()} className="btn-discord">
          <svg width="20" height="20" viewBox="0 0 71 55" fill="currentColor">
            <path d="M60.1 4.9A58.55 58.55 0 0 0 45.5.37a.22.22 0 0 0-.23.11 40.78 40.78 0 0 0-1.8 3.7 54.07 54.07 0 0 0-16.23 0 37.38 37.38 0 0 0-1.82-3.7.23.23 0 0 0-.23-.11 58.41 58.41 0 0 0-14.6 4.53.21.21 0 0 0-.1.08C1.44 19.3-.87 33.27.27 47.07a.24.24 0 0 0 .09.16 58.84 58.84 0 0 0 17.72 8.96.23.23 0 0 0 .25-.08 42.08 42.08 0 0 0 3.63-5.9.22.22 0 0 0-.12-.31 38.75 38.75 0 0 1-5.53-2.63.23.23 0 0 1-.02-.38c.37-.28.74-.57 1.1-.86a.22.22 0 0 1 .23-.03c11.6 5.3 24.14 5.3 35.6 0a.22.22 0 0 1 .23.03c.35.3.73.58 1.1.86a.23.23 0 0 1-.02.38 36.37 36.37 0 0 1-5.54 2.63.23.23 0 0 0-.12.31 47.25 47.25 0 0 0 3.63 5.9.23.23 0 0 0 .25.08 58.62 58.62 0 0 0 17.74-8.96.23.23 0 0 0 .09-.16c1.37-16-2.3-29.86-9.7-42.1a.18.18 0 0 0-.1-.08zM23.74 38.73c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.82 7.15-6.38 7.15zm23.6 0c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.8 7.15-6.38 7.15z" />
          </svg>
          Continue with Discord
        </a>

        <div className="divider">or</div>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Login</button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Register</button>
          <button className={`auth-tab ${mode === 'guest' ? 'active' : ''}`} onClick={() => { setMode('guest'); setError(''); }}>Guest</button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {mode === 'guest' ? (
          <form onSubmit={handleGuest}>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input className="form-input" placeholder="Enter a name to play as..." value={guestName} onChange={e => setGuestName(e.target.value)} maxLength={20} />
            </div>
            <div className="form-hint">Guest stats are not saved between sessions.</div>
            <button type="submit" className="btn btn-primary w-full mt-2">Play as Guest →</button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input className="form-input" placeholder="How others see you" value={form.displayName} onChange={e => set('displayName', e.target.value)} maxLength={30} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" placeholder="Letters, numbers, underscores" value={form.username} onChange={e => set('username', e.target.value)} autoComplete="username" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="form-input" placeholder={mode === 'register' ? 'Min 6 characters' : 'Your password'} value={form.password} onChange={e => set('password', e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Login →' : 'Create Account →'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          Powered by <span className="text-cyan">Pyth Network</span> oracle price feeds
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
        }
        .auth-bg-effect {
          position: fixed; inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(109,40,217,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(209,154,102,0.07) 0%, transparent 60%);
          pointer-events: none;
        }
        .auth-container {
          position: relative;
          width: 100%;
          max-width: 420px;
          background: rgba(255,255,255,0.95);
          border: 1px solid var(--border2);
          border-radius: 16px;
          padding: 36px 32px;
          backdrop-filter: blur(20px);
          box-shadow: 0 8px 48px rgba(109,40,217,0.12), 0 2px 16px rgba(109,40,217,0.06);
        }
        .auth-logo {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }
        .auth-logo-icon {
          font-size: 36px;
          filter: drop-shadow(0 0 12px var(--cyan));
        }
        .auth-logo-title {
          font-family: var(--font-display);
          font-size: 22px; font-weight: 700; letter-spacing: 3px;
          color: var(--purple); line-height: 1.1;
        }
        .auth-logo-sub {
          font-size: 11px;
          color: var(--tx3);
          letter-spacing: 0.5px;
          margin-top: 2px;
        }
        .btn-discord {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 11px;
          background: #5865F2;
          color: white;
          border-radius: var(--radius);
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3);
        }
        .btn-discord:hover {
          background: #4752c4;
          box-shadow: 0 4px 20px rgba(88, 101, 242, 0.5);
          transform: translateY(-1px);
        }
        .auth-tabs {
          display: flex;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 3px;
          margin-bottom: 20px;
          gap: 2px;
        }
        .auth-tab {
          flex: 1;
          padding: 7px;
          background: none;
          border: none;
          color: var(--tx3);
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .auth-tab.active {
          background: var(--bg2);
          color: var(--cyan);
          box-shadow: 0 0 10px rgba(56,189,248,0.15);
        }
        .form-hint {
          font-size: 12px;
          color: var(--tx3);
          margin-bottom: 8px;
        }
        .auth-footer {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: var(--tx3);
        }
      `}</style>
    </div>
  );
}
