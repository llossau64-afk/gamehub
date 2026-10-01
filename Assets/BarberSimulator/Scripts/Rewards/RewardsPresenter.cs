using System.Collections.Generic;
using BarberSimulator.Audio;
using BarberSimulator.Core;
using BarberSimulator.Economy;
using BarberSimulator.Localization;
using BarberSimulator.Save;
using BarberSimulator.UI;

namespace BarberSimulator.Rewards
{
    /// <summary>
    /// Shows the reward systems to the player: the streak badge, the goals panel, toasts, banners, sounds and the
    /// floating payment popups. It only listens; the rules live in the streak, goal and milestone services.
    /// </summary>
    public sealed class RewardsPresenter
    {
        private readonly GameContext _ctx;
        private readonly HudView _hud;
        private readonly LocalizationService _loc;
        private readonly AudioService _audio;

        public RewardsPresenter(GameContext ctx)
        {
            _ctx = ctx;
            _hud = ctx.UI.Hud;
            _loc = ctx.Localization;
            _audio = ctx.Audio;

            ctx.Streak.Grew += OnStreakGrew;
            ctx.Streak.Lost += OnStreakLost;
            ctx.Goals.Changed += RenderGoals;
            ctx.Goals.Generated += OnGoalsGenerated;
            ctx.Goals.GoalCompleted += OnGoalCompleted;
            ctx.Milestones.Unlocked += OnMilestoneUnlocked;
            ctx.Economy.ServicePaid += OnServicePaid;
            ctx.Progression.XpGained += OnXpGained;
            _loc.LanguageChanged += OnLanguageChanged;

            ctx.UI.Summary.GoalSource = BuildGoalRows;
            ctx.UI.Achievements.Source = BuildAchievementRows;
        }

        /// <summary>Gameplay (re)started: make sure today's goals exist and redraw the badge and the list.</summary>
        public void Refresh()
        {
            _ctx.Goals.EnsureToday(_ctx.Day.Day);
            RenderStreak(animate: false);
            RenderGoals();
            _ctx.Milestones.Check();
        }

        // ---------------------------------------------------------------- streak

        private void RenderStreak(bool animate)
        {
            int streak = _ctx.Streak.Current;
            float multiplier = StreakService.MultiplierFor(streak);
            string bonus = multiplier > 1.001f
                ? _loc.Format("hud.streak_bonus", multiplier.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture))
                : string.Empty;
            _hud.SetStreak(streak, bonus, animate);
        }

        private void OnStreakGrew(int streak, int previous)
        {
            RenderStreak(animate: true);
            float multiplier = StreakService.MultiplierFor(streak);
            if (multiplier <= StreakService.MultiplierFor(previous)) return;
            _hud.ShowToast(_loc.Format("toast.streak_tier", multiplier.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)));
            Play(_audio.Library != null ? _audio.Library.uiToast : null, 0.8f, 1.2f);
        }

        private void OnStreakLost(int lost)
        {
            _hud.ShowStreakLost(lost);
            _hud.ShowToast(_loc.Format("toast.streak_lost", lost));
            Play(_audio.Library != null ? _audio.Library.reviewBad : null, 0.5f, 1f);
        }

        // ---------------------------------------------------------------- goals

        private void RenderGoals() => _hud.SetGoals(BuildGoalRows());

        private List<GoalRow> BuildGoalRows()
        {
            var rows = new List<GoalRow>();
            foreach (var goal in _ctx.Goals.Goals)
            {
                rows.Add(new GoalRow
                {
                    Text = GoalText.Describe(_loc, goal),
                    Counter = GoalText.Counter(goal),
                    Reward = GoalText.Reward(_loc, goal),
                    Progress01 = goal.target > 0 ? (float)goal.progress / goal.target : 0f,
                    Completed = goal.completed,
                    Failed = goal.failed
                });
            }
            return rows;
        }

        private void OnGoalsGenerated()
        {
            _hud.ShowToast(_loc.Get("toast.new_goals"));
        }

        private void OnGoalCompleted(DailyGoalData goal)
        {
            _hud.ShowBanner(_loc.Get("hud.goal_complete"), GoalText.Describe(_loc, goal), complete: true, celebrate: true);
            _hud.ShowToast(GoalText.Reward(_loc, goal));
            Play(_audio.Library != null ? _audio.Library.objectiveComplete : null, 0.8f, 1.1f);
        }

        // ---------------------------------------------------------------- milestones

        private void OnMilestoneUnlocked(MilestoneDefinition milestone)
        {
            _hud.ShowBanner(_loc.Get("hud.achievement"), _loc.Get(milestone.TitleKey), complete: true, celebrate: true);
            _hud.ShowToast(_loc.Get(milestone.DescriptionKey));
            Play(_audio.Library != null ? _audio.Library.objectiveComplete : null, 0.9f, 1.25f);
        }

        private List<AchievementRow> BuildAchievementRows()
        {
            var stats = _ctx.Milestones.CurrentStats();
            var rows = new List<AchievementRow>();
            foreach (var milestone in MilestoneService.All)
            {
                bool unlocked = _ctx.Milestones.IsUnlocked(milestone.Id);
                rows.Add(new AchievementRow
                {
                    Title = _loc.Get(milestone.TitleKey),
                    Description = _loc.Get(milestone.DescriptionKey),
                    Progress = !unlocked && milestone.Progress != null ? milestone.Progress(stats) : string.Empty,
                    Unlocked = unlocked
                });
            }
            return rows;
        }

        // ---------------------------------------------------------------- juice

        private void OnServicePaid(ServicePayment payment)
        {
            _hud.ShowPopup("+" + EconomyService.Format(payment.Total), xp: false, lane: 0);
        }

        private void OnXpGained(int xp)
        {
            _hud.ShowPopup(_loc.Format("hud.xp_popup", xp), xp: true, lane: 1);
        }

        private void OnLanguageChanged()
        {
            RenderStreak(animate: false);
            RenderGoals();
        }

        private void Play(UnityEngine.AudioClip clip, float volume, float pitch)
        {
            if (clip != null) _audio.PlayUI(clip, volume, pitch);
        }
    }
}
