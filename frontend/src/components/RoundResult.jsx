export default function RoundResult({ result, myUserId, myCommit, myEntryPrice }) {
  if (!result) return null;

  const { correctDirection, exitPrice, ciMultiplier, results, asset } = result;

  // Find this player's result from the results array
  const myResult = results?.find(r => r.userId === myUserId);

  // Use personal entry price (price at commit time) if available
  const entryPrice = myEntryPrice || myResult?.personalEntryPrice || result.entryPrice || 0;

  const correct = myResult?.correct;
  const pointsEarned = myResult?.pointsEarned || 0;
  const isTie = !correctDirection;

  const priceChange = entryPrice > 0
    ? ((exitPrice - entryPrice) / entryPrice * 100)
    : 0;
  const priceUp = exitPrice >= entryPrice;

  return (
    <div className={`round-result animate-fade ${isTie ? 'tie' : correct ? 'win' : 'loss'}`}>

      {/* Outcome */}
      <div className="result-outcome">
        {isTie ? (
          <>
            <div className="outcome-icon">🤝</div>
            <div className="outcome-label tie-label">TIE</div>
            <div className="outcome-sub">No price movement — round voided</div>
          </>
        ) : correct ? (
          <>
            <div className="outcome-icon">✅</div>
            <div className="outcome-label win-label">CORRECT!</div>
            <div className="outcome-pts">+{pointsEarned.toLocaleString()} pts</div>
          </>
        ) : (
          <>
            <div className="outcome-icon">❌</div>
            <div className="outcome-label loss-label">WRONG</div>
            <div className="outcome-sub">
              {myCommit
                ? `You picked ${myCommit}, price went ${correctDirection || '—'}`
                : 'You did not commit this round'}
            </div>
          </>
        )}
      </div>

      {/* Price movement */}
      <div className="price-movement">
        <div className="price-col">
          <div className="price-label">ENTRY</div>
          <div className="price-val mono">
            ${entryPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
        <div className="price-arrow">
          <div className={`arrow-icon ${priceUp ? 'up' : 'down'}`}>{priceUp ? '▲' : '▼'}</div>
          <div className={`price-change mono ${priceUp ? 'text-green' : 'text-red'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(4)}%
          </div>
        </div>
        <div className="price-col">
          <div className="price-label">EXIT</div>
          <div className={`price-val mono ${priceUp ? 'text-green' : 'text-red'}`}>
            ${exitPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
      </div>

      {/* Bonuses */}
      {!isTie && myResult && (
        <div className="bonus-row">
          {ciMultiplier > 1 && (
            <div className="bonus-chip">
              <span className="bonus-label">⚡ CI Bonus</span>
              <span className="bonus-val text-cyan">{ciMultiplier}×</span>
            </div>
          )}
          {myResult.speedBonus > 0 && (
            <div className="bonus-chip">
              <span className="bonus-label">⚡ Speed</span>
              <span className="bonus-val text-amber">+{myResult.speedBonus}</span>
            </div>
          )}
          {myResult.streakBonus > 0 && (
            <div className="bonus-chip">
              <span className="bonus-label">🔥 Streak</span>
              <span className="bonus-val text-purple">+{myResult.streakBonus}</span>
            </div>
          )}
        </div>
      )}

      {/* Round summary */}
      {results && (
        <div className="result-counts">
          <span className="text-green">✓ {results.filter(r => r.correct).length} correct</span>
          <span className="text-dim">·</span>
          <span className="text-red">✗ {results.filter(r => !r.correct).length} wrong</span>
        </div>
      )}

      <style>{`
        .round-result {
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          padding: 28px 24px;
          display: flex; flex-direction: column; align-items: center; gap: 20px;
          backdrop-filter: blur(8px);
        }
        .round-result.win { background: rgba(52,211,153,0.06); border-color: rgba(52,211,153,0.3); box-shadow: 0 0 40px rgba(52,211,153,0.1); }
        .round-result.loss { background: rgba(248,113,113,0.06); border-color: rgba(248,113,113,0.3); box-shadow: 0 0 40px rgba(248,113,113,0.1); }
        .round-result.tie { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.2); }

        .result-outcome { text-align: center; }
        .outcome-icon { font-size: 40px; margin-bottom: 4px; }
        .outcome-label { font-family: var(--font-display); font-size: 36px; font-weight: 700; letter-spacing: 4px; }
        .win-label { color: var(--green); text-shadow: 0 0 20px rgba(52,211,153,0.5); }
        .loss-label { color: var(--red); text-shadow: 0 0 20px rgba(248,113,113,0.5); }
        .tie-label { color: var(--amber); }
        .outcome-pts { font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--cyan); margin-top: 4px; }
        .outcome-sub { font-size: 13px; color: var(--tx2); margin-top: 6px; }

        .price-movement { display: flex; align-items: center; gap: 24px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 28px; }
        .price-col { text-align: center; }
        .price-label { font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--tx3); margin-bottom: 4px; }
        .price-val { font-size: 18px; font-weight: 700; color: var(--tx1); }
        .price-arrow { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .arrow-icon { font-size: 24px; }
        .arrow-icon.up { color: var(--green); text-shadow: 0 0 10px rgba(52,211,153,0.6); }
        .arrow-icon.down { color: var(--red); text-shadow: 0 0 10px rgba(248,113,113,0.6); }
        .price-change { font-size: 14px; font-weight: 700; }

        .bonus-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .bonus-chip { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 12px; }
        .bonus-label { color: var(--tx3); }
        .bonus-val { font-family: var(--font-mono); font-weight: 700; font-size: 13px; }

        .result-counts { display: flex; align-items: center; gap: 8px; font-size: 13px; font-family: var(--font-mono); }
      `}</style>
    </div>
  );
}
