import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback(({ message, type = 'info', duration = 3500, icon }) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type, icon }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const toast = {
    success: (msg, opts) => addToast({ message: msg, type: 'success', icon: '✅', ...opts }),
    error:   (msg, opts) => addToast({ message: msg, type: 'error',   icon: '❌', ...opts }),
    info:    (msg, opts) => addToast({ message: msg, type: 'info',    icon: 'ℹ️', ...opts }),
    warn:    (msg, opts) => addToast({ message: msg, type: 'warn',    icon: '⚠️', ...opts }),
    points:  (pts, opts) => addToast({ message: `+${pts} pts`, type: 'points', icon: '⚡', duration: 2500, ...opts }),
    streak:  (n, opts)   => addToast({ message: `🔥 ${n}-round streak!`, type: 'streak', duration: 2800, ...opts }),
  };

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => onDismiss(t.id)}
        >
          {t.icon && <span className="toast-icon">{t.icon}</span>}
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}

      <style>{`
        .toast-container {
          position: fixed;
          top: 72px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
        }
        .toast {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          font-family: var(--font-body);
          backdrop-filter: blur(16px);
          border: 1px solid;
          pointer-events: all;
          cursor: pointer;
          animation: toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          max-width: 320px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(0.9); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        .toast-success {
          background: rgba(52,211,153,0.12);
          border-color: rgba(52,211,153,0.35);
          color: var(--green);
        }
        .toast-error {
          background: rgba(248,113,113,0.12);
          border-color: rgba(248,113,113,0.35);
          color: var(--red);
        }
        .toast-info {
          background: rgba(56,189,248,0.1);
          border-color: rgba(56,189,248,0.3);
          color: var(--cyan);
        }
        .toast-warn {
          background: rgba(251,191,36,0.1);
          border-color: rgba(251,191,36,0.3);
          color: var(--amber);
        }
        .toast-points {
          background: rgba(56,189,248,0.15);
          border-color: rgba(56,189,248,0.4);
          color: var(--cyan);
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 700;
          box-shadow: 0 0 20px rgba(56,189,248,0.25), 0 8px 32px rgba(0,0,0,0.4);
        }
        .toast-streak {
          background: rgba(251,191,36,0.12);
          border-color: rgba(251,191,36,0.4);
          color: var(--amber);
          font-weight: 700;
          box-shadow: 0 0 20px rgba(251,191,36,0.2), 0 8px 32px rgba(0,0,0,0.4);
        }
        .toast-icon { font-size: 16px; flex-shrink: 0; }
        .toast-msg { line-height: 1.4; color: inherit; }
      `}</style>
    </div>
  );
}
