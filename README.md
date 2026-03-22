# ⚡ Price Royale

> Free-to-play multiplayer crypto price prediction game — powered by Pyth Network live oracle feeds.

**Live Demo:** https://price-royale.vercel.app

---

## What is it?

Price Royale is a real-time PvP game where 2–500 players compete to predict whether ETH, BTC, or SOL will go UP or DOWN. Pyth Network oracle price feeds settle every round. No wallet required — purely points-based.

Your entry price is recorded at the **exact moment you commit** — not the round start — so timing your prediction matters.

---

## Game Modes

| Mode | Description |
|---|---|
| **Custom Rooms** | Host creates a room with 1–10 rounds, 15–90s duration, custom asset/points settings. Share via 6-letter code or URL. |
| **Quick Royale** | Always-on public room. Auto-starts when 2+ players join. 5 rounds, 60s each. Resets automatically. |
| **Tournament** | Bracket-style single elimination. 4 preset rooms: Duel Arena (4p), Crypto Clash (8p), Oracle League (16p), Price Royale Pro (32p). Auto-starts when full. |

---

## Scoring

| Bonus | Points |
|---|---|
| Correct prediction | +100 base |
| Speed bonus | +10 to +50 (faster commit = more) |
| Streak bonus | +20 per consecutive correct (max ×5) |
| Pyth CI multiplier | ×1.0 to ×1.5 (wider confidence interval = higher reward) |
| High Stakes mode | All points ×2 |
| Tournament win | +500 pts |

### Pyth Confidence Interval Multiplier

Every Pyth price comes with a confidence interval. Wider CI = more uncertain market = harder to predict = bigger reward:

| CI (basis points) | Multiplier |
|---|---|
| < 10 bps | 1.0× (stable) |
| 10–25 bps | 1.1× |
| 25–50 bps | 1.25× |
| 50+ bps | 1.5× (volatile) |

---

## Rank Progression

| Title | Points Required |
|---|---|
| Rookie Trader | 0–999 |
| Chartist | 1,000–4,999 |
| Oracle Reader | 5,000–14,999 |
| Price Prophet | 15,000+ |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 (Vite), Socket.io-client, Axios |
| Backend | Node.js, Express, Socket.io |
| Oracle | Pyth Network Hermes REST API |
| Charts | TradingView Lightweight Charts |
| Database | MongoDB Atlas (persistent leaderboard + stats) |
| Auth | JWT (bcrypt) + Discord OAuth2 |
| Deployment | Railway (backend), Vercel (frontend) |
| Styling | Custom CSS — Pyth brand colors (lavender/purple palette) |

---

## Pyth Integration Details

- **Feeds:** ETH/USD, BTC/USD, SOL/USD via `hermes.pyth.network/v2/updates/price/latest`
- **Feed IDs:**
  - ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
  - BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
  - SOL/USD: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
- Prices polled every 3 seconds, broadcast to all players via Socket.io
- Personal entry price snapped from live Pyth feed at exact commit moment
- DNS retry with graceful fallback — games continue on brief Pyth outages

---

## Project Structure

```
price-royale/
├── backend/
│   └── src/
│       ├── index.js           — Express server + REST routes
│       ├── db.js              — MongoDB Atlas connection
│       ├── pythClient.js      — Pyth Hermes integration + CI multiplier
│       ├── authService.js     — Auth, ranks, badges, leaderboard, stats
│       ├── roomEngine.js      — Custom room state + scoring engine
│       ├── socketServer.js    — Socket.io game loop
│       ├── quickRoyale.js     — Quick Royale singleton game mode
│       └── tournamentEngine.js — Bracket elimination engine
└── frontend/
    └── src/
        ├── App.jsx
        ├── App.css            — Pyth brand theme (lavender/purple)
        ├── lib/client.js      — Axios + Socket.io singleton
        ├── hooks/
        │   ├── useAuth.jsx    — Auth context + Discord OAuth handler
        │   ├── useGame.js     — All socket game events
        │   └── useToast.jsx   — Toast notification system
        ├── pages/
        │   ├── AuthPage.jsx
        │   ├── LobbyPage.jsx
        │   ├── GamePage.jsx
        │   ├── QuickRoyalePage.jsx
        │   ├── TournamentPage.jsx
        │   ├── LeaderboardPage.jsx
        │   └── ProfilePage.jsx
        └── components/
            ├── PriceChart.jsx      — Live TradingView chart (Pyth data)
            ├── RoundResult.jsx     — Post-round outcome + bonuses
            ├── CountdownTimer.jsx  — Animated SVG circular timer
            ├── Scoreboard.jsx      — Live rankings sidebar
            ├── EventFeed.jsx       — Live game event log
            ├── ShareModal.jsx      — Room sharing (code, URL, Discord)
            └── ConnectionStatus.jsx — Socket/Pyth health indicator
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)

### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:
```
PORT=3001
JWT_SECRET=any_long_random_string
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/price-royale
FRONTEND_URL=http://localhost:5173
PYTH_HERMES_URL=https://hermes.pyth.network

# Optional — Discord OAuth
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback
```

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Discord OAuth Setup (optional)

1. Go to https://discord.com/developers/applications → Create application
2. OAuth2 → Add redirect: `http://localhost:3001/auth/discord/callback`
3. Copy Client ID + Secret to `backend/.env`

For production add: `https://your-backend.railway.app/auth/discord/callback`

---

## Anti-Cheat Design

| Threat | Mitigation |
|---|---|
| Changing prediction after commit | Commit is final and server-enforced |
| Seeing other players' picks | Only commit *count* is broadcast, never directions |
| Network-timing exploits | Entry price snapped server-side at socket event receipt |
| Multi-account abuse | Free to play — no financial incentive |

---

## License

Apache 2.0 — see [LICENSE](./LICENSE)

---

Built for the **Pyth Playground Hackathon** · March 2026
