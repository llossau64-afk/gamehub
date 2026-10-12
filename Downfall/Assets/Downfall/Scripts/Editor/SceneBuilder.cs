using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
#if DOWNFALL_URP
using UnityEngine.Rendering.Universal;
#endif

namespace Downfall.EditorTools
{
    /// <summary>
    /// Creates Assets/Downfall/Scenes/Main.unity: "Game" (Downfall.GameBoot, resolved by name so this compiles
    /// before GameBoot exists), "Main Camera", "Sun" (directional light) and a global post-processing volume,
    /// and puts the scene first in the build settings.
    /// </summary>
    public static class SceneBuilder
    {
        public const string GameBootType = "Downfall.GameBoot, Downfall.Runtime";

        public static void Build()
        {
            DownfallPaths.EnsureFolder(DownfallPaths.Scenes);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var game = new GameObject("Game");
            var type = System.Type.GetType(GameBootType);
            if (type == null)
                foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
                    if ((type = asm.GetType("Downfall.GameBoot")) != null) break;
            if (type != null && typeof(Component).IsAssignableFrom(type)) game.AddComponent(type);
            else Debug.LogWarning("[Downfall] Downfall.GameBoot not found yet; re-run Downfall/Rebuild Content once it exists.");

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 4500f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.66f, 0.72f, 0.77f);
            cam.allowHDR = true;
            cam.allowMSAA = true;
            camGo.AddComponent<AudioListener>();
            camGo.transform.position = new Vector3(0f, 3f, -8f);
#if DOWNFALL_URP
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.None;
#endif

            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.6f;
            sun.color = Color.white;
            sun.shadows = LightShadows.Soft;
            sun.shadowBias = 0.05f;
            sun.shadowNormalBias = 0.4f;
            sunGo.transform.rotation = Quaternion.Euler(45f, -30f, 0f);
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.8f, 0.85f, 0.92f);
            RenderSettings.ambientEquatorColor = new Color(0.55f, 0.55f, 0.55f);
            RenderSettings.ambientGroundColor = new Color(0.27f, 0.27f, 0.27f);
            RenderSettings.fog = false;

#if DOWNFALL_URP
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(ProjectSetup.PostProfilePath);
            if (profile == null) profile = ProjectSetup.BuildPostProfile() as VolumeProfile;
            if (profile != null)
            {
                var volGo = new GameObject("Post Volume");
                var vol = volGo.AddComponent<Volume>();
                vol.isGlobal = true;
                vol.priority = 0f;
                vol.sharedProfile = profile;
            }
#endif
            EditorSceneManager.SaveScene(scene, DownfallPaths.MainScene);
            AddSceneToBuild(DownfallPaths.MainScene);
        }

        public static void AddSceneToBuild(string path)
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            scenes.RemoveAll(s => s.path == path);
            scenes.Insert(0, new EditorBuildSettingsScene(path, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
