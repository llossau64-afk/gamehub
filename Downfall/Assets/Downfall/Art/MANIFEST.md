# DOWNFALL art manifest

Generated from the ONE ROAD DOWN sources (`OneRoadDown/assets/models/*.glb`, `assets/textures/*.jpg`, `src/gfx/textures.js` & co.).
Re-create with the scripts described at the end. All runtime lookups go through `Downfall.Mats` (Scripts/Core/Mats.cs).

## Coordinates / import

- FBX written by Blender 5.1 (`import_scene.gltf` -> `export_scene.fbx`, Forward -Z, Up Y, Apply Transform, "FBX All" scaling).
  In Unity (useFileScale on, scale 1) this gives Unity = (-x, y, z) of the glTF data, i.e. the same mirror-x as `Coord.ToUnity`; cars face Unity +z, 1 unit = 1 m, root rotation identity.
- Each top-level glTF node is its own FBX, placed at the origin (JS `register()` / `cloneAsset()` do the same). Node names are unchanged.
- No vertex colours in any GLB. Textures are PNG files next to the models (`Art/Textures/<glb>/`); the WebP originals were decoded losslessly.
- Prefabs: `Resources/Prefabs/<Category>/<name>.prefab`, built by `Downfall/Rebuild Content` (PrefabBuilder) with the registry materials assigned. Load with `Mats.Prefab(jsName)`, `Mats.Car(id)` or `Resources.Load<GameObject>(path)`.
- Read/Write is enabled on Cars, Nature, Buildings meshes (crash deformation, chunk merging); off for Animals/Garage/Props3p.

## Models (131 FBX, 24.8 MB)

### Nature (66)

