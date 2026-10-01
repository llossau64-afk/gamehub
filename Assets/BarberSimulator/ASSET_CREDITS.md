# Asset Credits - Barbershop Simulator

## Procedurally generated (original, project-owned, CC0-equivalent)
All files below were generated from scratch by the scripts in `Tools/AssetGen/` (Python: numpy, scipy, Pillow).
No third-party images, samples, or recordings were used. Re-run `Tools/AssetGen/generate_all.sh` to regenerate.

- **Art/Textures/** - tileable albedo/normal textures (checker floor, walnut wood, oak floor, plaster, wallpaper, brick, concrete, asphalt, leather, brushed metal, cardboard, ceiling tiles, fabric) and non-tiling printed/decal textures (fictional magazine covers, hairstyle poster, window gold-leaf decal, sign board, mirror dirt overlay, street silhouettes, passer-by silhouette, door sign). Script: `tex_a.py`, `tex_b.py`, `tex_c.py`. All magazine titles and brands are fictional.
- **UI/Sprites/** - white-on-transparent UI sprites and icons (joystick, circles, rounded rect, vignette, gradients, hand/pause/gear/check/scissors icons, crosshair). Script: `sprites.py`.
- **Audio/UI, Audio/SFX, Audio/Ambience, Audio/Music/** - fully synthesised (noise, filters, FM/additive synthesis); 16-bit PCM mono 22050 Hz. Script: `audio.py`.
- Phase 2 audio (`audio_phase2.py`): clipper_start/loop/stop, clipper_cutting_loop, trimmer_loop, scissor_snip_01-04, comb_01-02, chair_creak, cloth_sit/stand, cape_snap, cash_register, coins, review_good/bad, hair_fall (SFX) and ui_tool_select (UI) - all synthesised.

## Fonts (third-party, SIL Open Font License 1.1)
Obtained from Google Fonts via the npm packages `@expo-google-fonts/dm-serif-display` and `@expo-google-fonts/inter`. License text: `UI/Fonts/OFL.txt`.

| File | Family | Copyright / Source |
|---|---|---|
| UI/Fonts/DMSerifDisplay-Regular.ttf | DM Serif Display | Copyright 2014-2018 Adobe (Source), Copyright 2019 Google LLC; see OFL.txt |
| UI/Fonts/Inter-Regular.ttf, Inter-Medium.ttf, Inter-SemiBold.ttf | Inter | Copyright 2020 The Inter Project Authors; https://github.com/rsms/inter |

The fonts are licensed under the SIL Open Font License, Version 1.1 (https://scripts.sil.org/OFL). Fonts may be bundled and embedded in the game; they must not be sold by themselves.

## Procedural geometry (project-owned)
All architecture, furniture, tool and prop meshes are generated in the editor by `Scripts/Editor/PropFactory.cs`,
`WallBuilder.cs` and `ShopSceneGenerator.cs` using `Scripts/Art/MeshBuilder.cs`. `Art/Textures/barber_pole_albedo.png`
was generated alongside them.

## Characters (project-owned, made in Blender)
`Art/Source/Characters/character_parts.json` (skinned body, head with face, clothing, facial hair, glasses, cap) and
`first_person_arm.json` are modelled procedurally in Blender 4.5 by `Tools/AssetGen/blender/characters.py`
(skin-modifier skeleton + subdivision, sculpted head sphere, clothing shells, automatic bone-heat weights).
`Scripts/Editor/CharacterFactory.cs` turns them into skinned meshes. No scanned, purchased or downloaded models are used.

No external 3D assets are used.
