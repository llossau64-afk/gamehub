using System;

namespace BarberSimulator.Platform
{
    public enum AdType
    {
        Midgame,
        Rewarded
    }

    /// <summary>Which portal integration the game should use. Chosen in <see cref="Core.GameConfig"/>.</summary>
    public enum PlatformMode
    {
        /// <summary>Use the portal SDK when the page provides one, otherwise run without a portal.</summary>
        Auto,
        /// <summary>Require the CrazyGames SDK (still falls back to no portal when it is missing).</summary>
        CrazyGames,
        /// <summary>No portal integration at all.</summary>
        None
    }

    /// <summary>
    /// Everything the game needs from a web portal (CrazyGames, ...): lifecycle signals, ads and user data.
    /// All calls are safe to make when the portal is missing; they simply do nothing or report failure.
    /// </summary>
    public interface IPlatformService
    {
        /// <summary>Human readable name of the active integration, e.g. "CrazyGames" or "None".</summary>
        string Name { get; }
        bool IsInitialized { get; }

        /// <summary>Starts the portal SDK. Idempotent; <paramref name="onDone"/> receives true when the SDK is usable.</summary>
        void Initialize(Action<bool> onDone);

        void LoadingStart();
        void LoadingStop();
        void GameplayStart();
        void GameplayStop();
        /// <summary>A celebratory moment (portals use it for their own effects).</summary>
        void HappyTime();

        /// <summary>True when an ad request can be attempted (SDK ready, no ad running, no ad blocker detected).</summary>
        bool AdsAvailable { get; }
        bool IsAdBlocked { get; }
        bool IsAdPlaying { get; }

        /// <summary>Plays an interstitial. <paramref name="onFinished"/> always runs, whether or not an ad was shown.</summary>
        void ShowMidgameAd(Action onFinished);
        /// <summary>Plays a rewarded ad. Exactly one of the callbacks runs.</summary>
        void ShowRewardedAd(Action onRewarded, Action onFailed);

        event Action<AdType> AdStarted;
        /// <summary>The bool is true when the ad was watched to the end.</summary>
        event Action<AdType, bool> AdFinished;

        /// <summary>True when <see cref="GetItem"/>/<see cref="SetItem"/> are backed by the portal.</summary>
        bool UserDataAvailable { get; }
        string GetItem(string key);
        void SetItem(string key, string value);
        void RemoveItem(string key);

        /// <summary>Two-letter language code reported by the portal or browser, or null when unknown.</summary>
        string LanguageHint { get; }
    }
}
