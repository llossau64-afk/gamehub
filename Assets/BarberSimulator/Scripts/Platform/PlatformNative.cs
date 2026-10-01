#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Bridge to Plugins/WebGL/BarberPlatform.jslib. Outside a WebGL player every call is a harmless no-op, so the
    /// rest of the code never needs its own platform guards.
    /// </summary>
    internal static class PlatformNative
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern int BarberPlatform_IsSdkPresent();
        [DllImport("__Internal")] private static extern int BarberPlatform_Init(string receiverName);
        [DllImport("__Internal")] private static extern void BarberPlatform_LoadingStart();
        [DllImport("__Internal")] private static extern void BarberPlatform_LoadingStop();
        [DllImport("__Internal")] private static extern void BarberPlatform_GameplayStart();
        [DllImport("__Internal")] private static extern void BarberPlatform_GameplayStop();
        [DllImport("__Internal")] private static extern void BarberPlatform_HappyTime();
        [DllImport("__Internal")] private static extern void BarberPlatform_RequestAd(string adType, string receiverName);
        [DllImport("__Internal")] private static extern int BarberPlatform_HasAdblock();
        [DllImport("__Internal")] private static extern string BarberPlatform_GetItem(string key);
        [DllImport("__Internal")] private static extern void BarberPlatform_SetItem(string key, string value);
        [DllImport("__Internal")] private static extern void BarberPlatform_RemoveItem(string key);
        [DllImport("__Internal")] private static extern string BarberPlatform_GetLocale();

        public static bool IsSdkPresent() => BarberPlatform_IsSdkPresent() == 1;
        /// <summary>1 ready, 0 failed, 2 pending (the result arrives later through the receiver).</summary>
        public static int Init(string receiverName) => BarberPlatform_Init(receiverName);
        public static void LoadingStart() => BarberPlatform_LoadingStart();
        public static void LoadingStop() => BarberPlatform_LoadingStop();
        public static void GameplayStart() => BarberPlatform_GameplayStart();
        public static void GameplayStop() => BarberPlatform_GameplayStop();
        public static void HappyTime() => BarberPlatform_HappyTime();
        public static void RequestAd(string adType, string receiverName) => BarberPlatform_RequestAd(adType, receiverName);
        /// <summary>1 blocked, 0 not blocked, -1 unknown.</summary>
        public static int HasAdblock() => BarberPlatform_HasAdblock();
        public static string GetItem(string key) => BarberPlatform_GetItem(key);
        public static void SetItem(string key, string value) => BarberPlatform_SetItem(key, value);
        public static void RemoveItem(string key) => BarberPlatform_RemoveItem(key);
        public static string GetLocale() => BarberPlatform_GetLocale();
#else
        public static bool IsSdkPresent() => false;
        public static int Init(string receiverName) => 0;
        public static void LoadingStart() { }
        public static void LoadingStop() { }
        public static void GameplayStart() { }
        public static void GameplayStop() { }
        public static void HappyTime() { }
        public static void RequestAd(string adType, string receiverName) { }
        public static int HasAdblock() => -1;
        public static string GetItem(string key) => null;
        public static void SetItem(string key, string value) { }
        public static void RemoveItem(string key) { }
        public static string GetLocale() => null;
#endif
    }
}
