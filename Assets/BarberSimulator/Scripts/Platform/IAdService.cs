using System;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Game-facing ad API (<c>GameContext.Ads</c>). Handles muting and pausing while an ad plays, so callers only
    /// decide when to offer one.
    /// <code>
    /// if (ctx.Ads.RewardedAvailable)
    ///     ctx.Ads.ShowRewarded(onRewarded: () => ctx.Economy.Add(bonus), onFailed: () => toast("No ad available"));
    /// </code>
    /// </summary>
    public interface IAdService
    {
        /// <summary>True when a rewarded ad can be requested right now. Use it to show or hide the "watch ad" button.</summary>
        bool RewardedAvailable { get; }
        bool IsAdPlaying { get; }

        /// <summary>Raised when an ad starts or ends (audio is already muted and the game paused / restored).</summary>
        event Action AdPlayingChanged;

        /// <summary>
        /// Plays a rewarded ad. Exactly one callback runs, after the game has been restored. Without a portal that
        /// has ads (release build outside CrazyGames) this fails immediately and never grants the reward.
        /// </summary>
        void ShowRewarded(Action onRewarded, Action onFailed = null);

        /// <summary>
        /// Plays an interstitial at a natural break (end of day, back to menu). Skipped during the first minute of the
        /// session and when the previous ad was recent. <paramref name="onDone"/> always runs.
        /// </summary>
        void ShowMidgame(Action onDone = null);
    }
}
