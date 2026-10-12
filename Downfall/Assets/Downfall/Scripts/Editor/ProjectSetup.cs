using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
#if DOWNFALL_URP
using UnityEngine.Rendering.Universal;
#endif

namespace Downfall.EditorTools
{
    /// <summary>
    /// Project configuration done in code: URP pipeline assets per quality level (Low / Medium / High =
    /// the web game's quality presets), linear colour space, the post-processing profile (mirrors
    /// src/gfx/post.js), player settings and the gamepad trigger axes Core/Input.cs reads.
    /// </summary>
    public static class ProjectSetup
    {
        public static readonly string[] TierNames = { "Low", "Medium", "High" };
        public const string PostProfilePath = DownfallPaths.Resources + "/PostProfile.asset"; // Resources.Load<VolumeProfile>("PostProfile")

        // JS presets (main.js / env.js / post.js):
        //   low:    no antialias, no shadows, no post, pixel ratio <= 1
        //   medium: MSAA, PCF soft shadows 1536 px over +-42 m, post on, pixel ratio <= 1.5
        //   high:   MSAA, shadows 2048 px over +-55 m, post on, pixel ratio <= 2, anisotropy 8
        static readonly int[] Msaa = { 1, 4, 4 };
        static readonly bool[] Shadows = { false, true, true };
        static readonly int[] ShadowRes = { 1024, 2048, 2048 };
        static readonly float[] ShadowDist = { 0f, 60f, 80f };
        static readonly bool[] Hdr = { false, true, true };
        static readonly float[] RenderScale = { 1f, 1f, 1f };

        public static void ConfigureAll()
        {
            ConfigurePlayer();
            ConfigureInput();
            var assets = CreatePipelineAssets();
            ConfigureQualityLevels(assets);
            BuildPostProfile();
            AssetDatabase.SaveAssets();
        }

        // ------------------------------------------------------------------ player

        public static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "Downfall";
            PlayerSettings.productName = "DOWNFALL: NO BRAKES";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.defaultWebScreenWidth = 1280;
            PlayerSettings.defaultWebScreenHeight = 720;
        }

        // ------------------------------------------------------------------ input manager

