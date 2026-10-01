using System;
using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Shared ad bookkeeping for the platform services: one ad at a time, exactly-once callbacks and a timeout when
    /// an ad request never starts. Native results arrive through <see cref="PlatformReceiver"/>.
    /// </summary>
    public abstract class PlatformServiceBase : IPlatformService
    {
        private const float AdStartTimeoutSeconds = 10f;

        private bool _adPending;
        private bool _adStarted;
        private AdType _adType;
        private float _adRequestTime;
        private Action _onFinished;
        private Action _onRewarded;
        private Action _onFailed;
        private PlatformReceiver _receiver;

        public abstract string Name { get; }
        public bool IsInitialized { get; protected set; }
        public virtual bool UserDataAvailable => false;
        public virtual string LanguageHint => null;
        public virtual bool IsAdBlocked => false;
        public bool IsAdPlaying => _adPending;
        public virtual bool AdsAvailable => IsInitialized && !_adPending && !IsAdBlocked;

        public event Action<AdType> AdStarted;
        public event Action<AdType, bool> AdFinished;

        public abstract void Initialize(Action<bool> onDone);
        public virtual void LoadingStart() { }
        public virtual void LoadingStop() { }
        public virtual void GameplayStart() { }
        public virtual void GameplayStop() { }
        public virtual void HappyTime() { }
        public virtual string GetItem(string key) => null;
        public virtual void SetItem(string key, string value) { }
        public virtual void RemoveItem(string key) { }

        /// <summary>Asks the portal to play an ad. Results must be reported through the Handle* methods.</summary>
        protected abstract void RequestAd(AdType type);

        /// <summary>Called every frame by the receiver (unscaled time).</summary>
        protected virtual void Tick(float now) { }

        protected PlatformReceiver Receiver => _receiver != null ? _receiver : (_receiver = PlatformReceiver.Create(this));

        public void ShowMidgameAd(Action onFinished)
        {
            if (!AdsAvailable)
            {
                onFinished?.Invoke();
                return;
            }
            _onFinished = onFinished;
            _onRewarded = null;
            _onFailed = null;
            BeginAd(AdType.Midgame);
        }

        public void ShowRewardedAd(Action onRewarded, Action onFailed)
        {
            if (!AdsAvailable)
            {
                onFailed?.Invoke();
                return;
            }
            _onFinished = null;
            _onRewarded = onRewarded;
            _onFailed = onFailed;
            BeginAd(AdType.Rewarded);
        }

        private void BeginAd(AdType type)
        {
            _adPending = true;
            _adStarted = false;
            _adType = type;
            _adRequestTime = Time.realtimeSinceStartup;
            Receiver.EnsureAlive();
            try
            {
                RequestAd(type);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[Platform] Ad request failed: {e.Message}");
                HandleAdError("request failed");
            }
        }

        // ---------------------------------------------------------------- Results from the native side

        internal void HandleAdStarted()
        {
            if (!_adPending || _adStarted) return;
            _adStarted = true;
            AdStarted?.Invoke(_adType);
        }

        internal void HandleAdFinished()
        {
            HandleAdStarted();
            CompleteAd(true);
        }

        internal void HandleAdError(string message)
        {
            if (!_adPending) return;
            Debug.Log($"[Platform] Ad not completed: {message}");
            CompleteAd(false);
        }

        private void CompleteAd(bool success)
        {
            if (!_adPending) return;
            bool wasStarted = _adStarted;
            var type = _adType;
            var onFinished = _onFinished;
            var onRewarded = _onRewarded;
            var onFailed = _onFailed;
            _adPending = false;
            _adStarted = false;
            _onFinished = _onRewarded = _onFailed = null;

            // Restore game state first so callbacks (grant a reward, continue a flow) run in a normal game.
            if (wasStarted) AdFinished?.Invoke(type, success);

            if (type == AdType.Midgame) onFinished?.Invoke();
            else if (success) onRewarded?.Invoke();
            else onFailed?.Invoke();
        }

        internal void ReceiverTick(float now)
        {
            if (_adPending && !_adStarted && now - _adRequestTime > AdStartTimeoutSeconds)
                HandleAdError("timed out waiting for the ad to start");
            Tick(now);
        }

        internal void ReceiveInit(string result) => OnInitResult(result == "1");

        protected virtual void OnInitResult(bool success) { }
    }
}
