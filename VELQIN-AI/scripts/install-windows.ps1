<#
  VELQIN AI - Windows installer
  Run in PowerShell from the VELQIN-AI folder:
      powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
  Options:
      -WithComfyUI    also install ComfyUI (image + video engine, ~5 GB incl. PyTorch CUDA)
      -PullModel      download the first chat model (qwen3:4b, ~2.6 GB)
      -SkipWinget     never try to install missing tools automatically
#>
param([switch]$WithComfyUI, [switch]$PullModel, [switch]$SkipWinget)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [x]  $m" -ForegroundColor Red }
function Step($m) { Write-Host ""; Write-Host "== $m" -ForegroundColor Cyan }

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Ensure-Tool($cmd, $wingetId, $label, $required) {
  if (Has $cmd) { Ok "$label found"; return $true }
  if (-not $SkipWinget -and (Has "winget")) {
    Warn "$label is missing - installing with winget ($wingetId) ..."
    winget install --id $wingetId -e --accept-package-agreements --accept-source-agreements | Out-Host
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Has $cmd) { Ok "$label installed"; return $true }
    Warn "$label was installed but is not on PATH yet. Close this window, open a new PowerShell and run the installer again."
  }
  if ($required) { Fail "$label is required. Install it (winget install $wingetId) and run this script again."; exit 1 }
  Warn "$label not installed (optional)."
  return $false
}

Write-Host ""
Write-Host "  VELQIN AI  -  Create Without Limits" -ForegroundColor Magenta
Write-Host "  Private, local AI platform installer" -ForegroundColor DarkGray

Step "Checking hardware"
if (Has "nvidia-smi") {
  $gpu = (nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader) -join "; "
  Ok "NVIDIA GPU: $gpu"
} else {
  Warn "nvidia-smi not found. Install the latest NVIDIA driver (GeForce Experience / nvidia.com). Without it everything runs on the CPU (very slow)."
}
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
Info "RAM: $ramGB GB"
$pf = Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pf) { Info ("Page file: {0} GB (video generation needs a large page file; 'system managed' is fine)" -f [math]::Round($pf.AllocatedBaseSize / 1024)) }

Step "Checking required tools"
$pyCmd = $null
foreach ($c in @("py -3.12", "py -3.11", "py -3.13", "python")) {
  try {
    $v = Invoke-Expression "$c -c `"import sys;print('%d.%d' % sys.version_info[:2])`"" 2>$null
    if ($v -and ([version]$v -ge [version]"3.11")) { $pyCmd = $c; Ok "Python $v ($c)"; break }
  } catch {}
}
if (-not $pyCmd) {
  if (-not $SkipWinget -and (Has "winget")) {
    Warn "Python 3.11+ missing - installing Python 3.12 ..."
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements | Out-Host
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $pyCmd = "py -3.12"
  } else { Fail "Python 3.11 or newer is required (https://www.python.org/downloads/)."; exit 1 }
}
Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js (to build the web app)" $true | Out-Null
Ensure-Tool "git" "Git.Git" "Git" $false | Out-Null
$hasOllama = Ensure-Tool "ollama" "Ollama.Ollama" "Ollama (local chat models)" $false
$hasFfmpeg = Ensure-Tool "ffmpeg" "Gyan.FFmpeg" "FFmpeg (video export)" $false

Step "Python environment"
if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Invoke-Expression "$pyCmd -m venv .venv"
  Ok "Created .venv"
}
& .venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .venv\Scripts\python.exe -m pip install -r backend\requirements.txt --quiet
if ($LASTEXITCODE -ne 0) { Fail "pip install failed (see messages above)."; exit 1 }
Ok "Backend dependencies installed"
$voice = Read-Host "  Install VELQIN Voice (local speech-to-text, ~200 MB)? [y/N]"
if ($voice -match "^[yYjJ]") {
  & .venv\Scripts\python.exe -m pip install -r backend\requirements-optional.txt --quiet
  Ok "Voice input installed (the Whisper model downloads on first use)"
}

Step "Web app"
Push-Location frontend
if (Test-Path "package-lock.json") { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install failed."; exit 1 }
$env:NEXT_TELEMETRY_DISABLED = "1"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "Frontend build failed."; exit 1 }
Pop-Location
Ok "Web app built (frontend\out)"

Step "Configuration"
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env"; Ok "Created .env from .env.example" } else { Ok ".env exists (kept)" }

if ($hasOllama) {
  Step "Ollama tuning for 8 GB VRAM"
  # Keep Ollama local-only, use less VRAM per token and keep one big model loaded at a time.
  [Environment]::SetEnvironmentVariable("OLLAMA_HOST", "127.0.0.1:11434", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", "q8_0", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_MAX_LOADED_MODELS", "1", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "2", "User")
  Ok "Set OLLAMA_HOST=127.0.0.1, flash attention, q8 KV cache, 1 loaded model, 2 parallel requests"
  Warn "Restart Ollama (tray icon > Quit, then start it again) so the settings take effect."
  if ($PullModel) {
    Info "Downloading qwen3:4b (VELQIN Swift) ..."
    ollama pull qwen3:4b
  } else {
    Info "Tip: download models later in the VELQIN Model Library (or: ollama pull qwen3:4b)"
  }
}

if ($WithComfyUI) {
  Step "ComfyUI (image & video engine)"
  & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\install-comfyui.ps1"
}

Step "Firewall"
Info "To use VELQIN from your phone in the same Wi-Fi, allow port 8080 for PRIVATE networks (run as admin):"
Info '  New-NetFirewallRule -DisplayName "VELQIN AI" -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow'

Write-Host ""
Write-Host "  Installation finished." -ForegroundColor Green
Write-Host "  Start VELQIN with:  start-velqin.bat" -ForegroundColor Green
Write-Host "  Then open http://localhost:8080 and create the owner account." -ForegroundColor Green
if (-not $WithComfyUI) { Write-Host "  For images & videos run: powershell -ExecutionPolicy Bypass -File scripts\install-comfyui.ps1" -ForegroundColor DarkGray }
Write-Host ""
