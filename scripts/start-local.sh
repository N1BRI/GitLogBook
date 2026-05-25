#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://127.0.0.1:5173"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run GitLogBook."
  echo "Install Node.js 20 or newer, then run this launcher again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  (
    sleep 1
    xdg-open "$URL" >/dev/null 2>&1 || true
  ) &
elif command -v open >/dev/null 2>&1; then
  (
    sleep 1
    open "$URL" >/dev/null 2>&1 || true
  ) &
fi

echo "Starting GitLogBook..."
echo "Local logger: $URL"
echo "Public preview: $URL/site"
echo

exec npm run dev
