// Hand-written part of the material table: the shared materials of the JS game
// (src/gfx/materials.js initMaterials(), carModel.js assetMats()/buildWheel(), circuit.js, garage.js,
// world.js). Names are the JS `mats.<key>` names; roughness/metalness are ported as
// smoothness = 1 - roughness. Texture keys point at Art/Textures/Generated (baked from textures.js).
// Height-derived normal maps ("_h" keys) stand in for three.js bumpMap.
using System.Collections.Generic;
using UnityEngine;

namespace Downfall
{
    public static partial class MatDefs
    {
        static MatDef L(string name, int hex, float rough, float metal = 0f) => new MatDef(name, MatDef.Hex(hex), rough, metal);
        const string G = "Generated/";

        /// <summary>Road material per SURF index (track.js SURF 0..11), same order as JS mats.road[].</summary>
        public static readonly string[] RoadBySurf =
        {
            "road_asphalt", "road_damaged", "road_gravel", "road_dirt", "road_mud", "road_snow",
            "road_ice", "road_grass", "road_rock", "road_water", "road_sand", "road_concrete",
        };

        /// <summary>Tyre texture kind per tyre upgrade id (carModel.js applyUpgrades()).</summary>
        public static string TireKind(string tireId)
        {
            switch (tireId)
            {
                case "perf": case "at": case "offroad": case "snow": case "race": return tireId;
                default: return "street";
            }
        }

