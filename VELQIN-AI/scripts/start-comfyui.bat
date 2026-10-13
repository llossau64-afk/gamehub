@echo off
rem Starts ComfyUI bound to 127.0.0.1 only (never exposed to the network).
cd /d "%~dp0..\ai\comfyui\ComfyUI"
if not exist "venv\Scripts\python.exe" (
  echo ComfyUI is not installed. Run: powershell -ExecutionPolicy Bypass -File scripts\install-comfyui.ps1
  pause
  exit /b 1
)
venv\Scripts\python.exe main.py --listen 127.0.0.1 --port 8188 --preview-method auto --disable-auto-launch