| JS name | prefab | materials (Resources/Materials/Models/…) |
|---|---|---|
| `pine0_lod0` | Prefabs/Nature/pine0_lod0 | bark_pine, needles_pine |
| `spruce0_lod0` | Prefabs/Nature/spruce0_lod0 | bark_pine, needles_spruce |
| `pine0_lod1` | Prefabs/Nature/pine0_lod1 | bark_pine, needles_pine |
| `spruce0_lod1` | Prefabs/Nature/spruce0_lod1 | bark_pine, needles_spruce |
| `pine1_lod0` | Prefabs/Nature/pine1_lod0 | bark_pine, needles_pine |
| `spruce1_lod0` | Prefabs/Nature/spruce1_lod0 | bark_pine, needles_spruce |
| `pine1_lod1` | Prefabs/Nature/pine1_lod1 | bark_pine, needles_pine |
| `spruce1_lod1` | Prefabs/Nature/spruce1_lod1 | bark_pine, needles_spruce |
| `pine2_lod0` | Prefabs/Nature/pine2_lod0 | bark_pine, needles_pine |
| `spruce2_lod0` | Prefabs/Nature/spruce2_lod0 | bark_pine, needles_spruce |
| `pine2_lod1` | Prefabs/Nature/pine2_lod1 | bark_pine, needles_pine |
| `spruce2_lod1` | Prefabs/Nature/spruce2_lod1 | bark_pine, needles_spruce |
| `oak0_lod0` | Prefabs/Nature/oak0_lod0 | bark_oak, leaves_oak |
| `oak0_autumn_lod0` | Prefabs/Nature/oak0_autumn_lod0 | bark_oak, leaves_autumn |
| `oak0_dry_lod0` | Prefabs/Nature/oak0_dry_lod0 | bark_oak, leaves_dry |
| `birch0_lod0` | Prefabs/Nature/birch0_lod0 | bark_birch, leaves_birch |
| `birch0_autumn_lod0` | Prefabs/Nature/birch0_autumn_lod0 | bark_birch, leaves_autumn |
| `oak0_lod1` | Prefabs/Nature/oak0_lod1 | bark_oak, leaves_oak |
| `oak0_autumn_lod1` | Prefabs/Nature/oak0_autumn_lod1 | bark_oak, leaves_autumn |
| `oak0_dry_lod1` | Prefabs/Nature/oak0_dry_lod1 | bark_oak, leaves_dry |
| `birch0_lod1` | Prefabs/Nature/birch0_lod1 | bark_birch, leaves_birch |
| `birch0_autumn_lod1` | Prefabs/Nature/birch0_autumn_lod1 | bark_birch, leaves_autumn |
| `oak1_lod0` | Prefabs/Nature/oak1_lod0 | bark_oak, leaves_oak |
| `oak1_autumn_lod0` | Prefabs/Nature/oak1_autumn_lod0 | bark_oak, leaves_autumn |
| `oak1_dry_lod0` | Prefabs/Nature/oak1_dry_lod0 | bark_oak, leaves_dry |
| `birch1_lod0` | Prefabs/Nature/birch1_lod0 | bark_birch, leaves_birch |
| `birch1_autumn_lod0` | Prefabs/Nature/birch1_autumn_lod0 | bark_birch, leaves_autumn |
| `oak1_lod1` | Prefabs/Nature/oak1_lod1 | bark_oak, leaves_oak |
| `oak1_autumn_lod1` | Prefabs/Nature/oak1_autumn_lod1 | bark_oak, leaves_autumn |
| `oak1_dry_lod1` | Prefabs/Nature/oak1_dry_lod1 | bark_oak, leaves_dry |
| `birch1_lod1` | Prefabs/Nature/birch1_lod1 | bark_birch, leaves_birch |
| `birch1_autumn_lod1` | Prefabs/Nature/birch1_autumn_lod1 | bark_birch, leaves_autumn |
| `cherry0_lod0` | Prefabs/Nature/cherry0_lod0 | bark_cherry, leaves_cherry |
| `cherry0_lod1` | Prefabs/Nature/cherry0_lod1 | bark_cherry, leaves_cherry |
| `cherry1_lod0` | Prefabs/Nature/cherry1_lod0 | bark_cherry, leaves_cherry |
| `cherry1_lod1` | Prefabs/Nature/cherry1_lod1 | bark_cherry, leaves_cherry |
| `cherry2_lod0` | Prefabs/Nature/cherry2_lod0 | bark_cherry, leaves_cherry |
| `cherry2_lod1` | Prefabs/Nature/cherry2_lod1 | bark_cherry, leaves_cherry |
| `maple0_maple_lod0` | Prefabs/Nature/maple0_maple_lod0 | bark_oak, leaves_maple |
| `cypress0_lod0` | Prefabs/Nature/cypress0_lod0 | bark_pine, needles_cypress |
| `maple0_maple_lod1` | Prefabs/Nature/maple0_maple_lod1 | bark_oak, leaves_maple |
| `cypress0_lod1` | Prefabs/Nature/cypress0_lod1 | bark_pine, needles_cypress |
| `maple1_maple_lod0` | Prefabs/Nature/maple1_maple_lod0 | bark_oak, leaves_maple |
| `cypress1_lod0` | Prefabs/Nature/cypress1_lod0 | bark_pine, needles_cypress |
| `maple1_maple_lod1` | Prefabs/Nature/maple1_maple_lod1 | bark_oak, leaves_maple |
| `cypress1_lod1` | Prefabs/Nature/cypress1_lod1 | bark_pine, needles_cypress |
| `dead0_none_lod0` | Prefabs/Nature/dead0_none_lod0 | bark_oak |
| `dead1_none_lod0` | Prefabs/Nature/dead1_none_lod0 | bark_oak |
| `bush0_oak` | Prefabs/Nature/bush0_oak | leaves_oak |
| `bush0_autumn` | Prefabs/Nature/bush0_autumn | leaves_autumn |
| `bush0_dry` | Prefabs/Nature/bush0_dry | leaves_dry |
| `bush1_oak` | Prefabs/Nature/bush1_oak | leaves_oak |
| `bush1_autumn` | Prefabs/Nature/bush1_autumn | leaves_autumn |
| `bush1_dry` | Prefabs/Nature/bush1_dry | leaves_dry |
| `grass0` | Prefabs/Nature/grass0 | grass_card |
| `grass1` | Prefabs/Nature/grass1 | grass_flowers_card |
| `grass2` | Prefabs/Nature/grass2 | grass_card |
| `fern0` | Prefabs/Nature/fern0 | fern_card |
| `rock0` | Prefabs/Nature/rock0 | rock |
| `rock1` | Prefabs/Nature/rock1 | rock |
| `rock2` | Prefabs/Nature/rock2 | rock |
| `rock3` | Prefabs/Nature/rock3 | rock |
| `rock4` | Prefabs/Nature/rock4 | rock |
| `rock5` | Prefabs/Nature/rock5 | rock |
| `cliffrock0` | Prefabs/Nature/cliffrock0 | rock |
| `cliffrock1` | Prefabs/Nature/cliffrock1 | rock |

### Buildings (12)

