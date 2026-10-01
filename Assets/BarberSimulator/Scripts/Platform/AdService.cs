using System;
using BarberSimulator.Audio;
using BarberSimulator.Input;
using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Wraps the platform ads: while an ad runs it mutes the audio, freezes game time and blocks gameplay input,
    /// then restores exactly what it changed.
    /// </summary>
    public sealed class AdService : IAdService
    {
        /// <summary>CrazyGames asks for no interstitial during the first minute of a session.</summary>
        public const float FirstMidgameDelaySeconds = 60f;
        public const float MinSecondsBetweenMidgames = 180f;

        private readonly IPlatformService _platform;
        private readonly AudioService _audio;
        private readonly InputService _input;

        private bool _frozen;
        private float _savedTimeScale = 1f;
        private bool _savedGameplayInput;
        private bool _savedBarberInput;
        private float _lastMidgameTime = float.NegativeInfinity;

        public AdService(IPlatformService platform, AudioService audio, InputService input)
        {
            _platform = platform;
            _audio = audio;
            _input = input;
            _platform.AdStarted += OnAdStarted;
            _platform.AdFinished += OnAdFinished;
        }

        public bool RewardedAvailable => _platform.AdsAvailable;
        public bool IsAdPlaying => _platform.IsAdPlaying;
        public event Action AdPlayingChanged;

        public void ShowRewarded(Action onRewarded, Action onFailed = null)
        {
            _platform.ShowRewardedAd(onRewarded, onFailed);
        }

        public void ShowMidgame(Action onDone = null)
        {
            float now = Time.realtimeSinceStartup;
            bool allowed = now >= FirstMidgameDelaySeconds && now - _lastMidgameTime >= MinSecondsBetweenMidgames;
            if (!allowed || !_platform.AdsAvailable)
            {
                onDone?.Invoke();
                return;
            }
            _lastMidgameTime = now;
            _platform.ShowMidgameAd(onDone);
        }

        private void OnAdStarted(AdType type)
        {
            if (_frozen) return;
            _frozen = true;
            _savedTimeScale = Time.timeScale;
            _savedGameplayInput = _input.GameplayEnabled;
            _savedBarberInput = _input.BarberEnabled;
            Time.timeScale = 0f;
            _input.GameplayEnabled = false;
            _input.BarberEnabled = false;
            if (_audio != null) _audio.Muted = true;
            AdPlayingChanged?.Invoke();
        }

        private void OnAdFinished(AdType type, bool completed)
        {
            if (!_frozen) return;
            _frozen = false;
            if (_audio != null) _audio.Muted = false;
            Time.timeScale = _savedTimeScale;
            _input.GameplayEnabled = _savedGameplayInput;
            _input.BarberEnabled = _savedBarberInput;
            if (_savedGameplayInput) _input.SetCursorLock(true);
            AdPlayingChanged?.Invoke();
        }
    }
}
