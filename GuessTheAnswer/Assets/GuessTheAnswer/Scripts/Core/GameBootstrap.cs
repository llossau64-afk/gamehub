using UnityEngine;

namespace GuessTheAnswer.Core
{
    /// <summary>
    /// Creates the persistent app object before the first scene finishes loading. Because of this the game starts from
    /// the Bootstrap scene or any other scene (handy in the editor), and there is never more than one app.
    /// </summary>
    public static class GameBootstrap
    {
        public const string RootName = "[Guess The Answer]";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (App.Instance != null) return;
            var go = new GameObject(RootName);
            go.AddComponent<App>();
        }
    }
}
