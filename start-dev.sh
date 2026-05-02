#!/usr/bin/env bash
# ─── Boutyflameet Dev Launcher ──────────────────────────────────
# Starts backend (port 3001) + frontend (port 5173) in parallel
# Usage: bash start-dev.sh
set -e

echo "🔥 Starting Boutyflameet..."
echo ""

# Install deps if needed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  (cd backend && npm install)
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  (cd frontend && npm install)
fi

echo ""
echo "🚀 Launching servers..."
echo "   Backend  → http://localhost:3001"
echo "   Frontend → http://localhost:5173"
echo ""
echo "Open http://localhost:5173 to start a meeting!"
echo "Press Ctrl+C to stop both."
echo ""

# Run both in parallel, kill both on Ctrl+C
trap 'kill 0' INT
(cd backend  && node server.js) &
(cd frontend && npm run dev)    &
wait
