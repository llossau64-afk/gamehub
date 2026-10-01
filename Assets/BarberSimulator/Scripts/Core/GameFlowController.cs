using System.Collections;
using BarberSimulator.CameraSystems;
using BarberSimulator.Cinematics;
using BarberSimulator.Input;
using BarberSimulator.Interaction;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
using BarberSimulator.Player;
using BarberSimulator.Shop;
using BarberSimulator.UI;
using BarberSimulator.Workday;
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
        private GameState _stateBeforePause = GameState.Gameplay;
        private const string ServeFirstCustomerObjective = "serve_first_customer";

        private GameState _state = GameState.Booting;

        public GameState State
        {
            get => _state;
            private set
            {
                if (_state == value) return;
                var previous = _state;
                _state = value;
                StateChanged?.Invoke(previous, value);
            }
        }

        public event System.Action<GameState, GameState> StateChanged;

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
            ui.Pause.AchievementsClicked += OpenAchievements;
            ui.Achievements.BackClicked += CloseAchievements;
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
            if (_scene.BarberMode != null)
            {
                _scene.BarberMode.Exited += OnBarberModeExited;
                if (_scene.CustomerSite != null)
                    foreach (var chair in _scene.CustomerSite.Chairs) chair.HaircutRequested += EnterBarberMode;
            }
            _ctx.Economy.ServicePaid += OnServicePaid;
            _scene.Intro.CutToStreet += () => SetMenuDressing(false);

            // Workday loop, upgrade store and end-of-day summary.
            ui.Store.CloseClicked += CloseStore;
            ui.Summary.NextDayClicked += OnNextDayClicked;
            ui.Summary.DoubleTipsClicked += OnDoubleTipsClicked;
            _ctx.Day.OpenGate = IsOpeningAllowed;
            _ctx.Day.PhaseChanged += OnDayPhaseChanged;
            _ctx.Day.ClockChanged += RefreshWorkdayHud;
            _ctx.Day.DayStarted += _ => RefreshWorkdayHud();
            _ctx.Progression.XpGained += _ => RefreshWorkdayHud();
            _ctx.Progression.LevelChanged += OnLevelChanged;
            _ctx.Upgrades.Purchased += OnUpgradePurchased;
            _ctx.Localization.LanguageChanged += RefreshWorkdayHud;
            if (_scene.Computer != null) _scene.Computer.Used += OpenStore;

            OnInputModeChanged(_ctx.Input.Mode);
            ApplyRuntimeSettings();
        }

        // ---------------------------------------------------------------- Main menu

        public void EnterMainMenu()
        {
            State = GameState.MainMenu;
            _ctx.Day.Running = false;
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
            // The menu is visible from the very first frame: no fade from black, the camera already shows the shop.
            _ctx.UI.GlobalFade.SetAlpha(0f);
            _ctx.UI.SceneFade.SetAlpha(0f);
            _ctx.UI.MainMenu.Show();
            _scene.MenuCamera.Play();
            if (_scene.MenuAtmosphere != null) _scene.MenuAtmosphere.SetMenuActive(true);
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
            if (_scene.MenuAtmosphere != null) _scene.MenuAtmosphere.SetMenuActive(false);
            yield return new WaitForSecondsRealtime(0.45f);

            // Glide from the menu shot straight into the player's eyes where the last session ended.
            _scene.MenuCamera.Stop();
            var player = _scene.Player;
            var data = _ctx.Save.Data.player;
            if (data.hasPosition) player.Teleport(data.position, data.yaw, data.pitch);
            else
            {
                var spawn = _scene.Shop.GameplaySpawn;
                player.Teleport(spawn.position, spawn.eulerAngles.y, 4f);
            }
            yield return _scene.CinematicCamera.BlendToAttach(player.Head, _ctx.Config.gameplayFieldOfView, 1.6f);
            SetMenuDressing(false);
            EnterGameplay(restorePosition: false);
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
            yield return LoadSceneAsync();
        }

        /// <summary>
        /// Reloads the shop scene in the background while the loading screen (logo, barber pole, tips) is shown, so
        /// the screen never sits frozen and black.
        /// </summary>
        private IEnumerator LoadSceneAsync()
        {
            var loading = _ctx.UI.Loading;
            if (loading != null)
            {
                loading.Show();
                loading.SetProgress(0f);
            }
            _ctx.UI.GlobalFade.SetAlpha(0f);
            yield return null;
            var operation = SceneManager.LoadSceneAsync(SceneManager.GetActiveScene().buildIndex);
            if (operation == null) yield break;
            while (!operation.isDone)
            {
                if (loading != null) loading.SetProgress(Mathf.Clamp01(operation.progress / 0.9f));
                yield return null;
            }
        }

        // ---------------------------------------------------------------- Intro

        /// <param name="skipApproach">True when the screen is already black (after a reload).</param>
        public void StartIntro(bool skipApproach)
        {
            StartCoroutine(StartIntroRoutine(skipApproach));
        }

        private IEnumerator StartIntroRoutine(bool skipApproach)
        {
            State = GameState.Intro;
            _ctx.Day.Running = false;
            Time.timeScale = 1f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _scene.Player.SetControlEnabled(false);
            _scene.Interactor.SetActive(false);
            _ctx.UI.Hud.Hide(true);
            _ctx.UI.Credits.Hide(true);
            // Fade the menu away first (~0.7 s), never teleport straight into the cinematic.
            bool menuWasVisible = _ctx.UI.MainMenu.IsVisible;
            _ctx.UI.MainMenu.Hide();
            if (_scene.MenuAtmosphere != null) _scene.MenuAtmosphere.SetMenuActive(false);
            if (menuWasVisible)
            {
                _ctx.Audio.PlayUI(_ctx.Audio.Library.uiWhoosh, 0.6f);
                yield return new WaitForSecondsRealtime(0.7f);
            }
            _scene.MenuCamera.Stop();
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

            // First gameplay moment: Day 1 and the first objective.
            var loc = _ctx.Localization;
            _ctx.UI.Hud.ShowBanner(loc.Get("intro.day1_banner"), loc.Get("intro.day1_sub"), complete: false);
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
            ResumeWorkday();

            _nextPositionSave = Time.unscaledTime + PositionSaveInterval;
            _ctx.Save.RequestSave();
        }

        private IEnumerator BeginObjectivesSoon()
        {
            ClearObjectivePanel();
            // Let the "Day 1" banner breathe before the first objective is announced.
            yield return new WaitForSeconds(3.2f);
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

        // ---------------------------------------------------------------- Shop & barber mode

        // ---------------------------------------------------------------- Workday

        /// <summary>Day 1: the sign only works once the player has done the tidying and is asked to serve the first customer.</summary>
        private bool IsOpeningAllowed()
        {
            if (_ctx.Save.Data.progression.firstCustomerTutorialCompleted) return true;
            var current = _ctx.Objectives.Current;
            return _ctx.Objectives.AllComplete || (current != null && current.ObjectiveId == ServeFirstCustomerObjective);
        }

        /// <summary>Gameplay (re)started: restore the day from the save and re-apply the owned upgrades.</summary>
        private void ResumeWorkday()
        {
            _ctx.Progression.SyncSavedLevel();
            _ctx.Upgrades.Refresh();
            _ctx.Day.Restore();
            _ctx.Day.Running = true;
            ApplyShopOpenState();
            RefreshWorkdayHud();
            _ctx.RewardsUI.Refresh();
        }

        /// <summary>The spawner follows the day phase: customers only come while the shop is open.</summary>
        private void ApplyShopOpenState()
        {
            if (_scene.CustomerSpawner == null) return;
            bool open = _ctx.Day.IsAcceptingCustomers;
            if (open != _scene.CustomerSpawner.IsOpen)
                _scene.CustomerSpawner.SetOpen(open, tutorialFirst: !_ctx.Save.Data.progression.firstCustomerTutorialCompleted);
        }

        private void OnDayPhaseChanged(DayPhase previous, DayPhase phase)
        {
            var loc = _ctx.Localization;
            var hud = _ctx.UI.Hud;
            ApplyShopOpenState();
            if (phase == DayPhase.Open)
            {
                hud.ShowToast(loc.Get("toast.shop_open"));
                _ctx.Audio.PlayUI(_ctx.Audio.Library.uiToast, 0.9f);
            }
            else if (phase == DayPhase.Closing)
            {
                hud.ShowBanner(loc.Get("hud.closing"), loc.Get("hud.closing_title"), complete: false);
                _ctx.Audio.PlayUI(_ctx.Audio.Library.uiToast, 0.9f);
            }
            RefreshWorkdayHud();
            _ctx.Save.RequestSave();
        }

        private void RefreshWorkdayHud()
        {
            var loc = _ctx.Localization;
            var day = _ctx.Day;
            string stateKey = "hud.state.closed";
            var style = ShopStatusStyle.Closed;
            if (day.Phase == DayPhase.Open) { stateKey = "hud.state.open"; style = ShopStatusStyle.Open; }
            else if (day.Phase == DayPhase.Closing) { stateKey = "hud.state.closing"; style = ShopStatusStyle.Closing; }

            var hud = _ctx.UI.Hud;
            hud.SetWorkday(loc.Format("hud.day", day.Day), day.ClockText, loc.Get(stateKey), style);
            hud.SetLevel(loc.Format("hud.level", _ctx.Progression.Level), _ctx.Progression.Progress01);
        }

        private void OnLevelChanged(int previous, int level)
        {
            var loc = _ctx.Localization;
            _ctx.UI.Hud.ShowBanner(loc.Get("hud.level_up"), loc.Format("hud.level_title", level), complete: true, celebrate: true);
            _ctx.UI.Hud.ShowToast(loc.Get("toast.new_upgrades"));
            _ctx.Audio.PlaySfx(_ctx.Audio.Library.objectiveComplete, 0.8f);
            RefreshWorkdayHud();
        }

        // ---------------------------------------------------------------- Upgrade store

        private void OpenStore()
        {
            if (State != GameState.Gameplay) return;
            State = GameState.Store;
            Time.timeScale = 0f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _scene.Interactor.SetActive(false);
            _ctx.UI.Hud.SetInteraction(false, null, null, false);
            _ctx.UI.Hud.Hide();
            _ctx.Audio.PlayClick();
            _ctx.UI.Store.Show();
        }

        private void CloseStore()
        {
            if (State != GameState.Store) return;
            _ctx.UI.Store.Hide();
            Time.timeScale = 1f;
            State = GameState.Gameplay;
            _ctx.Input.GameplayEnabled = true;
            _ctx.Input.SetCursorLock(true);
            _scene.Interactor.SetActive(true);
            _ctx.UI.Hud.Show();
            _ctx.Audio.PlayBack();
            _ctx.Save.SaveNow();
        }

        private void OnUpgradePurchased(UpgradeDefinition upgrade)
        {
            var library = _ctx.Audio.Library;
            if (library != null) _ctx.Audio.PlaySfx(library.cashRegister, 0.8f);
            _ctx.Save.SaveNow();
        }

        // ---------------------------------------------------------------- End of day

        private void EnterDaySummary()
        {
            if (State != GameState.Gameplay) return;
            State = GameState.DaySummary;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.SetCursorLock(false);
            _scene.Interactor.SetActive(false);
            _ctx.UI.Hud.SetInteraction(false, null, null, false);
            _ctx.UI.Hud.Hide();
            WritePlayerTransform();
            _ctx.Save.SaveNow();
            var library = _ctx.Audio.Library;
            if (library != null) _ctx.Audio.PlaySfx(library.objectiveComplete, 0.7f);
            var summary = _ctx.Day.BuildSummary();
            _ctx.UI.Summary.Show(summary);
            _tipBonusOffered = summary.Tips;
            _ctx.UI.Summary.SetDoubleTipsOffer(_ctx.Ads != null && _ctx.Ads.RewardedAvailable, _tipBonusOffered);
        }

        private int _tipBonusOffered;

        /// <summary>Rewarded ad on the end-of-day screen: watching it pays today's tips a second time.</summary>
        private void OnDoubleTipsClicked()
        {
            if (State != GameState.DaySummary || _tipBonusOffered <= 0 || _ctx.Ads == null) return;
            int bonus = _tipBonusOffered;
            _tipBonusOffered = 0;
            _ctx.UI.Summary.SetDoubleTipsOffer(false, 0);
            _ctx.Ads.ShowRewarded(
                onRewarded: () =>
                {
                    _ctx.Economy.Add(bonus);
                    _ctx.UI.Summary.ApplyTipBonus(bonus);
                    _ctx.Save.SaveNow();
                    if (_ctx.Audio.Library != null) _ctx.Audio.PlayUI(_ctx.Audio.Library.uiToast, 0.9f);
                },
                onFailed: () =>
                {
                    // No reward without a completed ad; offer again only if ads are still available.
                    _tipBonusOffered = bonus;
                    _ctx.UI.Summary.SetDoubleTipsOffer(_ctx.Ads.RewardedAvailable, bonus);
                });
        }

        private void OnNextDayClicked()
        {
            if (State != GameState.DaySummary) return;
            StartCoroutine(NextDayRoutine());
        }

        private IEnumerator NextDayRoutine()
        {
            State = GameState.Transitioning;
            _ctx.UI.Summary.SetDoubleTipsOffer(false, 0);
            // Natural break between days: the portal may show an interstitial (skipped if one played recently).
            if (_ctx.Ads != null)
            {
                bool adDone = false;
                _ctx.Ads.ShowMidgame(() => adDone = true);
                while (!adDone) yield return null;
            }
            IScreenFade fade = _ctx.UI.GlobalFade;
            yield return fade.FadeTo(1f, 0.5f);
            _ctx.UI.Summary.Hide(true);
            _ctx.Day.StartNextDay();
            yield return new WaitForSecondsRealtime(0.3f);

            State = GameState.Gameplay;
            _ctx.Input.GameplayEnabled = true;
            _ctx.Input.SetCursorLock(true);
            _scene.Interactor.SetActive(true);
            _ctx.UI.Hud.Show();
            RefreshWorkdayHud();
            yield return fade.FadeTo(0f, 0.7f);

            var loc = _ctx.Localization;
            _ctx.UI.Hud.ShowBanner(loc.Get("hud.new_day"), loc.Format("hud.day_title", _ctx.Day.Day), complete: false);
        }

        private void OnServicePaid(Economy.ServicePayment payment)
        {
            var progression = _ctx.Save.Data.progression;
            if (!progression.firstCustomerTutorialCompleted)
            {
                progression.firstCustomerTutorialCompleted = true;
                _ctx.Save.RequestSave();
            }
        }

        private void EnterBarberMode(Customers.BarberChairStation chair)
        {
            if (State != GameState.Gameplay || _scene.BarberMode == null || !_scene.BarberMode.CanStart(chair)) return;
            State = GameState.BarberMode;
            _scene.Interactor.SetActive(false);
            _ctx.UI.Hud.SetInteraction(false, null, null, false);
            _ctx.UI.Hud.Hide();
            _scene.BarberMode.Begin(chair);
            if (!_scene.BarberMode.IsActive)
            {
                // Could not start (e.g. missing hair data): fall back to normal play.
                State = GameState.Gameplay;
                _scene.Interactor.SetActive(true);
                _ctx.UI.Hud.Show();
            }
        }

        private void OnBarberModeExited()
        {
            if (State != GameState.BarberMode) return;
            State = GameState.Gameplay;
            _scene.Interactor.SetActive(true);
            _ctx.UI.Hud.Show();
            WritePlayerTransform();
            _ctx.Save.RequestSave();
        }

        // ---------------------------------------------------------------- Pause

        private void OnPausePressed()
        {
            switch (State)
            {
                case GameState.Gameplay:
                case GameState.BarberMode:
                    Pause();
                    break;
                case GameState.Paused:
                    if (_ctx.UI.Settings.IsVisible) CloseSettings();
                    else if (_ctx.UI.Achievements.IsVisible) CloseAchievements();
                    else Resume();
                    break;
                case GameState.Store:
                    CloseStore();
                    break;
                case GameState.MainMenu:
                    if (_ctx.UI.Settings.IsVisible) CloseSettings();
                    else if (_ctx.UI.Credits.IsVisible) CloseCredits();
                    break;
            }
        }

        public void Pause()
        {
            if (State != GameState.Gameplay && State != GameState.BarberMode) return;
            _stateBeforePause = State;
            State = GameState.Paused;
            Time.timeScale = 0f;
            _ctx.Input.GameplayEnabled = false;
            _ctx.Input.BarberEnabled = false;
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
            State = _stateBeforePause;
            Time.timeScale = 1f;
            if (State == GameState.BarberMode)
            {
                _ctx.Input.BarberEnabled = true;
                return;
            }
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
            yield return _ctx.UI.GlobalFade.FadeTo(1f, 0.4f);
            Time.timeScale = 1f;
            yield return LoadSceneAsync();
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

        private void OpenAchievements()
        {
            if (State != GameState.Paused) return;
            _ctx.UI.Pause.Hide();
            _ctx.UI.Achievements.Show();
        }

        private void CloseAchievements()
        {
            _ctx.UI.Achievements.Hide();
            _ctx.Audio.PlayBack();
            if (State == GameState.Paused) _ctx.UI.Pause.Show();
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
                if (_ctx.Day.Phase == DayPhase.Ended)
                {
                    EnterDaySummary();
                    return;
                }
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
            if (_ctx.Ads != null && _ctx.Ads.IsAdPlaying) return; // the ad overlay steals focus; the ad service already froze the game
            if (State == GameState.Gameplay || State == GameState.BarberMode) Pause();
        }
    }

    /// <summary>Carries a request across a scene reload (e.g. "start the intro right away").</summary>
    public static class PendingStart
    {
        public static bool IntroRequested;
    }
}
