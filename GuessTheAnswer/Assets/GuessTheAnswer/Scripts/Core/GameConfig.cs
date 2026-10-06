using System;
using GuessTheAnswer.Platform;
using UnityEngine;

namespace GuessTheAnswer.Core
{
    /// <summary>
    /// Settings that change per deployment, read from Resources/GTA/Data/config.json so they can be edited without
    /// touching code. A page URL parameter ?server=wss://... overrides the server for testing.
    /// </summary>
    [Serializable]
    public class GameConfig
    {
        public string serverUrl = "ws://localhost:8080/ws";
        public string editorServerUrl = "ws://localhost:8080/ws";
        public string gameVersion = "1.0.0";

        public static GameConfig Load()
        {
            var config = new GameConfig();
            var asset = Resources.Load<TextAsset>("GTA/Data/config");
            if (asset != null)
            {
                try
                {
                    JsonUtility.FromJsonOverwrite(asset.text, config);
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Config] config.json is invalid: " + e.Message);
                }
            }
            return config;
        }

        public string ResolveServerUrl()
        {
            string fromPage = BrowserBridge.QueryParam("server");
            if (!string.IsNullOrEmpty(fromPage) && (fromPage.StartsWith("ws://", StringComparison.Ordinal) || fromPage.StartsWith("wss://", StringComparison.Ordinal)))
                return fromPage;
#if UNITY_EDITOR
            return string.IsNullOrEmpty(editorServerUrl) ? serverUrl : editorServerUrl;
#else
            return serverUrl;
#endif
        }
    }
}
