# NeonArc Games

Welcome to **NeonArc Games**, a neon-drenched gaming hub where pilots chase clever skill loops, strategic card matches, and community rewards. Every title shares one universal balance, one aesthetic, and one ledger of **credits** — no real-money wagers, just immersive challenges and collectible flair.

---

## Overview

NeonArc Games serves as a modular arena for a variety of original titles. Each mode plugs into a shared lobby, balance system, and reward fabric.

| Category | Games | Description |
|-----------|--------|-------------|
| **Skill Games** | Rocket Line · Pulse Cash · Mind Bet · StackJack | Fast decision loops that pressure timing, risk, and momentum. |
| **Card Games** | Binary Poker · Echo Hand · Fuse · Perception | Strategic, rhythm-based matches built for intuition and experimentation. |

---

## Signature Features

- **Unified Credit Wallet** — One balance of glowing credits powers every game, challenges, and cosmetic unlocks.
- **Daily Prizes** — Spin the NeonArc prize wheel (and track your winnings) once every 24 hours for extra credits and surprise boosts.
- **Challenges** — Complete curated challenges for bonus credits, leaderboard status, and status badges.
- **Avatar Marketplace** — Purchase animated avatars, themes, and badges inside the Shop to express your pilot persona.
- **Live Neon Visuals** — Neon gradients, animated halos, and ambient synth pulses wrap every interaction.
- **Expandable Architecture** — New games, daily events, or cosmetic drops plug right into the existing lobby + account system.

---

## Current Games

### Skill Games
| Game | Summary |
|------|----------|
| **Rocket Line** | Classic crash-style ascent — cash out before the line breaks apart. |
| **Pulse Cash** | Ride a charged rhythm and cash out when the waveform peaks. |
| **Mind Bet** | Predict the rogue AI’s shifts and profit from its changing mood. |
| **StackJack** | Stack cards toward 21 without toppling your tower or your nerves. |

### Card Games
| Game | Summary |
|------|----------|
| **Binary Poker** | Align your 4-bit cards with the secret target number. |
| **Echo Hand** | Chain cards while managing echo events and instability. |
| **Fuse** | Merge hands for hybrid values while taming escalating instability. |
| **Perception** | Investigate your opponent’s intent and call the right moment. |

---

## Architecture

| Path | Description |
|------|--------------|
| **index.js** | Express server entry point — renders every view and mounts the feature routes. |
| **/views/** | EJS templates for the lobby, home page, account shell, and individual games. |
| **/routes/** | API handlers for account, profile, vault, shop, campaigns, and daily wheel flows. |
| **/utils/** | Shared helpers for sessions, database access, and email campaigns. |
| **/data/** | Seed/mock data for development. |

Shared helpers include:
- `applyAccountData(payload)`
- `updateBalance(sync)`
- `persistBalanceDelta({ cashDelta, creditDelta })`
- `renderLeaderboardTable(entries)`

---

## How to Run

1. Clone or unzip the repo.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and configure database/email credentials as needed.
4. Run `npm start` and open `http://localhost:3000`.
5. Log in, spin the daily wheel, complete challenges, and browse the avatar shop to spend credits.

---

## Developer Notes

- Every game writes to the shared account DOM nodes, so keep UI ids consistent before adding new logic.
- The **Daily Wheel** route (`/api/daily-wheel`) already tracks spins and rewards, making it easy to extend to other prize drops.
- Challenges are currently driven by client-side logic, so they can be expanded with backend data or global timers.
- Shop purchases reduce credit balances through `/api/shop/purchase`, which validates inventory items defined in `routes/shop.js`.

---

## Roadmap

- Add vault leaderboards and premium hubs.
- Introduce animated ambient soundtracks that sync with each game.
- Expand the avatar shop with seasonal gear and badges.
- Launch an experimental “Archive Mode” for lightning prototypes.

---

## Disclaimer

This project is for educational and entertainment use. NeonArc Games does not handle real currency nor promote gambling with actual money.

---

## Author

**Jon** — Creator, NeonArc Games architect, synth artist, and pilot.