        /// <summary>Adds the trigger axes "Downfall Gas" (RT, 10th axis) and "Downfall Brake" (LT, 9th axis)
        /// used by Core/Input.cs, if missing. Horizontal/Vertical stay the Unity defaults.</summary>
        public static void ConfigureInput()
        {
            var objs = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (objs == null || objs.Length == 0) return;
            var so = new SerializedObject(objs[0]);
            var axes = so.FindProperty("m_Axes");
            if (axes == null) return;
            AddAxis(axes, "Downfall Gas", 9);
            AddAxis(axes, "Downfall Brake", 8);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void AddAxis(SerializedProperty axes, string name, int axis)
        {
            for (int i = 0; i < axes.arraySize; i++)
                if (axes.GetArrayElementAtIndex(i).FindPropertyRelative("m_Name").stringValue == name) return;
            axes.InsertArrayElementAtIndex(axes.arraySize);
            var a = axes.GetArrayElementAtIndex(axes.arraySize - 1);
            a.FindPropertyRelative("m_Name").stringValue = name;
            a.FindPropertyRelative("descriptiveName").stringValue = name;
            a.FindPropertyRelative("descriptiveNegativeName").stringValue = "";
            a.FindPropertyRelative("negativeButton").stringValue = "";
            a.FindPropertyRelative("positiveButton").stringValue = "";
            a.FindPropertyRelative("altNegativeButton").stringValue = "";
            a.FindPropertyRelative("altPositiveButton").stringValue = "";
            a.FindPropertyRelative("gravity").floatValue = 0f;
            a.FindPropertyRelative("dead").floatValue = 0.05f;
            a.FindPropertyRelative("sensitivity").floatValue = 1f;
            a.FindPropertyRelative("snap").boolValue = false;
            a.FindPropertyRelative("invert").boolValue = false;
            a.FindPropertyRelative("type").intValue = 2; // joystick axis
            a.FindPropertyRelative("axis").intValue = axis;
            a.FindPropertyRelative("joyNum").intValue = 0;
        }

        // ------------------------------------------------------------------ URP

        static RenderPipelineAsset[] CreatePipelineAssets()
        {
            var result = new RenderPipelineAsset[3];
#if DOWNFALL_URP
            DownfallPaths.EnsureFolder(DownfallPaths.Settings);
            string rendererPath = DownfallPaths.Settings + "/URP_Renderer.asset";
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                var postData = AssetDatabase.LoadAssetAtPath<PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                if (postData != null) renderer.postProcessData = postData;
                AssetDatabase.CreateAsset(renderer, rendererPath);
            }

            for (int i = 0; i < 3; i++)
            {
                string path = DownfallPaths.Settings + "/URP_" + TierNames[i] + ".asset";
                var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(path);
                if (asset == null)
                {
                    asset = UniversalRenderPipelineAsset.Create(renderer);
                    AssetDatabase.CreateAsset(asset, path);
                }
                asset.renderScale = RenderScale[i];
                asset.supportsHDR = Hdr[i];
                asset.msaaSampleCount = Msaa[i];
                asset.shadowDistance = Shadows[i] ? ShadowDist[i] : 0f;
                asset.shadowCascadeCount = i == 2 ? 2 : 1;

                var so = new SerializedObject(asset);
                SetBool(so, "m_MainLightShadowsSupported", Shadows[i]);
                SetInt(so, "m_MainLightShadowmapResolution", ShadowRes[i]);
                SetBool(so, "m_SoftShadowsSupported", Shadows[i]);
                SetBool(so, "m_AdditionalLightShadowsSupported", false);
                SetInt(so, "m_AdditionalLightsRenderingMode", 1); // per pixel (headlights)
                SetInt(so, "m_AdditionalLightsPerObjectLimit", i == 0 ? 2 : 4);
                SetBool(so, "m_RequireDepthTexture", false);
                SetBool(so, "m_RequireOpaqueTexture", false);
                SetBool(so, "m_SupportsTerrainHoles", false);
                SetInt(so, "m_ColorGradingMode", Hdr[i] ? 1 : 0); // HDR grading when the target is HDR
                SetInt(so, "m_ColorGradingLutSize", 32);
                SetFloat(so, "m_ShadowDepthBias", 0.6f);
                SetFloat(so, "m_ShadowNormalBias", 0.6f);
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(asset);
                result[i] = asset;
            }
            GraphicsSettings.defaultRenderPipeline = result[1];
#else
            Debug.LogWarning("[Downfall] URP package not found (DOWNFALL_URP undefined); keeping the built-in pipeline.");
#endif
            return result;
        }

        static void SetInt(SerializedObject so, string name, int v) { var p = so.FindProperty(name); if (p != null) p.intValue = v; }
        static void SetBool(SerializedObject so, string name, bool v) { var p = so.FindProperty(name); if (p != null) p.boolValue = v; }
        static void SetFloat(SerializedObject so, string name, float v) { var p = so.FindProperty(name); if (p != null) p.floatValue = v; }

