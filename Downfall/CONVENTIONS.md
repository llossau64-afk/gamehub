# DOWNFALL: NO BRAKES — Unity port conventions

The Unity project in `Downfall/` is a port of the browser game in `OneRoadDown/` (three.js).
The JS source is the specification: port behaviour 1:1, same numbers, same seeds.

## Language / API
- Unity 6000.0.47f1, URP 17.0.4, legacy Input Manager (no Input System package), uGUI built in code.
- C# 9, everything in `namespace Downfall` (editor code: `Downfall.EditorTools`).
- The compile check (`cd Downfall/check && dotnet build -nologo -v q`, add `-p:WithEditor=true` for editor
  scripts) uses Unity **2020.3** reference DLLs. Only use APIs that exist in 2020.3 *and* Unity 6.
  - Not available in the refs: `Graphics.RenderMeshInstanced`/`RenderParams` (use `Graphics.DrawMeshInstanced`),
    `FindObjectsByType`/`FindFirstObjectByType` (use `FindObjectOfType`), `Rigidbody.linearVelocity`,
    anything URP. Code that needs URP types goes inside `#if DOWNFALL_URP` (defined by the asmdef
    when com.unity.render-pipelines.universal is present), with a working fallback outside.
  - Do not use `UnityEditor` from runtime scripts (the runtime asmdef can't see it in Unity).
- No third-party packages, no Asset Store content. Everything is generated or ships in this repo.

## Coordinates
- All simulation code (track, physics, AI, race logic) works in the **JS coordinate system**:
  right-handed, y up, cars face +z, +x is the driver's LEFT, heading `hd` = angle around +y.
  Port the math as-is; `UnityEngine.Vector3`/`Quaternion` may be used as plain number containers, but
  never Unity's handedness-dependent helpers (`Quaternion.Euler`, `LookRotation`, `Transform.*`) in sim code.
- Crossing into Unity scene space only through `Core/Coord.cs`: `Coord.ToUnity(v)` mirrors x,
  `Coord.ToUnity(q)` = (x,-y,-z,w), `Coord.Yaw(hd)`, `Coord.ApplyToMesh` (mirrors x and flips winding).
- Track generation uses `double`; physics may use `float`.

## Naming
- JS class → C# class of the same name (`Track`, `Vehicle`, `World`, `Race` …).
- JS method `fooBar()` → `FooBar()`. JS fields keep their exact JS names as public fields
  (`track.px`, `vehicle.pos`, `stats.phys.mass`) so ported code reads like the original.
- JS object literals that are passed around become small classes with the same field names
  (e.g. `TrackQuery` for the `out` object of `track.query`, `CarDef`, `MapDef`, `BiomeDef`).
- Random: `new Rng(seed)` (`r()` → `r.Next()`, `r.range/int/pick/chance` → `Range/Int/Pick/Chance`).
  Noise: `new Noise(seed)`, `N2/Fbm/Ridge`. Helpers: `U.Clamp/Lerp/InvLerp/Smoothstep/Damp/WrapAngle/Hash2`.
  `Math.random()` in JS → `UnityEngine.Random.value` (only where the JS isn't seeded).

## Folders (`Assets/Downfall/`)
- `Scripts/Core` util, coords, save, input · `Scripts/Data` cars, maps, mountains, upgrades, achievements
- `Scripts/World` track, world chunks, environment, props · `Scripts/Physics` vehicle
- `Scripts/Game` stats, ai, run, race, presentation, camera · `Scripts/FX` particles, skids
- `Scripts/Audio` · `Scripts/UI` · `Scripts/Online` · `Scripts/Editor` (first-run setup, importers)
- `Art/Models` (FBX converted from the Blender GLBs) · `Art/Textures` · `Resources/` for runtime-loaded content
