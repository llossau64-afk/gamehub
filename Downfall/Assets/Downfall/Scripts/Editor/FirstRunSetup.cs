using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Downfall.EditorTools
{
    /// <summary>
    /// The repository ships source assets (FBX, PNG, scripts) but no generated content. On the first editor
    /// load this configures the project and builds materials, prefabs and the main scene once; the marker
    /// file ProjectSettings/DownfallSetup.txt records that it ran. Menu: Downfall/Rebuild Content.
    /// </summary>
    [InitializeOnLoad]
    public static class FirstRunSetup
    {
        public const string Marker = "ProjectSettings/DownfallSetup.txt";
        const int ContentVersion = 1;
        const string SessionKey = "Downfall.FirstRunChecked";
        static int attempts;

        static FirstRunSetup()
        {
            if (Application.isBatchMode || SessionState.GetBool(SessionKey, false)) return;
            EditorApplication.delayCall += Check;
        }

        static bool Done()
        {
            if (!File.Exists(Marker)) return false;
            int.TryParse(File.ReadAllText(Marker).Trim(), out int v);
            return v >= ContentVersion && File.Exists(DownfallPaths.MainScene);
        }

        static void Check()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) { EditorApplication.delayCall += Check; return; }
            if (Done()) { SessionState.SetBool(SessionKey, true); return; }
            // packages (URP) may still be importing on the very first open
            if (Shader.Find("Universal Render Pipeline/Lit") == null && attempts++ < 60) { EditorApplication.delayCall += Check; return; }
            SessionState.SetBool(SessionKey, true);
            Debug.Log("[Downfall] First run: generating project content...");
            RebuildAll(false);
            if (File.Exists(DownfallPaths.MainScene)) EditorSceneManager.OpenScene(DownfallPaths.MainScene);
        }

        [MenuItem("Downfall/Rebuild Content")]
        public static void RebuildContent() => RebuildAll(false);

        [MenuItem("Downfall/Reimport Art + Rebuild Content")]
        public static void ReimportAndRebuild() => RebuildAll(true);

        [MenuItem("Downfall/Rebuild Materials + Prefabs")]
        public static void RebuildMaterials()
        {
            MaterialBuilder.Build();
            PrefabBuilder.Build();
        }

        public static void RebuildAll(bool reimportArt)
        {
            try
            {
                EditorUtility.DisplayProgressBar("Downfall", "Project settings", 0.05f);
                ProjectSetup.ConfigureAll();
                if (reimportArt)
                {
                    EditorUtility.DisplayProgressBar("Downfall", "Reimporting Art", 0.15f);
                    AssetDatabase.ImportAsset(DownfallPaths.Art, ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate);
                }
                EditorUtility.DisplayProgressBar("Downfall", "Materials", 0.4f);
                MaterialBuilder.Build();
                EditorUtility.DisplayProgressBar("Downfall", "Prefabs", 0.6f);
                PrefabBuilder.Build();
                EditorUtility.DisplayProgressBar("Downfall", "Scene", 0.9f);
                SceneBuilder.Build();
                AssetDatabase.SaveAssets();
                File.WriteAllText(Marker, ContentVersion.ToString());
                Debug.Log("[Downfall] Content ready.");
            }
            catch (System.Exception e) { Debug.LogError("[Downfall] content build failed: " + e); }
            finally { EditorUtility.ClearProgressBar(); }
        }
    }
}
