using System.Collections;
using BarberSimulator.CameraSystems;
using BarberSimulator.Cinematics;
using BarberSimulator.Input;
using BarberSimulator.Interaction;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
using BarberSimulator.Player;
using BarberSimulator.Shop;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace BarberSimulator.Core
{
    /// <summary>
    /// High-level game state machine: Main Menu → Intro → Gameplay ⇄ Paused, plus Continue and Return-to-Menu.
    /// Owns the transitions between states; individual systems stay unaware of each other.
    /// </summary>
    public sealed class GameFlowController : MonoBehaviour
    {
        private const float PositionSaveInterval = 4f;

        private GameContext _ctx;
        private SceneReferences _scene;
        private float _nextPositionSave;
        private bool _settingsFromPause;
        private bool _objectivesStarted;

        public GameState State { get; private set; } = GameState.Booting;

        public void Initialize(GameContext context, SceneReferences scene)
        {
            _ctx = context;
            _scene = scene;

            var ui = _ctx.UI;
            ui.MainMenu.ContinueClicked += OnContinue;
            ui.MainMenu.NewGameClicked += OnNewGameClicked;
            ui.MainMenu.NewGameConfirmed += StartNewGame;
            ui.MainMenu.SettingsClicked += () => OpenSettings(fromPause: false);
            ui.MainMenu.CreditsClicked += OpenCredits;
            ui.MainMenu.LanguageClicked += CycleLanguage;
            ui.Credits.BackClicked += CloseCredits;
            ui.Settings.BackClicked += CloseSettings;
            ui.Settings.LanguageSelected += SetLanguage;
            ui.Pause.ResumeClicked += Resume;
            ui.Pause.SettingsClicked += () => OpenSettings(fromPause: true);
            ui.Pause.MainMenuClicked += ReturnToMainMenu;

            _ctx.Input.PausePressed += OnPausePressed;
            _ctx.Input.ModeChanged += OnInputModeChanged;
            _ctx.Settings.Changed += ApplyRuntimeSettings;
            _ctx.Localization.LanguageChanged += RefreshMenuTexts;

            _ctx.Objectives.Started += OnObjectiveStarted;
            _ctx.Objectives.ProgressChanged += OnObjectiveProgress;
            _ctx.Objectives.Completed += OnObjectiveCompleted;
            _ctx.Objectives.SequenceCompleted += OnSequenceCompleted;
            _ctx.Economy.MoneyChanged += (balance, delta) => ui.Hud.SetMoney(balance, delta);

            _scene.Interactor.FocusChanged += OnFocusChanged;
            _scene.Intro.CutToStreet += () => SetMenuDressing(false);

            OnInputModeChanged(_ctx.Input.Mode);
            ApplyRuntimeSettings();
        }

        // ---------------------------------------------------------------- Main menu

        public void EnterMainMenu()
        {
            State = GameState.MainMenu;
            Time.timeScale = 1f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _scene.Interactor.SetActive(false);
            _scene.Player.SetControlEnabled(false);
            SetMenuDressing(true);

            var audio = _ctx.Audio;
            audio.PlayMusic(audio.Library.menuMusic, _ctx.Config.menuMusicLevel, 3f);
            audio.SetAmbience("shop", audio.Library.shopAmbience, _ctx.Config.shopAmbienceLevel * 0.8f, 3f);
            audio.SetAmbience("street", audio.Library.streetAmbience, _ctx.Config.streetAmbienceInside, 3f, _ctx.Config.insideStreetLowPass);

            RefreshMenuTexts();
            _ctx.UI.Hud.Hide(true);
            _ctx.UI.MainMenu.Show();
            _scene.MenuDirector.Play(fadeInFromBlack: true);
            StartCoroutine(_ctx.UI.GlobalFade.FadeTo(0f, 1.2f));
        }

        private void RefreshMenuTexts()
        {
            var menu = _ctx.UI.MainMenu;
            var save = _ctx.Save;
            string detail = string.Empty;
            if (save.HasActiveGame)
                detail = _ctx.Localization.Format("menu.continue_detail", save.Data.progression.day, Economy.EconomyService.Format(save.Data.player.money));
            menu.SetContinueState(save.HasActiveGame, detail);
            menu.SetLanguageLabel(_ctx.Localization.Get("menu.language") + ": " + LocalizationService.GetDisplayName(_ctx.Localization.CurrentLanguage));
            menu.SetVersion(_ctx.Config.versionLabel);
        }

        private void SetMenuDressing(bool visible)
        {
            if (_scene.MenuOnly != null) _scene.MenuOnly.SetActive(visible);
        }

        private void OnContinue()
        {
            if (State != GameState.MainMenu || !_ctx.Save.HasActiveGame) return;
            if (!_ctx.Save.Data.progression.introCompleted)
            {
                // Progress exists but the intro was interrupted: replay it.
                StartIntro(skipApproach: false);
                return;
            }
            StartCoroutine(ContinueRoutine());
        }

        private IEnumerator ContinueRoutine()
        {
            State = GameState.Transitioning;
            _ctx.UI.MainMenu.Hide();
            _ctx.Audio.PlayUI(_ctx.Audio.Library.uiWhoosh, 0.7f);
            yield return _ctx.UI.GlobalFade.FadeTo(1f, 0.6f);
            _scene.MenuDirector.Stop();
            SetMenuDressing(false);
            _ctx.UI.SceneFade.SetAlpha(0f);
            EnterGameplay(restorePosition: true);
            yield return new WaitForSeconds(0.2f);
            yield return _ctx.UI.GlobalFade.FadeTo(0f, 0.9f);
        }

        private void OnNewGameClicked()
        {
            if (State != GameState.MainMenu) return;
            if (_ctx.Save.HasActiveGame) _ctx.UI.MainMenu.ShowConfirm(true);
            else StartNewGame();
        }

        private void StartNewGame()
        {
            if (State != GameState.MainMenu) return;
            bool hadGame = _ctx.Save.HasActiveGame;
            _ctx.Save.StartNewGame();
            if (!hadGame)
            {
                StartIntro(skipApproach: false);
                return;
            }
            // The scene was restored from the old save (collected trash etc.). Reload it clean and go straight
            // into the intro.
            StartCoroutine(ReloadIntoIntro());
        }

        private IEnumerator ReloadIntoIntro()
        {
            State = GameState.Transitioning;
            _ctx.UI.MainMenu.Hide();
            yield return _ctx.UI.GlobalFade.FadeTo(1f, 0.5f);
            PendingStart.IntroRequested = true;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        // ---------------------------------------------------------------- Intro

        /// <param name="skipApproach">True when the screen is already black (after a reload).</param>
        public void StartIntro(bool skipApproach)
        {
            State = GameState.Intro;
            Time.timeScale = 1f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _scene.Player.SetControlEnabled(false);
            _scene.Interactor.SetActive(false);
            _ctx.UI.Hud.Hide(true);
            _ctx.UI.MainMenu.Hide();
            _ctx.UI.Credits.Hide(true);
            _scene.MenuDirector.Stop();
            _scene.Intro.Play(OnIntroFinished, skipApproach);
        }

        private void OnIntroFinished()
        {
            _ctx.Save.Data.progression.introCompleted = true;
            _ctx.Save.RequestSave();
            StartCoroutine(IntroToGameplay());
        }

        private IEnumerator IntroToGameplay()
        {
            bool screenIsBlack = _ctx.UI.GlobalFade.Alpha > 0.9f;
            var spawn = _scene.Shop.GameplaySpawn;
            _scene.Player.Teleport(spawn.position, spawn.eulerAngles.y, 4f);

            if (screenIsBlack)
            {
                _scene.CinematicCamera.AttachImmediate(_scene.Player.Head, _ctx.Config.gameplayFieldOfView);
            }
            else
            {
                yield return _scene.CinematicCamera.BlendToAttach(_scene.Player.Head, _ctx.Config.gameplayFieldOfView, 1.3f);
            }

            EnterGameplay(restorePosition: false);
            if (screenIsBlack) yield return _ctx.UI.GlobalFade.FadeTo(0f, 0.8f);
        }

        // ---------------------------------------------------------------- Gameplay

        private void EnterGameplay(bool restorePosition)
        {
            State = GameState.Gameplay;
            Time.timeScale = 1f;

            var player = _scene.Player;
            var data = _ctx.Save.Data.player;
            if (restorePosition && data.hasPosition)
            {
                player.Teleport(data.position, data.yaw, data.pitch);
            }
            else if (restorePosition)
            {
                var spawn = _scene.Shop.GameplaySpawn;
                player.Teleport(spawn.position, spawn.eulerAngles.y, 4f);
            }

            if (!_scene.CinematicCamera.IsAttached)
                _scene.CinematicCamera.AttachImmediate(player.Head, _ctx.Config.gameplayFieldOfView);

            player.SetControlEnabled(true);
            _scene.Interactor.SetActive(true);
            _ctx.Input.GameplayEnabled = true;
            _ctx.Input.SetCursorLock(true);

            var audio = _ctx.Audio;
            audio.PlayMusic(audio.Library.menuMusic, _ctx.Config.gameplayMusicLevel, 6f);
            audio.SetAmbience("shop", audio.Library.shopAmbience, _ctx.Config.shopAmbienceLevel, 2f);
            audio.SetAmbience("street", audio.Library.streetAmbience, _ctx.Config.streetAmbienceInside, 2f, _ctx.Config.insideStreetLowPass);

            var hud = _ctx.UI.Hud;
            hud.Show();
            hud.SetMoney(_ctx.Economy.Money, 0);
            hud.SetInteraction(false, null, null, false);

            if (!_objectivesStarted)
            {
                _objectivesStarted = true;
                StartCoroutine(BeginObjectivesSoon());
            }

            _nextPositionSave = Time.unscaledTime + PositionSaveInterval;
            _ctx.Save.RequestSave();
        }

        private IEnumerator BeginObjectivesSoon()
        {
            ClearObjectivePanel();
            yield return new WaitForSeconds(1.2f);
            _ctx.Objectives.Begin();
            _scene.Shop.ResyncObjectiveProgress();
        }

        private void ClearObjectivePanel() => _ctx.UI.Hud.SetObjective(string.Empty, 0, 0);

        private void OnObjectiveStarted(ObjectiveDefinition objective)
        {
            var loc = _ctx.Localization;
            var title = loc.Get(objective.TitleKey);
            _ctx.UI.Hud.SetObjective(title, _ctx.Objectives.Progress, objective.TargetCount);
            _ctx.UI.Hud.ShowBanner(loc.Get("hud.new_objective"), title, complete: false);
            _ctx.Audio.PlayUI(_ctx.Audio.Library.uiToast, 0.9f);

            if (_ctx.Settings.Data.tutorialHints && !string.IsNullOrEmpty(objective.HintKey))
            {
                bool touch = _ctx.Input.Mode == InputDeviceMode.Touch;
                string key = touch ? objective.HintKey + ".touch" : objective.HintKey;
                string hint = loc.Get(key);
                if (hint == key) hint = loc.Get(objective.HintKey);
                _ctx.UI.Hud.ShowHint(hint);
            }
        }

        private void OnObjectiveProgress(ObjectiveDefinition objective, int progress)
        {
            _ctx.UI.Hud.SetObjective(_ctx.Localization.Get(objective.TitleKey), progress, objective.TargetCount);
        }

        private void OnObjectiveCompleted(ObjectiveDefinition objective)
        {
            _ctx.UI.Hud.ShowBanner(_ctx.Localization.Get("hud.objective_complete"), _ctx.Localization.Get(objective.TitleKey), complete: true);
            _ctx.Audio.PlaySfx(_ctx.Audio.Library.objectiveComplete, 0.8f);
            _ctx.Save.RequestSave();
        }

        private void OnSequenceCompleted()
        {
            var key = _ctx.Objectives.Sequence.CompletedTitleKey;
            _ctx.UI.Hud.SetObjective(_ctx.Localization.Get(key), 0, 0);
        }

        private void OnFocusChanged(IInteractable target, InteractionPrompt prompt, bool canInteract)
        {
            var hud = _ctx.UI.Hud;
            if (target == null || State != GameState.Gameplay)
            {
                hud.SetInteraction(false, null, null, false);
                return;
            }

            var loc = _ctx.Localization;
            string verb = loc.Get("verb." + prompt.Verb.ToString().ToLowerInvariant());
            string label = string.IsNullOrEmpty(prompt.LabelKey) ? string.Empty : loc.Get(prompt.LabelKey);
            hud.SetInteraction(true, verb, label, canInteract);
        }

        // ---------------------------------------------------------------- Pause

        private void OnPausePressed()
        {
            switch (State)
            {
                case GameState.Gameplay:
                    Pause();
                    break;
                case GameState.Paused:
                    if (_ctx.UI.Settings.IsVisible) CloseSettings();
                    else Resume();
                    break;
                case GameState.MainMenu:
                    if (_ctx.UI.Settings.IsVisible) CloseSettings();
                    else if (_ctx.UI.Credits.IsVisible) CloseCredits();
                    break;
            }
        }

        public void Pause()
        {
            if (State != GameState.Gameplay) return;
            State = GameState.Paused;
            Time.timeScale = 0f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _ctx.UI.Hud.SetInteraction(false, null, null, false);
            _ctx.UI.Pause.Show();
            _ctx.Audio.PlayBack();
            WritePlayerTransform();
            _ctx.Save.SaveNow();
        }

        public void Resume()
        {
            if (State != GameState.Paused) return;
            _ctx.UI.Settings.Hide();
            _ctx.UI.Pause.Hide();
            State = GameState.Gameplay;
            Time.timeScale = 1f;
            _ctx.Input.GameplayEnabled = true;
            _ctx.Input.SetCursorLock(true);
        }

        private void ReturnToMainMenu()
        {
            if (State != GameState.Paused) return;
            StartCoroutine(ReturnToMenuRoutine());
        }

        private IEnumerator ReturnToMenuRoutine()
        {
            State = GameState.Transitioning;
            WritePlayerTransform();
            _ctx.Save.SaveNow();
            _ctx.UI.Pause.Hide();
            yield return _ctx.UI.GlobalFade.FadeTo(1f, 0.5f);
            Time.timeScale = 1f;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        // ---------------------------------------------------------------- Settings / credits / language

        private void OpenSettings(bool fromPause)
        {
            _settingsFromPause = fromPause;
            var ui = _ctx.UI;
            if (fromPause) ui.Pause.Hide();
            else ui.MainMenu.Hide();
            ui.Settings.SetBackdrop(fromPause);
            ui.Settings.Show();
        }

        private void CloseSettings()
        {
            var ui = _ctx.UI;
            ui.Settings.Hide();
            _ctx.Audio.PlayBack();
            if (_settingsFromPause && State == GameState.Paused) ui.Pause.Show();
            else if (State == GameState.MainMenu) ui.MainMenu.Show();
        }

        private void OpenCredits()
        {
            _ctx.UI.MainMenu.Hide();
            _ctx.UI.Credits.Show();
        }

        private void CloseCredits()
        {
            _ctx.UI.Credits.Hide();
            _ctx.Audio.PlayBack();
            _ctx.UI.MainMenu.Show();
        }

        private void CycleLanguage() => SetLanguage(_ctx.Localization.NextLanguage());

        private void SetLanguage(string code)
        {
            _ctx.Settings.SetLanguage(code);
            _ctx.Localization.SetLanguage(code);
            if (_ctx.Objectives.Current != null) OnObjectiveProgress(_ctx.Objectives.Current, _ctx.Objectives.Progress);
            else if (_ctx.Objectives.AllComplete) OnSequenceCompleted();
        }

        private void ApplyRuntimeSettings()
        {
            var s = _ctx.Settings.Data;
            _scene.Player.CameraBobEnabled = s.cameraBob;
            if (_scene.Mirror != null) _scene.Mirror.ApplyQuality(s.quality);
            var touch = _ctx.UI.Hud.TouchControls;
            if (touch != null) touch.ApplySettings(s.joystickOpacity, s.dynamicJoystick);
        }

        private void OnInputModeChanged(InputDeviceMode mode)
        {
            _ctx.UI.SetTouchMode(mode == InputDeviceMode.Touch);
            if (_scene.Interactor.Focused != null && State == GameState.Gameplay)
                OnFocusChanged(_scene.Interactor.Focused, _scene.Interactor.Focused.GetPrompt(_scene.InteractionContext), _scene.Interactor.Focused.CanInteract(_scene.InteractionContext));
        }

        // ---------------------------------------------------------------- Persistence

        private void Update()
        {
            if (State == GameState.Gameplay)
            {
                _ctx.UI.Hud.SetCaptureHint(_ctx.Input.NeedsClickToCapture);
                if (Time.unscaledTime >= _nextPositionSave)
                {
                    _nextPositionSave = Time.unscaledTime + PositionSaveInterval;
                    WritePlayerTransform();
                    _ctx.Save.RequestSave();
                }
            }
            else
            {
                _ctx.UI.Hud.SetCaptureHint(false);
            }
        }

        private void WritePlayerTransform()
        {
            if (State != GameState.Gameplay && State != GameState.Paused && State != GameState.Transitioning) return;
            if (!_ctx.Save.Data.progression.introCompleted) return;
            var data = _ctx.Save.Data.player;
            data.hasPosition = true;
            data.position = _scene.Player.transform.position;
            data.yaw = _scene.Player.Yaw;
            data.pitch = _scene.Player.Pitch;
        }

        private void OnApplicationPause(bool paused)
        {
            if (!paused || _ctx == null) return;
            WritePlayerTransform();
            _ctx.Save.SaveNow();
        }

        private void OnApplicationFocus(bool focused)
        {
            if (focused || _ctx == null) return;
            WritePlayerTransform();
            _ctx.Save.SaveNow();
            // Losing the browser tab mid-game opens the pause menu instead of leaving the player walking.
            if (State == GameState.Gameplay) Pause();
        }
    }

    /// <summary>Carries a request across a scene reload (e.g. "start the intro right away").</summary>
    public static class PendingStart
    {
        public static bool IntroRequested;
    }
}
