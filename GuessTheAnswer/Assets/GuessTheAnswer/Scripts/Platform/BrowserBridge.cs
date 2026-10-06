using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace GuessTheAnswer.Platform
{
    /// <summary>
    /// Small browser helpers (GuessTheAnswerBrowser.jslib). Every call has a safe fallback outside WebGL,
    /// so the editor and desktop builds work without a browser.
    /// </summary>
    public static class BrowserBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void GTA_CopyToClipboard(string text);
        [DllImport("__Internal")] static extern void GTA_Vibrate(int ms);
        [DllImport("__Internal")] static extern int GTA_IsMobile();
        [DllImport("__Internal")] static extern string GTA_GetQueryParam(string name);
        [DllImport("__Internal")] static extern void GTA_RegisterVisibility(string target);
#endif

        public static bool IsWebGL
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                return true;
#else
                return false;
#endif
            }
        }

        public static void CopyToClipboard(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
#if UNITY_WEBGL && !UNITY_EDITOR
            GTA_CopyToClipboard(text);
#else
            GUIUtility.systemCopyBuffer = text;
#endif
        }

        public static void Vibrate(int milliseconds)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            GTA_Vibrate(milliseconds);
#elif UNITY_ANDROID || UNITY_IOS
            if (milliseconds >= 30) Handheld.Vibrate();
#endif
        }

        static int isMobile = -1;

        /// <summary>Phones and tablets, including iPads that report a desktop user agent.</summary>
        public static bool IsMobile
        {
            get
            {
                if (isMobile < 0)
                {
#if UNITY_WEBGL && !UNITY_EDITOR
                    isMobile = GTA_IsMobile();
#else
                    isMobile = Application.isMobilePlatform ? 1 : 0;
#endif
                }
                return isMobile == 1;
            }
        }

        /// <summary>A value from the page URL (e.g. ?room=K7MX4Q). Empty outside WebGL.</summary>
        public static string QueryParam(string name)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try { return GTA_GetQueryParam(name) ?? string.Empty; }
            catch (Exception) { return string.Empty; }
#else
            return string.Empty;
#endif
        }

        /// <summary>Forwards tab visibility and window focus changes to OnBrowserVisibility/OnBrowserFocus on the target object.</summary>
        public static void RegisterVisibility(string targetObjectName)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            GTA_RegisterVisibility(targetObjectName);
#endif
        }
    }
}
