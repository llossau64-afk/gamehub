# Teststatus & ehrliche Grenzen

Entwickelt wurde in einer Cloud-Umgebung **ohne GPU**, in der Downloads von ollama.com, huggingface.co und
github.com gesperrt waren. Deshalb gilt:

## Getestet (automatisch, `pytest -q tests` → 39 Tests)

* Ersteinrichtung, Login, Rate-Limit, Einladungen, CSRF, Abmelden, Konto-/Datenlöschung
* Chat-Streaming über SSE, Speicherung, Auto-Titel, Stop mit Teilantwort, Regenerieren, Bearbeiten, Wiederaufnahme-Endpunkt
* VELQIN-Auto-Routing (Code → VELQIN Code), klare Fehler bei fehlendem Modell / fehlendem Vision-Modell
* Websuche inkl. Quellen, Veröffentlichungsdatum, **SSRF-Blockade** (interne Adressen werden nie abgerufen)
* Datei-Upload: Textextraktion, Magic-Byte-Prüfung (gefälschte PNG abgelehnt), Pfadbereinigung, Dateikontext im Prompt
* Projekte: Anweisungen + Datei-Retrieval im Prompt
* Memory im Prompt, Datentrennung zwischen Nutzern, Admin ohne private Inhalte, Plan-Sperren, Moderation
* Modell-Download mit Fortschritt, Backups
* ComfyUI-Workflows: Struktur, Verknüpfungen, Wan-Frame-Regeln, Preset-Erkennung (alte & neue `/object_info`-Formate)
* Bild-Job ohne ComfyUI → sauberer Fehler, „Retry“ funktioniert
* **Komplette Studio-Pipeline** gegen ein ComfyUI-Protokoll-Double (HTTP + WebSocket, `tests/fake_comfy.py`):
  Preset-Erkennung, Text→Bild (Format, Seeds, Anzahl), Inpaint mit Maske, Upscale, Fortschritt & Live-Vorschau,
  OOM → automatischer zweiter Versuch, Abbrechen eines laufenden Jobs, 10-s-Video aus 2 Segmenten (letzter Frame →
  nächstes Segment, FFmpeg-Zusammenfügen ohne doppelten Frame, MP4), Video verlängern (10 s → 15 s)

Diese Tests sprechen mit **Protokoll-Testdoubles** von Ollama/SearXNG (`tests/fakes.py`) und ComfyUI
(`tests/fake_comfy.py`), die dieselben Schnittstellen bedienen. Sie enthalten **keine KI** (Bilder sind einfarbige
Platzhalter, Videos FFmpeg-Testbilder) und werden von der App selbst nie verwendet.

Die Oberfläche wurde mit Playwright/Chromium im Desktop- (1440 px) und Smartphone-Format (390 px, Touch)
durchgeklickt; Screenshots liegen in `docs/screenshots/` (Chat-Antworten darauf stammen vom Testdouble).

## Nicht getestet — bitte auf deinem PC prüfen (`scripts/selftest.py`)

| Komponente | Status | So prüfst du es |
|---|---|---|
| Echte Ollama-Modelle (Qwen3 4B/8B, Qwen3-VL 4B, Qwen2.5-Coder 7B) | **ungetestet** (API-Format nach Ollama-Doku umgesetzt) | `selftest.py`, dann im Chat |
| Bildanalyse mit Qwen3-VL | **ungetestet** | Bild im Chat hochladen |
| ComfyUI + SDXL-Lightning / FLUX GGUF / Upscale | **ungetestet** (Knotentypen & Parameter aus offiziellen ComfyUI-Vorlagen abgeleitet) | `selftest.py --image`, Image Studio |
| Wan 2.2 TI2V 5B Video, Segmentverlängerung | **ungetestet**; Workflow folgt der offiziellen Vorlage. Laufzeit auf 8 GB / 16 GB RAM unbekannt | `selftest.py --video`, VELQIN Motion |
| SearXNG mit echten Suchmaschinen | **ungetestet** (nur Protokoll) | `selftest.py` |
| NVIDIA-Statistiken (NVML) | **ungetestet** (Fallback auf `nvidia-smi`) | Admin → Overview |
| Spracheingabe (faster-whisper) | **ungetestet** | Mikrofon-Symbol (benötigt HTTPS oder localhost) |
| Windows-Skripte (`install-windows.ps1`, `start-velqin.bat`) | **ungetestet** auf echtem Windows | Installation ausführen |
| Docker Compose / ComfyUI-Dockerfile | **ungetestet** | `docker compose up -d` |

Wenn etwas davon fehlschlägt: Die Meldung aus dem Selbsttest bzw. aus `storage/logs/velqin.log` hilft beim Beheben.

## Bekannte Grenzen

* **8 GB VRAM:** nur ein Bild-/Videojob gleichzeitig; währenddessen antwortet der Chat auf der CPU (langsamer).
* **Video:** ~5 s pro Segment; längere Clips sind aneinandergereihte Segmente (Drift/Sprünge möglich). Ein 30-s-Video
  kann auf einer RTX 4060 deutlich über eine Stunde dauern. FramePack ist nicht integriert (siehe IMAGE_VIDEO_SETUP).
* **Inpainting** nutzt das Basis-SDXL-Modell (kein spezielles Inpaint-Modell) — Kanten können sichtbar sein.
* **Vorlesen** nutzt die Stimme des Geräts (Web Speech API), keine serverseitige TTS.
* **Auto-Routing** ist eine Heuristik (Schlüsselwörter, Länge, Bilder), kein Klassifikationsmodell.
* Der Moderationsfilter ist schlüsselwortbasiert und nicht lückenlos.
* Die App-Oberfläche ist Englisch (wie in der Vorgabe: „Welcome to VELQIN.“); die KI antwortet in der Sprache des Nutzers.
