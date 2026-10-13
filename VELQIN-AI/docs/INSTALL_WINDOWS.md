# Installation unter Windows (RTX 4060)

## Voraussetzungen

| Programm | Wofür | Installation (der Installer erledigt das per `winget`) |
|---|---|---|
| NVIDIA-Treiber (aktuell) | GPU für KI | nvidia.com / GeForce Experience |
| Python 3.11 – 3.13 | VELQIN-Backend | `winget install Python.Python.3.12` |
| Node.js 20+ (LTS) | Web-App bauen | `winget install OpenJS.NodeJS.LTS` |
| Ollama | Chatmodelle | `winget install Ollama.Ollama` |
| FFmpeg | Video-Export (MP4) | `winget install Gyan.FFmpeg` |
| Git | ComfyUI installieren | `winget install Git.Git` |
| Docker Desktop (optional) | SearXNG-Websuche | docker.com |

Speicherplatz: ~15 GB für Chatmodelle, ~8 GB für SDXL, ~18 GB für Wan 2.2 Video, ~12 GB für FLUX.

## Schritt für Schritt

1. **VELQIN-Ordner** an einen Ort mit genug Speicher legen (z. B. `D:\VELQIN-AI`).
2. PowerShell im Ordner öffnen (Shift + Rechtsklick → „PowerShell-Fenster hier öffnen“).
3. Installer starten:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -PullModel
   ```
   Er prüft GPU, Python, Node, Ollama, FFmpeg, erstellt `.venv`, installiert alles, baut die Web-App,
   legt `.env` an und stellt Ollama für 8 GB VRAM ein (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`,
   `OLLAMA_MAX_LOADED_MODELS=1`, nur `127.0.0.1`). **Danach Ollama einmal neu starten** (Tray-Symbol → Quit → neu öffnen).
4. **Bild & Video** (optional, empfohlen):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install-comfyui.ps1
   ```
   Wähle beim Download z. B. `image upscale` (≈ 8 GB) und später `video` (≈ 18 GB).
5. **Websuche** (optional): Docker Desktop installieren, dann `docker compose up -d searxng`.
   `start-velqin.bat` startet SearXNG danach automatisch mit. Vorher in `compose.yaml` bzw. per
   Umgebungsvariable `SEARXNG_SECRET` einen eigenen geheimen Schlüssel setzen.
6. **Starten:** Doppelklick auf `start-velqin.bat`. Der Browser öffnet `http://localhost:8080`.
7. **Owner-Konto** anlegen → du landest in der Model Library → **VELQIN Swift herunterladen**.
8. **Freunde einladen:** Admin-Dashboard → Invites → Code/Link erstellen und teilen.

## Handy, iPad und Schul-iPad

* Im selben WLAN: Adresse aus dem Startfenster öffnen, z. B. `http://192.168.178.20:8080`.
* Falls nichts lädt: Windows-Firewall für **private** Netzwerke freigeben (PowerShell als Administrator):
  ```powershell
  New-NetFirewallRule -DisplayName "VELQIN AI" -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow
  ```
* **Als App installieren:** Safari → Teilen → „Zum Home-Bildschirm“ (Android/Chrome: „App installieren“).
  Vollwertige PWA-Funktionen (Offline-Shell, Mikrofon) erfordern HTTPS → siehe [REMOTE_ACCESS.md](REMOTE_ACCESS.md).
* Schul-iPads mit Filter/MDM blockieren eventuell private IP-Adressen oder fremde Domains. Dann geht es nur,
  wenn die Schule die Adresse erlaubt — VELQIN braucht nur einen normalen Browser, keine App-Installation.

## Prüfen, ob die KI wirklich lokal läuft

```powershell
.venv\Scripts\python.exe scripts\selftest.py            # GPU, Ollama-Chat (echte Antwort + tok/s), Suche, ComfyUI
.venv\Scripts\python.exe scripts\selftest.py --image    # + echtes Testbild (storage\selftest\selftest-image.png)
.venv\Scripts\python.exe scripts\selftest.py --video    # + echter kurzer Wan-2.2-Clip (dauert Minuten)
```

## Updates

```powershell
git pull
powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
```
Die Datenbank wird beim Start automatisch ergänzt (neue Tabellen). Vorher ein Backup im Admin-Dashboard anlegen.

## Häufige Probleme

| Problem | Lösung |
|---|---|
| „The local AI runtime (Ollama) is offline“ | Ollama starten (Startmenü) oder `ollama serve` |
| Antwort sehr langsam, Modell „on CPU“ | Anderes Programm belegt VRAM (Spiele, Browser-GPU). Model Library → „Unload all“, Spiel schließen |
| „model … not installed“ | Model Library → Download |
| Image Studio „offline“ | `scripts\start-comfyui.bat`, Fehlermeldungen im ComfyUI-Fenster lesen |
| „Missing: SDXL base checkpoint“ | `.venv\Scripts\python.exe scripts\download_models.py image` |
| Video-Job „ran out of memory“ | Quality „Fast“, kürzere Dauer, Auslagerungsdatei ≥ 32 GB (Windows-Systemsteuerung → Leistung) |
| Handy erreicht den PC nicht | Firewall-Regel oben, gleiche WLAN-Gruppe (kein Gast-WLAN), Adresse mit `:8080` |
