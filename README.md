# Poker Modern

A time-complexity optimal, multiplayer Poker game transition from C++ to a modern stack:
- **Backend**: Python (FastAPI + Socket.io) with custom game engine.
- **AI**: Monte Carlo simulation-based logic (default: 2000 simulations per move).
- **Frontend**: Next.js with a premium, aesthetic emerald felt UI and Framer Motion.

## 🧠 Algorithms (code redirects)

- **5-card hand evaluator**: `backend/poker_logic.py` → `evaluate_5_card_hand`
- **Best hand from 7 cards (Texas Hold’em)**: `backend/poker_logic.py` → `get_best_hand` (checks all 5-card combinations)
- **Monte Carlo equity estimation**: `backend/poker_logic.py` → `run_monte_carlo`
- **Draw detection (flush / OESD / gutshot)**: `backend/poker_logic.py` → `detect_draws`
- **Opponent modelling (VPIP / PFR)**:
  - Stats tracked in `backend/main.py` (pre-flop VPIP/PFR updates)
  - Used in `backend/poker_logic.py` → `OpponentModel` + `PokerAI.decide_action(... opponent_model=...)`
- **Betting / turn-order game loop**: `backend/main.py` → `game_loop`, `betting_round`, `apply_action`
- **Legacy reference implementation**: `server.cpp` (original C++ engine/AI)

## ⏱️ A priori time complexity (by component)

- **5-card evaluation** (`evaluate_5_card_hand`)
  - **Time:** `O(1)`
  - **Notes:** Fixed work on 5 cards (rank/suit counts + straight/flush checks).

- **Best hand from 7 cards** (`get_best_hand`)
  - **Time:** `O(C(7,5)) = O(21) = O(1)`
  - **Notes:** Enumerates all 21 five-card combinations and chooses the best.

- **Monte Carlo equity** (`run_monte_carlo`)
  - **Time:** `O(I * (O+1) * C(7,5)) ≈ O(I * O)`
  - **Notes:** `I` = iterations (default 2000), `O` = opponents (default 1), `C(7,5)=21` is constant.

- **Draw detection** (`detect_draws`)
  - **Time:** `O(n)` where `n ≤ 7`
  - **Notes:** Suit counts + scan of unique ranks.

- **Betting round loop** (`betting_round`)
  - **Time:** `O(A * P)` per street (worst-case)
  - **Notes:** `P` = players, `A` = number of actions until the street ends. AI compute per action is dominated by `run_monte_carlo`.

## 🚀 How to Run

### 1. Start the Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi python-socketio uvicorn-standard
python3 main.py
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## ⚙️ Features
- **Real-time Multiplayer**: Powered by WebSockets (Socket.io).
- **Aesthetic UI**: Custom card animations, glassmorphism, and responsive design.
- **Optimal Engine**: Hand evaluation and simulations optimized for Python.
- **AI Opponents**: Built-in AI that plays realistically using probability.

## 📦 Project Structure
- `backend/`: Core game logic and WebSocket server.
- `frontend/`: Next.js application with Tailwind CSS and Framer Motion.
- `...` (Legacy C++ files remain for reference).
