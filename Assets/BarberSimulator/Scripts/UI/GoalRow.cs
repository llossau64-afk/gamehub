namespace BarberSimulator.UI
{
    /// <summary>One daily goal as the HUD panel and the end-of-day summary show it.</summary>
    public struct GoalRow
    {
        public string Text;
        /// <summary>"2 / 5"</summary>
        public string Counter;
        public string Reward;
        public float Progress01;
        public bool Completed;
        public bool Failed;
    }

    /// <summary>One entry of the Achievements panel.</summary>
    public struct AchievementRow
    {
        /// <summary>Milestone id; picks the card's icon.</summary>
        public string Id;
        public string Title;
        public string Description;
        /// <summary>"37 / 50" for locked entries with a counter; empty otherwise.</summary>
        public string Progress;
        /// <summary>The achievement counts something, so the card shows a progress bar.</summary>
        public bool HasProgress;
        /// <summary>0..1 bar fill (1 once unlocked).</summary>
        public float Progress01;
        public bool Unlocked;
    }
}
