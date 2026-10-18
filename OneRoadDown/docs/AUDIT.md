# DOWNFALL: NO BRAKES – Projekt-Audit (Phase 1)

Stand: Oktober 2026. Branch `claude/blissful-euler-u3ydyp`. Jeder Zwischenstand ist ein Git-Commit, jede Version lässt sich mit `git checkout <commit>` wiederherstellen.

## Engine und Architektur
- **Engine:** HTML5 + three.js r170 (vendored, kein Build-Schritt), etwa 14 400 Zeilen eigenes JavaScript.
  - Läuft auf Desktop, iPad und Smartphone. Qualitätsstufen low/medium/high, „auto“ wählt auf Touch-Geräten low.
- **Unity-Port:** Ein vollständiger Port existiert parallel in `../Downfall` (Unity 6, URP). Er wurde auf ausdrücklichen Wunsch gebaut, ist aber in echtem Unity noch ungetestet.
  - Die Browser-Version bleibt die Hauptversion.
  - Eine Migration nach Unity/WebGL brächte bessere Werkzeuge (Lightmapping, Reflection Probes, Profiler). Dagegen sprechen 15–40 MB Download statt ~25 MB, längere Ladezeiten und schwächere Mobile-WebGL-Performance. Bis zum ersten echten Unity-Test bleibt die Web-Version Basis.
- **Module (`src/`):**
  | Bereich | Dateien |
  |---|---|
  | Kern | `core/` (Mathe, Eingabe, Spielstand, Portal-SDK) |
  | Daten | `data/` (Autos, Maps, Berge, Upgrades, Erfolge) |
  | Welt | `world/` (Strecken-Generator, Chunk-Streaming, Himmel/Wetter, Tiere, Assets) |
  | Physik | `physics/` (120-Hz-Fahrzeugphysik) |
  | Spiel | `game/` (Abfahrt, Rennen, KI, Präsentation, Werte) |
  | Grafik | `models/` (Auto, Requisiten, Rennstrecken-Ausstattung), `gfx/` (Materialien, Texturen, Partikel, Post-FX) |
  | Sonstiges | `audio/` (Synthese), `ui/`, `net/` (Online), `scenes/garage.js` |
- **Assets:** Alle 3D-Modelle (Autos, Natur, Gebäude, Tiere, Garage) entstehen per Blender-Python in `tools/blender/` als GLB. Fremd-Assets sind nur CC0/CC-BY, siehe `assets/thirdparty/CREDITS.md`.

## Inhalte
- **20 Renn-Maps** in 8 Ländern, Tier 1–5:
  - Japan: Sakura Ring, Hakone Touge, Mount Kirin, Odaiba, Irohazaka
  - Deutschland: Eifelring, Schwarzwald, Autobahn A8, Alpenring, Hockenring
  - Frankreich: Riviera, Provence, Sarthe 24, Galibier, Bordeaux
  - Italien: Brianza · USA: Mesa · Norwegen: Fjord · Schweiz: Alpine Summit · Schottland: Highlands
  - Rundkurse und Sprints, jeweils bis zu 8 Fahrer.
- **2 Abfahrts-Berge** (Hollow Peak, The Canyon), je 25 km, mit 8 Biomen.
- **32 Autos** vom Rostkübel bis zum Hypercar, mit 11 Upgrade-Kategorien, Reifen, Lack und Garagen-Stufen.
- **Online:**
  - Lobbys mit Einmal-Codes, öffentliche Lobbys und Schnellsuche, Rematch.
  - Übertragung über Claude-Room oder P2P (WebRTC über öffentliche Relays).
  - Nicht übers echte Internet getestet, nur mit einem lokalen Relay.
- **Story-Modus:** Einen echten Story-Modus mit Kapiteln, Figuren und Zwischensequenzen gibt es bisher **nicht**. Die vorhandene Progression besteht aus:
  - Freischaltung der Berge,
  - Map-Tiers,
  - Gratis-Auto nach 5 Rennen,
  - Erfolgen.

  Der Story-Modus „From Nothing to Legend“ ist deshalb ein Neubau. Er soll auf diesen Systemen aufsetzen, ohne Spielstände zu brechen.

## Bekannte Schwachstellen (Priorität)
1. **Autos wirken prozedural/klobig** (Loft-Querschnitte). → Neue Hi-Fi-Pipeline in `tools/blender/car_hifi.py` (in Arbeit).
2. **Lack und Spiegelungen:** Bisher spiegelt sich nur der Himmel. → Dynamische Reflection Probe und Klarlack (in Arbeit).
3. **Garage:**
   - Ein Lichtmodus.
   - Kein Cockpit-Blick.
   - Keine Detailansichten.
4. **Minimap:**
   - Nur im Rennen, nicht auf den Bergen.
   - Nicht rotierend.
5. **Performance:** Allokationen pro Frame (Kamera), mögliche Shader-Kompilierungen beim ersten Auftauchen von Effekten (in Arbeit).
6. **Fehlende Features:**
   - Story-Modus,
   - Wetterwechsel, Nacht und Nässe nicht auf allen Maps,
   - Stoßstangen- und Replay-Kamera,
   - Tastenbelegung,
   - Fahrhilfen-Stufen,
   - KI-Persönlichkeiten,
   - Bestenlisten.

## Plan
| Phase | Inhalt | Status |
|---|---|---|
| 1 | Audit | dieses Dokument |
| 2 | Premium-Fahrzeug TORO (Exterieur, Innenraum, LODs, Lichter) | in Arbeit |
| 3 | Premium-Garage (6 Lichtmodi, freie Kamera, Cockpit, Motorstart) | geplant |
| 4 | Welt-Grafik: Reflexionen, Licht, Referenz-Map, dann alle 20 | in Arbeit (Rendering) |
| 5 | Story-Modus „From Nothing to Legend“ (6 Kapitel über die 20 Maps) | geplant |
| 6 | Physik, Kameras, KI-Persönlichkeiten, Fahrhilfen | geplant |
| 7 | Multiplayer-Verbesserungen | geplant |
| 8 | UI, Audio, VFX | teilweise (Minimap in Arbeit) |
| 9 | Optimierung und Bugfixing | laufend |
