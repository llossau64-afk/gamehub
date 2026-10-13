# Architektur

```
 Handy / iPad / PC-Browser  ──HTTPS/HTTP──►  VELQIN (FastAPI, Port 8080)
                                              ├─ statische Web-App (Next.js-Export, PWA)
                                              ├─ REST + SSE  (/api/…)
                                              ├─ Chat-Engine ──────────────► Ollama   127.0.0.1:11434
                                              ├─ Websuche ─► SearXNG 127.0.0.1:8888 ─► Internet
                                              │      └─ sicherer Seitenabruf (SSRF-Schutz)
                                              ├─ GPU-Manager + Job-Queue ──► ComfyUI  127.0.0.1:8188 (WebSocket-Fortschritt)
                                              ├─ FFmpeg (Videos zusammenfügen, MP4, Thumbnails)
                                              └─ SQLite (WAL) + storage/ (Uploads, Medien, Logs, Backups)
```

**Ein Port, ein Prozess:** Das Frontend wird statisch exportiert und vom Backend ausgeliefert. Dadurch gibt es keine
CORS-Probleme, Cookies bleiben same-origin, und zur Laufzeit wird kein Node.js gebraucht.

## Chat-Ablauf

1. `POST /api/chats/{id}/messages` speichert die Nutzernachricht + eine leere Assistentennachricht (`streaming`).
2. Ein **Hintergrund-Task** (unabhängig von der HTTP-Verbindung) baut den Kontext: System-Prompt (Datum, Sprache,
   Ehrlichkeitsregeln) → Memory → Projekt-Anweisungen → Projekt-RAG → Dateien (ganz oder per Retrieval) →
   Websuche (SearXNG → Seiten lesen → nummerierte Quellen) → Verlauf (auf das Kontextbudget gekürzt).
3. VELQIN Auto wählt das Modell (Bilder → Vision, Code → Code, lang/komplex → Core, sonst Swift; nur installierte & erlaubte).
4. Tokens werden als SSE-Events (`meta`, `status`, `sources`, `thinking`, `token`, `done`, `error`, `title`)
   veröffentlicht; die Teilantwort wird alle 1,5 s gespeichert.
5. Bricht die Verbindung ab, holt `GET /api/generations/{id}/stream?offset=n` die fehlenden Events nach.
6. Nach der ersten Antwort erzeugt das kleinste Modell einen kurzen Chat-Titel.

## Bild-/Video-Jobs

`POST /api/studio/image|video` → Job in der DB (`queued`) → GPU-Worker wählt fair den nächsten Job →
`gpu.heavy()` entlädt Ollama-Modelle → Workflow an ComfyUI, Fortschritt & Vorschaubilder über WebSocket →
Ergebnis wird in die private Mediathek kopiert (Thumbnail, MP4-Normalisierung) → Event an den Browser (SSE `/api/jobs/events`).

## Erweiterbarkeit

* **Neues Chatmodell:** Model Library → Profil konfigurieren (beliebiger Ollama-Tag) oder `POST /api/models/profiles`.
* **Neues Bildmodell:** Preset in `backend/services/workflows.py` (`IMAGE_PRESETS` + Builder) ergänzen.
* **Neues Video-Backend:** Klasse mit `check()` und `segment()` in `backend/services/video_studio.py` → `VIDEO_ADAPTERS`.
* **PostgreSQL:** `VELQIN_DATABASE_URL=postgresql+asyncpg://…` (asyncpg nachinstallieren).

## Datenmodell (Auszug)

`users`, `sessions`, `invites`, `chats`, `messages` (Status, Metadaten: Quellen, Wissensart, Tokens/s),
`attachments` + `document_chunks` (Text + Embedding), `projects`, `memories`, `ai_models` (Profile),
`jobs`, `media`, `settings`.
