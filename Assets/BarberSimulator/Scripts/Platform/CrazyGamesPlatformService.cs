using System;
using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// CrazyGames HTML5 SDK v3 (window.CrazyGames.SDK) through the jslib bridge. Only functional in a WebGL player
    /// whose page loaded the SDK; <see cref="PlatformServiceFactory"/> checks that before creating it.
    /// </summary>
    public sealed class CrazyGamesPlatformService : PlatformServiceBase
    {
        private const float AdblockRecheckSeconds = 5f;

        private Action<bool> _pendingInit;
        private bool _initStarted;
        private bool _sdkReady;
        private int _adblock = -1;
        private float _nextAdblockCheck;
        private string _language;

        public override string Name => "CrazyGames";
        public override bool UserDataAvailable => _sdkReady;
        public override bool IsAdBlocked => _adblock == 1;
        public override string LanguageHint => _language;

        public static bool IsSdkPresent() => PlatformNative.IsSdkPresent();

        public override void Initialize(Action<bool> onDone)
        {
            if (IsInitialized)
            {
                onDone?.Invoke(_sdkReady);
                return;
            }
            _pendingInit += onDone;
            if (_initStarted) return;
            _initStarted = true;

            Receiver.EnsureAlive();
            int state = PlatformNative.Init(PlatformReceiver.ObjectName);
            if (state != 2) OnInitResult(state == 1);
        }

        protected override void OnInitResult(bool success)
        {
            IsInitialized = true;
            _sdkReady = success;
            if (success)
            {
                _language = NormalizeLanguage(PlatformNative.GetLocale());
                _adblock = PlatformNative.HasAdblock();
            }
            else
            {
                Debug.LogWarning("[Platform] CrazyGames SDK initialisation failed; running without portal features.");
            }
            var callbacks = _pendingInit;
            _pendingInit = null;
            callbacks?.Invoke(success);
        }

        public override bool AdsAvailable => _sdkReady && base.AdsAvailable;

        public override void LoadingStart() { if (_sdkReady) PlatformNative.LoadingStart(); }
        public override void LoadingStop() { if (_sdkReady) PlatformNative.LoadingStop(); }
        public override void GameplayStart() { if (_sdkReady) PlatformNative.GameplayStart(); }
        public override void GameplayStop() { if (_sdkReady) PlatformNative.GameplayStop(); }
        public override void HappyTime() { if (_sdkReady) PlatformNative.HappyTime(); }

        protected override void RequestAd(AdType type)
        {
            PlatformNative.RequestAd(type == AdType.Rewarded ? "rewarded" : "midgame", PlatformReceiver.ObjectName);
        }

        protected override void Tick(float now)
        {
            // The ad blocker check is asynchronous in the SDK; keep asking until it has an answer.
            if (_sdkReady && _adblock < 0 && now >= _nextAdblockCheck)
            {
                _nextAdblockCheck = now + AdblockRecheckSeconds;
                _adblock = PlatformNative.HasAdblock();
            }
        }

        public override string GetItem(string key) => _sdkReady ? PlatformNative.GetItem(key) : null;

        public override void SetItem(string key, string value)
        {
            if (_sdkReady) PlatformNative.SetItem(key, value);
        }

        public override void RemoveItem(string key)
        {
            if (_sdkReady) PlatformNative.RemoveItem(key);
        }

        private static string NormalizeLanguage(string locale)
        {
            if (string.IsNullOrEmpty(locale) || locale.Length < 2) return null;
            return locale.Substring(0, 2).ToLowerInvariant();
        }
    }
}
