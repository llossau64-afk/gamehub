# Sicherheit & Datenschutz

| Thema | Umsetzung |
|---|---|
| Keine offenen KI-APIs | Ollama, ComfyUI, SearXNG lauschen nur auf `127.0.0.1` (Installer setzt `OLLAMA_HOST=127.0.0.1:11434`, ComfyUI startet mit `--listen 127.0.0.1`). Nur VELQIN (Port 8080) ist im Netz sichtbar. |
| Anmeldung | Passwort-Hashing mit **Argon2id** (`argon2-cffi`), Mindestlänge 8, gleich lange Antwortzeit auch bei unbekanntem Nutzer |
| Sessions | zufällige 256-bit-Tokens, nur als SHA-256-Hash in der DB, Cookie `HttpOnly`, `SameSite=Lax`, `Secure` bei HTTPS; Geräteliste & Abmelden in den Einstellungen; Passwortwechsel meldet andere Geräte ab |
| Registrierung | öffentlich **aus**; nur mit Einladungscode (einmalig angezeigt, nur gehasht gespeichert, Ablaufdatum, Nutzungszahl, widerrufbar) |
| Brute Force | Login: 10 Versuche / 15 min pro IP **und** pro Benutzername; Registrierung: 10 / h pro IP |
| CSRF | Jeder schreibende `/api`-Aufruf braucht den Header `X-Velqin-Request` und passenden `Origin` |
| Browser-Header | CSP (`default-src 'self'`, keine fremden Skripte/Bilder), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Cache-Control: no-store` für die API |
| Datentrennung | Jede Abfrage filtert nach dem angemeldeten Nutzer; fremde IDs liefern 404 (getestet: `tests/test_api.py::test_user_isolation`) |
| Admin & Privatsphäre | Das Dashboard zeigt Kontodaten, Zähler und technische Jobdaten — **keine** Chats, Prompts, Dateien oder Medien anderer Nutzer |
| Uploads | Größenlimit (Standard 25 MB), Typprüfung per **Magic Bytes** + Endung, Dateinamen bereinigt, zufällige Speichernamen, Bild-Dekompressionsbomben-Schutz, Bilder werden neu kodiert (EXIF/GPS entfernt), Dokumente werden nie inline ausgeliefert |
| Path Traversal | alle Speicherpfade werden aufgelöst und müssen im Datenordner liegen; Backup-Namen streng geprüft; Restore entpackt nur in den Datenordner |
| Websuche (SSRF) | nur http/https, DNS-Auflösung → private/Loopback/Link-Local/Metadaten-IPs blockiert, jeder Redirect neu geprüft, max. 2 MB, nur Text/HTML, Timeouts |
| Prompt-Injection | Webseiten- und Dateiinhalte werden dem Modell als „nicht vertrauenswürdige Daten“ übergeben; Markdown wird ohne HTML gerendert, externe Bilder blockiert die CSP |
| Missbrauch (Bild/Video) | Filter blockiert immer sexuelle Inhalte mit Minderjährigen und sexuelle Deepfakes; explizite Inhalte standardmäßig aus (Owner-Einstellung); Negativ-Prompt gegen NSFW. Ein Keyword-Filter ist **keine** Garantie |
| Logging | Logs enthalten keine Chatinhalte, Prompts oder Dateiinhalte (nur Metadaten, Fehlertypen) |
| Daten löschen | Einstellungen → „Your data“: alle eigenen Daten oder das ganze Konto löschen (inkl. Dateien auf der Platte) |
| Backups | Admin → Backups (konsistenter SQLite-Snapshot, optional mit Dateien); Wiederherstellen mit `scripts/restore-backup.py` |

Bekannte Restrisiken: DNS-Rebinding zwischen Prüfung und Abruf bei der Websuche ist theoretisch möglich (kurzes
Zeitfenster); ein Moderationsfilter per Schlüsselwort lässt sich umgehen; wer physischen Zugriff auf den PC hat,
kann die Datenbank lesen (Festplattenverschlüsselung mit BitLocker empfohlen).
