using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace GuessTheAnswer.Platform
{
    /// <summary>
    /// Portal integration (CrazyGames, Poki, GamePix, Playgama ...). Gameplay code only talks to this interface;
    /// the WebGL template maps the calls to whichever SDK is on the page. Ads are cosmetic-free and never give a
    /// gameplay advantage.
    /// </summary>
    public interface IPlatformService
    {
        string Name { get; }
        void LoadingStart();
        void LoadingFinished();
        void GameplayStart();
        void GameplayStop();
        void HappyTime();
        /// <summary>Interstitial at a natural break. Always calls back (with or without an ad).</summary>
        void ShowMidgameAd(Action done);
        /// <summary>Rewarded ad; the callback says whether the reward was earned.</summary>
        void ShowRewardedAd(Action<bool> done);
    }

    /// <summary>Editor, desktop and pages without a portal SDK: only logs.</summary>
    public sealed class NullPlatformService : IPlatformService
    {
        public string Name => "none";
        public void LoadingStart() { }
        public void LoadingFinished() { }
        public void GameplayStart() { }
        public void GameplayStop() { }
        public void HappyTime() { }
        public void ShowMidgameAd(Action done) => done?.Invoke();
        public void ShowRewardedAd(Action<bool> done) => done?.Invoke(false);
    }

    /// <summary>Forwards to window.GTAPlatform (see the WebGL template). Ad callbacks come back via SendMessage.</summary>
    public sealed class WebPlatformService : MonoBehaviour, IPlatformService
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void GTA_Platform(string eventName);
        [DllImport("__Internal")] static extern string GTA_PlatformName();
        [DllImport("__Internal")] static extern void GTA_PlatformAd(string kind, string target);
#endif

        Action midgameDone;
        Action<bool> rewardedDone;
        bool gameplayRunning;
        string platformName;

        public string Name
        {
            get
            {
                if (platformName == null)
                {
#if UNITY_WEBGL && !UNITY_EDITOR
                    try { platformName = GTA_PlatformName(); } catch (Exception) { platformName = "none"; }
#else
                    platformName = "none";
#endif
                }
                return platformName;
            }
        }

        static void Fire(string eventName)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            GTA_Platform(eventName);
#endif
        }

        public void LoadingStart() => Fire("loadingStart");
        public void LoadingFinished() => Fire("loadingStop");

        public void GameplayStart()
        {
            if (gameplayRunning) return;
            gameplayRunning = true;
            Fire("gameplayStart");
        }

        public void GameplayStop()
        {
            if (!gameplayRunning) return;
            gameplayRunning = false;
            Fire("gameplayStop");
        }

        public void HappyTime() => Fire("happyTime");

        public void ShowMidgameAd(Action done)
        {
            midgameDone = done;
#if UNITY_WEBGL && !UNITY_EDITOR
            Audio.AudioManager.SetAdMute(true);
            GTA_PlatformAd("midgame", gameObject.name);
#else
            OnAdFinished("midgame|0");
#endif
        }

        public void ShowRewardedAd(Action<bool> done)
        {
            rewardedDone = done;
#if UNITY_WEBGL && !UNITY_EDITOR
            Audio.AudioManager.SetAdMute(true);
            GTA_PlatformAd("rewarded", gameObject.name);
#else
            OnAdFinished("rewarded|0");
#endif
        }

        /// <summary>Called from JavaScript: "kind|1" or "kind|0".</summary>
        public void OnAdFinished(string value)
        {
            Audio.AudioManager.SetAdMute(false);
            bool ok = value != null && value.EndsWith("|1", StringComparison.Ordinal);
            if (value != null && value.StartsWith("rewarded", StringComparison.Ordinal))
            {
                var cb = rewardedDone;
                rewardedDone = null;
                cb?.Invoke(ok);
            }
            else
            {
                var cb = midgameDone;
                midgameDone = null;
                cb?.Invoke();
            }
        }
    }
}
