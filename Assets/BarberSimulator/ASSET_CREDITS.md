# Asset Credits - Barbershop Simulator

## Procedurally generated (original, project-owned, CC0-equivalent)
All files below were generated from scratch by the scripts in `Tools/AssetGen/` (Python: numpy, scipy, Pillow).
No third-party images, samples, or recordings were used. Re-run `Tools/AssetGen/generate_all.sh` to regenerate.

- **Art/Textures/** - tileable albedo/normal textures (checker floor, walnut wood, oak floor, plaster, wallpaper, brick, concrete, asphalt, leather, brushed metal, cardboard, ceiling tiles, fabric) and non-tiling printed/decal textures (fictional magazine covers, hairstyle poster, window gold-leaf decal, sign board, mirror dirt overlay, street silhouettes, passer-by silhouette, door sign). Script: `tex_a.py`, `tex_b.py`, `tex_c.py`. All magazine titles and brands are fictional.
- **UI/Sprites/** - white-on-transparent UI sprites and icons (joystick, circles, rounded rect, vignette, gradients, hand/pause/gear/check/scissors icons, crosshair). Script: `sprites.py`.
- **Audio/UI, Audio/SFX, Audio/Ambience, Audio/Music/** - fully synthesised (noise, filters, FM/additive synthesis); 16-bit PCM mono 22050 Hz. Script: `audio.py`.

## Fonts (third-party, SIL Open Font License 1.1)
Obtained from Google Fonts via the npm packages `@expo-google-fonts/dm-serif-display` and `@expo-google-fonts/inter`. License text: `UI/Fonts/OFL.txt`.

| File | Family | Copyright / Source |
|---|---|---|
| UI/Fonts/DMSerifDisplay-Regular.ttf | DM Serif Display | Copyright 2014-2018 Adobe (Source), Copyright 2019 Google LLC; see OFL.txt |
| UI/Fonts/Inter-Regular.ttf, Inter-Medium.ttf, Inter-SemiBold.ttf | Inter | Copyright 2020 The Inter Project Authors; https://github.com/rsms/inter |

The fonts are licensed under the SIL Open Font License, Version 1.1 (https://scripts.sil.org/OFL). Fonts may be bundled and embedded in the game; they must not be sold by themselves.

## Procedural geometry (project-owned)
All 3D meshes (architecture, furniture, tools, props, placeholder characters) are generated in the editor by
`Scripts/Editor/PropFactory.cs`, `CharacterFactory.cs`, `WallBuilder.cs` and `ShopSceneGenerator.cs` using
`Scripts/Art/MeshBuilder.cs`. `Art/Textures/barber_pole_albedo.png` was generated alongside them.
No external 3D assets are used. Characters and props are placeholders intended to be replaced by final art.
