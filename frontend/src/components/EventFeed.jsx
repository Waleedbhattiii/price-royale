export default function EventFeed({ events }) {
  const colorMap = {
    join:   'var(--green)',
    leave:  'var(--tx3)',
    round:  'var(--cyan)',
    up:     'var(--green)',
    down:   'var(--red)',
    tie:    'var(--amber)',
    win:    'var(--amber)',
    system: 'var(--purple)',
    info:   'var(--tx2)',
  };

  if (!events?.length) return null;

  return (
    <div className="event-feed card">
      <div className="ef-title">LIVE FEED</div>
      <div className="ef-list">
        {events.map(ev => (
          <div key={ev.id} className="ef-row animate-fade">
            <span className="ef-dot" style={{ background: colorMap[ev.type] || 'var(--tx3)' }} />
            <span className="ef-msg">{ev.msg}</span>
          </div>
        ))}
      </div>

      <style>{`
        .event-feed { padding: 14px; }
        .ef-title {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          letter-spacing: 2px; color: var(--tx3); margin-bottom: 10px;
        }
        .ef-list {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 200px; overflow-y: auto;
        }
        .ef-row { display: flex; align-items: flex-start; gap: 8px; }
        .ef-dot {
          width: 6px; height: 6px; border-radius: 50%;
          flex-shrink: 0; margin-top: 5px;
        }
        .ef-msg { font-size: 12px; color: var(--tx2); line-height: 1.5; }
      `}</style>
    </div>
  );
}
