#!/usr/bin/env bash
# ============================================================================
# CodeLens - one-click launcher (macOS / Linux)
#
# Usage:
#   ./start.sh            run CodeLens in development mode
#   ./start.sh build      build the release installers
#   ./start.sh test       run the Rust tests, then exit
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"

MISSING=""
command -v node >/dev/null 2>&1 || MISSING="${MISSING}  - Node.js >= 18 (https://nodejs.org/)\n"
command -v npm  >/dev/null 2>&1 || MISSING="${MISSING}  - npm (ships with Node.js)\n"
command -v cargo >/dev/null 2>&1 || MISSING="${MISSING}  - Rust (https://rustup.rs/)\n"

if [ -n "$MISSING" ]; then
  echo "Missing required dependencies:"
  printf "$MISSING"
  echo "Install them, then run this script again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing npm dependencies..."
  npm install --no-audit --no-fund
fi

case "$MODE" in
  build)
    echo "Building release installers..."
    npm run tauri build
    echo
    echo "Done. Installers are in src-tauri/target/release/bundle/."
    ;;
  test)
    echo "Running Rust tests..."
    cargo test --manifest-path src-tauri/Cargo.toml
    ;;
  *)
    echo "Launching CodeLens in development mode..."
    echo "(Close the CodeLens window to stop the dev server.)"
    npm run tauri dev
    ;;
esac