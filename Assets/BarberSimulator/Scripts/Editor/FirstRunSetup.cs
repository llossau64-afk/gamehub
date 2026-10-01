using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// The repository ships source assets (scripts, textures, audio, fonts) but not generated content. On the first
    /// editor load this builds materials, meshes, prefabs, data assets and the scene automatically.
    /// </summary>
    [InitializeOnLoad]
    public static class FirstRunSetup
    {
        private const string SessionKey = "BarberSimulator.FirstRunChecked";
        private static int _attempts;

        static FirstRunSetup()
        {
            if (Application.isBatchMode || SessionState.GetBool(SessionKey, false)) return;
            EditorApplication.delayCall += Check;
        }

        private static void Check()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += Check;
                return;
            }

            if (File.Exists(GeneratorPaths.MainScene))
            {
                SessionState.SetBool(SessionKey, true);
                return;
            }

            // Packages (URP) may still be importing on the very first open.
            if (Shader.Find("Universal Render Pipeline/Lit") == null && _attempts++ < 50)
            {
                EditorApplication.delayCall += Check;
                return;
            }

            SessionState.SetBool(SessionKey, true);
            Debug.Log("[Barber Simulator] First run: generating project content...");
            ShopSceneGenerator.BuildAll();
            EditorSceneManager.OpenScene(GeneratorPaths.MainScene);
            PlayModeSceneGuard.AssignStartScene();
        }
    }
}
