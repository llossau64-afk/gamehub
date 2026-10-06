# Guess the Answer

A multiplayer quiz party game for Unity WebGL (CrazyGames, Poki, GamePix, Playgama and other HTML5 portals), built mobile-first for landscape phones and also fully playable with mouse, keyboard and touch on desktop and tablets.

Teams take turns answering multiple-choice questions in **1v1** or **2v2** matches. Teammates rotate, so one strong player can't answer everything. Jokers (50/50, +8 SEC, TEAM VOTE, STEAL), streaks and speed bonuses add tactics, and a sudden-death **tie breaker** decides level games.

This folder is a self-contained Unity project. It is separate from the Barbershop Simulator project at the repository root.

```
GuessTheAnswer/
├─ Assets/GuessTheAnswer/
│  ├─ Scripts/
│  │  ├─ Shared/        Rules engine, protocol, questions, rooms (no UnityEngine; also compiled by the server)
│  │  ├─ Core/          App (composition root), GameBootstrap, GameConfig, InputRouter
│  │  ├─ Gameplay/      GameFlow: snapshots → screens
│  │  ├─ Multiplayer/   IMultiplayerService, online WebSocket service, practice service, transports
│  │  ├─ UI/            Theme, shapes, tweens, UIManager, widgets, Screens/, Game/
│  │  ├─ Audio/         AudioManager, synthesizer, sound library
│  │  ├─ Questions/     ContentLibrary (loads the packs)
│  │  ├─ Platform/      IPlatformService (portal SDKs), BrowserBridge
│  │  ├─ Settings/ Save/
│  │  └─ Editor/        Project setup, import rules, build + validation tools
│  ├─ Resources/GTA/    Data (questions, categories, config), Fonts, Icons
│  ├─ Plugins/WebGL/    GuessTheAnswerBrowser.jslib (WebSocket, clipboard, vibration, visibility, portal hooks)
│  └─ Scenes/           Bootstrap.unity (created by the setup step)
├─ Assets/WebGLTemplates/GuessTheAnswer/   Branded loader page with the portal adapter
├─ Server/              .NET 8 authoritative game server + tests
└─ Tools/               generate_icons.py
```

## Running it

### 1. The Unity project

1. Open the `GuessTheAnswer` folder with **Unity 6 (6000.0 LTS)**. You need the WebGL Build Support module.
2. On first load, **Guess The Answer → Setup Project** runs automatically. It creates `Assets/GuessTheAnswer/Scenes/Bootstrap.unity`, adds it to the build settings, and applies the WebGL player settings: Gzip with decompression fallback, the project's WebGL template, gamma colour space, old input manager, medium managed stripping. You can re-run it from the menu at any time.
3. Press **Play**. `GameBootstrap` builds the whole game at runtime, so Play also works from an empty scene.

Without a server the menu shows **OFFLINE**. **PRACTICE** runs the same rules against bots on the device.

### 2. The game server (needed for online play)

```bash
cd GuessTheAnswer/Server
dotnet run --project GameServer           # ws://localhost:8080/ws, health at http://localhost:8080/health
dotnet run --project GameServer.Tests     # 30 tests: rules, rooms, full WebSocket matches
```

In the editor the game connects to `editorServerUrl` from `Resources/GTA/Data/config.json` (`ws://localhost:8080/ws`). Builds use `serverUrl`. **Set `serverUrl` to your deployed `wss://` address before building.** For testing, `?server=wss://host/ws` in the page URL overrides it.

Deploy it with Docker on any host that supports WebSockets (Fly.io, Render, Railway, a VPS ...):

```bash
cd GuessTheAnswer
docker build -f Server/Dockerfile -t guess-the-answer-server .
docker run -p 8080:8080 guess-the-answer-server
```

Put it behind TLS (`wss://`). Portals serve games over HTTPS, and browsers block plain `ws://` from HTTPS pages. The `PORT` environment variable sets the port.

### 3. WebGL build

Use **Guess The Answer → Build WebGL**. It validates the questions and writes the build to `Builds/WebGL`. From the command line:

```bash
Unity -batchmode -projectPath GuessTheAnswer -executeMethod GuessTheAnswer.EditorTools.BuildTools.CommandLineBuild -quit
```

Zip the contents of `Builds/WebGL` (with `index.html` at the zip root) for the portal.

### 4. Browser version with online play (CrazyGames)

`Web/template.html` is a complete HTML5 version of the game. `python3 Tools/build_web.py <font.ttf> <codepoints> [--server-url wss://host/ws]` builds it in four flavours:

| Output | What it is |
|---|---|
| `Web/crazygames/index.html` | Upload this to CrazyGames. Includes the CrazyGames SDK (rooms, invite links, `isInstantMultiplayer`, gameplay events, happytime) and connects to `--server-url`. |
| `WebServer/public/index.html` | The page the game server hosts itself at its own URL. |
| `WebServer/game-core.js` | The page's rules engine and questions for the server. |
| `Web/guess-the-answer.html` | The Claude artifact build (online play through artifact rooms). |

