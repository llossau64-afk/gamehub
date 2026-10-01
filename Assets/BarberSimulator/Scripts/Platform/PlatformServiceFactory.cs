using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Picks the platform integration. The choice is made once per page load and kept across scene reloads, because
    /// the SDK can only be initialised once.
    /// </summary>
    public static class PlatformServiceFactory
    {
        private static IPlatformService _instance;

        public static IPlatformService GetOrCreate(PlatformMode mode)
        {
            if (_instance != null) return _instance;
            _instance = Create(mode);
            Debug.Log($"[Platform] Using '{_instance.Name}' (mode {mode}).");
            return _instance;
        }

        private static IPlatformService Create(PlatformMode mode)
        {
            if (mode == PlatformMode.None) return new NullPlatformService();

#if UNITY_WEBGL && !UNITY_EDITOR
            // Auto and CrazyGames both need the SDK on the page. Other portals (GamePix, Playgama, itch.io, a plain
            // web server) do not have it, so the game runs on the null service there.
            if (CrazyGamesPlatformService.IsSdkPresent()) return new CrazyGamesPlatformService();
            if (mode == PlatformMode.CrazyGames) Debug.LogWarning("[Platform] CrazyGames SDK not found on this page; running without portal features.");
#endif
            return new NullPlatformService();
        }
    }
}
