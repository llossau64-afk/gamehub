<#
  Installs ComfyUI (image + video backend) into ai\comfyui\ComfyUI with its own Python venv,
  PyTorch with CUDA, the ComfyUI-GGUF custom node and optionally the model files.
      powershell -ExecutionPolicy Bypass -File scripts\install-comfyui.ps1
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root "ai\comfyui\ComfyUI"

function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [x]  $m" -ForegroundColor Red }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git is required (winget install Git.Git)."; exit 1 }

if (-not (Test-Path (Join-Path $Target "main.py"))) {
  git clone https://github.com/comfyanonymous/ComfyUI.git $Target
  Ok "ComfyUI cloned"
} else {
  Push-Location $Target; git pull; Pop-Location
  Ok "ComfyUI updated"
}

$py = $null
foreach ($c in @("py -3.12", "py -3.11", "python")) { try { Invoke-Expression "$c --version" | Out-Null; $py = $c; break } catch {} }
if (-not $py) { Fail "Python 3.11/3.12 not found."; exit 1 }

$venv = Join-Path $Target "venv"
if (-not (Test-Path "$venv\Scripts\python.exe")) { Invoke-Expression "$py -m venv `"$venv`""; Ok "venv created" }
$vpy = "$venv\Scripts\python.exe"
& $vpy -m pip install --upgrade pip --quiet
Write-Host "  Installing PyTorch with CUDA 12.8 (RTX 40 series) - this downloads ~3 GB ..." -ForegroundColor Gray
& $vpy -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { Fail "PyTorch install failed."; exit 1 }
& $vpy -m pip install -r (Join-Path $Target "requirements.txt")
if ($LASTEXITCODE -ne 0) { Fail "ComfyUI requirements failed."; exit 1 }
Ok "ComfyUI dependencies installed"

$gguf = Join-Path $Target "custom_nodes\ComfyUI-GGUF"
if (-not (Test-Path $gguf)) { git clone https://github.com/city96/ComfyUI-GGUF.git $gguf }
& $vpy -m pip install -r (Join-Path $gguf "requirements.txt") --quiet
Ok "ComfyUI-GGUF custom node installed (for FLUX.1-schnell GGUF)"

& $vpy -c "import torch; print('  CUDA available:', torch.cuda.is_available(), '| GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else '-')"

Write-Host ""
Write-Host "  Which models do you want to download now?" -ForegroundColor Cyan
& (Join-Path $Root ".venv\Scripts\python.exe") (Join-Path $Root "scripts\download_models.py") --list
$groups = Read-Host "  Enter groups separated by spaces (e.g. 'image upscale' or 'image upscale video flux'), empty = skip"
if ($groups.Trim()) {
  $dlArgs = @((Join-Path $Root "scripts\download_models.py"), "--comfyui", $Target) + $groups.Trim().Split(" ")
  & (Join-Path $Root ".venv\Scripts\python.exe") @dlArgs
}
Write-Host ""
Ok "ComfyUI is ready. start-velqin.bat starts it automatically (local-only on 127.0.0.1:8188)."