| JS name | prefab | materials (Resources/Materials/Models/…) |
|---|---|---|
| `chalet0` | Prefabs/Buildings/chalet0 | b_concrete, b_door, b_flowers, b_metal_roof, b_plaster, b_railing, b_shingle_wood, b_shutter_green, b_stone, b_white, b_window, b_window_lit, b_wood, b_wood_dark, b_wood_h |
| `chalet1` | Prefabs/Buildings/chalet1 | b_concrete, b_door, b_flowers, b_plaster_ochre, b_railing, b_shingle_slate, b_shutter_red, b_stone, b_white, b_window, b_window_lit, b_wood, b_wood_dark |
| `chalet2` | Prefabs/Buildings/chalet2 | b_concrete, b_door, b_flowers, b_metal_roof, b_plaster, b_railing, b_shingle_slate, b_shutter_green, b_stone, b_white, b_window, b_window_lit, b_wood, b_wood_dark, b_wood_h |
| `chalet3` | Prefabs/Buildings/chalet3 | b_concrete, b_door, b_flowers, b_metal_roof, b_plaster, b_stone, b_white, b_window, b_wood, b_wood_dark, b_wood_h |
| `barn0` | Prefabs/Buildings/barn0 | b_shingle_wood, b_stone, b_white, b_window, b_wood, b_wood_dark, b_wood_grey, b_wood_h |
| `chapel0` | Prefabs/Buildings/chapel0 | b_dark, b_door, b_plaster, b_shingle_slate, b_stone, b_white, b_window, b_wood_dark |
| `shack0` | Prefabs/Buildings/shack0 | b_dark, b_metal, b_metal_roof, b_painted_orange, b_white, b_window, b_wood_grey |
| `gasstation0` | Prefabs/Buildings/gasstation0 | b_concrete, b_dark, b_door, b_metal, b_painted_orange, b_painted_white, b_plaster_ochre, b_window_dark |
| `busstop0` | Prefabs/Buildings/busstop0 | b_concrete, b_metal_roof, b_wood, b_wood_dark |
| `pole0` | Prefabs/Buildings/pole0 | b_white, b_wood_dark |
| `fence0` | Prefabs/Buildings/fence0 | b_wood_grey |
| `logpile0` | Prefabs/Buildings/logpile0 | b_wood_dark |

### Cars (30)

JS: `carAsset(id)` (assets.js `registerCars`). File `Models/Cars/car_<id>.fbx`, prefab `Prefabs/Cars/car_<id>`.
Children are `<id>__<part>`: meshes (part = JS `A.parts` key) and anchor empties `<id>__eye`, `<id>__hoodEye`, `<id>__hoodHinge` (JS `A.nodes`).
`<id>__steering` keeps its hub transform (wheel turns about its local z). Wheels are not in the GLB (procedural in carModel.js `buildWheel`).

Car ids: `rusty`, `brick`, `dusty`, `diplomat`, `samurai`, `sparrow`, `nomad`, `mistral`, `wasp`, `mule`, `bulldog`, `stallion`, `falke`, `ronin`, `kestrel`, `rook`, `bauhaus`, `stiletto`, `sidewinder`, `behemoth`, `kaiju`, `volt`, `vanta`, `apex`, `mammoth`, `halo`, `rivale`, `furia`, `zenith`, `lemans`

Parts seen: amber, bed, bedRails, bumperF, bumperR, cabin, doorL, doorR, eye, fascia, fenderFL, fenderFR, gauges, glass, grille, grilleFrame, handles, hood, hoodEye, hoodHinge, interior, lamps, lightL, lightR, mirrorGlass, mirrors, pillars, plateF, plateR, quarterL, quarterR, rearPanel, roof, seals, seats, steering, tail, trunk, under, vents, wells, wipers

GLB material -> registry material (carModel.js `buildAssetBody` matFor, `ArtIndex.CarPartMaterial`):

| GLB material | Mats name |
|---|---|
| car_paint | car_paint_<id> (fenderFR of wear>0.5 cars: car_odd) |
| car_bumper | chrome if model.chrome, else car_paint_<id> if sport body, else car_trim_<id> |
| car_trim | car_trim |
| car_chrome / car_mirror | chrome |
| car_glass | glass |
| car_headlight | headlight |
| car_taillight | taillight |
| car_amber | car_amber |
| car_grille | car_grille |
| car_plate | car_plate_<id> (texture Generated/plate_<id>) |
| car_under / car_wells | car_under |
| car_dash | car_dash |
| car_cabin | car_cabin |
| car_seat | car_seat |
| car_gauges | car_gauges (JS draws the cluster on a canvas each frame - runtime job) |

No-shadow parts (JS noShadow set): glass, lightL, lightR, tail, amber, plateF, plateR, gauges, seals, mirrorGlass, grille, under, cabin.

### Animals (6)

| JS name | prefab | materials (Resources/Materials/Models/…) |
|---|---|---|
| `deer` | Prefabs/Animals/deer | an_deer, an_hoof, an_horn, an_nose |
| `cow` | Prefabs/Animals/cow | an_cow, an_hoof, an_horn, an_nose |
| `sheep` | Prefabs/Animals/sheep | an_hoof, an_nose, an_sheep |
| `boar` | Prefabs/Animals/boar | an_boar, an_hoof, an_horn, an_nose |
| `ibex` | Prefabs/Animals/ibex | an_hoof, an_horn, an_ibex, an_nose |
| `fox` | Prefabs/Animals/fox | fox_material |

Animals `deer, cow, sheep, boar, ibex`: children `<kind>__body`, `<kind>__legFL/FR/RL/RR` (animals.js swings the legs).
`fox` (Khronos sample): prefab root `fox` (identity) -> child `model` scaled 0.0055 (animals.js: modelled in cm) with an Animator
using `Prefabs/Animals/fox.controller`, states `Survey` (default, JS idle), `Walk`, `Run`, all looping. Do NOT scale it again at runtime.
The stray untextured `Icosphere` node of fox.glb was dropped.

### Garage (15)

