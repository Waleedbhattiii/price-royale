import { useEffect, useRef, useState } from 'react';
import { pricesApi } from '../lib/client.js';

export default function PriceChart({ asset, entryPrice, personalEntryPrice, showEntryLine }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const entryLineRef = useRef(null);
  const intervalRef = useRef(null);
  const roRef = useRef(null);
  const [currentPrice, setCurrentPrice] = useState(entryPrice || 0);
  const [priceChange, setPriceChange] = useState(0);

  // Build chart once on mount — properly clean up on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    let chart = null;
    let series = null;
    let destroyed = false;

    import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode }) => {
      if (destroyed || !containerRef.current) return;

      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 200,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#475569',
        },
        grid: {
          vertLines: { color: 'rgba(56,189,248,0.06)' },
          horzLines: { color: 'rgba(56,189,248,0.06)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(56,189,248,0.15)', textColor: '#94A3B8' },
        timeScale: { borderColor: 'rgba(56,189,248,0.15)', textColor: '#94A3B8', timeVisible: true },
        handleScroll: false,
        handleScale: false,
      });

      series = chart.addAreaSeries({
        lineColor: '#38BDF8',
        topColor: 'rgba(56,189,248,0.2)',
        bottomColor: 'rgba(56,189,248,0.0)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      chartRef.current = chart;
      seriesRef.current = series;

      // ResizeObserver
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (!destroyed && chartRef.current) {
            chartRef.current.applyOptions({ width: entry.contentRect.width });
          }
        }
      });
      ro.observe(containerRef.current);
      roRef.current = ro;

      // Load history
      pricesApi.history(asset).then(history => {
        if (!history?.length || destroyed || !seriesRef.current) return;
        const seen = new Set();
        const data = history
          .map(p => ({ time: Math.floor(p.t / 1000), value: p.price }))
          .filter(d => { if (seen.has(d.time)) return false; seen.add(d.time); return true; })
          .sort((a, b) => a.time - b.time);
        if (data.length && seriesRef.current) {
          seriesRef.current.setData(data);
          chartRef.current?.timeScale().fitContent();
        }
      }).catch(() => {});
    });

    // Cleanup — this IS the useEffect return, properly called by React on unmount
    return () => {
      destroyed = true;
      clearInterval(intervalRef.current);
      intervalRef.current = null;

      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }

      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
        seriesRef.current = null;
        entryLineRef.current = null;
      }
    };
  }, []); // mount/unmount only — key prop forces remount per round

  // Show/update personal entry line after commit
  useEffect(() => {
    if (!seriesRef.current) return;

    if (showEntryLine && personalEntryPrice) {
      if (entryLineRef.current) {
        try { seriesRef.current.removePriceLine(entryLineRef.current); } catch {}
        entryLineRef.current = null;
      }
      try {
        entryLineRef.current = seriesRef.current.createPriceLine({
          price: personalEntryPrice,
          color: 'rgba(251,191,36,0.8)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Your Entry',
        });
      } catch {}
    } else if (!showEntryLine && entryLineRef.current) {
      try { seriesRef.current.removePriceLine(entryLineRef.current); } catch {}
      entryLineRef.current = null;
    }
  }, [showEntryLine, personalEntryPrice]);

  // Poll live price
  useEffect(() => {
    async function tick() {
      try {
        const prices = await pricesApi.latest();
        const p = prices[asset];
        if (!p || !seriesRef.current) return;

        const time = Math.floor(Date.now() / 1000);
        try { seriesRef.current.update({ time, value: p.price }); } catch {}
        setCurrentPrice(p.price);

        const base = personalEntryPrice || entryPrice;
        if (base) setPriceChange(((p.price - base) / base) * 100);

        if (chartRef.current) {
          try { chartRef.current.timeScale().scrollToRealTime(); } catch {}
        }
      } catch {}
    }

    tick();
    intervalRef.current = setInterval(tick, 3000);
    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [asset, personalEntryPrice, entryPrice]);

  const isUp = priceChange >= 0;
  const hasBase = !!(personalEntryPrice || entryPrice);

  return (
    <div className="price-chart card">
      <div className="chart-top">
        <span className="chart-asset">{asset}</span>
        <span className="chart-price mono">
          ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </span>
        {showEntryLine && hasBase && (
          <span className={`chart-change mono ${isUp ? 'text-green' : 'text-red'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(4)}%
          </span>
        )}
        {!showEntryLine && (
          <span className="chart-no-entry text-dim">Entry shown after you commit</span>
        )}
        <span className="chart-live">
          <span className="live-dot" />
          LIVE
        </span>
      </div>
      <div ref={containerRef} className="chart-container" />

      <style>{`
        .price-chart { padding: 14px; }
        .chart-top { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .chart-asset { font-family: var(--font-display); font-size: 14px; font-weight: 700; letter-spacing: 1px; color: var(--tx2); }
        .chart-price { font-size: 18px; font-weight: 700; color: var(--tx1); }
        .chart-change { font-size: 14px; font-weight: 700; }
        .chart-no-entry { font-size: 11px; font-style: italic; }
        .chart-live { margin-left: auto; display: flex; align-items: center; gap: 5px; font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--green); }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: blink 1.5s ease-in-out infinite; }
        .chart-container { width: 100%; }
      `}</style>
    </div>
  );
}
