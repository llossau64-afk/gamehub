import json, os, re, glob
A = '/home/user/gamehub/Downfall/Assets/Downfall/Art'
rep = json.load(open('models_report.json')); info = json.load(open('matinfo.json')); gen = json.load(open('gen/generated_meta.json'))
cs = open('/home/user/gamehub/Downfall/Assets/Downfall/Scripts/Core/MatDefs.cs').read()
o = []
w = o.append
w('# DOWNFALL art manifest\n')
w('Generated from the ONE ROAD DOWN sources (`OneRoadDown/assets/models/*.glb`, `assets/textures/*.jpg`, `src/gfx/textures.js` & co.).')
w('Re-create with the scripts described at the end. All runtime lookups go through `Downfall.Mats` (Scripts/Core/Mats.cs).\n')
w('## Coordinates / import\n')
w('- FBX written by Blender 5.1 (`import_scene.gltf` -> `export_scene.fbx`, Forward -Z, Up Y, Apply Transform, "FBX All" scaling).')
w('  In Unity (useFileScale on, scale 1) this gives Unity = (-x, y, z) of the glTF data, i.e. the same mirror-x as `Coord.ToUnity`; cars face Unity +z, 1 unit = 1 m, root rotation identity.')
w('- Each top-level glTF node is its own FBX, placed at the origin (JS `register()` / `cloneAsset()` do the same). Node names are unchanged.')
w('- No vertex colours in any GLB. Textures are PNG files next to the models (`Art/Textures/<glb>/`); the WebP originals were decoded losslessly.')
w('- Prefabs: `Resources/Prefabs/<Category>/<name>.prefab`, built by `Downfall/Rebuild Content` (PrefabBuilder) with the registry materials assigned. Load with `Mats.Prefab(jsName)`, `Mats.Car(id)` or `Resources.Load<GameObject>(path)`.')
w('- Read/Write is enabled on Cars, Nature, Buildings meshes (crash deformation, chunk merging); off for Animals/Garage/Props3p.\n')
cats = {}
for x in rep: cats.setdefault(x['category'], []).append(x)
w('## Models (%d FBX, %.1f MB)\n' % (len(rep), sum(x['size'] for x in rep) / 1e6))
for cat, xs in cats.items():
    w('### %s (%d)\n' % (cat, len(xs)))
    if cat == 'Cars':
        w('JS: `carAsset(id)` (assets.js `registerCars`). File `Models/Cars/car_<id>.fbx`, prefab `Prefabs/Cars/car_<id>`.')
        w('Children are `<id>__<part>`: meshes (part = JS `A.parts` key) and anchor empties `<id>__eye`, `<id>__hoodEye`, `<id>__hoodHinge` (JS `A.nodes`).')
        w('`<id>__steering` keeps its hub transform (wheel turns about its local z). Wheels are not in the GLB (procedural in carModel.js `buildWheel`).\n')
        w('Car ids: ' + ', '.join('`%s`' % x['name'] for x in xs) + '\n')
        parts = sorted({n.split('__', 1)[1] for x in xs for n in x['nodes']})
        w('Parts seen: ' + ', '.join(parts) + '\n')
        w('GLB material -> registry material (carModel.js `buildAssetBody` matFor, `ArtIndex.CarPartMaterial`):\n')
        w('| GLB material | Mats name |\n|---|---|')
        for a, b in [('car_paint', 'car_paint_<id> (fenderFR of wear>0.5 cars: car_odd)'), ('car_bumper', 'chrome if model.chrome, else car_paint_<id> if sport body, else car_trim_<id>'),
                     ('car_trim', 'car_trim'), ('car_chrome / car_mirror', 'chrome'), ('car_glass', 'glass'), ('car_headlight', 'headlight'), ('car_taillight', 'taillight'),
                     ('car_amber', 'car_amber'), ('car_grille', 'car_grille'), ('car_plate', 'car_plate_<id> (texture Generated/plate_<id>)'), ('car_under / car_wells', 'car_under'),
                     ('car_dash', 'car_dash'), ('car_cabin', 'car_cabin'), ('car_seat', 'car_seat'), ('car_gauges', 'car_gauges (JS draws the cluster on a canvas each frame - runtime job)')]:
            w('| %s | %s |' % (a, b))
        w('\nNo-shadow parts (JS noShadow set): glass, lightL, lightR, tail, amber, plateF, plateR, gauges, seals, mirrorGlass, grille, under, cabin.\n')
        continue
    w('| JS name | prefab | materials (Resources/Materials/Models/…) |\n|---|---|---|')
    for x in xs:
        base = os.path.splitext(os.path.basename(x['file']))[0]
        w('| `%s` | Prefabs/%s/%s | %s |' % (x['name'], cat, base, ', '.join(re.sub('[^A-Za-z0-9_]+', '_', m) for m in x['materials'])))
    if cat == 'Animals':
        w('\nAnimals `deer, cow, sheep, boar, ibex`: children `<kind>__body`, `<kind>__legFL/FR/RL/RR` (animals.js swings the legs).')
        w('`fox` (Khronos sample): prefab root `fox` (identity) -> child `model` scaled 0.0055 (animals.js: modelled in cm) with an Animator')
        w('using `Prefabs/Animals/fox.controller`, states `Survey` (default, JS idle), `Walk`, `Run`, all looping. Do NOT scale it again at runtime.')
        w('The stray untextured `Icosphere` node of fox.glb was dropped.')
    if cat == 'Props3p':
        w('\nKhronos samples (CC-BY 4.0, see CREDITS.md). glTF metallicRoughness maps were converted to Unity metallic(R)/smoothness(A) `*_ms.png`.')
        w('Clearcoat / transmission / anisotropy / volume extensions are approximated (glass = transparent Lit). The fridge door animation (Anim_0) is not used by the JS and was not exported.')
    w('')