`WebServer/` is a small Node.js server (`ws` package). It runs the same `Room`/`Engine` code as the page as the single authority. It also does public 1v1/2v2 matchmaking, private rooms with 6-letter codes, reconnects after a reload or a dropped connection, and emotes.

```bash
cd GuessTheAnswer/WebServer && npm ci && node server.js   # http://localhost:8080 plays the game, ws://localhost:8080/ws
```

Deploy on Render with the `render.yaml` blueprint in the repository root (New → Blueprint → this repository). The free plan sleeps after 15 minutes without visitors and takes about a minute to wake up. The page shows "CONNECTING TO THE SERVER..." meanwhile. Use a paid plan for a launch. If Render gives the service a different URL than `gta-quiz-llossau.onrender.com`, rebuild with `--server-url wss://<your-url>/ws`. For testing, `?server=wss://host/ws` in the page URL overrides it, and `?room=CODE` opens a room directly.

## How it works

### Multiplayer architecture

- **The server is the authority.** `MatchEngine` decides everything: it draws the questions, shuffles the answers, runs the timers, checks answers, computes scores and handles jokers, steals, tie breakers and disconnects. Clients send only intents (`answer 2`, `useJoker 50/50`) and render **snapshots**.
  - The correct answer is not sent until the reveal.
  - The teammate's TEAM VOTE pick only goes to that team.
  - Opponents only see *that* someone answered in the tie breaker, not *what*.
  - Late, duplicate, out-of-turn or invalid inputs are rejected.
