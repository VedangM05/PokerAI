# Poker Modern

A time-complexity optimal, multiplayer Poker game transition from C++ to a modern stack:
- **Backend**: Python (FastAPI + Socket.io) with custom game engine.
- **AI**: Monte Carlo simulation-based logic (500 simulations per move).
- **Frontend**: Next.js with a premium, aesthetic emerald felt UI and Framer Motion.

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