| JS name | prefab | materials (Resources/Materials/Models/…) |
|---|---|---|
| `g_lift` | Prefabs/Garage/g_lift | g_black, g_blue, g_darksteel, g_red, g_rubber, g_steel |
| `g_toolchest` | Prefabs/Garage/g_toolchest | g_black, g_chrome, g_red, g_rubber, g_steel |
| `g_bench` | Prefabs/Garage/g_bench | g_black, g_blue, g_chrome, g_darksteel, g_engine, g_green, g_oilcan, g_pegboard, g_red, g_steel, g_wood, g_yellow |
| `g_tirerack` | Prefabs/Garage/g_tirerack | g_alu, g_darksteel, g_orange, g_tread |
| `g_shelf` | Prefabs/Garage/g_shelf | g_black, g_cardboard, g_darksteel, g_green, g_oilcan, g_red, g_yellow |
| `g_compressor` | Prefabs/Garage/g_compressor | g_black, g_chrome, g_darksteel, g_gauge, g_red, g_rubber, g_yellow |
| `g_hoist` | Prefabs/Garage/g_hoist | g_chrome, g_darksteel, g_rubber, g_steel, g_yellow |
| `g_engine` | Prefabs/Garage/g_engine | g_alu, g_black, g_engine, g_red, g_rubber, g_steel |
| `g_jack` | Prefabs/Garage/g_jack | g_chrome, g_red, g_rubber, g_steel |
| `g_drums` | Prefabs/Garage/g_drums | g_black, g_blue, g_darksteel, g_green, g_red |
| `g_lounge` | Prefabs/Garage/g_lounge | g_black, g_chrome, g_glass, g_leather, g_red, g_screen |
| `g_bar` | Prefabs/Garage/g_bar | g_black, g_chrome, g_darksteel, g_leather, g_screen, g_wood |
| `g_fixture` | Prefabs/Garage/g_fixture | g_darksteel, g_lamp, g_white |
| `g_podium` | Prefabs/Garage/g_podium | g_black, g_checker, g_chrome |
| `g_stanchions` | Prefabs/Garage/g_stanchions | g_chrome |

### Props3p (2)

| JS name | prefab | materials (Resources/Materials/Models/…) |
|---|---|---|
| `fridge` | Prefabs/Props3p/fridge | ChampagneFoil, ChampagneGlass, ChampagneLabel, FridgeCase, FridgeGlass, FridgeInterior |
| `barnlamp` | Prefabs/Props3p/barnlamp | Lamp_Filament, Lamp_Glass, Lamp_Metal |

Khronos samples (CC-BY 4.0, see CREDITS.md). glTF metallicRoughness maps were converted to Unity metallic(R)/smoothness(A) `*_ms.png`.
Clearcoat / transmission / anisotropy / volume extensions are approximated (glass = transparent Lit). The fridge door animation (Anim_0) is not used by the JS and was not exported.

Nature names: `<tree><variant>[_<leaf>]_lod0/lod1`, `bush<n>_<leaf>`, `grass0-2`, `fern0`, `rock0-5`, `cliffrock0-1`, `dead<n>_none_lod0` — exactly the names world.js passes to `assetParts()`.

### Foliage / alpha (assets.js patchFoliage & register)

- `needles_*`, `leaves_*`, `grass_card`, `grass_flowers_card`, `fern_card`: alpha clip 0.45, two-sided (JS alphaTest 0.45, DoubleSide); textures import with *mip maps preserve coverage* (replaces the JS mip-alpha shader fix).
- `b_railing`, `b_flowers`: alpha clip 0.5. Other BLEND materials (`g_glass`, car glass) are transparent.
- JS-only shader effects NOT reproduced by URP Lit: wind sway (uTime/uWind), world-space snow (uSnow), card camera fade, terrain 7-layer splat/triplanar blend, car paint wear mask (dirt/rust/scratch from `Generated/car_mask`), vertex-colour tinting (`VC()` flag in MatDefs: terrain, rock, foliage, standStruct, tireMarks). These need custom shaders on the runtime side.

## Textures

Keys for `Mats.Tex(key)` = path under Art/Textures without extension (Resources/TexRegistry.asset).

### Terrain/ (copied from assets/textures)

`grass, forest, dirt, gravel, rock, snow, sand` (+ `_n` normal maps; the JS only loads the albedo). JS: `groundTex` / makeTerrainMaterial (uv = world xz * 0.16).

### Model textures

- `nature/`: bark_birch, bark_cherry, bark_oak, bark_pine, fern, grass, grass_flowers, leaves_autumn, leaves_birch, leaves_cherry, leaves_dry, leaves_maple, leaves_oak, needles_cypress, needles_pine, needles_spruce, rock
- `buildings/`: concrete, door, flowers, metal_roof, painted_orange, painted_white, plaster, plaster_ochre, railing, shingle_slate, shingle_wood, shutter_green, shutter_red, stone, window, window_dark, window_lit, wood, wood_dark, wood_grey, wood_h
- `animals/`: boar_tex, cow_tex, deer_tex, ibex_tex, sheep_tex
- `fox/`: fox_material_base
- `garage/`: gt_checker, gt_pegboard, gt_tread, gt_wood
- `props3p/`: ChampagneFoil_normal, ChampagneGlass_normal, ChampagneLabel_base, ChampagneLabel_mr, FridgeCase_base, FridgeCase_mr, FridgeGlass_mr, FridgeInterior_base, FridgeInterior_emissive, FridgeInterior_mr, LampMetal_base, LampMetal_mr, LampMetal_normal, props3p_img11
- `props3p/*_ms`: converted metallic/smoothness maps.