- **One rule set, two runtimes.** `Scripts/Shared` compiles in Unity and in the .NET server (`Server/Shared`, .NET Standard 2.1 / C# 9, like Unity). Practice mode runs the identical `RoomController` + `MatchEngine` on the device.
- **The backend is replaceable.** UI and game flow only use `IMultiplayerService` (`CreateRoom`, `JoinRoom`, `LeaveRoom`, `StartMatch`, `SubmitAnswer`, `UseJoker`, …). `OnlineMultiplayerService` (WebSocket) and `LocalMultiplayerService` (practice) implement it. A Photon or Unity Gaming Services backend would be one more implementation, with the host or a cloud function running the shared `MatchEngine`.
- **Wire format.** JSON envelopes `{ "t": type, "d": payload-json }`. Unity uses `JsonUtility`; the server uses `System.Text.Json` with matching field names. The protocol version is checked on connect.
- **WebGL sockets.** Browsers use the native WebSocket through the jslib. The editor and desktop builds use `System.Net.WebSockets`.

### Rooms, matchmaking, reconnects

- **Room codes.** 6 uppercase characters, without the look-alikes 0/O and 1/I (`RoomCode`). Typed codes are normalized. Wrong codes show **ROOM NOT FOUND**, full rooms **ROOM IS FULL**, and running games **GAME ALREADY STARTED**.
- **Hosts.** The first player hosts. If the host leaves, the oldest remaining player takes over. Only the host changes the settings, adds bots or starts. Guests mark themselves READY.
- **Public queues (1v1 and 2v2).** After 30 s a 2v2 search expands into 1v1. After 15 s the player can **PLAY WITH BOTS**: everyone waiting joins and bots fill the free seats. Public matches play `GameHub.PublicRounds` (5) rounds so a quick match takes a few minutes.
- **Reconnects.** Every player gets an id plus a secret token. When the connection drops, the client reconnects with backoff and resumes the same seat. That also works after a page reload, because the token is saved.
  - In a match, the clock pauses while the player who has to act is away, for up to **15 s**, with **PLAYER RECONNECTING…** on screen.
  - **2v2:** the teammate takes over.
  - **1v1:** the opponent wins by forfeit, or the match is cancelled if almost nothing was played yet.

### Game rules (all in `MatchEngine`)

| Rule | Value |
|---|---|
| Round | Each team answers one question per round (so 10 rounds = 20 questions). Teams alternate; in 2v2 the players alternate within the team (R1, B1, R2, B2, …). The rematch flips who starts. |
| Correct answer | +100 |
| Speed bonus | +25 when answered within 5 s |
| No joker bonus | +10 when no joker was used on that question |
| Streak | +50 at 3 correct in a row, +100 at 5 (and every further 5) |
| Wrong / no answer | 0, streak resets. TIME'S UP counts as wrong |
| 50/50 | Removes two wrong answers |
| +8 SEC | Adds 8 seconds |
| TEAM VOTE (2v2 only) | The teammate secretly suggests an answer; "TEAMMATE THINKS: B" |
| STEAL | After the other team's wrong answer: 5 s to pick from the remaining answers, +75 if right. The joker is only used up when you actually steal |
| Jokers | Each once per match, at most one per question |
| Tie breaker | Equal score after the last round: everyone answers one hard question, the first correct answer wins (+100). If nobody is right, another question. After 7 the team with more correct answers wins |
| Questions | Never repeat within a match; the answer order is shuffled (except numeric answers marked `keepOrder`) |

### Client flow and UI

`GameFlow` turns the room/match snapshots into screens:

```
Loading → Main menu → (Public: matchmaking | Private: create/join | Practice)
        → Lobby → Game → Results → Rematch / Lobby / Menu
```

- **Everything is built in code.** All UI is uGUI built in code from `Theme` tokens: a dark palette, one accent yellow, red/blue teams, Outfit font, rounded cards and soft shadows. The rounded cards, shadows and rings are generated at startup from signed distance fields.
- **Animations** come from a small pooled tween engine and mostly run 0.1–0.4 s.
- **Safe areas and scaling.** `SafeArea` keeps controls clear of notches. `ResponsiveScaler` scales the 1920×1080 layout by height on wide phones and by width on 4:3 and 16:10 screens. Phones held in portrait show a rotate hint.
- **Controls.**
  - Mouse and touch: big answer cards, press/hover feedback and debounce. Vibration on supported phones.
  - Keyboard: `1`–`4` answers, `Q W E R` jokers, `Esc` menu/back, `Enter` confirm, and typing room codes.
- **Audio.** `AudioManager` crossfades the menu and game music and runs a small pool of SFX voices. Master/music/SFX volume and mute are saved. Audio is muted while the tab is hidden or an ad plays.
  - All sounds are synthesized at startup (`SoundLibrary`), so the build ships no audio files.
  - To use recordings, drop a clip at `Resources/GTA/Audio/<Sfx name>` or `Music_Menu` / `Music_Game`; it replaces the generated sound.

### Performance and build size

- **No rendering pipeline.** No URP, no physics and no Input System package; only uGUI, audio, IMGUI and JSON modules.
- **Separate canvases.** The animated background has its own canvas, and the timer ring has a nested canvas, so they don't rebuild the main UI every frame.
- **Small assets.** Icons are 38 small sprites, fonts are 3 × 55 KB, and there is no audio data.
- **Frame rate.** Graphics LOW caps at 30 FPS and calms the background; MEDIUM (the mobile default) and HIGH let the browser drive the frame rate.
- **Render resolution.** The WebGL template caps the device pixel ratio at 2.

### Saving

`SaveManager` stores JSON in PlayerPrefs (IndexedDB on WebGL):

- nickname and avatar colour
- settings
- statistics (matches, wins, accuracy, best streak, points)
- XP and level, as a hook for future progression and cosmetics
- the reconnect token

Nothing sensitive is stored.

## Extending

### Add a question category

1. Create `Resources/GTA/Data/questions_<id>.json`:
   ```json
   { "category": "anime", "version": 1, "questions": [
     { "id": "ani-001", "questionText": "…", "difficulty": "easy",
       "answers": ["…", "…", "…", "…"], "correctAnswerIndex": 2,
       "optionalExplanation": "…", "optionalImage": "", "keepOrder": false } ] }
   ```
2. Add it to `categories.json` with `id`, display `name`, `icon` (a sprite in `Resources/GTA/Icons`, see `Tools/generate_icons.py`), `color`, `pack`, and whether CLASSIC should include it.
3. Run **Guess The Answer → Validate Questions**. A 15-round match needs at least 31 questions per category.

The server loads the same files (copied at build time), so online and practice always share one question database.

### Portal SDKs

Gameplay code only calls `IPlatformService`:

- `LoadingStart`, `LoadingFinished`, `GameplayStart`, `GameplayStop`, `HappyTime`
- `ShowMidgameAd` (played when leaving the results to the main menu)
- `ShowRewardedAd`

In WebGL builds, `WebPlatformService` forwards these to `window.GTAPlatform` in `WebGLTemplates/GuessTheAnswer/index.html`. That adapter already maps **CrazyGames SDK v3** and **Poki SDK** when their script is on the page; add the portal's `<script>` tag to the template. Other portals (GamePix, Playgama) only need a few lines in the same adapter. Without an SDK every call is a safe no-op.

Monetization should stay cosmetic or optional (rewarded ads). Nothing gives a gameplay advantage.

## Testing checklist

These are covered by the automated server tests:

- turn order (1v1 / 2v2)
- scoring, speed bonus and streaks
- hidden answers
- timeouts
- 50/50, +8 SEC, TEAM VOTE and STEAL (including skip and blocked answers)
- one joker per question
- no repeated questions
- tie breaker (win, and "nobody right")
- pause/resume when the active player disconnects
- forfeit and cancel in 1v1, teammate takeover in 2v2
- bots
- room codes; full / started / unknown rooms; host migration; lobby timeouts; start validation
- rematch with alternating start
- end-to-end WebSocket matches with reconnect and matchmaking

Check by hand in the editor and in a browser build:

- create / join / wrong code / room full
- host leaving the lobby
- disconnect and reconnect (toggle the network)
- answer by tap and by keys 1–4, jokers Q/W/E/R
- results → rematch / lobby / menu
- settings persistence
- 1920×1080, 1366×768, 1280×720, phone landscape (notch) and tablet
- tab hidden → audio pauses

Credits for fonts and icons are in `Assets/GuessTheAnswer/ASSET_CREDITS.md`.
