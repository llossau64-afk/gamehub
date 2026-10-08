# ONE ROAD DOWN

A 3D downhill driving progression game for the browser (CrazyGames, GamePix, Playgama, itch.io).

> You have a terrible car. Get as far down the mountain as you can. Earn money. Upgrade it. Try again.

It's a static HTML5/WebGL build with no build step, no external requests and no binary art or audio assets. Every car, tree, rock, building, texture, engine note and piece of music is generated in code when the game loads. The whole game is about 1 MB, mostly three.js and the two fonts.

## Running it

```bash
cd OneRoadDown
npm start            # serves the folder on http://localhost:8080 (npx http-server)
```

Any static file server works. ES modules need http(s); opening `index.html` from `file://` won't work.

**Publishing.** Zip the contents of `OneRoadDown/` with `index.html` at the zip root. You can leave out `tools/`, `package.json` and this README. To use the CrazyGames SDK, add `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` before the module script in `index.html`. `src/core/platform.js` detects the SDK and then calls `loadingStart/Stop` and `gameplayStart/Stop`, plus `happytime` on a new record. It also mirrors saves to the portal's data module. If the SDK is missing, every call is a no-op.

## Controls

| Action | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Accelerate | W / ↑ | GAS | RT / A |
| Brake / reverse | S / ↓ (hold at standstill to reverse) | BRAKE | LT |
| Steer | A D / ← → | ‹ › | Left stick |
| Handbrake | Space | HANDBRAKE | B |
| Turbo overboost | Shift (needs a turbo) | TURBO | X |
| Camera (chase / far / hood / first person) | C | – | Y |
| Pause | Esc | ❚❚ | Start |
| Retry after a run | R / Enter | RETRY | – |

## The game loop

Garage → select car → start run → drive down the mountain → crash, run out of fuel or wreck the car → get paid → buy upgrades → try again.

- **The mountain.** Hollow Peak is one continuous 25 km road with no levels and no loading between regions: Mountain Village → Forest Road → Rocky Pass → Snow Line → Abandoned Highway → The Cliffs → The Lower Pass → Bottom of the Mountain. Each biome sets the curve style (switchback hairpins, sweepers, highway straights), the grade, the road width, surfaces, hazards, vegetation, light, fog and weather. Neighbouring biomes blend over 350 m. Completing it unlocks **Mountain II – The Canyon**.
- **Road hazards.** Hairpins, braking zones, jumps, potholes, mud, gravel spills, standing water (which aquaplanes), ice, fallen trees, abandoned cars, roadworks, rockfalls, tunnels, bridges, breakable guard rails and cliff edges.
- **Shortcuts.** On some switchbacks a gap in the guard rail lets you drop down the slope to the next leg of the road. Some tight bends have a rough dirt cut across the inside. Hand-painted SHORTCUT signs mark both kinds. They pay a bonus, carry crates, and are dangerous.
- **Pickups.** Cash, fuel cans, small and large repair kits, bonus cash crates and rare part crates. A rare part crate gives a free upgrade level. Fuel cans get further apart the deeper you go.
- **Payout.** You earn money for distance (rising with depth), new records, collected cash, shortcuts, airtime and drifts, and the car's condition. Higher garage levels multiply the payout.

## Vehicles and stats

There are 17 fictional cars, from RUSTY, BRICK and DUSTY up to the VANTA supercar, MAMMOTH monster truck and HALO hypercar. Every number on the garage screen comes out of `src/game/stats.js`, the same model the physics uses:

- **Power and torque** shape a real torque curve. Upgrades raise the rev range when power outgrows torque.
- **Top speed** is the lower of the gearing limit (transmission) and the drag limit (power against drag and rolling resistance), so engine and transmission upgrades need each other.
- **0–100 km/h** comes from a numerical simulation of the drivetrain, traction limit, drag and shift time.
- **Grip** scales tyre friction. Tyre compounds (worn, street, performance, all-terrain, off-road, snow, race) change grip per surface group.
- **Brakes** set deceleration capacity and fade resistance. Level 6 adds ABS.
- **Suspension** sets spring frequency, damping, travel, anti-roll and the landing damage threshold.
- **Durability** sets the damage pool and damage scaling. **Fuel** is tank size. **Weight** is the simulated mass.

