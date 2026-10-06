# TOWER OF ARGUS

A fast roguelite tower climber for the browser. Forty floors, eight worlds and a guardian every ten floors. At the top, Argus, the overseer who has been talking to you the whole way, waits for you himself.

Built with HTML5 + three.js (WebGL), no build step and no external requests. The whole game is about 1 MB: all audio is synthesized at runtime, and three.js and the fonts are vendored.

## Run it

ES modules need a web server (opening `index.html` via `file://` will not work):

```bash
cd OneMoreFloor
python3 -m http.server 8000      # or: npx http-server -p 8000
# open http://localhost:8000
```

To deploy (itch.io, CrazyGames, GitHub Pages, any static host), upload the `OneMoreFloor/` folder as is.

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | Floating joystick (left half) | Left stick |
| Aim | Mouse | Auto-aim | Right stick (or auto-aim) |
| Attack | Left mouse (hold) / J | ATTACK button (hold) | X / RT / A |
| Dash | Space / Shift / K | DASH button | B / RB |
| Power | Q / E / right mouse | Power button | Y / LB |
| Pause | Esc / P | Pause button | Start |

On the upgrade screen use 1/2/3 (or arrows + Enter) and R to reroll. On the results screen, Space/Enter starts the next run immediately.

## What's new in v6

- **Renamed to Tower of Argus.** Saves from earlier versions are kept.
- **The tower has an end:** floor 40 is the top. Argus falls from the sky in a cutscene, talks, then fights: rune spirals, sweeping eye beams, a meteor rain, blink strikes and summons from all eight worlds. Below half health his crown ignites (phase II). Beating him plays an ending dialog, pays 3,000 coins and 5 keys, and unlocks the Overseer skin (later clears pay 1,000 coins and 2 keys).
- **Chests (shop → CHESTS):** Wooden (1,200 coins), Silver (1 key) and Gold (5 keys, always Super Rare or better). They drop in, shake, leak light in the colour of what is inside, burst open with light rays, and the prize rises out with a rarity fanfare.
- **Chest exclusives:** 5 skins (Pumpkin King, Crystal Knight, Oni Samurai, Dragon Lord with beating wings, Celestial) and 5 weapons (Bone Cleaver, Frostfang that slows, Soul Reaper that heals on kills, Dragonfang that burns, Starfall that arcs lightning). Duplicates turn into coins.
- **Keys:** from floor 20 up, about 1 monster in 20 drops a key. On CrazyGames a rewarded ad gives 1 key every 4 hours. The shop shows key packs for real money; they stay switched off until a payment provider is connected (`js/payments.js`).
- After the training floor and the power choice you go back to the main menu, and the first real climb starts from PLAY.
- **iPad:** iPadOS is detected as a touch device (it reports itself as a Mac), bigger touch buttons and joystick on tablets, re-layout after rotation, and a render-resolution cap so it stays at 60 fps.
- A monster can never appear before its own world (hard guard in the wave generator), and monsters from earlier worlds only mix in from floor 11.

## What's new in v5

- **40 monsters** built from a creature kit (bipeds, beasts, flyers, fish, slimes, spirits, serpents, spiders, crabs, mimics): cel-shaded, ink-outlined, glowing eyes, horns, jaws, wings and tails, each with its own animation. New behaviours: flyers that circle and dive, bombers that swell up and explode.
- **8 worlds**, 5 floors each: Dungeon, Flooded Sewers (water slows, swimmers speed up), Haunted Crypt, Lava Forge (lava burns), The Abyss (water), Frozen Spire (slippery ice), Shadow Garden, Sky Sanctum. Animated water/lava/ice shaders.
- **Sound:** every monster has a voice (growl, roar, screech, caw, bark, hiss, gurgle, bubble, chitter, moan, clank, sizzle, zap, chime, chomp, croak) for spawn, wind-up, attack, hurt and death. Footsteps per surface, heartbeat at low HP, wood/blade hit sounds, combo swing pitches, heal sparkle, coin magnet. New lobby theme (main menu) and shop groove (shop, mastery, register, settings); run music changes key per world.
- The Register lists all 41 monsters plus the 3 bosses with animated 3D models. The power choice now always follows the training floor.

## What's new in v4

- **Fixed:** on phones the joystick could stop working after a tap on the background (iOS sends fake mouse events that switched the game to mouse mode). Input now uses pointer events and a document-wide touch stick.
- **New look:** cel-shaded (toon) characters with ink outlines, soft glowing particles with smoke, a real sword trail.
- **Animation:** speed-synced run cycle (no foot sliding), hip/torso counter-motion, blinking, and a 3-hit combo: right swing, left swing, 360° spin finisher (+35% damage).
- **Skins:** 16 hand-built outfits (beanie + backpack, pirate with parrot, astronaut, ninja, warlord, golden king, living-flame Ember, …) in 5 rarity tiers (Common, Rare, Super Rare, Epic, Legendary) with rendered 3D thumbnails. Legendary skins have auras.
- **Powers:** charge-up, fire with smoke and embers, branching lightning with crawling arcs, a boulder that rips out of the floor and lands in a crown of stone spikes, a frost nova of ice spikes, wind blades with swirl trails. Animated showcase models in the shop.
- **CrazyGames:** SDK v3 is loaded only on CrazyGames (gameplay start/stop, happy time, a revive for a rewarded ad once per run). Daily reward with a 7-day streak. `python3 tools/build.py` writes a single-file `dist/index.html` to upload.

