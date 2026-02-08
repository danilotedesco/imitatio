#!/usr/bin/env bash
set -euo pipefail

# dev.sh — start backend (Flask) and frontend (Vite) for local development
# Usage: ./dev.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

# Start backend: create venv if missing, install deps, run flask in background
cd backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt
export FLASK_APP=app.py
export FLASK_ENV=development

nohup flask run --host=127.0.0.1 --port=5000 > "$ROOT_DIR/.dev_backend.log" 2>&1 &
BACKEND_PID=$!

cd "$ROOT_DIR/vite-app"

# Install frontend deps (fast if already installed) and start Vite in foreground
npm install

echo "Backend PID: $BACKEND_PID — logs: $ROOT_DIR/.dev_backend.log"
echo "Starting Vite dev server (foreground). Press Ctrl-C to stop both."

trap 'echo "Stopping dev servers..."; kill "$BACKEND_PID" 2>/dev/null || true; exit' INT TERM

npm run dev

# If Vite exits, stop backend as well
kill "$BACKEND_PID" 2>/dev/null || true
