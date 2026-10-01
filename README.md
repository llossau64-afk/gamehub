# Barbershop Simulator

First-person barbershop simulator for Unity WebGL (CrazyGames, GamePix, Playgama), playable on desktop and mobile browsers.

**Current state: Phase 1 (foundation and first playable slice).**

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

A gamepad also works through the same input actions: left stick, right stick, A to interact, Start to pause.

## Architecture

All code is in `Assets/BarberSimulator/Scripts`. It uses two assemblies: `BarberSimulator.Runtime` and `BarberSimulator.Editor`.

| Folder | Responsibility |
|---|---|
| `Core` | `GameBootstrap` (composition root), `GameFlowController` (Menu → Intro → Gameplay ⇄ Pause), `GameConfig` |
| `Save` | Versioned `SaveData`, the `ISaveStorage` abstraction (PlayerPrefs/IndexedDB now, a portal SDK later) and the migration step |
| `Settings` | `SettingsService` (every setting is applied and persisted) and `QualityApplier` (URP tiers) |
| `Input` | `InputService` with the Move/Look/Interact/Pause actions for keyboard, mouse, gamepad and touch; the virtual joystick; the multitouch look area |
| `Player` | `FirstPersonController`, `FirstPersonHands` (tool sockets and animation states for the haircut phase), `PlayerAudio` |
| `Interaction` | `IInteractable`, `Interactor` (camera probe), doors, trash, the barber station and inspection points |
| `Objectives` | Data-driven objective sequence (ScriptableObjects) advanced by string signals |
| `Dialogue` | Speakers, lines and conversations (ScriptableObjects) plus `DialoguePlayer` |
| `Camera` / `Cinematics` | A single shared camera (`CinematicCamera`), the menu shot director, the intro sequence and the planar mirror |
| `NPC` / `Characters` | The customer state machine, the NPC motor, modular appearance data and the procedural animator |
| `UI` | Code-built uGUI styled by the `UITheme` asset: menu, settings, pause, HUD, cinematic overlay and touch controls |
| `Audio` | `AudioService` with Music, SFX, Ambience and UI volume categories |
| `Economy` / `Shop` | Money, shop state restoration and expansion areas |
| `Editor` | Project setup and the procedural content and scene generators |

Localization tables are in `Assets/BarberSimulator/Resources/BarberSimulator/Localization` (English and German).

## Assets

The textures, sprites, sound effects, ambience and music are original files generated for this project. The scripts that generate them are in `Tools/AssetGen`. The fonts are DM Serif Display and Inter (SIL OFL 1.1). See `Assets/BarberSimulator/ASSET_CREDITS.md` for details.

The characters and props are procedural **placeholders** built by the editor generators. They are meant to be replaced by final art without changing any gameplay code.