### Generated/ (baked by running the real textures.js functions in headless Chromium)

| file | JS call | wrap |
|---|---|---|
| road_asphalt.png (256x512) | roadTexture('asphalt') | repeat |
| road_damaged.png (256x512) | roadTexture('damaged') | repeat |
| road_gravel.png (256x512) | roadTexture('gravel') | repeat |
| road_dirt.png (256x512) | roadTexture('dirt') | repeat |
| road_snow.png (256x512) | roadTexture('snow') | repeat |
| road_concrete.png (256x512) | roadTexture('concrete') | repeat |
| terrain_detail.png (256x256) | terrainDetail() | repeat |
| rock.png (256x256) | rockTexture() | repeat |
| bark.png (128x256) | barkTexture() | repeat |
| car_mask.png (512x512) | carMask() (linear: R dirt, G rust, B scratches) | repeat |
| crack.png (512x512) | crackTexture() | clamp |
| tire_street.png (64x512) | tireTexture('street') | repeat |
| tire_perf.png (64x512) | tireTexture('perf') | repeat |
| tire_at.png (64x512) | tireTexture('at') | repeat |
| tire_offroad.png (64x512) | tireTexture('offroad') | repeat |
| tire_snow.png (64x512) | tireTexture('snow') | repeat |
| tire_race.png (64x512) | tireTexture('race') | repeat |
| grille.png (256x128) | grilleTexture() | repeat |
| plate_rusty.png (256x64) | plateTexture('WE 173') for car rusty | clamp |
| plate_brick.png (256x64) | plateTexture('HW 413') for car brick | clamp |
| plate_dusty.png (256x64) | plateTexture('ED 279') for car dusty | clamp |
| plate_diplomat.png (256x64) | plateTexture('SE 610') for car diplomat | clamp |
| plate_samurai.png (256x64) | plateTexture('MW 860') for car samurai | clamp |
| plate_sparrow.png (256x64) | plateTexture('AK 948') for car sparrow | clamp |
| plate_nomad.png (256x64) | plateTexture('HH 867') for car nomad | clamp |
| plate_mistral.png (256x64) | plateTexture('FW 616') for car mistral | clamp |
| plate_wasp.png (256x64) | plateTexture('RW 723') for car wasp | clamp |
| plate_mule.png (256x64) | plateTexture('SE 805') for car mule | clamp |
| plate_bulldog.png (256x64) | plateTexture('HD 929') for car bulldog | clamp |
| plate_stallion.png (256x64) | plateTexture('ER 104') for car stallion | clamp |
| plate_falke.png (256x64) | plateTexture('EF 675') for car falke | clamp |
| plate_ronin.png (256x64) | plateTexture('CD 770') for car ronin | clamp |
| plate_kestrel.png (256x64) | plateTexture('AW 570') for car kestrel | clamp |
| plate_rook.png (256x64) | plateTexture('LN 993') for car rook | clamp |
| plate_bauhaus.png (256x64) | plateTexture('ND 345') for car bauhaus | clamp |
| plate_stiletto.png (256x64) | plateTexture('XX 602') for car stiletto | clamp |
| plate_sidewinder.png (256x64) | plateTexture('HS 768') for car sidewinder | clamp |
| plate_behemoth.png (256x64) | plateTexture('ML 970') for car behemoth | clamp |
| plate_kaiju.png (256x64) | plateTexture('ND 182') for car kaiju | clamp |
| plate_volt.png (256x64) | plateTexture('DM 373') for car volt | clamp |
| plate_vanta.png (256x64) | plateTexture('RR 308') for car vanta | clamp |
| plate_apex.png (256x64) | plateTexture('MV 110') for car apex | clamp |
| plate_mammoth.png (256x64) | plateTexture('XM 247') for car mammoth | clamp |
| plate_halo.png (256x64) | plateTexture('RA 940') for car halo | clamp |
| plate_rivale.png (256x64) | plateTexture('PA 623') for car rivale | clamp |
| plate_furia.png (256x64) | plateTexture('SX 995') for car furia | clamp |
| plate_zenith.png (256x64) | plateTexture('WV 458') for car zenith | clamp |
| plate_lemans.png (256x64) | plateTexture('CA 290') for car lemans | clamp |
| soft_sprite.png (64x64) | softSprite() | clamp |
| puddle.png (256x256) | puddleTexture() | clamp |
| mud.png (256x256) | mudTexture() | clamp |
| ice.png (256x256) | iceTexture() | clamp |
| concrete_3_1.png (256x256) | concreteTexture(3, 1) | repeat |
| concrete_4_0.7.png (256x256) | concreteTexture(4, 0.7) | repeat |
| concrete_5_1.35.png (256x256) | concreteTexture(5, 1.35) | repeat |
| concrete_9_1.png (256x256) | concreteTexture(9, 1) | repeat |
| concrete_7_0.25.png (256x256) | concreteTexture(7, 0.25) | repeat |
| concrete_20_0.85.png (256x256) | concreteTexture(20, 0.85) garage floor level 0 | repeat |
| concrete_21_0.85.png (256x256) | concreteTexture(21, 0.85) garage floor level 1 | repeat |
| concrete_22_0.85.png (256x256) | concreteTexture(22, 0.85) garage floor level 2 | repeat |
| concrete_23_1.05.png (256x256) | concreteTexture(23, 1.05) garage floor level 3 | repeat |
| concrete_24_0.55.png (256x256) | concreteTexture(24, 0.55) garage floor level 4 | repeat |
| concrete_25_0.55.png (256x256) | concreteTexture(25, 0.55) garage floor level 5 | repeat |
| oil_stains.png (512x512) | oilStains() | clamp |
| planks_120_92_62.png (256x256) | planksTexture([120, 92, 62]) | repeat |
| planks_82_62_44.png (256x256) | planksTexture([82, 62, 44]) | repeat |
| planks_96_56_44.png (256x256) | planksTexture([96, 56, 44]) | repeat |
| planks_62_64_68.png (256x256) | planksTexture([62, 64, 68]) | repeat |
| planks_150_118_74.png (256x256) | planksTexture([150, 118, 74]) | repeat |
| blocks_132_128_118.png (256x256) | blockWallTexture([132, 128, 118]) | repeat |
| blocks_206_204_198.png (256x256) | blockWallTexture([206, 204, 198]) | repeat |
| corrugated.png (256x256) | corrugatedTexture() | repeat |
| pegboard.png (256x256) | pegboardTexture() | repeat |
| carbon.png (128x128) | carbonTexture() (repeat 6x6) | repeat |
| sign_curveL.png (256x256) | signTexture('curveL') | clamp |
| sign_curveR.png (256x256) | signTexture('curveR') | clamp |
| sign_hairpinL.png (256x256) | signTexture('hairpinL') | clamp |
| sign_hairpinR.png (256x256) | signTexture('hairpinR') | clamp |
| sign_chevL.png (256x256) | signTexture('chevL') | clamp |
| sign_chevR.png (256x256) | signTexture('chevR') | clamp |
| sign_bump.png (256x256) | signTexture('bump') | clamp |
| sign_rockfall.png (256x256) | signTexture('rockfall') | clamp |
| sign_ice.png (256x256) | signTexture('ice') | clamp |
| sign_tunnel.png (256x256) | signTexture('tunnel') | clamp |
| sign_shortcut.png (256x256) | signTexture('shortcut') | clamp |
| sign_km_1.png (256x256) | signTexture('km', '1') | clamp |
| sign_km_2.png (256x256) | signTexture('km', '2') | clamp |
| sign_km_3.png (256x256) | signTexture('km', '3') | clamp |
| sign_km_4.png (256x256) | signTexture('km', '4') | clamp |
| sign_km_5.png (256x256) | signTexture('km', '5') | clamp |
| sign_km_6.png (256x256) | signTexture('km', '6') | clamp |
| sign_km_7.png (256x256) | signTexture('km', '7') | clamp |
| sign_km_8.png (256x256) | signTexture('km', '8') | clamp |
| sign_km_9.png (256x256) | signTexture('km', '9') | clamp |
| sign_km_10.png (256x256) | signTexture('km', '10') | clamp |
| sign_km_11.png (256x256) | signTexture('km', '11') | clamp |
| sign_km_12.png (256x256) | signTexture('km', '12') | clamp |
| sign_km_13.png (256x256) | signTexture('km', '13') | clamp |
| sign_km_14.png (256x256) | signTexture('km', '14') | clamp |
| sign_km_15.png (256x256) | signTexture('km', '15') | clamp |
| sign_km_16.png (256x256) | signTexture('km', '16') | clamp |
| sign_km_17.png (256x256) | signTexture('km', '17') | clamp |
| sign_km_18.png (256x256) | signTexture('km', '18') | clamp |
| sign_km_19.png (256x256) | signTexture('km', '19') | clamp |
| sign_km_20.png (256x256) | signTexture('km', '20') | clamp |
| sign_km_21.png (256x256) | signTexture('km', '21') | clamp |
| sign_km_22.png (256x256) | signTexture('km', '22') | clamp |
| sign_km_23.png (256x256) | signTexture('km', '23') | clamp |
| sign_km_24.png (256x256) | signTexture('km', '24') | clamp |
| sign_km_25.png (256x256) | signTexture('km', '25') | clamp |
| sign_km_26.png (256x256) | signTexture('km', '26') | clamp |
| sign_km_27.png (256x256) | signTexture('km', '27') | clamp |
| sign_km_28.png (256x256) | signTexture('km', '28') | clamp |
| sign_km_29.png (256x256) | signTexture('km', '29') | clamp |
| sign_km_30.png (256x256) | signTexture('km', '30') | clamp |
| sign_region_MOUNTAIN_VILLAGE.png (256x256) | signTexture('region', 'MOUNTAIN VILLAGE') | clamp |
| sign_region_FOREST_ROAD.png (256x256) | signTexture('region', 'FOREST ROAD') | clamp |
| sign_region_ROCKY_PASS.png (256x256) | signTexture('region', 'ROCKY PASS') | clamp |
| sign_region_SNOW_LINE.png (256x256) | signTexture('region', 'SNOW LINE') | clamp |
| sign_region_ABANDONED_HIGHWAY.png (256x256) | signTexture('region', 'ABANDONED HIGHWAY') | clamp |
| sign_region_THE_CLIFFS.png (256x256) | signTexture('region', 'THE CLIFFS') | clamp |
| sign_region_THE_LOWER_PASS.png (256x256) | signTexture('region', 'THE LOWER PASS') | clamp |
| sign_region_BOTTOM_OF_THE_MOUNTAIN.png (256x256) | signTexture('region', 'BOTTOM OF THE MOUNTAIN') | clamp |
| sign_region_MESA_RIM.png (256x256) | signTexture('region', 'MESA RIM') | clamp |
| sign_region_RED_WALLS.png (256x256) | signTexture('region', 'RED WALLS') | clamp |
| sign_region_DUST_HIGHWAY.png (256x256) | signTexture('region', 'DUST HIGHWAY') | clamp |
| sign_region_THE_GORGE.png (256x256) | signTexture('region', 'THE GORGE') | clamp |
| sign_region_DRY_RIVERBED.png (256x256) | signTexture('region', 'DRY RIVERBED') | clamp |
| sign_region_CANYON_FLOOR.png (256x256) | signTexture('region', 'CANYON FLOOR') | clamp |
| noise.png (256x256) | noiseTexture() (linear) | repeat |
| water.png (128x512) | waterTexture() | repeat |
| poster_map.png (256x360) | posterTexture('map') | clamp |
| poster_oil.png (256x360) | posterTexture('oil') | clamp |
| poster_race.png (256x360) | posterTexture('race') | clamp |
| light_glow.png (128x128) | lightGlowTexture() | clamp |
| rim_steel.png (256x256) | rimTexture('steel') | clamp |
| rim_offroad.png (256x256) | rimTexture('offroad') | clamp |
| rim_hubcap.png (256x256) | rimTexture('hubcap') | clamp |
| rim_alloy.png (256x256) | rimTexture('alloy') | clamp |
| rim_rally.png (256x256) | rimTexture('rally') | clamp |
| rim_dish.png (256x256) | rimTexture('dish') | clamp |
| rim_beadlock.png (256x256) | rimTexture('beadlock') | clamp |
| lamp_head.png (256x128) | materials.js lampTextures().head | clamp |
| lamp_head_glow.png (256x128) | lampTextures().headGlow (emissive map) | clamp |
| lamp_tail.png (256x64) | lampTextures().tail | clamp |
| lamp_tail_glow.png (256x64) | lampTextures().tailGlow (emissive map) | clamp |
| crowd.png (512x64) | circuit.js crowdTexture() | U repeat, V clamp |
| banner_BOTTOM_OF_THE_MOUNTAIN.png (1024x128) | world.js signMaterialVillage('BOTTOM OF THE MOUNTAIN') | clamp |
| banner_START_FINISH.png (1024x128) | world.js signMaterialVillage('START · FINISH') | clamp |
| banner_FINISH.png (1024x128) | world.js signMaterialVillage('FINISH') | clamp |
| checker_line.png (256x32) | world.js start/finish line canvas | clamp |
| dealer_sign.png (1024x160) | garage.js 'MONTAGNA  MOTORS' sign | clamp |

