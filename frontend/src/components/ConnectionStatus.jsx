import { useState, useEffect } from 'react';
import { getSocket, api } from '../lib/client.js';

export default function ConnectionStatus() {
  const [socketOk, setSocketOk] = useState(true);
  const [pythOk, setPythOk] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [forceDisconnected, setForceDisconnected] = useState(null);

  // Monitor socket connection
  useEffect(() => {
    function checkSocket() {
      const socket = getSocket();
      const connected = socket?.connected ?? false;
      setSocketOk(connected);
      setReconnecting(!connected && !!socket);
    }

    checkSocket();
    const interval = setInterval(checkSocket, 2000);

    const socket = getSocket();
    if (socket) {
      socket.on('connect',    () => { setSocketOk(true);  setReconnecting(false); });
      socket.on('disconnect', () => { setSocketOk(false); });
      socket.on('reconnecting', () => setReconnecting(true));
      socket.on('reconnect',  () => { setSocketOk(true);  setReconnecting(false); });
      socket.on('force:disconnect', ({ reason }) => {
        setSocketOk(false);
        setReconnecting(false);
        setForceDisconnected(reason || 'Disconnected from another tab');
      });
    }

    return () => {
      clearInterval(interval);
      const s = getSocket();
      if (s) {
        s.off('connect');
        s.off('disconnect');
        s.off('reconnecting');
        s.off('reconnect');
      }
    };
  }, []);

  // Monitor Pyth health
  useEffect(() => {
    function checkPyth() {
      api.get('/health').then(r => {
        setPythOk(r.data?.pyth?.ok !== false);
      }).catch(() => {});
    }

    checkPyth();
    const interval = setInterval(checkPyth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Don't render anything when all is good
  if (socketOk && pythOk && !reconnecting && !forceDisconnected) return null;

  return (
    <div className="conn-status-bar">
      {forceDisconnected && (
        <div className="conn-badge conn-error" style={{ cursor: 'pointer' }} onClick={() => window.location.reload()}>
          <span className="conn-dot" />
          {forceDisconnected} — Click to reload
        </div>
      )}
      {!forceDisconnected && !socketOk && !reconnecting && (
        <div className="conn-badge conn-error" style={{ cursor: 'pointer' }} onClick={() => window.location.reload()}>
          <span className="conn-dot" />
          Disconnected — Click to reload
        </div>
      )}
      {!forceDisconnected && reconnecting && (
        <div className="conn-badge conn-warn">
          <span className="conn-spin" />
          Reconnecting...
        </div>
      )}
      {socketOk && !pythOk && (
        <div className="conn-badge conn-warn">
          <span className="conn-dot conn-amber" />
          Pyth oracle offline — using cached prices
        </div>
      )}

      <style>{`
        .conn-status-bar {
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9000;
          display: flex;
          gap: 8px;
          pointer-events: none;
        }
        .conn-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(16px);
          animation: slideUp 0.3s ease forwards;
        }
        .conn-error {
          background: rgba(248,113,113,0.15);
          border: 1px solid rgba(248,113,113,0.4);
          color: var(--red);
          box-shadow: 0 4px 20px rgba(248,113,113,0.2);
        }
        .conn-warn {
          background: rgba(251,191,36,0.12);
          border: 1px solid rgba(251,191,36,0.35);
          color: var(--amber);
          box-shadow: 0 4px 20px rgba(251,191,36,0.15);
        }
        .conn-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--red); flex-shrink: 0;
          animation: blink 1s ease-in-out infinite;
        }
        .conn-dot.conn-amber { background: var(--amber); }
        .conn-spin {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid rgba(251,191,36,0.3);
          border-top-color: var(--amber);
          flex-shrink: 0;
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  );
}