        /// <summary>Exactly three quality levels Low / Medium / High, each with its URP asset.</summary>
        static void ConfigureQualityLevels(RenderPipelineAsset[] assets)
        {
            var q = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset");
            if (q == null || q.Length == 0) { Debug.LogWarning("[Downfall] QualitySettings.asset not found"); return; }
            var so = new SerializedObject(q[0]);
            var levels = so.FindProperty("m_QualitySettings");
            if (levels == null) return;
            while (levels.arraySize < 3) levels.InsertArrayElementAtIndex(levels.arraySize);
            while (levels.arraySize > 3) levels.DeleteArrayElementAtIndex(levels.arraySize - 1);
            for (int i = 0; i < 3; i++)
            {
                var l = levels.GetArrayElementAtIndex(i);
                Rel(l, "name", TierNames[i]);
                var rp = l.FindPropertyRelative("customRenderPipeline");
                if (rp != null) rp.objectReferenceValue = assets[i];
                RelI(l, "vSyncCount", 1);
                RelI(l, "antiAliasing", Msaa[i] > 1 ? Msaa[i] : 0);
                RelI(l, "anisotropicTextures", i == 0 ? 1 : 2); // 1 = per texture, 2 = forced on
                RelI(l, "shadows", Shadows[i] ? 2 : 0);
                RelI(l, "shadowResolution", i == 2 ? 2 : 1);
                RelF(l, "shadowDistance", ShadowDist[i]);
                RelF(l, "lodBias", i == 0 ? 0.7f : i == 1 ? 1f : 1.5f);
                RelI(l, "globalTextureMipmapLimit", 0);
                RelI(l, "masterTextureLimit", 0);
                RelI(l, "particleRaycastBudget", 64);
                RelB(l, "softParticles", false);
                RelB(l, "realtimeReflectionProbes", i > 0);
            }
            var cur = so.FindProperty("m_CurrentQuality");
            if (cur != null) cur.intValue = 2;
            var perPlatform = so.FindProperty("m_PerPlatformDefaultQuality");
            if (perPlatform != null)
                for (int i = 0; i < perPlatform.arraySize; i++)
                {
                    var e = perPlatform.GetArrayElementAtIndex(i);
                    var first = e.FindPropertyRelative("first");
                    var second = e.FindPropertyRelative("second");
                    bool mobile = first != null && (first.stringValue == "Android" || first.stringValue == "iPhone");
                    if (second != null) second.intValue = mobile ? 0 : 2;
                }
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void Rel(SerializedProperty p, string n, string v) { var c = p.FindPropertyRelative(n); if (c != null) c.stringValue = v; }
        static void RelI(SerializedProperty p, string n, int v) { var c = p.FindPropertyRelative(n); if (c != null) c.intValue = v; }
        static void RelF(SerializedProperty p, string n, float v) { var c = p.FindPropertyRelative(n); if (c != null) c.floatValue = v; }
        static void RelB(SerializedProperty p, string n, bool v) { var c = p.FindPropertyRelative(n); if (c != null) c.boolValue = v; }

        // ------------------------------------------------------------------ post processing

        /// <summary>post.js defaults: bloom 0.55 (threshold 1.0 on the linear HDR target), ACES,
        /// contrast 1.06, saturation 1.08, vignette 0.32. Saved to Resources/PostProfile.asset.</summary>
        public static Object BuildPostProfile()
        {
#if DOWNFALL_URP
            DownfallPaths.EnsureFolder(DownfallPaths.Resources);
            string path = PostProfilePath;
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null)
            {
                foreach (var sub in AssetDatabase.LoadAllAssetRepresentationsAtPath(path))
                    if (sub is VolumeComponent) Object.DestroyImmediate(sub, true);
                profile.components.Clear();
            }
            else
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, path);
            }

            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.0f);
            bloom.intensity.Override(0.55f);
            bloom.scatter.Override(0.7f);

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0f);
            color.contrast.Override(6f);   // (c - 0.5) * 1.06 + 0.5
            color.saturation.Override(8f); // mix(luma, c, 1.08)

            var white = profile.Add<WhiteBalance>(true);
            white.temperature.Override(4f); // post.js uWarm: warm highlights, cool shadows

            var vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.32f);
            vig.smoothness.Override(0.5f);
            vig.color.Override(Color.black);

            foreach (var c in profile.components)
            {
                c.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                AssetDatabase.AddObjectToAsset(c, profile);
            }
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return profile;
#else
            return null;
#endif
        }
    }
}
