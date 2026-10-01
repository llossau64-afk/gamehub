using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>Menu commands for lighting, validation and the WebGL build (also usable from the command line).</summary>
    public static class BuildTools
    {
        private const string WebGLOutput = "Builds/WebGL";
        /// <summary>Assets/WebGLTemplates/BarberSimulator: loads the CrazyGames SDK and hosts the loading screen.</summary>
        public const string WebGLTemplate = "PROJECT:BarberSimulator";

        [MenuItem("Barber Simulator/Build WebGL", priority = 20)]
        public static void BuildWebGL()
        {
            if (!File.Exists(GeneratorPaths.MainScene)) ShopSceneGenerator.BuildAll();
            PlayerSettings.WebGL.template = WebGLTemplate;
            var options = new BuildPlayerOptions
            {
                scenes = new[] { GeneratorPaths.MainScene },
                locationPathName = WebGLOutput,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            };
            var report = BuildPipeline.BuildPlayer(options);
            var summary = report.summary;
            if (summary.result == BuildResult.Succeeded)
                Debug.Log($"[Barber Simulator] WebGL build succeeded: {WebGLOutput} ({summary.totalSize / (1024f * 1024f):0.0} MB)");
            else
                Debug.LogError($"[Barber Simulator] WebGL build failed with {summary.totalErrors} error(s).");
        }

        /// <summary>Command line: Unity -batchmode -projectPath . -executeMethod BarberSimulator.EditorTools.BuildTools.CommandLineBuild -quit</summary>
        public static void CommandLineBuild()
        {
            ShopSceneGenerator.BuildAll();
            BuildWebGL();
        }

        [MenuItem("Barber Simulator/Bake Lighting (optional)", priority = 21)]
        public static void BakeLighting()
        {
            if (EditorSceneManager.GetActiveScene().path != GeneratorPaths.MainScene)
                EditorSceneManager.OpenScene(GeneratorPaths.MainScene);
            LightingSettings settings = null;
            try { settings = Lightmapping.lightingSettings; }
            catch (System.Exception) { settings = null; } // throws when the scene has none yet
            if (settings == null)
            {
                settings = new LightingSettings { name = "BarbershopLighting" };
                AssetDatabase.CreateAsset(settings, GeneratorPaths.Settings + "/BarbershopLighting.lighting");
                Lightmapping.lightingSettings = settings;
            }
            settings.bakedGI = true;
            settings.realtimeGI = false;
            settings.mixedBakeMode = MixedLightingMode.IndirectOnly;
            settings.lightmapResolution = 12f;
            settings.lightmapMaxSize = 1024;
            settings.directSampleCount = 16;
            settings.indirectSampleCount = 128;
            Lightmapping.BakeAsync();
            Debug.Log("[Barber Simulator] Lightmap bake started (indirect bounce only; direct light stays realtime).");
        }

        [MenuItem("Barber Simulator/Validate Scene", priority = 40)]
        public static void ValidateScene()
        {
            int problems = 0;
            var all = new System.Collections.Generic.List<GameObject>();
            foreach (var root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                    all.Add(t.gameObject);

            foreach (var go in all)
            {
                foreach (var component in go.GetComponents<Component>())
                {
                    if (component == null)
                    {
                        Debug.LogError($"[Validate] Missing script on '{go.name}'", go);
                        problems++;
                    }
                }

                var filter = go.GetComponent<MeshFilter>();
                if (filter != null && filter.sharedMesh == null)
                {
                    Debug.LogError($"[Validate] Missing mesh on '{go.name}'", go);
                    problems++;
                }

                var renderer = go.GetComponent<Renderer>();
                if (renderer != null)
                {
                    foreach (var material in renderer.sharedMaterials)
                    {
                        if (material != null && material.shader != null && material.shader.name != "Hidden/InternalErrorShader") continue;
                        Debug.LogError($"[Validate] Missing or broken material on '{go.name}'", go);
                        problems++;
                        break;
                    }
                }
            }

            if (problems == 0) Debug.Log("[Validate] Scene OK: no missing scripts, meshes or materials.");
            else Debug.LogWarning($"[Validate] {problems} problem(s) found.");
        }
    }
}