There are 11 upgrade categories with 14–20 levels each, and the caps differ per car. Engine, transmission, torque, tyres, brakes, suspension, armour, fuel tank, cooling, turbo and weight reduction all have trade-offs. For example, armour adds weight and drag, a big tank adds weight, a turbo adds heat and lag, and weight reduction weakens the shell. Many upgrades also change the car visibly: exhaust tips, hood scoop, vents, intercooler, bull bar, skid plate, roll cage, side plates, roof cans, carbon panels, caliper colour, tyre tread and strut colour.

## Physics

`src/physics/vehicle.js` is a fixed-step (120 Hz) rigid body with four raycast suspension corners. It includes:

- springs and dampers, bump stops and anti-roll bars
- a load-sensitive tyre model (simplified Pacejka lateral curve with a friction circle) with wheelspin, lockup and a handbrake
- an automatic gearbox and reverse
- turbo spool and overboost, rev limiter and over-rev engine braking
- engine heat, brake fade, fuel burn, aerodynamic drag and optional downforce
- body contact points against the terrain, guard rails (which break on hard hits), tunnel walls and obstacles, including rollovers
- a light stability assist that you can switch off

The terrain is defined relative to the road by one function, `Track.query()`, which blends the profiles of nearby road legs. The physics and the rendered terrain therefore always agree.

**Damage.** Impacts deform the body panels. Bumpers sag and fall off, glass cracks, headlights break, wheels lose alignment, the engine smokes and the paint scratches. Damage also changes how the car drives:

- engine damage cuts power, and critical damage lowers the rev limit and causes misfires
- suspension damage softens the damping
- wheel damage cuts grip and pulls the steering
- brake damage lengthens braking

## Project layout

| Path | Contents |
|---|---|
| `src/main.js` | Boot and loading, state machine, menu showcase, first start, garage tabs, settings, achievements |
| `src/game/run.js` | A run: physics ↔ visuals, camera modes, pickups, hazards, bonuses, audio mix, HUD, payout |
| `src/game/stats.js` | Stats ⇄ physics parameters, top speed solver, 0–100 simulation |
| `src/physics/vehicle.js` | Vehicle simulation and damage model |
| `src/world/track.js` | Road generator (curves, grade, tunnels, bridges, shortcuts, hazards, pickups, signs, props) and terrain queries |
| `src/world/world.js` | Chunk streaming: terrain, road, decals, rails, tunnels, bridges, vegetation, props, obstacles |
| `src/world/env.js` | Sky and clouds, sun and shadows, fog, distant ranges, weather, birds, reflections, lightning |
| `src/models/carModel.js` | Parametric car builder (lofted panels, wheels, engine bay, interior, upgrade parts, dents) |
| `src/models/props.js` | Trees, rocks, signs, houses, ruins, gas station, poles, barriers, pickups |
| `src/scenes/garage.js` | The 3D workshop (5 levels), part focus camera, install animation, starter lineup, roller door |
| `src/audio/audio.js` | Web Audio engines, tyres, surfaces, impacts, ambience and generative music |
| `src/ui/` | DOM UI, HUD and the canvas speedometer |
| `src/data/` | Cars, upgrades and economy, mountains and biomes, achievements |
| `tools/` | Node physics tests (`npm test`) and Playwright browser smoke tests |

## Saving

Progress saves automatically to `localStorage` with a rolling backup copy. It is validated and migrated on load, flushed every few seconds and when the tab is hidden or closed, and mirrored to the portal's cloud storage when it exists. You can reset it from Settings.

## Performance

- Chunks are built ahead of the player one per frame and disposed behind.
- Vegetation, rocks and street furniture are drawn as instanced meshes per chunk.
- There is a single shadow-casting sun with a camera-following shadow frustum.
- Particles are pooled into two draw calls.
- Quality tiers (low, medium, high, auto) set view distance, tree density, shadows, particle counts and pixel ratio. Auto mode also scales the render resolution down when the frame rate drops.

## Testing

```bash
npm test                             # headless physics test: a bot drives several cars down Mountain I
node tools/stats-test.mjs            # stock vs. max stats for every car
node tools/track-test.mjs            # generator statistics for both mountains
node tools/play.mjs <outdir> --fresh # browser smoke test (needs a server on :8080 and Playwright)
```

## Playable build in Claude

`node tools/build-artifact.mjs <out.html>` writes the page for a Claude Artifact (index.html without the document skeleton) and prints the supporting-file map (css, fonts, vendor, src). Every update gets republished to the same artifact URL.
