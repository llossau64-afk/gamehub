using BarberSimulator.Core;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Translates game flow states into portal lifecycle signals: loadingStop once the first screen is up,
    /// gameplayStart while the player is actually playing and gameplayStop in menus, cutscenes and pause.
    /// </summary>
    public sealed class PlatformFlowBridge
    {
        private readonly IPlatformService _platform;
        private bool _loadingStopped;
        private bool _gameplayActive;

        public PlatformFlowBridge(IPlatformService platform, GameFlowController flow)
        {
            _platform = platform;
            flow.StateChanged += OnStateChanged;
        }

        private void OnStateChanged(GameState previous, GameState state)
        {
            if (!_loadingStopped && state != GameState.Booting)
            {
                _loadingStopped = true;
                _platform.LoadingStop();
            }

            bool playing = state == GameState.Gameplay || state == GameState.BarberMode;
            if (playing == _gameplayActive) return;
            _gameplayActive = playing;
            if (playing) _platform.GameplayStart();
            else _platform.GameplayStop();
        }
    }
}
