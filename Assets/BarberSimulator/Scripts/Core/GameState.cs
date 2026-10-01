namespace BarberSimulator.Core
{
    public enum GameState
    {
        Booting,
        MainMenu,
        Intro,
        Gameplay,
        Paused,
        BarberMode,
        /// <summary>The shop computer's upgrade store is open (the world is frozen).</summary>
        Store,
        /// <summary>The end-of-day summary is showing.</summary>
        DaySummary,
        Transitioning
    }
}
