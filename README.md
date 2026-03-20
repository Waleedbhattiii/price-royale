# ⚡ Price Royale

> Pyth-powered multiplayer price prediction game. Built for the Pyth Playground Hackathon.

---

## What is it?

Price Royale is a free-to-play, real-time multiplayer game where players predict whether crypto asset prices will go UP or DOWN. Powered by Pyth Network live price feeds. Points are awarded based on accuracy, speed, and Pyth confidence interval bonuses.

**2 to 500 players per room. No wallet required.**

---

## Game Modes

- **Quick Royale** — Join a public room instantly
- **Community Room** — Create a private room, share a code for Discord events
- **Custom settings** — 1–10 rounds, 15/30/60/90s duration, ETH/BTC/SOL or random asset

## Scoring

| Bonus | Points |
|---|---|
| Correct prediction | +100 base |
| Speed bonus | +10 to +50 (faster = more) |
| Streak bonus | +20 per consecutive correct |
| Pyth CI bonus | 1.0× to 1.5× multiplier (wide CI = harder = more pts) |
| High Stakes mode | All of the above × 2 |

---

## Stack

- **Backend:** Node.js + Express + Socket.io
- **Oracle:** Pyth Hermes REST API (real-time price + confidence interval)
- **Frontend:** Vite + React
- **Auth:** Username/password (bcrypt + JWT) + Discord OAuth
- **Realtime:** Socket.io (supports 500 concurrent players)
- **Charts:** TradingView Lightweight Charts

---

## Project Structure

```
price-royale/
├── backend/
│   └── src/
│       ├── index.js          — Express server + all REST routes
│       ├── pythClient.js     — Pyth Hermes integration, CI multiplier
│       ├── authService.js    — Auth, badges, rank system, leaderboard
│       ├── roomEngine.js     — Room/game state, scoring engine
│       └── socketServer.js   — Socket.io game loop
└── frontend/
    └── src/
        ├── App.jsx           — Root layout + routing
        ├── App.css           — Dark cyber-trading design system
        ├── lib/client.js     — Axios + Socket.io client
        ├── hooks/
        │   ├── useAuth.jsx   — Auth context
        │   └── useGame.js    — All socket game events
        ├── pages/
        │   ├── AuthPage.jsx      — Login / Register / Guest / Discord
        │   ├── LobbyPage.jsx     — Room list, create/join
        │   ├── GamePage.jsx      — Main game arena
        │   └── LeaderboardPage.jsx
        └── components/
            ├── CountdownTimer.jsx — Animated circular timer
            ├── RoundResult.jsx    — Post-round outcome display
            ├── Scoreboard.jsx     — Live rankings sidebar
            ├── EventFeed.jsx      — Live game event log
            └── PriceChart.jsx     — TradingView chart with live Pyth data
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env .env.local  # fill in your values
npm run dev
```

**Required `.env` values:**
```
JWT_SECRET=your_secret_here
DISCORD_CLIENT_ID=     # optional, for Discord OAuth
DISCORD_CLIENT_SECRET= # optional
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback
FRONTEND_URL=http://localhost:5173
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Discord OAuth Setup (optional)

1. Go to https://discord.com/developers/applications
2. Create new application → OAuth2
3. Add redirect: `http://localhost:3001/auth/discord/callback`
4. Copy Client ID + Secret to backend `.env`

---

## Anti-Cheat Design

| Threat | Mitigation |
|---|---|
| Last-second direction switch | Commit is final, server-enforced |
| Sybil (multi-account) | Free to play — no financial exploit possible |
| Seeing others' picks | Only commit *count* broadcast during round, not directions |
| Chart pattern recognition | Timestamps stripped from historical chart windows |
| No-commit griefing | Server auto-penalizes uncommitted players (streak reset, 0 pts) |

---

## Pyth Integration

- **Price feeds:** ETH/USD, BTC/USD, SOL/USD via Hermes REST
- **Confidence Interval (CI)** drives point multipliers:
  - CI < 10bps → 1.0× (stable market)
  - CI 10–25bps → 1.1× bonus
  - CI 25–50bps → 1.25× bonus
  - CI 50bps+ → 1.5× bonus (volatile market = bigger reward)
- Prices polled every 3 seconds, pushed via Socket.io to all connected clients

---

## Rank System

| Title | Points |
|---|---|
| Rookie Trader | 0–999 |
| Chartist | 1,000–4,999 |
| Oracle Reader | 5,000–14,999 |
| Price Prophet | 15,000+ |

---

## Step 3 — New in this version

### Toast Notifications (`useToast.jsx`)
Pop-up alerts that appear top-right for:
- Player joins/leaves
- Prediction locked in
- Points earned (with glow effect)
- Streak milestone
- Game start/end

### Share Modal (`ShareModal.jsx`)
Accessible from the **🔗 Share** button in game lobby:
- Big readable 6-letter room code
- Copy direct link (`?room=XXXXXX` URL)
- **Copy Discord Message** — pre-formatted message with room details ready to paste in Discord

### URL Room Params (`useRoomFromUrl.js`)
Visiting `http://localhost:5173?room=ABC123` automatically joins that room after login.
Perfect for Discord event links.

### Profile Page (`ProfilePage.jsx`)
Accessible from the **Profile** nav tab or clicking your username:
- Avatar + display name + Discord link indicator
- Rank progress bar (Rookie → Chartist → Oracle Reader → Price Prophet)
- Stats grid: points, games played, win rate, accuracy, best streak
- Badges earned
- Last 50 games history table

### Auto stats refresh
After each game finishes, player stats are automatically refreshed from the server so Profile always shows current numbers.
# price-royale
# price-royale