## What's new in v3

- **Powers + mastery pass:** after the tutorial you pick Fireball, Lightning Strike or Earth Throw (Frost Nova and Wind Blades are in the shop). Each power has a 20-level mastery pass that every run fills up: damage, cooldown, coins, five big perks and an exclusive skin at level 20. Cast with Q / E / right mouse / the power button on touch.
- **Weapons:** you start with a weak Training Stick. Spiked Club (level 4), Rusty Sword (9), Broken Steel Sword (20), Steel Longsword (30), Ember Blade (40) and Crown Edge (50) are bought in the shop once your player level is high enough.
- **Shop:** upgrades, weapons, powers and 13 skins, all with a rotatable 3D preview before you buy.
- **Register:** every monster and boss with a 3D model, lore and how many you have defeated. Unseen ones stay silhouettes.
- **Argus:** the tower's armoured overseer speaks to you through the intercom, shown live in 3D next to his lines.
- **Pacing:** upgrade cards now come every 5 floors; the floors in between end with a short lift ride. Enemy strength is unchanged.

## What's in it

- **Loop:** a 20–60 s room → upgrade card choice → lift → next floor. Death leads to the results screen and PLAY AGAIN starts a new run in under a second.
- **11 room templates** (randomly mirrored): box, long hall, pillars, cross, storage (breakable coin crates), arena, spike run, corner, ring, twin rooms, spike garden, plus a boss arena. Spike traps are timed and telegraphed, and they hurt enemies too.
- **5 enemies:** Runner (telegraphed bite), Shooter (keeps distance, spreads shots on higher floors), Tank (slam with a ground marker), Dasher (line telegraph, then a charge), Splitter (splits into two minis). Elites appear from floor 12.
- **3 bosses**, one every 10 floors, getting tougher each cycle:
  - **The Warden:** bullet rings, aimed bursts, summons, and a spiral in phase 2.
  - **The Crusher:** jump slam with a tracking-then-locking marker, wall charge that stuns it, shockwave pounds.
  - **The Hunter:** chained dash strikes, knife fans, blink ambush.
- **33 upgrades** in 4 rarities, built for synergies. Blade Wave, Ricochet, Piercing, Hydra, Detonator, Corpse Blast, Echo Strike, Static Charge, Storm Crown, Orbit Blades, Drone Buddy, Razor/Shockwave Dash and more. Cards show NEW and SYNERGY tags, and the pool leans slightly toward cards that fit your build.
- **Combat feel:** hitstop, screen shake (adjustable), knockback, hit flashes, damage numbers, particles. Swings also cut enemy bullets.
- **Meta:** coins are kept between runs. 5 permanent upgrades (Power, Vitality, Reflex, Greed, Fortune = rerolls), 6 cosmetic skins (unlocked with coins, floors, or kills), 12 achievements, account XP and level.
- **Adaptive music:** calm on normal floors, more layers as more enemies are alive, a separate boss loop, and a muffled mix on menus and cards.
- **Save:** localStorage JSON (`onemorefloor.save.v1`). It holds coins, best floor, upgrades, skins, settings and achievements, and is written on every important change and when the tab is hidden.

## Performance

Instanced meshes for coins, bullets, projectiles, shadows and particles (all pooled), no shadow maps, two lights, flat-shaded Lambert materials. Enemy models are pooled, and damage numbers are drawn on a 2D overlay. In Auto quality the resolution drops when frames are slow.

## Code map

| File | Purpose |
|---|---|
| `js/main.js` | boot and main loop |
| `js/game.js` | player, combat, enemies, waves, coins, traps, room flow, run results |
| `js/boss.js` | the three guardians and Argus |
| `js/chests.js`, `js/chestui.js` | chest models, loot tables, the opening screen |
| `js/payments.js` | hook for real-money key packs |
| `js/upgrades.js` | upgrade pool, rarity, stats, icons |
| `js/meta.js` | permanent upgrades, skins, achievements |
| `js/rooms.js` | room templates, collision, line of sight, flow-field pathing |
| `js/world.js` | renderer, camera, room geometry, instanced batches, biomes |
| `js/models.js` | procedural low-poly models |
| `js/fx.js` | particles, swing arcs, rings, lightning, telegraph markers, damage numbers |
| `js/audio.js` | synthesized SFX and adaptive music |
| `js/input.js` | keyboard/mouse, touch, gamepad |
| `js/ui.js` | menus, HUD, cards, results |

A console hook `window.__omf` exposes `game`, `ui`, `save` and the rest for debugging.

## Next steps

- Daily challenge: runs are already seeded (`game.startRun({ seed })`). A date-based seed plus a menu entry would complete it.
- Real-money key packs: connect CrazyGames' payment integration in `js/payments.js` (`payments.provider`).
- More bosses, enemy variants and upgrades.

Credits: three.js (MIT), Big Shoulders Display and Manrope (SIL OFL 1.1, licenses in `lib/` and `fonts/`).
