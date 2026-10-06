# ONE MORE FLOOR

A fast roguelite tower climber for the browser. You fight through a small room, pick one of three upgrade cards and ride the lift up. Then you do it again, as high as you can get.

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
| Dash | Space / Shift / right mouse / K | DASH button | B / RB |
| Pause | Esc / P | Pause button | Start |

On the upgrade screen use 1/2/3 (or arrows + Enter) and R to reroll. On the results screen, Space/Enter starts the next run immediately.

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
| `js/boss.js` | the three bosses |
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
- More bosses, enemy variants and upgrades.

Credits: three.js (MIT), Big Shoulders Display and Manrope (SIL OFL 1.1, licenses in `lib/` and `fonts/`).