        static void AddJs(List<MatDef> l)
        {
            // ---------------------------------------------------------------- roads (u across, v along 16 m)
            MatDef Road(string name, string kind, float rough) => L(name, 0xffffff, rough).Tex(G + "road_" + kind).Normal(G + "road_" + kind + "_h", 0.6f).From("mats.road / roadTexture('" + kind + "')");
            l.Add(Road("road_asphalt", "asphalt", 0.86f));
            l.Add(Road("road_damaged", "damaged", 0.9f));
            l.Add(Road("road_gravel", "gravel", 0.95f));
            l.Add(Road("road_dirt", "dirt", 0.97f));
            l.Add(Road("road_mud", "dirt", 0.97f));
            l.Add(Road("road_snow", "snow", 0.7f));
            l.Add(Road("road_ice", "snow", 0.35f));
            l.Add(Road("road_grass", "dirt", 0.97f));
            l.Add(Road("road_rock", "gravel", 0.95f));
            l.Add(Road("road_water", "asphalt", 0.86f));
            l.Add(Road("road_sand", "dirt", 0.97f));
            l.Add(Road("road_concrete", "concrete", 0.85f));

            // ---------------------------------------------------------------- terrain / nature
            l.Add(L("terrain", 0xffffff, 0.95f).Tex(G + "terrain_detail").VC().From("mats.terrain (vertex colours × terrainDetail)"));
            foreach (var t in new[] { "grass", "forest", "dirt", "gravel", "rock", "snow", "sand" })
                l.Add(L("terrain_" + t, 0xffffff, 0.95f).Tex("Terrain/" + t).Normal("Terrain/" + t + "_n").Tile(0.16f, 0.16f)
                    .From("assets.js makeTerrainMaterial layer t_" + t + " (world uv = xz * 0.16)"));
            l.Add(L("rock", 0xffffff, 0.9f).Tex(G + "rock").Normal(G + "rock_h", 1.2f).VC().From("mats.rock"));
            l.Add(L("bark", 0xb8a690, 0.95f).Tex(G + "bark").From("mats.bark"));
            l.Add(L("foliage", 0xffffff, 0.88f).VC().From("mats.foliage"));

            // ---------------------------------------------------------------- metals / building materials
            l.Add(L("steel", 0x9a9c9e, 0.42f, 0.8f).From("mats.steel"));
            l.Add(L("galv", 0x8e9294, 0.5f, 0.75f).TwoSided().From("mats.galv"));
            l.Add(L("rusty", 0x7d5a40, 0.9f, 0.3f).Tex(G + "concrete_9_1").TwoSided().From("mats.rusty"));
            l.Add(L("darkSteel", 0x2c2e30, 0.55f, 0.7f).From("mats.darkSteel"));
            l.Add(L("wood", 0xffffff, 0.9f).Tex(G + "planks_120_92_62").From("mats.wood"));
            l.Add(L("woodDark", 0xffffff, 0.92f).Tex(G + "planks_82_62_44").From("mats.woodDark"));
            l.Add(L("post", 0x5b4632, 0.95f).Tex(G + "bark").TwoSided().From("mats.post"));
            l.Add(L("concrete", 0xffffff, 0.92f).Tex(G + "concrete_3_1").TwoSided().From("mats.concrete"));
            l.Add(L("concreteDark", 0xffffff, 0.95f).Tex(G + "concrete_4_0.7").TwoSided().From("mats.concreteDark"));
            l.Add(L("plaster", 0xe8e0d0, 0.95f).Tex(G + "concrete_5_1.35").From("mats.plaster"));
            l.Add(L("roofTile", 0xffffff, 0.85f).Tex(G + "planks_96_56_44").From("mats.roofTile"));
            l.Add(L("roofSlate", 0xffffff, 0.8f).Tex(G + "planks_62_64_68").From("mats.roofSlate"));
            l.Add(L("windowDark", 0x1b2328, 0.15f, 0.4f).From("mats.windowDark"));
            l.Add(L("windowLit", 0x3a3428, 0.3f).Emit(0xffc77a, 0.45f).From("mats.windowLit"));
            l.Add(L("signBack", 0x7c7e80, 0.6f, 0.5f).From("mats.signBack"));
            l.Add(L("redWhite", 0xc9c5ba, 0.6f).From("mats.redWhite"));
            l.Add(L("orange", 0xd2621e, 0.55f).From("mats.orange"));
            l.Add(L("rubber", 0x1a1a1b, 0.92f).From("mats.rubber"));
            l.Add(L("plastic", 0x1c1c1c, 0.75f).From("mats.plastic"));
            l.Add(L("chrome", 0xdfe2e5, 0.12f, 1f).From("mats.chrome"));
            l.Add(L("glass", 0x101820, 0.04f, 0.1f).Transparent(0.72f).TwoSided().NoShadows().From("mats.glass (MeshPhysical, clearcoat 1)"));
            l.Add(L("crack", 0xffffff, 1f).Unlit().Tex(G + "crack").Transparent(0f).From("mats.crack (opacity animated 0..1)"));
            l.Add(L("headlight", 0xffffff, 0.12f, 0.55f).Tex(G + "lamp_head").Emit(0xfff1d6, 0.12f, G + "lamp_head_glow").From("mats.headlight"));
            l.Add(L("headlightBroken", 0x2d2c2a, 0.6f).From("mats.headlightBroken"));
            l.Add(L("taillight", 0xffffff, 0.2f, 0.2f).Tex(G + "lamp_tail").Emit(0xff1d10, 0.25f, G + "lamp_tail_glow").From("mats.taillight"));
            l.Add(L("grille", 0xffffff, 0.7f, 0.3f).Tex(G + "grille").From("mats.grille"));
            l.Add(L("carbon", 0xffffff, 0.3f, 0.2f).Tex(G + "carbon").Tile(6f, 6f).From("mats.carbon"));
            l.Add(L("engine", 0x5b5d60, 0.55f, 0.7f).From("mats.engine"));
            l.Add(L("engineDark", 0x232426, 0.65f, 0.5f).From("mats.engineDark"));
            l.Add(L("interior", 0x252322, 0.9f).From("mats.interior"));
            l.Add(L("seat", 0x3a3028, 0.95f).From("mats.seat"));
            l.Add(L("brakeDisc", 0x8a8a88, 0.4f, 0.9f).From("mats.brakeDisc"));
            l.Add(L("mud", 0xffffff, 0.7f).Tex(G + "mud").Transparent().NoShadows().From("mats.mud decal"));
            l.Add(L("puddle", 0x5f6b72, 0.02f, 0.9f).Tex(G + "puddle").Transparent().NoShadows().From("mats.puddle (alphaMap = puddleTexture)"));
            l.Add(L("ice", 0xffffff, 0.05f, 0.3f).Tex(G + "ice").Transparent().NoShadows().From("mats.ice decal"));
            l.Add(L("pothole", 0x1d1c1a, 1f).Tex(G + "puddle").Transparent().NoShadows().From("mats.pothole (alphaMap = puddleTexture)"));
            l.Add(L("water", 0xbcd0d6, 0.1f, 0.2f).Tex(G + "water").Transparent().TwoSided().NoShadows().From("mats.water"));
            l.Add(L("stream", 0x3b4e52, 0.05f, 0.6f).Transparent(0.88f).NoShadows().From("mats.stream"));
            l.Add(L("cardboard", 0x9a7a52, 0.95f).From("mats.cardboard"));
            l.Add(L("crate", 0xffffff, 0.85f).Tex(G + "planks_150_118_74").From("mats.crate"));
            l.Add(L("fuelCan", 0xa8281e, 0.45f, 0.3f).From("mats.fuelCan"));
            l.Add(L("cash", 0x5d7a4a, 0.8f).Emit(0x1d2a10, 0.3f).From("mats.cash"));
            l.Add(L("repair", 0x2c5f8a, 0.5f, 0.2f).From("mats.repair"));
            l.Add(L("rare", 0x38363a, 0.35f, 0.8f).From("mats.rare"));
            l.Add(L("rareTrim", 0xd0a14a, 0.3f, 1f).Emit(0x3a2a08, 0.4f).From("mats.rareTrim"));
            l.Add(L("tireMarks", 0x0a0a0a, 1f).Unlit().Transparent(0.55f).VC().NoShadows().From("mats.tireMarks"));
            l.Add(L("startLamp", 0x220806, 0.4f).Emit(0xff2010, 0.6f).From("world.js mats.startLamp"));
            l.Add(L("tunnelLamp", 0xfff1d0, 0.5f).Emit(0xffd9a0, 2.2f).From("world.js mats.tunnelLamp"));
            l.Add(L("checkerLine", 0xffffff, 0.8f).Tex(G + "checker_line").From("world.js start/finish chequered line"));
            foreach (var b in new[] { "BOTTOM_OF_THE_MOUNTAIN", "START_FINISH", "FINISH" })
                l.Add(L("banner_" + b, 0xffffff, 0.7f).Tex(G + "banner_" + b).From("world.js signMaterialVillage(text)"));

            // ---------------------------------------------------------------- signs (materials.js signMaterial)
            MatDef Sign(string n) => L("sign_" + n, 0xffffff, 0.55f, 0.1f).Tex(G + "sign_" + n).Cut(0.5f).From("signMaterial('" + n + "')");
            foreach (var s in new[] { "curveL", "curveR", "hairpinL", "hairpinR", "chevL", "chevR", "bump", "rockfall", "ice", "tunnel", "shortcut" })
                l.Add(Sign(s));
            for (int km = 1; km <= 30; km++) l.Add(Sign("km_" + km));
            foreach (var r in RegionSigns) l.Add(Sign("region_" + r));

            // ---------------------------------------------------------------- circuit (circuit.js)
            l.Add(L("standStruct", 0xffffff, 0.85f, 0.05f).VC().From("grandstandParts mStruct (vertex colours)"));
            l.Add(L("crowd", 0xffffff, 0.95f).Tex(G + "crowd").TwoSided().From("grandstandParts mCrowd"));
            l.Add(L("kerbRed", 0xc0281e, 0.6f).From("kerbParts(true)"));
            l.Add(L("kerbWhite", 0xe8e6e0, 0.6f).From("kerbParts(false)"));

            // ---------------------------------------------------------------- particles / sprites
            l.Add(L("softSprite", 0xffffff, 1f).Particle().Tex(G + "soft_sprite").Transparent().From("particles.js softSprite()"));
            l.Add(L("softSpriteAdd", 0xffffff, 1f).Particle().Tex(G + "soft_sprite").Additive().From("softSprite, additive (sparks)"));
            l.Add(L("lightGlow", 0xffffff, 1f).Particle().Tex(G + "light_glow").Additive().From("lightGlowTexture()"));

            // ---------------------------------------------------------------- cars: carModel.js assetMats() + GLB defaults
            l.Add(L("car_trim", 0x141415, 0.6f, 0.1f).From("assetMats().trim"));
            l.Add(L("car_amber", 0xc8720e, 0.2f).Emit(0x7a3a00, 0.3f).From("assetMats().amber"));
            l.Add(L("car_grille", 0xffffff, 0.7f, 0.3f).Tex(G + "grille").TwoSided().From("assetMats().grille"));
            l.Add(L("car_under", 0x0b0b0b, 1f).TwoSided().NoShadows().From("assetMats().under (also wells)"));
            l.Add(L("car_dash", 0x1c1d20, 0.7f).Emit(0x1c1d20, 0.9f).TwoSided().From("assetMats().dash"));
            l.Add(L("car_cabin", 0x3a3732, 0.95f).Emit(0x3a3732, 0.55f).TwoSided().NoShadows().From("assetMats().cabin"));
            l.Add(L("car_seat", 0x3a322b, 0.95f).Emit(0x3a322b, 0.5f).TwoSided().From("assetMats().seat"));
            l.Add(L("car_gauges", 0x07080a, 0.35f).Emit(0x07080a, 0.55f).From("gaugeMaterial() (canvas redrawn at runtime)"));
            l.Add(L("car_paint", 0x999999, 0.42f, 0.05f).From("makePaint() default (tint per car)"));
            l.Add(L("car_odd", 0x6f7a72, 0.42f, 0.05f).From("oddMat (wear > 0.5 cars, fenderFR)"));
            l.Add(L("car_wells", 0x0c0c0c, 1f).TwoSided().NoShadows().From("procedural wheel wells"));
            foreach (var k in new[] { "street", "perf", "at", "offroad", "snow", "race" })
                l.Add(L("tire_" + k, 0xffffff, 0.9f).Tex(G + "tire_" + k).Normal(G + "tire_" + k + "_h", 1f).From("buildWheel tireMat / tireTexture('" + k + "')"));
            l.Add(L("tire_worn", 0xb0aca4, 0.9f).Tex(G + "tire_street").Normal(G + "tire_street_h", 1f).From("tyre id 'worn' (street, tinted)"));
            foreach (var s in new[] { "steel", "offroad", "hubcap", "alloy", "rally", "dish", "beadlock" })
                l.Add(L("rim_" + s, 0xffffff, s == "hubcap" || s == "dish" ? 0.18f : 0.35f, 0.85f).Tex(G + "rim_" + s).Cut(0.4f).TwoSided().From("buildWheel rimMat / rimTexture('" + s + "')"));
            l.Add(L("rim3d_alloy", 0xc4c8cc, 0.28f, 0.9f).From("RIM_3D.alloy"));
            l.Add(L("rim3d_alloySport", 0x34373c, 0.28f, 0.9f).From("RIM_3D.alloy sportColor"));
            l.Add(L("rim3d_dish", 0xdcdfe2, 0.14f, 0.95f).From("RIM_3D.dish"));
            l.Add(L("rim3d_rally", 0xe6e6e2, 0.4f, 0.25f).From("RIM_3D.rally"));
            l.Add(L("rim3d_beadlock", 0x1e1f22, 0.5f, 0.6f).From("RIM_3D.beadlock"));
            l.Add(L("rim3d_offroad", 0x2a2b2e, 0.5f, 0.6f).From("RIM_3D.offroad"));
            l.Add(L("caliper", 0x3a3a3a, 0.5f, 0.3f).From("wheel caliper (colour set by brake level)"));

            // ---------------------------------------------------------------- garage (garage.js)
            for (int lv = 0; lv <= 5; lv++)
            {
                string tone = lv >= 4 ? "0.55" : lv >= 3 ? "1.05" : "0.85";
                l.Add(L("garageFloor" + lv, lv >= 5 ? 0x5a5c60 : lv >= 4 ? 0x6a6c70 : 0xffffff, lv >= 5 ? 0.18f : lv >= 4 ? 0.35f : 0.85f)
                    .Tex(G + "concrete_" + (20 + lv) + "_" + tone).From("garage floor level " + lv));
            }
            l.Add(L("oilStains", 0xffffff, 0.9f).Tex(G + "oil_stains").Transparent().NoShadows().From("garage oilStains()"));
            l.Add(L("blockWall", 0xffffff, 0.9f).Tex(G + "blocks_132_128_118").From("blockWallTexture([132,128,118])"));
            l.Add(L("blockWallLight", 0xffffff, 0.9f).Tex(G + "blocks_206_204_198").From("blockWallTexture([206,204,198])"));
            l.Add(L("corrugated", 0xffffff, 0.7f, 0.4f).Tex(G + "corrugated").From("corrugatedTexture()"));
            l.Add(L("pegboard", 0xffffff, 0.9f).Tex(G + "pegboard").From("pegboardTexture()"));
            l.Add(L("garageCeiling", 0xffffff, 0.95f).Tex(G + "concrete_7_0.25").From("concreteTexture(7, 0.25)"));
            foreach (var p in new[] { "map", "oil", "race" })
                l.Add(L("poster_" + p, 0xffffff, 0.9f).Tex(G + "poster_" + p).From("posterTexture('" + p + "')"));
            l.Add(L("dealerSign", 0xffffff, 0.5f).Tex(G + "dealer_sign").Emit(0xffffff, 0.9f, G + "dealer_sign").From("garage showroom name sign"));
        }

        /// <summary>Region sign texture suffixes (biome names, non-alphanumerics → '_').</summary>
        public static readonly string[] RegionSigns =
        {
            "MOUNTAIN_VILLAGE", "FOREST_ROAD", "ROCKY_PASS", "SNOW_LINE", "ABANDONED_HIGHWAY", "THE_CLIFFS", "THE_LOWER_PASS",
            "BOTTOM_OF_THE_MOUNTAIN", "MESA_RIM", "RED_WALLS", "DUST_HIGHWAY", "THE_GORGE", "DRY_RIVERBED", "CANYON_FLOOR",
        };

        /// <summary>"MOUNTAIN VILLAGE" → "sign_region_MOUNTAIN_VILLAGE".</summary>
        public static string RegionSignMaterial(string biomeName) =>
            "sign_region_" + System.Text.RegularExpressions.Regex.Replace(biomeName ?? "", "[^A-Za-z0-9]+", "_");
    }
}
