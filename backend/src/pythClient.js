import axios from 'axios';

export const PRICE_FEEDS = {
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};

export const FEED_NAMES = Object.keys(PRICE_FEEDS);

const HERMES_URL = process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network';

// Price history (last 200 points per feed)
const priceHistory = {};
for (const name of FEED_NAMES) priceHistory[name] = [];

// Latest prices — persists between fetch failures so game never crashes
let latestPrices = {};
let lastSuccessfulFetch = 0;
let consecutiveFailures = 0;

export function formatPrice(price, expo) {
  return price * Math.pow(10, expo);
}

// Fetch with retry — tries up to 3 times with 1s delay between attempts
async function fetchWithRetry(url, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { timeout: 8000 });
      return res;
    } catch (err) {
      const isLast = attempt === retries;
      if (!isLast) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
}

export async function fetchLatestPrices() {
  try {
    const ids = Object.values(PRICE_FEEDS);
    const params = ids.map(id => `ids[]=${id}`).join('&');
    const res = await fetchWithRetry(
      `${HERMES_URL}/v2/updates/price/latest?${params}&encoding=hex`
    );

    const parsed = res.data.parsed;
    const now = Date.now();
    consecutiveFailures = 0;
    lastSuccessfulFetch = now;

    for (const item of parsed) {
      const name = Object.entries(PRICE_FEEDS).find(([, id]) => id === `0x${item.id}`)?.[0];
      if (!name) continue;

      const price = formatPrice(Number(item.price.price), item.price.expo);
      const conf  = formatPrice(Number(item.price.conf),  item.price.expo);
      const confBps = (conf / price) * 10000;

      latestPrices[name] = {
        name, feedId: `0x${item.id}`,
        price, conf, confBps,
        expo: item.price.expo,
        publishTime: item.price.publish_time,
        fetchedAt: now,
        stale: false,
      };

      priceHistory[name].push({ t: now, price, conf, confBps });
      if (priceHistory[name].length > 200) priceHistory[name].shift();
    }

    return latestPrices;
  } catch (err) {
    consecutiveFailures++;
    const staleAge = Date.now() - lastSuccessfulFetch;

    // Mark prices as stale but keep returning them so the game doesn't crash
    for (const name of FEED_NAMES) {
      if (latestPrices[name]) latestPrices[name].stale = true;
    }

    // Only log every 5th failure to avoid log spam
    if (consecutiveFailures % 5 === 1) {
      console.warn(`[Pyth] Fetch failed (${consecutiveFailures} in a row, last good: ${Math.round(staleAge/1000)}s ago): ${err.message}`);
    }

    return latestPrices; // return cached — game continues with last known prices
  }
}

export function getLatestPrices() {
  return latestPrices;
}

export function getPriceHistory(feedName) {
  return priceHistory[feedName] || [];
}

export function getAllPriceHistory() {
  return priceHistory;
}

export function isPriceStale() {
  return consecutiveFailures > 0;
}

export function getLastFetchAge() {
  return lastSuccessfulFetch ? Date.now() - lastSuccessfulFetch : Infinity;
}

// Settlement price — uses cached price if live fetch fails, never throws
export async function fetchSettlementPrice(feedName) {
  try {
    await fetchLatestPrices();
  } catch {
    // fetchLatestPrices already handles errors — this is just extra safety
  }

  const data = latestPrices[feedName];
  if (!data) {
    // Return a dummy price so game can continue — result will be a tie
    console.warn(`[Pyth] No price data for ${feedName} — returning zero (tie result)`);
    return { price: 0, conf: 0, confBps: 0, ciMultiplier: 1.0, name: feedName, stale: true };
  }

  let ciMultiplier = 1.0;
  if (data.confBps >= 50)      ciMultiplier = 1.5;
  else if (data.confBps >= 25) ciMultiplier = 1.25;
  else if (data.confBps >= 10) ciMultiplier = 1.1;

  return { ...data, ciMultiplier };
}

export function getBlindChartWindow(feedName) {
  const history = priceHistory[feedName];
  if (!history || history.length < 10) return null;

  const maxStart = history.length - 5;
  const start = Math.floor(Math.random() * maxStart);
  const slice = history.slice(start, start + Math.min(30, history.length - start));
  const base = slice[0].t;

  return slice.map((p, i) => ({ t: i, price: p.price, conf: p.conf }));
}
