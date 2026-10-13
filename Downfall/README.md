# DOWNFALL: NO BRAKES — Unity

Unity port of the browser game in `../OneRoadDown/`. Same tracks, physics, bots, races, garage and online lobbies.

## Open
1. Unity Hub → install **Unity 6000.0.47f1**.
2. Unity Hub → Add → Add project from disk → select this `Downfall/` folder (not the repo root — that is a different project).
3. On first load the editor sets up URP (Low/Medium/High), materials, prefabs and `Assets/Downfall/Scenes/Main.unity`
   (menu **Downfall → Rebuild Content** re-runs it).
4. Open `Scenes/Main.unity`, press Play.

Command-line switches: `-race <mapId>`, `-opp <n>`, `-bot`, `-s <metres>`, `-fixed`, `-join <code>`.

## Online over the internet
Uses Unity Multiplayer Services (sessions + Relay) and Netcode for GameObjects.
Link a Unity Cloud project (Edit → Project Settings → Services) and enable Authentication, Relay and
Lobby/Multiplayer Sessions in the dashboard. Without it the game runs offline and says so in the online screen.
Lobby codes are one-time: they expire when the race starts; rematch makes a new code and members follow.

## Layout
- `Assets/Downfall/Scripts` — runtime (Core, Data, World, Physics, Game, FX, Audio, UI, Online) and `Editor/`.
- `Assets/Downfall/Art` — FBX models and textures converted from the web build's Blender assets (`Art/MANIFEST.md`, `Art/CREDITS.md`).
- `Assets/Downfall/Resources/Shaders` — URP shaders (lit/wind/snow, terrain, sky, particles, skids, city blocks).
- `Tools/art` — the conversion scripts; `check/` — a dotnet project that compile-checks the scripts against Unity reference DLLs.

See `CONVENTIONS.md` for coordinates and naming.
