# 🎰 NeonArc Casino

Welcome to **NeonArc Casino** — a futuristic, skill-based web casino built entirely with **HTML**, **CSS**, and **JavaScript**.  
Each game is an original creation that blends strategy, timing, and risk into fast-paced arcade tension.  

All games share a single glowing universe — one balance, one aesthetic, endless adrenaline.

---

## 🏗️ Overview

NeonArc Casino is designed as a modular environment that hosts multiple original games:

| Category | Games | Description |
|-----------|--------|-------------|
| 💥 **Skill Games** | Rocket · Pulse Cash · Mind Bet · StackJack | Real-time timing & crash games that test nerves and strategy. |
| 🃏 **Card Games** | Binary Poker *(and more coming)* | Strategic, logic-driven games where every card can turn your fate. |

Each game runs inside its own `<div>` container with a unified balance system and theme.

---

## 🌌 Features

- 🧩 **Multiple Game Modes** – Switch between skill and card-based games instantly.  
- 💰 **Global Wallet System** – One balance shared across all games.  
- ⚡ **Pure HTML/CSS/JS** – No frameworks or dependencies.  
- 🎨 **Neon-Cyber Visuals** – Smooth glowing animations and dynamic transitions.  
- 🧠 **Original Gameplay Concepts** – 100% invented mechanics, not remakes of existing casino titles.  
- 🧾 **In-Game Instructions** – Built-in help panels for each mode.  
- 🕹️ **Expandable Architecture** – Easily add new games using consistent structure and shared functions.

---

## 🕹️ Current Games

### 💥 Skill Games
| Game | Summary |
|------|----------|
| **Rocket** | Classic crash-style rocket launch — cash out before it explodes. |
| **Pulse Cash** | Rising energy waveform — overload risk grows with multiplier. |
| **Mind Bet** | Guess when a rogue AI will “change its mind” — moods are fake, odds are real. |

### 🃏 Card Games
| Game | Summary |
|------|----------|
| **Binary Poker** | Match your 4-bit binary cards to a secret target number. Flip bits wisely! |
| *(More Coming Soon)* | StackJack, Echo Hand, Fuse, Perception, and more will join the Card Games section. |

---

## 🧱 Architecture

| Path | Description |
|------|--------------|
| **index.html** | Main entry point — includes all game modes and layout. |
| **/css/** | Contains all shared and game-specific stylesheets. |
| **/js/** | Holds core scripts and modular game logic files. |
| **/assets/** | Optional folder for icons, glow effects, and sounds. |
| **README.md** | Documentation for developers and contributors. |

**Main Shared Functions:**
- `updateBalance(amount)`
- `switchMode(modeName)`
- `resetRound()`
- `toggleInstructions()`

**Each Game Adds:**
- A container `<div id="gameName">`  
- Its own start, play, and result functions  
- Optional special buttons or animations  

---

## 🧭 How to Run

1. Download or clone the repository.  
2. Open `index.html` in your browser — no build step required.  
3. Play any game using the mode selector at the top.  
4. Watch your balance rise (or fall 👀).  

---

## 🧠 Developer Notes

All games share **one global JavaScript environment**, making it simple to add, remove, or modify game logic.

Each game follows a consistent lifecycle pattern:

    startGame();
    playTurn();
    endRound();
    updateBalance();

### 🎨 UI Design

- **Reusable Components:** Neon buttons, toggles, sliders, and balance displays.  
- **Consistent Aesthetic:** Every game inherits the shared dark-neon theme.  
- **Lightweight Animations:** All transitions and effects use pure CSS (`transform`, `transition`, `keyframes`) — no heavy libraries.  

---

## 💡 Future Roadmap

- 🃏 Add more **Card Games** (Echo Hand, Fuse, Perception)  
- 🪙 Add **Vault & Leaderboard** sections  
- 🧭 Build **Animated Lobby Hub** for selecting games  
- 🎵 Include **Selectable Ambient Soundtracks**  
- 🧬 Create **“Archive Mode”** for experimental prototype games  

---

## ⚠️ Disclaimer

This project is for **educational and entertainment purposes only.**  
NeonArc Casino **does not** handle real currency, nor does it promote gambling of any kind.  

---

## 👨‍💻 Author

**Jon**  
💻 Developer • Inventor • Tech Artist  
Creator of the **NeonArc Universe & Casino** ✨
