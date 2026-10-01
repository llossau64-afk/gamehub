using System.Text;
using BarberSimulator.UI;
using UnityEngine;

namespace BarberSimulator.Debugging
{
    /// <summary>
    /// Editor / development builds: shows the first exception on screen (message, file and line) and lifts the
    /// black screen fades, so a crash never looks like a silent black screen. Created by GameBootstrap before
    /// anything else and kept alive across scene loads.
    /// </summary>
    public sealed class ErrorOverlay : MonoBehaviour
    {
        private static ErrorOverlay _instance;
        private string _report;
        private int _count;
        private bool _hidden;
        private GUIStyle _style;

        public static void Ensure()
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            if (_instance != null) return;
            var go = new GameObject("Error Overlay");
            DontDestroyOnLoad(go);
            _instance = go.AddComponent<ErrorOverlay>();
#endif
        }

        /// <summary>Reports a handled failure (e.g. a failed boot) the same way as an exception.</summary>
        public static void Report(string message, string stackTrace)
        {
            Ensure();
            if (_instance != null) _instance.Capture(message, stackTrace);
        }

        private void OnEnable() => Application.logMessageReceived += OnLog;
        private void OnDisable() => Application.logMessageReceived -= OnLog;

        private void OnLog(string condition, string stackTrace, LogType type)
        {
            if (type != LogType.Exception && type != LogType.Assert) return;
            Capture(condition, stackTrace);
        }

        private void Capture(string message, string stackTrace)
        {
            _count++;
            if (_report == null)
            {
                var sb = new StringBuilder(message).Append('\n');
                int lines = 0;
                foreach (var line in (stackTrace ?? string.Empty).Split('\n'))
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    sb.Append("   ").Append(line.Trim()).Append('\n');
                    if (++lines >= 8) break;
                }
                _report = sb.ToString();
            }
            // Never leave the player staring at a black fade.
            ScreenFader.ClearAll();
        }

        private void OnGUI()
        {
            if (_report == null || _hidden) return;
            if (_style == null)
            {
                _style = new GUIStyle(GUI.skin.label) { fontSize = 15, wordWrap = true };
                _style.normal.textColor = Color.white;
            }
            var rect = new Rect(16f, 16f, Mathf.Min(Screen.width - 32f, 1100f), 250f);
            GUI.color = new Color(0f, 0f, 0f, 0.85f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.Label(new Rect(rect.x + 12f, rect.y + 8f, rect.width - 24f, rect.height - 40f),
                "<b>Barber Simulator error</b> (" + _count + " total) – please send a screenshot of this box:\n" + _report, _style);
            if (GUI.Button(new Rect(rect.xMax - 110f, rect.yMax - 30f, 100f, 24f), "Hide")) _hidden = true;
        }
    }
}
