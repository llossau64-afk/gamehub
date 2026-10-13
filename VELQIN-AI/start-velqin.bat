@echo off
setlocal EnableExtensions
title VELQIN AI
cd /d "%~dp0"

echo.
echo   VELQIN AI  -  Create Without Limits
echo.

if not exist ".venv\Scripts\python.exe" (
  echo   [x] VELQIN is not installed yet. Run:
  echo       powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
  pause
  exit /b 1
)
if not exist "frontend\out\index.html" (
  echo   [!] The web app is not built. Building now...
  pushd frontend
  call npm run build
  if errorlevel 1 (
    popd
    echo   [x] Build failed
    pause
    exit /b 1
  )
  popd
)

rem --- Ollama (chat models) --------------------------------------------------------------
where ollama >nul 2>nul
if %errorlevel%==0 (
  powershell -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
  if errorlevel 1 (
    echo   Starting Ollama...
    start "Ollama" /min cmd /c "set OLLAMA_HOST=127.0.0.1:11434&& ollama serve"
  ) else (
    echo   [ok] Ollama is running
  )
) else (
  echo   [!] Ollama is not installed - chat will be unavailable. winget install Ollama.Ollama
)

rem --- ComfyUI (images + video) ----------------------------------------------------------
if exist "ai\comfyui\ComfyUI\venv\Scripts\python.exe" (
  powershell -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:8188/system_stats -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
  if errorlevel 1 (
    echo   Starting ComfyUI ^(local only^)...
    start "ComfyUI" /min cmd /c scripts\start-comfyui.bat
  ) else (
    echo   [ok] ComfyUI is running
  )
) else (
  echo   [i] ComfyUI not installed - Image Studio and Video Studio stay offline.
)

rem --- SearXNG (web search, optional via Docker Desktop) ---------------------------------
where docker >nul 2>nul
if %errorlevel%==0 (
  docker compose -f compose.yaml up -d searxng >nul 2>nul && echo   [ok] SearXNG web search started ^(Docker^)
)

rem --- show addresses for phones/tablets -------------------------------------------------
echo.
echo   Open VELQIN:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\show-addresses.ps1
echo.
echo   Press Ctrl+C to stop VELQIN.
echo.

start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:8080"
cd backend
"..\.venv\Scripts\python.exe" run.py
