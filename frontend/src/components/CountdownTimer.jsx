export default function CountdownTimer({ total, remaining }) {
  const pct = total > 0 ? remaining / total : 0;
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;

  const urgent = remaining <= 5;
  const warning = remaining <= 10;

  const color = urgent ? 'var(--red)' : warning ? 'var(--amber)' : 'var(--cyan)';

  return (
    <div className="countdown-wrap">
      <svg width="90" height="90" viewBox="0 0 90 90">
        {/* Track */}
        <circle
          cx="45" cy="45" r={radius}
          fill="none"
          stroke="var(--bg3)"
          strokeWidth="5"
        />
        {/* Progress */}
        <circle
          cx="45" cy="45" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset="0"
          transform="rotate(-90 45 45)"
          style={{
            transition: 'stroke-dasharray 1s linear, stroke 0.3s',
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
        {/* Number */}
        <text
          x="45" y="45"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="22"
          fontWeight="700"
          fontFamily="'Space Mono', monospace"
          style={{ filter: urgent ? `drop-shadow(0 0 8px ${color})` : 'none' }}
        >
          {remaining}
        </text>
      </svg>
      <div className="countdown-label" style={{ color }}>
        {urgent ? 'HURRY!' : warning ? 'DECIDE!' : 'seconds left'}
      </div>

      <style>{`
        .countdown-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .countdown-label {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          transition: color 0.3s;
        }
      `}</style>
    </div>
  );
}
