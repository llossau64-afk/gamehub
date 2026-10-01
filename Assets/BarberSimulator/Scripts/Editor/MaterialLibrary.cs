using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Every material used by the generated environment, created as URP/Lit assets in Art/Materials.
    /// Regenerating keeps GUIDs, so hand-made tweaks to scene objects keep their material links.
    /// </summary>
    public sealed class MaterialLibrary
    {
        // Architecture
        public Material FloorChecker, WoodDark, WoodFloor, Plaster, Wallpaper, Brick, Concrete, Asphalt, Ceiling, Trim, PaintedWall, Countertop;
        // Furniture & props
        public Material Leather, VinylDark, VinylGreen, Chrome, MetalDark, Brass, Cardboard, Fabric, FabricCream, Ceramic, PlasticBlack, PlasticWhite, PlasticAmber, RegisterBody, Terracotta, Leaf, Soil, Paper, Newsprint, CanRed, BottleGreen, PaintBucket, DustSheet;
        // Special
        public Material Glass, WindowDecal, Mirror, SignBoard, Poster, Magazines, BulbWarm, StreetBackdrop, Passerby, BarberPole, LockedSign, PlasticSheet, ClockFace;
        // Characters (tinted per renderer)
        public Material Skin, Hair, Cloth, Pants, Shoes, Eyes;

        private Shader _lit;
        private Shader _unlit;

        public static MaterialLibrary CreateOrUpdate()
        {
            var lib = new MaterialLibrary();
            lib.Build();
            return lib;
        }

        private void Build()
        {
            _lit = Shader.Find("Universal Render Pipeline/Lit");
            _unlit = Shader.Find("Universal Render Pipeline/Unlit");
            if (_lit == null) Debug.LogError("[Generator] URP Lit shader not found. Is the Universal RP package installed?");

            FloorChecker = Lit("Floor_Checker", Color.white, "floor_checker_albedo.png", "floor_checker_normal.png", 0.42f, 0f, 0.6f);
            WoodDark = Lit("Wood_Dark", Color.white, "wood_dark_albedo.png", "wood_dark_normal.png", 0.45f, 0f, 0.5f);
            WoodFloor = Lit("Wood_Floor", new Color(0.92f, 0.9f, 0.88f), "wood_floor_albedo.png", null, 0.3f);
            Plaster = Lit("Plaster", Color.white, "plaster_wall_albedo.png", null, 0.12f);
            Wallpaper = Lit("Wallpaper", Color.white, "wallpaper_albedo.png", null, 0.18f);
            Brick = Lit("Brick", Color.white, "brick_albedo.png", "brick_normal.png", 0.15f, 0f, 0.8f);
            Concrete = Lit("Concrete", Color.white, "concrete_albedo.png", null, 0.12f);
            Asphalt = Lit("Asphalt", new Color(0.8f, 0.8f, 0.8f), "asphalt_albedo.png", null, 0.2f);
            Ceiling = Lit("Ceiling", Color.white, "ceiling_tiles_albedo.png", null, 0.1f);
            Trim = Lit("Trim_Painted", new Color(0.18f, 0.24f, 0.2f), null, null, 0.35f);
            PaintedWall = Lit("Wall_Painted", new Color(0.62f, 0.6f, 0.55f), "plaster_wall_albedo.png", null, 0.1f);
            Countertop = Lit("Countertop", new Color(0.86f, 0.83f, 0.76f), null, null, 0.55f);

            Leather = Lit("Leather_Oxblood", Color.white, "leather_albedo.png", "leather_normal.png", 0.5f, 0f, 0.5f);
            VinylDark = Lit("Vinyl_Dark", new Color(0.32f, 0.3f, 0.3f), "leather_albedo.png", "leather_normal.png", 0.45f, 0f, 0.4f);
            VinylGreen = Lit("Vinyl_Green", new Color(0.45f, 0.62f, 0.5f), "leather_albedo.png", "leather_normal.png", 0.45f, 0f, 0.4f);
            Chrome = Lit("Chrome", new Color(0.86f, 0.86f, 0.86f), "metal_brushed_albedo.png", null, 0.82f, 1f);
            MetalDark = Lit("Metal_Dark", new Color(0.12f, 0.12f, 0.12f), null, null, 0.45f, 0.6f);
            Brass = Lit("Brass", new Color(0.78f, 0.6f, 0.32f), null, null, 0.7f, 1f);
            Cardboard = Lit("Cardboard", Color.white, "cardboard_albedo.png", null, 0.08f);
            Fabric = Lit("Fabric_White", new Color(0.9f, 0.89f, 0.86f), "fabric_albedo.png", null, 0.05f);
            FabricCream = Lit("Fabric_Cream", new Color(0.82f, 0.74f, 0.6f), "fabric_albedo.png", null, 0.05f);
            Ceramic = Lit("Ceramic", new Color(0.93f, 0.92f, 0.88f), null, null, 0.75f);
            PlasticBlack = Lit("Plastic_Black", new Color(0.05f, 0.05f, 0.05f), null, null, 0.55f);
            PlasticWhite = Lit("Plastic_White", new Color(0.88f, 0.88f, 0.86f), null, null, 0.5f);
            PlasticAmber = Lit("Plastic_Amber", new Color(0.6f, 0.32f, 0.08f), null, null, 0.7f);
            RegisterBody = Lit("Register_Body", new Color(0.55f, 0.5f, 0.42f), "metal_brushed_albedo.png", null, 0.55f, 0.6f);
            Terracotta = Lit("Terracotta", new Color(0.62f, 0.33f, 0.2f), null, null, 0.15f);
            Leaf = Lit("Leaf", new Color(0.33f, 0.42f, 0.2f), null, null, 0.3f);
            Soil = Lit("Soil", new Color(0.18f, 0.12f, 0.08f), null, null, 0.05f);
            Paper = Lit("Paper", new Color(0.88f, 0.86f, 0.8f), null, null, 0.1f);
            Newsprint = Lit("Newsprint", new Color(0.74f, 0.72f, 0.66f), "magazines_atlas.png", null, 0.08f);
            CanRed = Lit("Can_Red", new Color(0.7f, 0.08f, 0.06f), null, null, 0.7f, 0.8f);
            BottleGreen = Lit("Bottle_Green", new Color(0.12f, 0.3f, 0.16f), null, null, 0.9f);
            PaintBucket = Lit("Paint_Bucket", new Color(0.82f, 0.82f, 0.8f), null, null, 0.5f, 0.3f);
            DustSheet = Lit("Dust_Sheet", new Color(0.78f, 0.76f, 0.7f), "fabric_albedo.png", null, 0.05f);

            Glass = Transparent("Glass", new Color(0.7f, 0.78f, 0.78f, 0.18f), null, 0.92f);
            WindowDecal = Transparent("Window_Decal", Color.white, "window_decal.png", 0.6f);
            SignBoard = Lit("Sign_Board", Color.white, "sign_board.png", null, 0.3f);
            Poster = Lit("Poster_Hairstyles", Color.white, "poster_hairstyles.png", null, 0.1f);
            Magazines = Lit("Magazines", Color.white, "magazines_atlas.png", null, 0.25f);
            LockedSign = Lit("Locked_Sign", Color.white, "locked_door_sign.png", null, 0.1f);
            BarberPole = Lit("Barber_Pole", Color.white, "barber_pole_albedo.png", null, 0.6f);
            ClockFace = Lit("Clock_Face", new Color(0.94f, 0.92f, 0.86f), null, null, 0.4f);
            PlasticSheet = Transparent("Plastic_Sheet", new Color(0.9f, 0.92f, 0.9f, 0.35f), null, 0.6f);

            BulbWarm = Lit("Bulb_Warm", new Color(1f, 0.92f, 0.78f), null, null, 0.5f);
            BulbWarm.EnableKeyword("_EMISSION");
            BulbWarm.SetColor("_EmissionColor", new Color(1f, 0.72f, 0.42f) * 4f);
            BulbWarm.globalIlluminationFlags = MaterialGlobalIlluminationFlags.BakedEmissive;

            StreetBackdrop = UnlitTransparent("Street_Backdrop", new Color(0.55f, 0.5f, 0.48f, 1f), "street_silhouettes.png");
            Passerby = UnlitTransparent("Passerby", new Color(0.1f, 0.09f, 0.09f, 0.75f), "person_silhouette.png");

            Mirror = CreateMirror();

            Skin = Lit("Character_Skin", Color.white, null, null, 0.35f);
            Hair = Lit("Character_Hair", Color.white, null, null, 0.3f);
            Cloth = Lit("Character_Cloth", Color.white, "fabric_albedo.png", null, 0.1f);
            Pants = Lit("Character_Pants", Color.white, "fabric_albedo.png", null, 0.12f);
            Shoes = Lit("Character_Shoes", Color.white, null, null, 0.55f);
            Eyes = Lit("Character_Eyes", new Color(0.05f, 0.04f, 0.04f), null, null, 0.9f);

            AssetDatabase.SaveAssets();
        }

        private Material Lit(string name, Color color, string albedo, string normal, float smoothness, float metallic = 0f, float normalStrength = 1f)
        {
            var mat = GetOrCreate(name, _lit);
            mat.SetColor("_BaseColor", color);
            if (!string.IsNullOrEmpty(albedo)) mat.SetTexture("_BaseMap", AssetUtility.Texture(albedo));
            else mat.SetTexture("_BaseMap", null);

            if (!string.IsNullOrEmpty(normal))
            {
                mat.SetTexture("_BumpMap", AssetUtility.Texture(normal));
                mat.SetFloat("_BumpScale", normalStrength);
                mat.EnableKeyword("_NORMALMAP");
            }
            else
            {
                mat.SetTexture("_BumpMap", null);
                mat.DisableKeyword("_NORMALMAP");
            }

            mat.SetFloat("_Smoothness", smoothness);
            mat.SetFloat("_Metallic", metallic);
            mat.SetFloat("_EnvironmentReflections", 1f);
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        private Material Transparent(string name, Color color, string albedo, float smoothness)
        {
            var mat = Lit(name, color, albedo, null, smoothness);
            MakeTransparent(mat);
            return mat;
        }

        private Material UnlitTransparent(string name, Color color, string albedo)
        {
            var mat = GetOrCreate(name, _unlit);
            mat.SetColor("_BaseColor", color);
            mat.SetTexture("_BaseMap", AssetUtility.Texture(albedo));
            MakeTransparent(mat);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        /// <summary>Mirrors what the URP material inspector does when switching Surface Type to Transparent.</summary>
        public static void MakeTransparent(Material mat)
        {
            mat.SetFloat("_Surface", 1f);
            mat.SetFloat("_Blend", 0f);
            mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            if (mat.HasProperty("_SrcBlendAlpha")) mat.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            if (mat.HasProperty("_DstBlendAlpha")) mat.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            mat.SetFloat("_ZWrite", 0f);
            mat.SetFloat("_AlphaClip", 0f);
            mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            mat.DisableKeyword("_ALPHATEST_ON");
            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
            mat.SetOverrideTag("RenderType", "Transparent");
            mat.renderQueue = (int)RenderQueue.Transparent;
            mat.SetShaderPassEnabled("DepthOnly", false);
            mat.SetShaderPassEnabled("ShadowCaster", false);
        }

        private Material CreateMirror()
        {
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(GeneratorPaths.Shaders + "/Mirror.shader");
            if (shader == null) shader = Shader.Find("BarberSimulator/Mirror");
            var mat = GetOrCreate("Mirror", shader != null ? shader : _lit);
            if (shader != null)
            {
                mat.SetTexture("_DirtTex", AssetUtility.Texture("mirror_dirt.png"));
                mat.SetFloat("_DirtStrength", 0.6f);
                mat.SetColor("_Tint", new Color(0.86f, 0.9f, 0.88f));
            }
            EditorUtility.SetDirty(mat);
            return mat;
        }

        private static Material GetOrCreate(string name, Shader shader)
        {
            AssetUtility.EnsureFolder(GeneratorPaths.Materials);
            string path = GeneratorPaths.Materials + "/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(mat, path);
            }
            else if (mat.shader != shader)
            {
                mat.shader = shader;
            }
            return mat;
        }
    }
}