w('Nature names: `<tree><variant>[_<leaf>]_lod0/lod1`, `bush<n>_<leaf>`, `grass0-2`, `fern0`, `rock0-5`, `cliffrock0-1`, `dead<n>_none_lod0` — exactly the names world.js passes to `assetParts()`.\n')
w('### Foliage / alpha (assets.js patchFoliage & register)\n')
w('- `needles_*`, `leaves_*`, `grass_card`, `grass_flowers_card`, `fern_card`: alpha clip 0.45, two-sided (JS alphaTest 0.45, DoubleSide); textures import with *mip maps preserve coverage* (replaces the JS mip-alpha shader fix).')
w('- `b_railing`, `b_flowers`: alpha clip 0.5. Other BLEND materials (`g_glass`, car glass) are transparent.')
w('- JS-only shader effects NOT reproduced by URP Lit: wind sway (uTime/uWind), world-space snow (uSnow), card camera fade, terrain 7-layer splat/triplanar blend, car paint wear mask (dirt/rust/scratch from `Generated/car_mask`), vertex-colour tinting (`VC()` flag in MatDefs: terrain, rock, foliage, standStruct, tireMarks). These need custom shaders on the runtime side.\n')
w('## Textures\n')
w('Keys for `Mats.Tex(key)` = path under Art/Textures without extension (Resources/TexRegistry.asset).\n')
w('### Terrain/ (copied from assets/textures)\n')
w('`grass, forest, dirt, gravel, rock, snow, sand` (+ `_n` normal maps; the JS only loads the albedo). JS: `groundTex` / makeTerrainMaterial (uv = world xz * 0.16).\n')
w('### Model textures\n')
for f, d in info.items():
    if d['images']: w('- `%s/`: %s' % (f, ', '.join(sorted(set(d['images'].values())))))
