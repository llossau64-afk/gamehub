#!/usr/bin/env bash
# VELQIN AI installer for Linux / WSL2 (Ubuntu). Usage: bash scripts/install-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ok() { printf "  \033[32m[ok]\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m[!]\033[0m  %s\n" "$1"; }
fail() { printf "  \033[31m[x]\033[0m  %s\n" "$1"; exit 1; }

command -v python3 >/dev/null || fail "python3 is required (sudo apt install python3 python3-venv)"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' || fail "Python 3.11+ is required"
command -v node >/dev/null || fail "Node.js 20+ is required (https://nodejs.org or: sudo apt install nodejs npm)"
command -v ffmpeg >/dev/null && ok "ffmpeg found" || warn "ffmpeg missing (sudo apt install ffmpeg) — needed for video export"
command -v ollama >/dev/null && ok "Ollama found" || warn "Ollama missing: curl -fsSL https://ollama.com/install.sh | sh"
command -v nvidia-smi >/dev/null && ok "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)" || warn "No NVIDIA GPU visible"

[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r backend/requirements.txt -q
ok "Backend dependencies installed"
(cd frontend && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) && NEXT_TELEMETRY_DISABLED=1 npm run build)
ok "Web app built"
[ -f .env ] || { cp .env.example .env; ok "Created .env"; }
echo
echo "  Done. Start with: bash scripts/start-velqin.sh   (then open http://localhost:8080)"
