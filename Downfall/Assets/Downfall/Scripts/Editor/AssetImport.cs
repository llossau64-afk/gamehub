using System.IO;
using UnityEditor;
using UnityEngine;

namespace Downfall.EditorTools
{
    /// <summary>Folder and asset locations used by the editor bootstrap.</summary>
    public static class DownfallPaths
    {
        public const string Root = "Assets/Downfall";
        public const string Art = Root + "/Art";
        public const string Models = Art + "/Models";
        public const string Textures = Art + "/Textures";
        public const string Resources = Root + "/Resources";
        public const string Materials = Resources + "/Materials";
        public const string Prefabs = Resources + "/Prefabs";
        public const string Settings = Root + "/Settings";
        public const string Scenes = Root + "/Scenes";
        public const string MainScene = Scenes + "/Main.unity";
        public const string Registry = Resources + "/TexRegistry.asset";

        public static void EnsureFolder(string path)
        {
            path = path.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }

    /// <summary>
    /// Import settings for the converted Blender models (Art/Models) and the textures (Art/Textures).
    /// FBX files were written by Blender with "FBX All" scaling + Apply Transform, so with
    /// useFileScale they import at 1 unit = 1 m with identity root rotation.
    /// </summary>
    public sealed class AssetImport : AssetPostprocessor
    {
        const int Version = 3;
        public override uint GetVersion() => Version;

        static bool InArt(string path, string sub) => path.Replace('\\', '/').StartsWith(DownfallPaths.Art + "/" + sub + "/");

        // ------------------------------------------------------------------ models

        void OnPreprocessModel()
        {
            if (!InArt(assetPath, "Models")) return;
            var mi = (ModelImporter)assetImporter;
            string p = assetPath.Replace('\\', '/');
            bool fox = p.EndsWith("/Animals/fox.fbx");
            // the runtime deforms car panels (crash damage) and merges static meshes into chunks
            bool readable = p.Contains("/Cars/") || p.Contains("/Nature/") || p.Contains("/Buildings/");

            mi.globalScale = 1f;
            mi.useFileScale = true;
            mi.importCameras = false;
            mi.importLights = false;
            mi.importVisibility = false;
            mi.importBlendShapes = false;
            mi.preserveHierarchy = false;
            mi.sortHierarchyByName = false;
            mi.generateSecondaryUV = false;
            mi.isReadable = readable;
            mi.meshCompression = ModelImporterMeshCompression.Off;
            mi.optimizeMeshPolygons = true;
            mi.optimizeMeshVertices = true;
            mi.weldVertices = true;
            mi.importNormals = ModelImporterNormals.Import;
            mi.importTangents = ModelImporterTangents.CalculateMikk;
            mi.addCollider = false;
            mi.swapUVChannels = false;
            // materials: embedded (named after the Blender materials); the prefab builder swaps them
            // for the registry materials in Resources/Materials.
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
            mi.materialLocation = ModelImporterMaterialLocation.InPrefab;

            if (fox)
            {
                mi.animationType = ModelImporterAnimationType.Generic;
                mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                mi.importAnimation = true;
                mi.optimizeGameObjects = false;
                mi.animationCompression = ModelImporterAnimationCompression.KeyframeReduction;
                mi.resampleCurves = true;
            }
            else
            {
                mi.animationType = ModelImporterAnimationType.None;
                mi.importAnimation = false;
            }
        }

        void OnPreprocessAnimation()
        {
            if (!InArt(assetPath, "Models")) return;
            var mi = (ModelImporter)assetImporter;
            var clips = mi.defaultClipAnimations;
            if (clips == null || clips.Length == 0) return;
            foreach (var c in clips)
            {
                // Blender names takes "<object>|<action>": keep the glTF action names Survey / Walk / Run
                string n = c.name;
                int bar = n.LastIndexOf('|');
                if (bar >= 0) n = n.Substring(bar + 1);
                c.name = n;
                c.loopTime = true;
                c.loopPose = false;
                c.wrapMode = WrapMode.Loop;
            }
            mi.clipAnimations = clips;
        }

        // ------------------------------------------------------------------ textures

        static readonly string[] ClampNames =
        {
            "crack", "soft_sprite", "puddle", "mud", "ice", "oil_stains", "light_glow", "checker_line", "dealer_sign",
        };
        static readonly string[] ClampPrefixes = { "plate_", "sign_", "poster_", "rim_", "lamp_", "banner_" };
        static readonly string[] CoverageNames = { "leaves_", "needles_", "grass", "fern", "flowers", "railing" };

        void OnPreprocessTexture()
        {
            if (!InArt(assetPath, "Textures")) return;
            var ti = (TextureImporter)assetImporter;
            string p = assetPath.Replace('\\', '/');
            string file = Path.GetFileNameWithoutExtension(p);
            string folder = Path.GetFileName(Path.GetDirectoryName(p));
            bool generated = folder == "Generated";
            bool terrain = folder == "Terrain";

            bool normal = file.EndsWith("_normal") || (terrain && file.EndsWith("_n"));
            bool height = generated && file.EndsWith("_h");
            bool linear = file == "car_mask" || file == "noise" || file.EndsWith("_mr") || file.EndsWith("_ms");

            ti.textureType = normal || height ? TextureImporterType.NormalMap : TextureImporterType.Default;
            ti.textureShape = TextureImporterShape.Texture2D;
            ti.sRGBTexture = !(normal || height || linear);
            ti.convertToNormalmap = height;
            if (height)
            {
                // three.js bumpScale: roads 0.6, rock 1.2, tyres 2
                ti.heightmapScale = file.StartsWith("tire_") ? 0.12f : file.StartsWith("rock") ? 0.1f : 0.05f;
                ti.normalmapFilter = TextureImporterNormalFilter.Sobel;
            }
            ti.alphaSource = normal || height ? TextureImporterAlphaSource.None : TextureImporterAlphaSource.FromInput;
            ti.alphaIsTransparency = !normal && !height && !linear && p.EndsWith(".png");
            ti.mipmapEnabled = true;
            ti.mipmapFilter = TextureImporterMipFilter.KaiserFilter;

            // foliage cards: keep alpha-test coverage over the mip chain (the JS does this in the shader)
            bool coverage = false;
            foreach (var c in CoverageNames) if (file.StartsWith(c)) coverage = true;
            ti.mipMapsPreserveCoverage = coverage && !terrain;
            ti.alphaTestReferenceValue = file.StartsWith("flowers") || file.StartsWith("railing") ? 0.5f : 0.45f;

            bool clamp = System.Array.IndexOf(ClampNames, file) >= 0;
            foreach (var c in ClampPrefixes) if (generated && file.StartsWith(c)) clamp = true;
            if (generated && file == "crowd")
            {
                ti.wrapModeU = TextureWrapMode.Repeat;
                ti.wrapModeV = TextureWrapMode.Clamp;
                ti.wrapModeW = TextureWrapMode.Clamp;
            }
            else ti.wrapMode = generated && clamp ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;

            bool ground = terrain || file.StartsWith("road_");
            ti.anisoLevel = ground ? 8 : 4;
            ti.filterMode = FilterMode.Trilinear;
            ti.maxTextureSize = 1024;
            bool text = generated && (file.StartsWith("plate_") || file.StartsWith("sign_") || file.StartsWith("banner_") || file.StartsWith("poster_") || file == "dealer_sign");
            ti.textureCompression = text ? TextureImporterCompression.CompressedHQ : TextureImporterCompression.Compressed;
            ti.npotScale = TextureImporterNPOTScale.None;
        }
    }
}