w('- `props3p/*_ms`: converted metallic/smoothness maps.\n')
w('### Generated/ (baked by running the real textures.js functions in headless Chromium)\n')
w('| file | JS call | wrap |\n|---|---|---|')
def call(n, m):
    if n.startswith('road_'): return "roadTexture('%s')" % n[5:]
    if n.startswith('tire_'): return "tireTexture('%s')" % n[5:]
    if n.startswith('rim_'): return "rimTexture('%s')" % n[4:]
    if n.startswith('plate_'): return "plateTexture('%s') for car %s" % (m.get('text'), n[6:])
    if n.startswith('sign_km_'): return "signTexture('km', '%s')" % n[8:]
    if n.startswith('sign_region_'): return "signTexture('region', '%s')" % m.get('text')
    if n.startswith('sign_'): return "signTexture('%s')" % n[5:]
    if n.startswith('poster_'): return "posterTexture('%s')" % n[7:]
    if n.startswith('concrete_'):
        s, t = n[9:].split('_'); return 'concreteTexture(%s, %s)' % (s, t) + (' garage floor level %d' % m['garageLevel'] if 'garageLevel' in m else '')
    if n.startswith('planks_'): return 'planksTexture([%s])' % n[7:].replace('_', ', ')
    if n.startswith('blocks_'): return 'blockWallTexture([%s])' % n[7:].replace('_', ', ')
    if n.startswith('banner_'): return "world.js signMaterialVillage('%s')" % m.get('text')
    return {'terrain_detail': 'terrainDetail()', 'rock': 'rockTexture()', 'bark': 'barkTexture()', 'car_mask': 'carMask() (linear: R dirt, G rust, B scratches)',
            'crack': 'crackTexture()', 'grille': 'grilleTexture()', 'soft_sprite': 'softSprite()', 'puddle': 'puddleTexture()', 'mud': 'mudTexture()', 'ice': 'iceTexture()',
            'oil_stains': 'oilStains()', 'corrugated': 'corrugatedTexture()', 'pegboard': 'pegboardTexture()', 'carbon': 'carbonTexture() (repeat 6x6)', 'noise': 'noiseTexture() (linear)',
            'water': 'waterTexture()', 'light_glow': 'lightGlowTexture()', 'lamp_head': 'materials.js lampTextures().head', 'lamp_head_glow': 'lampTextures().headGlow (emissive map)',
            'lamp_tail': 'lampTextures().tail', 'lamp_tail_glow': 'lampTextures().tailGlow (emissive map)', 'crowd': 'circuit.js crowdTexture()', 'checker_line': 'world.js start/finish line canvas',
            'dealer_sign': "garage.js 'MONTAGNA  MOTORS' sign"}.get(n, n)
for m in gen:
    n = m['name']
    clamp = m['clamp'] or n.startswith(('lamp_', 'banner_')) or n in ('checker_line', 'dealer_sign')
    w('| %s.png (%dx%d) | %s | %s |' % (n, m['w'], m['h'], call(n, m), 'U repeat, V clamp' if n == 'crowd' else 'clamp' if clamp else 'repeat'))
w('\n`*_h.png` copies (road_*, rock, tire_*) import as normal maps generated from greyscale = three.js `bumpMap`.')
w('Text uses the game font Barlow Condensed (registered as "Barlow Condensed" for the bake, as the canvas code requests).')
w('Not baked: the instrument cluster (carModel.js `drawGauges`, redrawn live), UI canvases (ui.js), km signs > 30.\n')
w('## Materials (Resources/Materials/)\n')
w('Definitions: `Scripts/Core/MatDefs.cs` (JS shared materials, hand ported) and `MatDefs.Models.cs` (GLB materials + per-car, generated). `Mats.Get(name)`; editor writes the .mat assets, runtime builds them if missing.')
w('URP Lit / Unlit / Particles-Unlit (fallback Standard / legacy). smoothness = 1 - roughness; emissive = colour x intensity (linear).\n')
w('| Mats name | JS source |\n|---|---|')
for name, src in re.findall(r'L\("([^"]+)"[^;]*?\.From\("([^"]+)"\)', cs):
    w('| %s | %s |' % (name, src))
w('| road_* (12, `MatDefs.RoadBySurf[SURF]`) | mats.road[] |')
w('| sign_<type>, sign_km_1..30, sign_region_<NAME> | signMaterial(type, text) — `MatDefs.RegionSignMaterial(biome.name)` |')
w('| banner_<TEXT>, garageFloor0..5, poster_*, tire_*, rim_*, rim3d_* | see MatDefs.cs |')
w('| car_paint_<id>, car_trim_<id>, car_plate_<id> | per car (makePaint solid/metallic, trimMat, plate) |')
w('| Models/<glb material> | every GLB material (%d), e.g. Models/bark_pine, Models/b_stone, Models/g_chrome, Models/fox_material |' % sum(len(d['materials']) for d in info.values()))
w('\nPost-processing profile: `Resources/PostProfile.asset` (Bloom 0.55 thr 1, ACES, contrast +6, saturation +8, white balance +4, vignette 0.32).\n')
w('## Regenerating\n')
w('Scripts in `Downfall/Tools/art/` (run from a work dir holding matinfo.json / models_report.json / cars_info.json; paths at the top of each): `extract_tex.py` (GLB images -> PNG, MR -> MS), `convert.py` (bpy GLB -> FBX), `bake.html/bake.mjs` (Playwright texture bake),')
w('`gen_cs.py` (MatDefs.Models.cs, ArtIndex.cs), `gen_manifest.py` (this file). In Unity: menu **Downfall/Rebuild Content**.')
open(f'{A}/MANIFEST.md', 'w').write('\n'.join(o) + '\n')
