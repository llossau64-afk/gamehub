using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// Pressing Play always starts the game scene, whatever scene is open in the editor (a fresh Unity project opens
    /// an empty "SampleScene" without camera, which only shows a black screen). If the content has not been
    /// generated yet, Play is cancelled and the generator is offered instead.
    /// </summary>
    [InitializeOnLoad]
    public static class PlayModeSceneGuard
    {
        static PlayModeSceneGuard()
        {
            EditorApplication.delayCall += AssignStartScene;
            EditorApplication.playModeStateChanged += OnPlayModeChanged;
        }

        public static void AssignStartScene()
        {
            var sceneAsset = AssetDatabase.LoadAssetAtPath<SceneAsset>(GeneratorPaths.MainScene);
            if (sceneAsset != null && EditorSceneManager.playModeStartScene != sceneAsset)
                EditorSceneManager.playModeStartScene = sceneAsset;
        }

        private static void OnPlayModeChanged(PlayModeStateChange change)
        {
            if (change != PlayModeStateChange.ExitingEditMode) return;
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(GeneratorPaths.MainScene) != null)
            {
                AssignStartScene();
                return;
            }

            EditorApplication.isPlaying = false;
            bool generate = EditorUtility.DisplayDialog("Barber Simulator",
                "The game scene has not been generated yet (" + GeneratorPaths.MainScene + ").\n\n" +
                "Generate all project content now? This takes about a minute. Press Play again afterwards.",
                "Generate", "Cancel");
            if (!generate) return;
            EditorApplication.delayCall += () =>
            {
                ShopSceneGenerator.BuildAll();
                if (System.IO.File.Exists(GeneratorPaths.MainScene)) EditorSceneManager.OpenScene(GeneratorPaths.MainScene);
                AssignStartScene();
                Debug.Log("[Barber Simulator] Content generated. Press Play to start the game.");
            };
        }
    }
}
