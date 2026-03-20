import { useState } from 'react';

export default function ShareModal({ room, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const shareUrl = `${window.location.origin}?room=${room.id}`;

  function copyUrl() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(room.id).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  }

  function copyDiscordMessage() {
    const msg = `🎮 **Price Royale** — Join my room!\n📊 ${room.rounds} rounds · ${room.roundDuration}s per round · ${room.assetRotation === 'random' ? 'Random assets' : room.assetRotation}\n🔗 ${shareUrl}\n🔑 Room code: \`${room.id}\``;
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box animate-slide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Share Room</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Room info */}
        <div className="share-room-info">
          <div className="share-room-name">{room.name}</div>
          <div className="share-room-meta">
            <span className="tag tag-cyan">{room.rounds} rounds</span>
            <span className="tag tag-amber">{room.roundDuration}s</span>
            <span className="tag tag-purple">{room.assetRotation === 'random' ? '🎲 Random' : room.assetRotation}</span>
          </div>
        </div>

        {/* Room code — big and prominent */}
        <div className="share-code-block">
          <div className="share-code-label">ROOM CODE</div>
          <div className="share-code">{room.id}</div>
          <button className="btn btn-ghost" onClick={copyCode}>
            {copiedCode ? '✓ Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Direct link */}
        <div className="share-link-block">
          <div className="share-link-label">DIRECT LINK</div>
          <div className="share-link-row">
            <div className="share-link-url mono">{shareUrl}</div>
            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={copyUrl}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Discord copy */}
        <button className="btn-discord-share" onClick={copyDiscordMessage}>
          <svg width="18" height="18" viewBox="0 0 71 55" fill="currentColor">
            <path d="M60.1 4.9A58.55 58.55 0 0 0 45.5.37a.22.22 0 0 0-.23.11 40.78 40.78 0 0 0-1.8 3.7 54.07 54.07 0 0 0-16.23 0 37.38 37.38 0 0 0-1.82-3.7.23.23 0 0 0-.23-.11 58.41 58.41 0 0 0-14.6 4.53.21.21 0 0 0-.1.08C1.44 19.3-.87 33.27.27 47.07a.24.24 0 0 0 .09.16 58.84 58.84 0 0 0 17.72 8.96.23.23 0 0 0 .25-.08 42.08 42.08 0 0 0 3.63-5.9.22.22 0 0 0-.12-.31 38.75 38.75 0 0 1-5.53-2.63.23.23 0 0 1-.02-.38c.37-.28.74-.57 1.1-.86a.22.22 0 0 1 .23-.03c11.6 5.3 24.14 5.3 35.6 0a.22.22 0 0 1 .23.03c.35.3.73.58 1.1.86a.23.23 0 0 1-.02.38 36.37 36.37 0 0 1-5.54 2.63.23.23 0 0 0-.12.31 47.25 47.25 0 0 0 3.63 5.9.23.23 0 0 0 .25.08 58.62 58.62 0 0 0 17.74-8.96.23.23 0 0 0 .09-.16c1.37-16-2.3-29.86-9.7-42.1a.18.18 0 0 0-.1-.08zM23.74 38.73c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.82 7.15-6.38 7.15zm23.6 0c-3.5 0-6.38-3.21-6.38-7.15s2.82-7.16 6.38-7.16c3.6 0 6.44 3.24 6.38 7.16 0 3.94-2.8 7.15-6.38 7.15z"/>
          </svg>
          Copy Discord Message
        </button>

        <div className="share-hint">
          Share the link in your Discord server — members click it and land directly in this room.
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          backdrop-filter: blur(4px);
        }
        .modal-box {
          background: var(--bg2);
          border: 1px solid var(--border2);
          border-radius: 16px;
          padding: 28px;
          width: 100%;
          max-width: 460px;
          box-shadow: 0 0 60px rgba(56,189,248,0.1), 0 24px 60px rgba(0,0,0,0.5);
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px;
        }
        .modal-title {
          font-family: var(--font-display); font-size: 20px; font-weight: 700;
          letter-spacing: 1px; color: var(--tx1);
        }
        .modal-close {
          background: none; border: none; color: var(--tx3);
          font-size: 18px; cursor: pointer; padding: 4px 8px;
          border-radius: 6px; transition: color 0.2s;
        }
        .modal-close:hover { color: var(--tx1); }

        .share-room-info {
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px 16px;
          margin-bottom: 20px;
        }
        .share-room-name {
          font-family: var(--font-display); font-size: 17px; font-weight: 700;
          color: var(--tx1); margin-bottom: 8px;
        }
        .share-room-meta { display: flex; gap: 6px; flex-wrap: wrap; }

        .share-code-block {
          display: flex; flex-direction: column; align-items: center;
          gap: 10px; padding: 20px;
          background: var(--cyan-dim); border: 1px solid rgba(56,189,248,0.25);
          border-radius: var(--radius); margin-bottom: 16px;
        }
        .share-code-label {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 3px; color: var(--tx3);
        }
        .share-code {
          font-family: var(--font-mono); font-size: 40px; font-weight: 700;
          color: var(--cyan); letter-spacing: 12px;
          text-shadow: 0 0 20px rgba(56,189,248,0.5);
        }

        .share-link-block { margin-bottom: 16px; }
        .share-link-label {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3); margin-bottom: 8px;
        }
        .share-link-row {
          display: flex; gap: 8px; align-items: center;
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 8px 12px;
        }
        .share-link-url {
          flex: 1; font-size: 12px; color: var(--tx2);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .btn-discord-share {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; width: 100%; padding: 11px;
          background: rgba(88,101,242,0.15);
          border: 1px solid rgba(88,101,242,0.4);
          color: #7289da; border-radius: var(--radius);
          font-family: var(--font-display); font-size: 13px; font-weight: 700;
          letter-spacing: 0.5px; cursor: pointer;
          transition: all 0.2s; margin-bottom: 14px;
        }
        .btn-discord-share:hover {
          background: rgba(88,101,242,0.25);
          border-color: rgba(88,101,242,0.6);
        }

        .share-hint {
          font-size: 12px; color: var(--tx3); text-align: center; line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
