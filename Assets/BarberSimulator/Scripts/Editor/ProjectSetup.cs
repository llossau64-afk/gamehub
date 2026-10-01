using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Project-level configuration that would otherwise be manual clicking: URP assets per quality tier, the three
    /// quality levels, WebGL player settings, import settings for textures/sprites/audio and post-processing.
    /// </summary>
    public static class ProjectSetup
    {
        private static readonly string[] TierNames = { "Low", "Medium", "High" };

        public static void ConfigureAll()
        {
            ConfigureImporters();
            var assets = CreatePipelineAssets();
            ConfigureQualityLevels(assets);
            ConfigurePlayer();
            AssetDatabase.SaveAssets();
        }

        // ------------------------------------------------------------------ Import settings

        public static void ConfigureImporters()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { GeneratorPaths.Textures }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = (TextureImporter)AssetImporter.GetAtPath(path);
                if (importer == null) continue;
                bool normal = path.EndsWith("_normal.png");
                bool decal = path.Contains("window_decal") || path.Contains("silhouette") || path.Contains("mirror_dirt");
                importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.sRGBTexture = !normal;
                importer.alphaSource = decal ? TextureImporterAlphaSource.FromInput : TextureImporterAlphaSource.None;
                importer.alphaIsTransparency = decal;
                importer.mipmapEnabled = true;
                importer.wrapMode = decal || path.Contains("sign_board") || path.Contains("poster") || path.Contains("magazines") ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
                importer.anisoLevel = path.Contains("floor") ? 4 : 1;
                importer.maxTextureSize = 1024;
                importer.textureCompression = TextureImporterCompression.Compressed;
                var webgl = importer.GetPlatformTextureSettings("WebGL");
                webgl.overridden = true;
                webgl.maxTextureSize = path.Contains("floor") || path.Contains("brick") || path.Contains("wood_dark") ? 1024 : 512;
                webgl.format = TextureImporterFormat.Automatic;
                webgl.textureCompression = TextureImporterCompression.Compressed;
                importer.SetPlatformTextureSettings(webgl);
                importer.SaveAndReimport();
            }

            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { GeneratorPaths.UISprites }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = (TextureImporter)AssetImporter.GetAtPath(path);
                if (importer == null) continue;
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.alphaIsTransparency = true;
                importer.mipmapEnabled = false;
                importer.wrapMode = TextureWrapMode.Clamp;
                importer.textureCompression = TextureImporterCompression.Uncompressed;
                importer.spritePixelsPerUnit = 100f;
                if (path.EndsWith("rounded_rect.png")) importer.spriteBorder = new Vector4(14f, 14f, 14f, 14f);
                importer.SaveAndReimport();
            }

            foreach (var guid in AssetDatabase.FindAssets("t:AudioClip", new[] { GeneratorPaths.Audio }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = (AudioImporter)AssetImporter.GetAtPath(path);
                if (importer == null) continue;
                bool longClip = path.Contains("/Music/") || path.Contains("/Ambience/");
                importer.forceToMono = true;
                importer.loadInBackground = longClip;
                var settings = importer.defaultSampleSettings;
                settings.compressionFormat = AudioCompressionFormat.Vorbis;
                settings.quality = longClip ? 0.45f : 0.6f;
                settings.loadType = longClip ? AudioClipLoadType.CompressedInMemory : AudioClipLoadType.DecompressOnLoad;
                settings.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
                importer.defaultSampleSettings = settings;
                importer.SaveAndReimport();
            }
        }

        // ------------------------------------------------------------------ URP

        private static RenderPipelineAsset[] CreatePipelineAssets()
        {
            AssetUtility.EnsureFolder(GeneratorPaths.Settings);
            string rendererPath = GeneratorPaths.Settings + "/URP_Renderer.asset";
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                var postData = AssetDatabase.LoadAssetAtPath<PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                if (postData != null) renderer.postProcessData = postData;
                AssetDatabase.CreateAsset(renderer, rendererPath);
            }

            var result = new RenderPipelineAsset[3];
            for (int i = 0; i < 3; i++)
            {
                string path = GeneratorPaths.Settings + "/URP_" + TierNames[i] + ".asset";
                var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
                if (asset == null)
                {
                    asset = UniversalRenderPipelineAsset.Create(renderer);
                    AssetDatabase.CreateAsset(asset, path);
                }

                asset.renderScale = 1f;
                asset.supportsHDR = i == 2;
                asset.msaaSampleCount = i == 0 ? 1 : 4;
                asset.shadowDistance = i == 0 ? 12f : i == 1 ? 20f : 28f;
                asset.shadowCascadeCount = 1;

                var so = new SerializedObject(asset);
                SetInt(so, "m_MainLightShadowmapResolution", i == 0 ? 1024 : i == 1 ? 2048 : 2048);
                SetBool(so, "m_MainLightShadowsSupported", true);
                SetBool(so, "m_AdditionalLightShadowsSupported", false);
                SetInt(so, "m_AdditionalLightsRenderingMode", 1); // per pixel
                SetInt(so, "m_AdditionalLightsPerObjectLimit", i == 0 ? 2 : 4);
                SetBool(so, "m_SoftShadowsSupported", i > 0);
                SetBool(so, "m_RequireDepthTexture", false);
                SetBool(so, "m_RequireOpaqueTexture", false);
                SetBool(so, "m_SupportsTerrainHoles", false);
                SetInt(so, "m_ColorGradingMode", 0); // LDR grading is cheaper and fine for this look
                SetInt(so, "m_ColorGradingLutSize", 16);
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(asset);
                result[i] = asset;
            }

            GraphicsSettings.defaultRenderPipeline = result[1];
            return result;
        }

        private static void SetInt(SerializedObject so, string name, int value)
        {
            var p = so.FindProperty(name);
            if (p != null) p.intValue = value;
        }

        private static void SetBool(SerializedObject so, string name, bool value)
        {
            var p = so.FindProperty(name);
            if (p != null) p.boolValue = value;
        }

        /// <summary>Rewrites the quality level list to exactly Low / Medium / High, each with its URP asset.</summary>
        private static void ConfigureQualityLevels(RenderPipelineAsset[] assets)
        {
            var qualityAsset = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset");
            if (qualityAsset == null || qualityAsset.Length == 0)
            {
                Debug.LogWarning("[Setup] Could not open QualitySettings; assign URP assets to quality levels manually.");
                return;
            }

            var so = new SerializedObject(qualityAsset[0]);
            var levels = so.FindProperty("m_QualitySettings");
            if (levels == null) return;
            while (levels.arraySize < 3) levels.InsertArrayElementAtIndex(levels.arraySize);
            while (levels.arraySize > 3) levels.DeleteArrayElementAtIndex(levels.arraySize - 1);

            for (int i = 0; i < 3; i++)
            {
                var level = levels.GetArrayElementAtIndex(i);
                level.FindPropertyRelative("name").stringValue = TierNames[i];
                var rp = level.FindPropertyRelative("customRenderPipeline");
                if (rp != null) rp.objectReferenceValue = assets[i];
                var vsync = level.FindPropertyRelative("vSyncCount");
                if (vsync != null) vsync.intValue = 0;
                var lodBias = level.FindPropertyRelative("lodBias");
                if (lodBias != null) lodBias.floatValue = i == 0 ? 0.7f : i == 1 ? 1f : 1.5f;
                var aniso = level.FindPropertyRelative("anisotropicTextures");
                if (aniso != null) aniso.intValue = i == 0 ? 0 : 1;
                var probes = level.FindPropertyRelative("realtimeReflectionProbes");
                if (probes != null) probes.boolValue = true;
                var particles = level.FindPropertyRelative("particleRaycastBudget");
                if (particles != null) particles.intValue = 64;
            }

            var current = so.FindProperty("m_CurrentQuality");
            if (current != null) current.intValue = 1;

            // Default tier per platform; the game refines it at runtime from device hints.
            var perPlatform = so.FindProperty("m_PerPlatformDefaultQuality");
            if (perPlatform != null)
            {
                for (int i = 0; i < perPlatform.arraySize; i++)
                {
                    var entry = perPlatform.GetArrayElementAtIndex(i);
                    var second = entry.FindPropertyRelative("second");
                    if (second != null) second.intValue = 1;
                }
            }
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // ------------------------------------------------------------------ Player

        private static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "BarberSimulatorStudio";
            PlayerSettings.productName = "Barbershop Simulator";
            PlayerSettings.bundleVersion = "0.1.0";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.template = BuildTools.WebGLTemplate;
            PlayerSettings.defaultWebScreenWidth = 1280;
            PlayerSettings.defaultWebScreenHeight = 720;
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.WebGL, ManagedStrippingLevel.Low);

            // WebGL 2 only (needed for linear colour space and URP).
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });
        }

        public static void AddSceneToBuild(string scenePath)
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            scenes.RemoveAll(s => s.path == scenePath);
            scenes.Insert(0, new EditorBuildSettingsScene(scenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
