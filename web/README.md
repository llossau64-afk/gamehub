# Barber Empire (HTML5 / WebGL)

Browser-native barbershop simulator built with three.js and Vite. All 3D models are made by headless Blender scripts; textures and every sound are generated at runtime, so the whole build is about 1.7 MB.

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/, upload the contents (index.html at the root)
npm run preview    # serve dist/ locally
```

`dist/` uses relative paths, so it works from any portal sub-folder (GamePix, CrazyGames, Playgama, itch.io).

## Controls

| | Desktop | Touch |
|---|---|---|
| Move / look | WASD + mouse (click to capture) | left joystick / drag on the right |
| Interact | E | context button, or tap |
| Upgrades | U or the shop button | shop button |
| Pause | Esc | pause button |
| Skip intro | hold Space / Enter / Esc, or hold the skip ring | hold the skip ring |
| **Barber mode** | | |
| Cut | hold the left mouse button on the hair | drag on the hair |
| Camera (locked while cutting) | ← → turn the chair to the next side, ↑ ↓ view height, B front/back, Z / X zoom | view pad arrows |
| Tools | 1 clipper, 2 scissors, 3 trimmer, 4 comb, 5 spray | tool bar |
| Power (clipper, trimmer) | Space | power button |
| Clipper guard | Q / E | guard chips |
| Finish | F | Finish cut |

## What is in the game

- **Main menu** over the live shop (customers sit in the background once you have progress).
- **Opening cutscene** (about 60 s, skippable): the old owner, money handover and counting, pocket search, key handover, his escape, and his head poking back in.
- **Interactive tutorial** with the first customer, one step at a time: talk, chair, cape, clippers, power, right side, both sides, back, scissors on top, trimmer edges, finish, mirror reaction, rating, payment, first upgrade (the flickering bulb).
- **Haircut system** (`src/hair/`): each customer's hair is a 128×64 length map on the scalp, rendered with up to 22 shells in a single draw call. Tools write into the map, and clippings fall as instanced particles and stay on the floor until you sweep. Scoring covers per-region accuracy against the request, uniformity, bald patches, symmetry, edge cleanup and speed.
- **Beards** (`src/hair/beard.js`): a second cuttable surface along the jaw with chin, cheek, moustache and neckline zones. Customers grow random beards; beard cuts score them.
- **Haircuts** (19): Simple Trim, Buzz Cut, Beard Trim, Short Back & Sides, Clean Shave, Crew Cut, Trim & Beard, Taper Fade, Basic Fade, Side Part, Low Fade, Textured Crop, French Crop, Mid Fade, Slick Back, Skin Fade, High Fade, Mullet and Curly Fade, unlocked by level. Fades are scored texel by texel against the requested gradient. Combing lays the hair down along the style direction (visible, with a pomade sheen and a real parting line), and Side Part and Slick Back score how much of the top is combed into shape. Spray-damp hair cuts more evenly with scissors.
- **Reactions**: one star is a full meltdown (horror double take, red face, anger vein and steam, cape flung, "I'm NEVER coming back!", money thrown on the floor, bin kicked over, door slammed, a last fist shake through the window). Two stars sulk under a rain cloud, three shrug, four give a thumbs up, five go starstruck with hearts, a fist pump, a selfie and a hop-skip out of the door.
- **Physics** (`src/fx/physics.js`): coins, notes, paper and the thrown cape bounce, roll, tip over and settle against the floor, walls and furniture; stomps and the slammed door push them around. Walk over money on the floor to pick it up; the broom finds the rest and puts the bin back.
- **Shop hours**: flip the door sign to OPEN at 8:00; the day runs to 21:00 with a moving sun, golden hour and street lamps at dusk. At closing time the last customers finish and the next morning starts.
- **Courier deliveries**: equipment and crates arrive with a courier who drops a parcel by the counter; open it to unbox the item.
- **Crates & collectibles**: Street, Gold and Legend crates roll exclusive hair/beard dyes and tool skins (clipper, scissors, spray bottle) on a reel; duplicates are sold back.
- **Colour Bar**: customers ask for a colour on top of their cut; paint it on hair and beard with the dye brush (6).
- **Turn customers away** (X or the button on the request card).
- **Soundtrack**: four original instrumental tracks synthesised live (no audio files), better with the radio and the hi-fi upgrade; the radio skips tracks.
- **Bigger shop**: the extension opens an archway to a back room with a third chair and a second barber (Luca); arcade cabinet, hi-fi speakers.
- **Customers** with personalities (chill, impatient, nervous, confident, risky), patience, waiting seats, phone idling, small talk, mirror reactions (selfie at five stars), payment hand-off and walking out.
- **Progression**: money, tips, XP and levels, 19 upgrades that all visibly change the shop, your tools or your staff, 15 achievements, a next-goal line, and days (an interstitial ad slot sits between days).
- **Shop life**: pedestrians walk past and peek in, customers queue on the waiting seats, and fictional VIP guests (footballer, rapper, streamer, actor, businessman, influencer) pay more but expect four stars.
- **Daily events** from day 2: Friday Rush, Double Tips, VIP Day, Fade Challenge.
- **Staff**: buy a second station and hire Marco. He calls waiting customers to his chair, cuts their hair himself (skill and speed upgrades) and keeps 35%.
- **Save**: autosave after every haircut, purchase and level-up (localStorage, or the portal's data module). Settings include volumes, quality, look speed, replay tutorial and delete progress.

## Code map

| Folder | |
|---|---|
| `tools/blender/` | `geo.py` (mesh toolkit), `characters.py` (rig + body + face with shape keys), `props.py` (52 props), `build_assets.py` |
| `src/render/` | renderer and quality tiers, the material library (all surfaces are defined here by name), procedural textures |
| `src/world/` | `shop.js` (room, street, lights, upgrade states, mirror, colliders), `props.js` (prop loading and merging), `upgrades.js` |
| `src/chars/` | `template.js` turns the Blender rig into one rigid-skinned mesh per character; `character.js` holds locomotion, sitting, look-at, emotions, lip sync, arm IK and gestures; `looks.js` |
| `src/hair/` | hair rendering, cutting and picking; haircut definitions and scoring; clippings |
| `src/game/` | `game.js` (states, interactions, economy, events, haircut flow), `barber.js`, `customers.js`, `employee.js`, `street.js`, `player.js` (first person + hands), `tutorial.js` |
| `src/cutscene/` | `director.js` (game-time waits, camera moves, skip), `intro.js` |
| `src/audio/` | WebAudio synthesis: bell, door, squeaky chair, clipper motor with load, snips, voices, ambience, lo-fi music on the radio |
| `src/platform/` | portal adapters (CrazyGames v3, GamePix, Playgama, none). The SDK script is added by the portal packaging, not bundled. |
| `src/debug/` | headless test harness (`play.mjs` plus `scenarios/`) used to play through the intro, tutorial and a normal day in Chromium |

## macOS app (.dmg)

```bash
RCODESIGN=/path/to/rcodesign npm run mac   # needs genisoimage, python3 + Pillow; downloads Electron
```

Builds `release/BarberEmpire-<version>-mac-apple-silicon.dmg` and `…-intel.dmg`: an Electron window around the single-file build, ad-hoc signed (no Apple developer certificate). `npm run mac:lite` builds `release/BarberEmpire-<version>-mac.dmg` (about 1 MB, Intel and Apple Silicon): a launcher that opens the game in its own Chrome/Edge/Brave app window, or in the default browser.

On first launch macOS asks for confirmation: right-click the app → Open, or allow it under System Settings → Privacy & Security.

## Rebuilding the 3D assets

```bash
pip install bpy==5.2.2          # Blender as a Python module (Python 3.13)
npm run assets                  # Blender -> assets-src/*.glb -> gltfpack/meshopt -> public/assets/
```

## Performance notes

- One draw call per character (rigid skinning plus a palette texture for colours) and one per head of hair.
- Hair LOD by distance, faces under the hairline culled; static room and street meshes merged by material.
- Only large furniture and people cast lamp shadows. The planar mirror updates at half rate and is replaced by a cheap reflective surface on the low tier.
- Tiers (auto-detected, overridable in settings): low (no shadows or mirror, 10 hair shells, pixel ratio 0.85), medium, high.
- Typical scene with 4 customers: about 190 objects in the main pass and about 220k triangles.
