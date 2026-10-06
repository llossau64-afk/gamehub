# Game Hub

- **[One More Floor](OneMoreFloor/README.md)**: HTML5/WebGL roguelite tower climber (`OneMoreFloor/`).
- **Barbershop Simulator**: Unity WebGL project (below).

# Barbershop Simulator

First-person barbershop simulator for Unity WebGL (CrazyGames, GamePix, Playgama), playable on desktop and mobile browsers.

**Current state: Phase 3: workday loop, shop computer with upgrades and shop levels, on top of the Phase 2 customer loop and haircut gameplay.**

## Opening the project

1. Open the repository folder with **Unity 6 (6000.0 LTS)**. It needs the WebGL Build Support module.
2. Let the packages import: URP, Input System and uGUI (listed in `Packages/manifest.json`).
3. On the first editor load, `FirstRunSetup` runs **Barber Simulator → Build Project Content** automatically. This step:
   - configures URP. It sets up the Low, Medium and High quality tiers and the WebGL player settings.
   - sets the import settings for textures, sprites and audio.
   - generates the materials, meshes, prefabs, ScriptableObjects and the post-processing profile.
   - builds `Assets/BarberSimulator/Scenes/Barbershop.unity` and adds it to the build settings.
4. Press Play in `Barbershop.unity`.

The repository contains only the *source* assets: scripts, textures, audio, fonts and localization. All generated content can be rebuilt at any time from the menu with **Barber Simulator → Build Project Content**. To rebuild only the scene, use **Rebuild Scene Only**. Regenerating keeps asset GUIDs, so references stay valid.

Other menu commands:
- **Build WebGL**: writes the player to `Builds/WebGL`. From the command line:
  `Unity -batchmode -projectPath . -executeMethod BarberSimulator.EditorTools.BuildTools.CommandLineBuild -quit`
- **Bake Lighting (optional)**: bakes the indirect bounce into lightmaps. Direct light stays realtime.
- **Validate Scene**: reports missing scripts, meshes or materials.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrow keys | Left-side joystick (it follows your thumb) |
| Look | Mouse (click the game to capture the pointer) | Drag on the right side of the screen |
| Interact | E | Contextual hand button (bottom right) |
| Walk faster | Left Shift | – |
| Pause | Esc | Pause button (top right) |
| Skip intro | Space / Enter / Esc / "Skip" button | "Skip" button |

**Barber mode** (interact with the barber chair while a customer is seated):

| Action | Desktop | Touch |
|---|---|---|
| Cut | Hold left mouse on the hair | Hold the CUT button (aim with the centre reticle) |
| Rotate around the head | Right mouse drag / WASD / arrows | Drag anywhere |
| Zoom | Mouse wheel | – |
| Tools | 1 Clipper · 2 Trimmer · 3 Scissors · 4 Comb | Tap the tool bar |
| Clipper guard | Q / E | Tap a guard chip |
| Finish | F or "Finish haircut" | "Finish haircut" |

Debug keys (editor and development builds only): F5 spawn customer, F6 +$100, F7 reset hair, F8 complete haircut to target, F9 hair zone overlay.

**The workday.** Every day starts with the shop closed and the clock frozen at 09:00. Flip the OPEN/CLOSED sign next to the front door (interact) to open. The clock then runs to 18:00 (about 9 real minutes; `WorkdayConfig`). After closing time no new customers arrive, those inside finish, and then the end-of-day summary appears (served, revenue, tips, average stars, reputation, XP, rent) with a "Next day" button. Day 1 asks you to finish tidying first; the "Serve your first customer" objective points you at the sign. Rent is deducted at the end of each day (day 1 is free; rent that cannot be paid is waived).

**The shop computer.** The laptop on the reception counter opens the upgrade store (Tools, Comfort & Decor, Expansion). Pause, movement and the world are frozen while it is open; Esc or Close returns to the shop. Upgrades are `UpgradeDefinition` assets listed in an `UpgradeCatalog` (built by `Phase3ContentBuilder`); purchases are stored in `shop.ownedItemIds`. Their effects (customer patience, tips, customer arrival rate, queue size, reputation gain, tools, areas) are aggregated in `UpgradeEffects`, and their scene props (`UpgradeProp`) appear when bought. Shop level comes from experience (`ShopProgression`: each served customer gives 5-20 XP depending on the stars) and gates upgrades and hairstyles (`HaircutRequest.RequiredShopLevel`).

**Rewards.** `Rewards/` holds the retention systems, all persisted in `ProgressionData` (save version 4): `StreakService` (consecutive cuts of 4+ stars raise the tip multiplier to x1.1 / x1.25 / x1.5 at 2 / 4 / 6; a 3-star cut or a lost customer breaks it), `DailyGoalService` (three goals each morning drawn from `DailyGoalPool` and scaled with shop level, paid in cash and XP), `MilestoneService` (18 achievements, shown as cards in the Achievements panel of the main and pause menus; Busy Day uses the day statistics, Perfect Fade needs a fade at 95% or better with five stars, Barber Empire needs every upgrade) and `RewardsPresenter` (HUD badge, goals panel, toasts, banners, sounds, popups). From shop level 2 about 10% of spawns are VIPs (`CustomerSpawnConfig.vipChance`): a runtime flag on the visit with double price, 25% less patience, tighter evaluation and extra reputation and XP.

