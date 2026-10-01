using System;
using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Used when no portal SDK is present (editor, standalone, itch.io, ...). Lifecycle calls only log. Ads are
    /// simulated in the editor and development builds so the ad flows can be tested; in release builds there are
    /// no ads and rewarded requests fail, so a reward is never granted for nothing.
    /// </summary>
    public sealed class NullPlatformService : PlatformServiceBase
    {
        private const float SimulatedAdSeconds = 1.2f;

        private float _simulatedEnd = -1f;

        public override string Name => "None";

#if UNITY_EDITOR || DEVELOPMENT_BUILD
        public override bool AdsAvailable => IsInitialized && !IsAdPlaying;
#else
        public override bool AdsAvailable => false;
#endif

        public override void Initialize(Action<bool> onDone)
        {
            IsInitialized = true;
            onDone?.Invoke(true);
        }

        public override void LoadingStart() => Log("loadingStart");
        public override void LoadingStop() => Log("loadingStop");
        public override void GameplayStart() => Log("gameplayStart");
        public override void GameplayStop() => Log("gameplayStop");
        public override void HappyTime() => Log("happytime");

        protected override void RequestAd(AdType type)
        {
            Log("requestAd " + type);
            Receiver.EnsureAlive();
            HandleAdStarted();
            _simulatedEnd = Time.realtimeSinceStartup + SimulatedAdSeconds;
        }

        protected override void Tick(float now)
        {
            if (_simulatedEnd < 0f || now < _simulatedEnd) return;
            _simulatedEnd = -1f;
            HandleAdFinished();
        }

        private static void Log(string message)
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            Debug.Log("[Platform:None] " + message);
#endif
        }
    }
}
