using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace GuessTheAnswer.EditorTools
{
    /// <summary>
    /// One-click project configuration, also run automatically the first time the project opens:
    /// creates the Bootstrap scene, registers it in the build settings and applies the WebGL player settings.
    /// Everything else (managers, UI) is created at runtime by GameBootstrap, so the scene stays tiny.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        public const string ScenePath = "Assets/GuessTheAnswer/Scenes/Bootstrap.unity";
        const string DoneKey = "GuessTheAnswer.SetupDone.v1";

        static ProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                if (!File.Exists(ScenePath) || !EditorPrefs.GetBool(DoneKey + "." + Application.dataPath, false)) Run(false);
            };
        }

        [MenuItem("Guess The Answer/Setup Project", priority = 0)]
        public static void SetupMenu()
        {
            Run(true);
        }

        public static void Run(bool interactive)
        {
            CreateBootstrapScene();
            ApplyBuildSettings();
            ApplyPlayerSettings();
            AssetDatabase.SaveAssets();
            EditorPrefs.SetBool(DoneKey + "." + Application.dataPath, true);
            Debug.Log("[Guess The Answer] Project set up. Open " + ScenePath + " and press Play.");
            if (interactive) EditorUtility.DisplayDialog("Guess The Answer", "Project set up.\n\nScene: " + ScenePath + "\nPress Play to start the game.", "OK");
        }

        static void CreateBootstrapScene()
        {
            if (File.Exists(ScenePath)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            if (SceneManager.GetActiveScene().isDirty && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cameraGo = new GameObject("Main Camera");
            cameraGo.tag = "MainCamera";
            var camera = cameraGo.AddComponent<Camera>();
            // The UI draws in overlay canvases; the camera only clears the screen with the background colour.
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.055f, 0.067f, 0.125f, 1f);
            camera.cullingMask = 0;
            camera.orthographic = true;
            camera.allowHDR = false;
            camera.allowMSAA = false;
            cameraGo.AddComponent<AudioListener>();

            var note = new GameObject("README - the game is created at runtime by GameBootstrap");
            note.hideFlags = HideFlags.None;

            EditorSceneManager.SaveScene(scene, ScenePath);
            SceneManager.SetActiveScene(scene);
        }

        static void ApplyBuildSettings()
        {
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void ApplyPlayerSettings()
        {
            PlayerSettings.companyName = "GuessTheAnswerStudio";
            PlayerSettings.productName = "Guess the Answer";
            if (string.IsNullOrEmpty(PlayerSettings.bundleVersion) || PlayerSettings.bundleVersion == "0.1") PlayerSettings.bundleVersion = "1.0.0";
            // A UI-only game: gamma keeps the design colours exact and is cheaper on mobile GPUs.
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.runInBackground = true;
            PlayerSettings.defaultWebScreenWidth = 1280;
            PlayerSettings.defaultWebScreenHeight = 720;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.stripEngineCode = true;
#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.WebGL, ManagedStrippingLevel.Medium);
#else
            PlayerSettings.SetManagedStrippingLevel(BuildTargetGroup.WebGL, ManagedStrippingLevel.Medium);
#endif

            PlayerSettings.WebGL.template = "PROJECT:GuessTheAnswer";
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
            PlayerSettings.WebGL.nameFilesAsHashes = true;

            // Old input manager only (no Input System package): smaller build, works everywhere.
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settings != null && settings.Length > 0)
            {
                var so = new SerializedObject(settings[0]);
                var input = so.FindProperty("activeInputHandler");
                if (input != null && input.intValue != 0)
                {
                    input.intValue = 0;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
            }
        }
    }
}
