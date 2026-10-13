# Fernzugriff (unterwegs, sicher)

**Öffne VELQIN nie per Portweiterleitung ohne HTTPS.** Ollama und ComfyUI bleiben immer auf `127.0.0.1`.

## Empfohlen: Tailscale (kostenlos, VPN + HTTPS)

1. Tailscale auf dem PC und allen Geräten installieren und mit demselben Konto anmelden
   (Freunde lädst du in dein Tailnet ein oder teilst nur den PC per „Share“).
2. Auf dem PC (PowerShell):
   ```powershell
   tailscale serve --bg 8080
   ```
   VELQIN ist dann unter `https://<pc-name>.<tailnet>.ts.net` mit gültigem Zertifikat erreichbar — nur für Geräte im Tailnet.
3. HTTPS aktiviert die vollständige PWA (Installation, Mikrofon/Spracheingabe).
4. Falls die Anmeldung über diese Adresse mit „Cross-origin request blocked“ scheitert, in `.env` eintragen:
   `VELQIN_ALLOWED_ORIGINS=https://<pc-name>.<tailnet>.ts.net` und VELQIN neu starten.

## Alternative: eigene Domain + Caddy

Nur wenn du weißt, was du tust (Port 443 am Router weiterleiten). Beispiel-`Caddyfile`:
```
velqin.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1        # SSE-Streaming nicht puffern
    }
}
```
In `.env`: `VELQIN_TRUST_PROXY_HEADERS=true` und `VELQIN_HOST=127.0.0.1` (dann ist VELQIN nur noch über Caddy erreichbar).
Login-Rate-Limits, Einladungs-Pflicht und sichere Cookies sind aktiv; trotzdem ist ein VPN die sicherere Wahl.

## Verbindungsabbrüche

Antworten werden auf dem Server fertig generiert, auch wenn das Handy kurz die Verbindung verliert. Die App
verbindet sich automatisch neu und zeigt die fehlenden Tokens nach. Bild- und Videojobs laufen ohnehin serverseitig.
