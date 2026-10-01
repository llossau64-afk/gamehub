using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Static access for the few places that only need to fire a portal signal and have no service plumbing
    /// (for example a finished haircut). Set once by <see cref="Core.GameBootstrap"/>.
    /// </summary>
    public static class PlatformHooks
    {
        private const float MinSecondsBetweenHappyTimes = 15f;

        private static float _lastHappyTime = float.NegativeInfinity;

        public static IPlatformService Current { get; set; }

        /// <summary>Call after a customer review. Celebrates five-star results only, and not too often.</summary>
        public static void HappyTime(int stars)
        {
            if (stars < 5 || Current == null) return;
            float now = Time.realtimeSinceStartup;
            if (now - _lastHappyTime < MinSecondsBetweenHappyTimes) return;
            _lastHappyTime = now;
            Current.HappyTime();
        }
    }
}