`*_h.png` copies (road_*, rock, tire_*) import as normal maps generated from greyscale = three.js `bumpMap`.
Text uses the game font Barlow Condensed (registered as "Barlow Condensed" for the bake, as the canvas code requests).
Not baked: the instrument cluster (carModel.js `drawGauges`, redrawn live), UI canvases (ui.js), km signs > 30.

## Materials (Resources/Materials/)

Definitions: `Scripts/Core/MatDefs.cs` (JS shared materials, hand ported) and `MatDefs.Models.cs` (GLB materials + per-car, generated). `Mats.Get(name)`; editor writes the .mat assets, runtime builds them if missing.
URP Lit / Unlit / Particles-Unlit (fallback Standard / legacy). smoothness = 1 - roughness; emissive = colour x intensity (linear).

| Mats name | JS source |
|---|---|
| terrain | mats.terrain (vertex colours × terrainDetail) |
| rock | mats.rock |
| bark | mats.bark |
| foliage | mats.foliage |
| steel | mats.steel |
| galv | mats.galv |
| rusty | mats.rusty |
| darkSteel | mats.darkSteel |
| wood | mats.wood |
| woodDark | mats.woodDark |
| post | mats.post |
| concrete | mats.concrete |
| concreteDark | mats.concreteDark |
| plaster | mats.plaster |
| roofTile | mats.roofTile |
| roofSlate | mats.roofSlate |
| windowDark | mats.windowDark |
| windowLit | mats.windowLit |
| signBack | mats.signBack |
| redWhite | mats.redWhite |
| orange | mats.orange |
| rubber | mats.rubber |
| plastic | mats.plastic |
| chrome | mats.chrome |
| glass | mats.glass (MeshPhysical, clearcoat 1) |
| crack | mats.crack (opacity animated 0..1) |
| headlight | mats.headlight |
| headlightBroken | mats.headlightBroken |
| taillight | mats.taillight |
| grille | mats.grille |
| carbon | mats.carbon |
| engine | mats.engine |
| engineDark | mats.engineDark |
| interior | mats.interior |
| seat | mats.seat |
| brakeDisc | mats.brakeDisc |
| mud | mats.mud decal |
| puddle | mats.puddle (alphaMap = puddleTexture) |
| ice | mats.ice decal |
| pothole | mats.pothole (alphaMap = puddleTexture) |
| water | mats.water |
| stream | mats.stream |
| cardboard | mats.cardboard |
| crate | mats.crate |
| fuelCan | mats.fuelCan |
| cash | mats.cash |
| repair | mats.repair |
| rare | mats.rare |
| rareTrim | mats.rareTrim |
| tireMarks | mats.tireMarks |
| startLamp | world.js mats.startLamp |
| tunnelLamp | world.js mats.tunnelLamp |
| checkerLine | world.js start/finish chequered line |
| banner_ | world.js signMaterialVillage(text) |
| standStruct | grandstandParts mStruct (vertex colours) |
| crowd | grandstandParts mCrowd |
| kerbRed | kerbParts(true) |
| kerbWhite | kerbParts(false) |
| softSprite | particles.js softSprite() |
| softSpriteAdd | softSprite, additive (sparks) |
| lightGlow | lightGlowTexture() |
| car_trim | assetMats().trim |
| car_amber | assetMats().amber |
| car_grille | assetMats().grille |
| car_under | assetMats().under (also wells) |
| car_dash | assetMats().dash |
| car_cabin | assetMats().cabin |
| car_seat | assetMats().seat |
| car_gauges | gaugeMaterial() (canvas redrawn at runtime) |
| car_paint | makePaint() default (tint per car) |
| car_odd | oddMat (wear > 0.5 cars, fenderFR) |
| car_wells | procedural wheel wells |
| tire_worn | tyre id 'worn' (street, tinted) |
| rim3d_alloy | RIM_3D.alloy |
| rim3d_alloySport | RIM_3D.alloy sportColor |
| rim3d_dish | RIM_3D.dish |
| rim3d_rally | RIM_3D.rally |
| rim3d_beadlock | RIM_3D.beadlock |
| rim3d_offroad | RIM_3D.offroad |
| caliper | wheel caliper (colour set by brake level) |
| oilStains | garage oilStains() |
| blockWall | blockWallTexture([132,128,118]) |
| blockWallLight | blockWallTexture([206,204,198]) |
| corrugated | corrugatedTexture() |
| pegboard | pegboardTexture() |
| garageCeiling | concreteTexture(7, 0.25) |
| dealerSign | garage showroom name sign |
| road_* (12, `MatDefs.RoadBySurf[SURF]`) | mats.road[] |
| sign_<type>, sign_km_1..30, sign_region_<NAME> | signMaterial(type, text) — `MatDefs.RegionSignMaterial(biome.name)` |
| banner_<TEXT>, garageFloor0..5, poster_*, tire_*, rim_*, rim3d_* | see MatDefs.cs |
| car_paint_<id>, car_trim_<id>, car_plate_<id> | per car (makePaint solid/metallic, trimMat, plate) |
| Models/<glb material> | every GLB material (100), e.g. Models/bark_pine, Models/b_stone, Models/g_chrome, Models/fox_material |

Post-processing profile: `Resources/PostProfile.asset` (Bloom 0.55 thr 1, ACES, contrast +6, saturation +8, white balance +4, vignette 0.32).

## Regenerating

Scripts in `Downfall/Tools/art/` (run from a work dir holding matinfo.json / models_report.json / cars_info.json; paths at the top of each): `extract_tex.py` (GLB images -> PNG, MR -> MS), `convert.py` (bpy GLB -> FBX), `bake.html/bake.mjs` (Playwright texture bake),
`gen_cs.py` (MatDefs.Models.cs, ArtIndex.cs), `gen_manifest.py` (this file). In Unity: menu **Downfall/Rebuild Content**.
