#!/usr/bin/env bash
# Start VELQIN AI on Linux / WSL2.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/python ] || { echo "Run scripts/install-linux.sh first"; exit 1; }
if command -v ollama >/dev/null && ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  echo "Starting Ollama..."; OLLAMA_HOST=127.0.0.1:11434 nohup ollama serve >/tmp/ollama.log 2>&1 &
fi
if [ -x ai/comfyui/ComfyUI/venv/bin/python ] && ! curl -fsS http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
  echo "Starting ComfyUI (local only)..."
  (cd ai/comfyui/ComfyUI && nohup venv/bin/python main.py --listen 127.0.0.1 --port 8188 --preview-method auto >/tmp/comfyui.log 2>&1 &)
fi
echo "VELQIN: http://localhost:8080  (LAN: http://$(hostname -I 2>/dev/null | awk '{print $1}'):8080)"
cd backend && exec ../.venv/bin/python run.py