A gamepad also works through the same input actions: left stick, right stick, A to interact, Start to pause.

## Architecture

All code is in `Assets/BarberSimulator/Scripts`. It uses two assemblies: `BarberSimulator.Runtime` and `BarberSimulator.Editor`.

| Folder | Responsibility |
|---|---|
| `Core` | `GameBootstrap` (composition root), `GameFlowController` (Menu → Intro → Gameplay ⇄ Pause / Store / Day summary), `GameConfig` |
| `Workday` | `DayCycleService` (clock, Closed → Open → Closing → Ended, rent, summary data), `WorkdayConfig`, `ShopSign` (the interactable OPEN/CLOSED sign) |
| `Save` | Versioned `SaveData`, the `ISaveStorage` abstraction (PlayerPrefs/IndexedDB, or the portal's data module through `PlatformSaveStorage`) and the migration step |
| `Platform` | Portal integration: `IPlatformService` (CrazyGames SDK v3 or none), `IAdService`, `PlatformSaveStorage`, `PlatformFlowBridge` (loading and gameplay signals) |
| `Settings` | `SettingsService` (every setting is applied and persisted), `QualityApplier` (URP tiers Low / Medium / High / Ultra, shadow detail, texture mip limit, post processing, motion blur, V-Sync and frame cap) and `LiveSettings` (static read-only snapshot for camera / environment / subtitle code: `AmbientEffects`, `ReduceMotion`, `SubtitleScale`) |
| `Input` | `InputService` with the Move/Look/Interact/Pause actions for keyboard, mouse, gamepad and touch; the virtual joystick; the multitouch look area |
| `Player` | `FirstPersonController`, `FirstPersonHands` (tool sockets and animation states for the haircut phase), `PlayerAudio` |
| `Interaction` | `IInteractable`, `Interactor` (camera probe), doors, trash, the barber station and inspection points |
| `Objectives` | Data-driven objective sequence (ScriptableObjects) advanced by string signals |
| `Dialogue` | Speakers, lines and conversations (ScriptableObjects) plus `DialoguePlayer` |
| `Camera` / `Cinematics` | A single shared camera (`CinematicCamera`). `MainMenuCameraController` glides between 8 shots (`MenuCam_01`–`08`) with no cuts or fades. `MenuAtmosphere` adds the menu depth of field and dust. The `IntroSequence` (about 90 s, hold to skip) and the planar mirror also live here. |
| `NPC` / `Characters` | The customer state machine, the NPC motor, modular appearance data and the procedural animator |
| `UI` | Code-built uGUI styled by the `UITheme` asset: main menu (PLAY/CONTINUE, NEW GAME, SETTINGS, ACHIEVEMENTS, HOW TO PLAY, CREDITS, EXIT on desktop), `MenuPanelView` panels that open inside the menu (settings with Gameplay / Graphics / Audio / Controls / Accessibility tabs, achievement cards, how to play, credits), `LoadingView` (`Show()`, `SetProgress(float)`, `Hide()`), pause, HUD, cinematic overlay and touch controls |
| `Audio` | `AudioService` with Music, SFX, Ambience, UI and Dialogue volume categories; `MenuAudioManager` (quiet shop and street bed, subtle music and random one-shots while the main menu is shown) |
| `Economy` | Money, reputation, per-day statistics and the payment rules |
| `Shop` | `ShopState` (restores props and areas), `ExpansionArea`, `ShopComputer`, `UpgradeDefinition` / `UpgradeCatalog` / `UpgradeService` / `UpgradeEffects` / `UpgradeProp`, `ShopProgression` (XP and shop level) |
| `Haircut` | `HairGrid` (scalp cells with length per zone and band), `HaircutSession` (tools and guards), `HaircutEvaluator` (scoring), `HairShellRenderer` (visible hair), request and tool ScriptableObjects |
| `Barber` | `BarberModeController` (orbit camera, tool hand, cutting, audio, particles) and `BarberTutorial` |
| `Customers` | `CustomerBrain` (16-state visit), `ShopCustomerSite` (queue and reservations), `CustomerSpawner`, profiles and dialogue data, `BarberChairStation`, `WaitingSeat` |
| `Navigation` | `NavGraph`, the authored walk graph that customers use (always through the real door) |
| `Editor` | Project setup, the procedural content and scene generators, and validation (**Validate Customers & Haircuts**, **Validate Workday & Upgrades**) |

Localization tables are in `Assets/BarberSimulator/Resources/BarberSimulator/Localization` (English and German).

## Publishing (CrazyGames / other portals)

**Build.** Run **Barber Simulator → Build WebGL** (or the command-line build shown above). Both select the WebGL template `Assets/WebGLTemplates/BarberSimulator` (`PlayerSettings.WebGL.template = "PROJECT:BarberSimulator"`). Zip the contents of `Builds/WebGL` (with `index.html` at the zip root) and upload it. The template has a full-window responsive canvas, a mobile viewport, a loading bar and no analytics.

**Template.** `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js` before the Unity loader, initialises the SDK (waiting at most 5 seconds) and then starts Unity, so portal data is ready when the game boots. If the script is blocked or missing, the game still starts.

**SDK detection.** `GameConfig.platform` is `Auto` (default), `CrazyGames` or `None`. `PlatformServiceFactory` picks `CrazyGamesPlatformService` only in a WebGL player when `window.CrazyGames.SDK` exists, initialised successfully and its `environment` is not `disabled`. In every other case (editor, standalone, GamePix, Playgama, itch.io, ad blocker blocking the script) it uses `NullPlatformService`, which only logs. In the editor and development builds the null service simulates ads (1.2 s) so the ad flows can be tested. In release builds outside CrazyGames there are no ads and rewarded requests fail, so a reward is never granted for free. The native bridge is `Assets/BarberSimulator/Plugins/WebGL/BarberPlatform.jslib`; its callbacks reach the persistent `BarberPlatformReceiver` object.

**What is wired.**
- `GameBootstrap` creates the platform first and calls `LoadingStart`. `PlatformFlowBridge` calls `LoadingStop` when the first screen is up and `GameplayStart`/`GameplayStop` on entering and leaving Gameplay or Barber mode (pause, menu, intro and scene reloads stop it).
- Saves: `PlatformSaveStorage` writes to the portal data module when it is available and always mirrors to PlayerPrefs. Reads prefer the portal copy and fall back to PlayerPrefs.
- `HappyTime` fires on a five-star review (at most once every 15 s).
- The initial language uses the SDK/browser locale when the game has that language.
- **End-of-day screen.** It offers "Double the tips – watch an ad", a rewarded ad that is shown only when `RewardedAvailable` is true and today's tips are above 0, and that pays the tips a second time. "Next day" plays a midgame interstitial, which is rate limited, before the fade.

**Ads API.** `GameContext.Ads` (`IAdService`) is the only thing gameplay or UI code needs. While an ad plays it mutes `AudioService`, sets `Time.timeScale = 0` and blocks input, then restores them.

```csharp
// "Double tips" button on the end-of-day screen
button.interactable = ctx.Ads.RewardedAvailable;      // hide or disable the button when false
ctx.Ads.ShowRewarded(
    onRewarded: () => ctx.Economy.Add(tips)   ,     // runs only after the ad was watched
    onFailed:   () => ctx.UI.Hud.ShowToast("No ad available right now."));

ctx.Ads.ShowMidgame(() => ContinueToNextDay());       // always calls back; skipped in the first 60 s
```

Callbacks run after the game has been restored. `ShowMidgame` is rate limited (nothing in the first 60 s of the session, then at least 180 s apart) and should only be used at natural breaks.

**QA checklist (CrazyGames requirements).**
- [ ] Test on the CrazyGames QA tool / `?useLocalSdk` preview: `environment` is `local` or `crazygames` and the console shows `[Platform] Using 'CrazyGames'`.
- [ ] No external links, no other portal branding and no own analytics or ad code (the template only loads the CrazyGames SDK).
- [ ] `loadingStart` at boot, `loadingStop` when the main menu is shown.
- [ ] `gameplayStart` only while actually playing; `gameplayStop` in menus, pause, the intro and while an ad plays.
- [ ] Audio is muted and the game is frozen during every ad; both are restored afterwards, also when the ad fails.
- [ ] No ad in the first minute; interstitials only at natural breaks, never mid-haircut.
- [ ] Rewarded ads are optional, clearly labelled, and the reward is only granted in `onRewarded`.
- [ ] Works with an ad blocker (no reward, no crash, no stuck pause).
- [ ] Progress survives a reload (portal data and PlayerPrefs). Test both as guest and logged in.
- [ ] Keyboard, mouse and touch work; the page does not scroll; the game fits any window size and phone orientation.
- [ ] Initial download is small (portal limits apply) and the game starts without errors in the browser console.

## Assets

The textures, sprites, sound effects, ambience and music are original files generated for this project. The scripts that generate them are in `Tools/AssetGen`. The fonts are DM Serif Display and Inter (SIL OFL 1.1). See `Assets/BarberSimulator/ASSET_CREDITS.md` for details.

The characters are modelled in Blender by `Tools/AssetGen/blender/characters.py`. That is a headless script, run with `pip install bpy==4.5.9` and then `python Tools/AssetGen/blender/characters.py [--preview out.png]`. The script produces:
- a skinned body with a head and face,
- 4 tops, pants and shoes,
- 4 facial-hair styles, glasses and a cap,
- the first-person arm.

It writes them to `Art/Source/Characters/*.json`. `CharacterFactory` builds skinned meshes from these files on the same joint hierarchy that `ProceduralCharacterAnimator` drives, and the haircut hair shell fits the exported cranium. Props are still built procedurally by the editor generators.
