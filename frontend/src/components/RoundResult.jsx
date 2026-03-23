export default function RoundResult({ result, myUserId, myCommit, myEntryPrice }) {
  if (!result) return null;

  const { correctDirection, exitPrice, ciMultiplier, results, asset, entryPrice: roundEntryPrice } = result;

  // Find this player's result
  const myResult = results?.find(r => r.userId === myUserId);

  // Use personal entry price — this is what the player was judged against on the server
  // Falls back to round entry price only if personal not available
  const myPersonalEntry = myEntryPrice || myResult?.personalEntryPrice || roundEntryPrice || 0;

  // Determine personal direction from personal entry price vs exit price
  // This matches exactly what the server does in settleQRRound / settleRound
  let myPersonalDirection = null;
  if (exitPrice > myPersonalEntry) myPersonalDirection = 'UP';
  else if (exitPrice < myPersonalEntry) myPersonalDirection = 'DOWN';

  // correct = player's pick matches personal direction (not round direction)
  const correct = myResult?.correct;
  const pointsEarned = myResult?.pointsEarned || 0;
  const isTie = !myPersonalDirection && !!myCommit; // price didn't move from personal entry

  // Price movement display — always show from personal entry if available
  const displayEntry = myPersonalEntry || roundEntryPrice || 0;
  const priceChange = displayEntry > 0
    ? ((exitPrice - displayEntry) / displayEntry * 100)
    : 0;
  const priceUp = exitPrice >= displayEntry;

  return (
    <div className={`round-result animate-fade ${isTie ? 'tie' : correct ? 'win' : 'loss'}`}>

      {/* Outcome */}
      <div className="result-outcome">
        {isTie ? (
          <>
            <div className="outcome-icon">🤝</div>
            <div className="outcome-label tie-label">TIE</div>
            <div className="outcome-sub">Price didn't move from your entry</div>
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
                ? `You picked ${myCommit}, price went ${myPersonalDirection || correctDirection || '—'} from your entry`
                : 'You did not commit this round'}
            </div>
          </>
        )}
      </div>

      {/* Price movement — from personal entry to exit */}
      <div className="price-movement">
        <div className="price-col">
          <div className="price-label">YOUR ENTRY</div>
          <div className="price-val mono">
            ${displayEntry?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
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

      {/* Round direction note — shows where round started vs ended */}
      {myPersonalEntry !== roundEntryPrice && roundEntryPrice > 0 && (
        <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center' }}>
          Round started @ ${roundEntryPrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          · Round went {correctDirection || 'TIE'}
        </div>
      )}

      {/* Bonuses */}
      {!isTie && correct && myResult && (
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
        .round-result { border-radius: var(--radius-lg); border: 1px solid var(--border); padding: 28px 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; backdrop-filter: blur(8px); }
        .round-result.win { background: rgba(5,150,105,0.06); border-color: rgba(5,150,105,0.3); box-shadow: 0 0 40px rgba(5,150,105,0.1); }
        .round-result.loss { background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.3); box-shadow: 0 0 40px rgba(220,38,38,0.1); }
        .round-result.tie { background: rgba(209,154,102,0.05); border-color: rgba(209,154,102,0.2); }
        .result-outcome { text-align: center; }
        .outcome-icon { font-size: 40px; margin-bottom: 4px; }
        .outcome-label { font-family: var(--font-display); font-size: 36px; font-weight: 700; letter-spacing: 4px; }
        .win-label { color: var(--green); text-shadow: 0 0 20px rgba(5,150,105,0.4); }
        .loss-label { color: var(--red); text-shadow: 0 0 20px rgba(220,38,38,0.4); }
        .tie-label { color: var(--gold); }
        .outcome-pts { font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--purple); margin-top: 4px; }
        .outcome-sub { font-size: 13px; color: var(--tx2); margin-top: 6px; }
        .price-movement { display: flex; align-items: center; gap: 24px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 28px; }
        .price-col { text-align: center; }
        .price-label { font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--tx3); margin-bottom: 4px; }
        .price-val { font-size: 18px; font-weight: 700; color: var(--tx1); }
        .price-arrow { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .arrow-icon { font-size: 24px; }
        .arrow-icon.up { color: var(--green); }
        .arrow-icon.down { color: var(--red); }
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
