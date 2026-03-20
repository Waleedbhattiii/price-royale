import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ToastProvider, useToast } from './hooks/useToast.jsx';
import { useRoomFromUrl } from './hooks/useRoomFromUrl.js';
import AuthPage from './pages/AuthPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import GamePage from './pages/GamePage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import QuickRoyalePage from './pages/QuickRoyalePage.jsx';
import TournamentPage from './pages/TournamentPage.jsx';
import ShareModal from './components/ShareModal.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import { useGame } from './hooks/useGame.js';
import './App.css';

function AppInner() {
  const { user, loading, logout, refreshUser } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState('lobby');
  const [showShare, setShowShare] = useState(false);
  const game = useGame(toast);

  // Refresh stats after game ends
  useEffect(() => {
    if (game.gamePhase === 'finished' && !user?.isGuest) {
      setTimeout(refreshUser, 1500);
    }
  }, [game.gamePhase]);

  // Auto-join room from ?room=XXXX URL param
  useRoomFromUrl(async (code) => {
    if (!user) return;
    try {
      const room = await game.joinRoom(code);
      game.setRoom(room);
      setPage('game');
      toast.success(`Joined room ${code}!`);
    } catch (err) {
      toast.error(`Could not join room: ${err.message}`);
    }
  });

  // Handle ?mode=quick URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'quick') {
      window.history.replaceState({}, '', '/');
      if (user) setPage('quick');
    }
  }, [user]);

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">PRICE ROYALE</div>
      <div className="splash-sub">Loading...</div>
    </div>
  );

  if (!user) return <AuthPage />;

  const goLobby = () => { game.leaveRoom(); setPage('lobby'); };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo" onClick={goLobby}>
            <span className="logo-icon">⚡</span>
            <span className="logo-text">PRICE ROYALE</span>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-btn ${page === 'lobby' ? 'active' : ''}`} onClick={goLobby}>Rooms</button>
          <button className={`nav-btn ${page === 'quick' ? 'active' : ''}`} onClick={() => setPage('quick')}>
            ⚡ Quick
          </button>
          <button className={`nav-btn ${page === 'tournament' ? 'active' : ''}`} onClick={() => setPage('tournament')}>
            🏆 Tournament
          </button>
          <button className={`nav-btn ${page === 'leaderboard' ? 'active' : ''}`} onClick={() => setPage('leaderboard')}>Board</button>
          {!user.isGuest && (
            <button className={`nav-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>Profile</button>
          )}
        </nav>

        <div className="header-right">
          {page === 'game' && game.room && game.gamePhase === 'lobby' && (
            <button className="btn-ghost" onClick={() => setShowShare(true)}>🔗 Share</button>
          )}
          <div className="user-pill"
            onClick={() => !user.isGuest && setPage('profile')}
            style={{ cursor: user.isGuest ? 'default' : 'pointer' }}
          >
            {user.avatar && <img src={user.avatar} alt="" className="user-avatar" />}
            <span className="user-name">{user.displayName}</span>
            {user.isGuest && <span className="guest-tag">Guest</span>}
            {!user.isGuest && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)', opacity: 0.8 }}>
                {(user.stats?.totalPoints || 0).toLocaleString()}
              </span>
            )}
          </div>
          <button className="btn-ghost" onClick={() => { logout(); toast.info('Logged out'); }}>Exit</button>
        </div>
      </header>

      <main className="main">
        <div style={{ display: page === 'lobby' ? 'block' : 'none' }}>
          <LobbyPage game={game} onEnterRoom={(room) => { game.setRoom(room); setPage('game'); }} onGoGame={() => setPage('game')} />
        </div>
        <div style={{ display: page === 'game' ? 'block' : 'none' }}>
          <GamePage game={game} onLeave={goLobby} />
        </div>
        {page === 'quick' && (
          <QuickRoyalePage onLeave={() => setPage('lobby')} />
        )}
        {page === 'tournament' && (
          <TournamentPage onLeave={() => setPage('lobby')} />
        )}
        <div style={{ display: page === 'leaderboard' ? 'block' : 'none' }}>
          <LeaderboardPage />
        </div>
        {!user.isGuest && (
          <div style={{ display: page === 'profile' ? 'block' : 'none' }}>
            <ProfilePage />
          </div>
        )}
      </main>

      {showShare && game.room && (
        <ShareModal room={game.room} onClose={() => setShowShare(false)} />
      )}

      <ConnectionStatus />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </AuthProvider>
  );
}
