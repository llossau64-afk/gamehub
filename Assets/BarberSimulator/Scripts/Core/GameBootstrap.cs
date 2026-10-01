using BarberSimulator.Audio;
using BarberSimulator.Economy;
using BarberSimulator.Input;
using BarberSimulator.Interaction;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
using BarberSimulator.Platform;
using BarberSimulator.Save;
using BarberSimulator.Settings;
using BarberSimulator.UI;
using UnityEngine;

namespace BarberSimulator.Core
{
    /// <summary>
    /// Composition root. Creates every service once, wires scene objects and hands control to
    /// <see cref="GameFlowController"/>. This is the only place that knows about all systems.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameBootstrap : MonoBehaviour
    {
        [SerializeField] private GameConfig config;
        [SerializeField] private SceneReferences scene = new SceneReferences();

        private GameContext _context;
        private GameFlowController _flow;
        private PlatformFlowBridge _platformBridge;

        public void Configure(GameConfig gameConfig, SceneReferences references)
        {
            config = gameConfig;
            scene = references;
        }

        private void Awake()
        {
            if (config == null)
            {
                Debug.LogError("[Bootstrap] GameConfig is missing. Run 'Barber Simulator > Build Project Content'.");
                enabled = false;
                return;
            }

            Application.runInBackground = true;
            Time.timeScale = 1f;

            var ctx = new GameContext { Config = config };

            // The portal comes first: it reports loading, and its data module backs the save.
            ctx.Platform = PlatformServiceFactory.GetOrCreate(config.platform);
            PlatformHooks.Current = ctx.Platform;
            ctx.Platform.LoadingStart();
            ctx.Platform.Initialize(null);

            ctx.Save = new SaveService(new PlatformSaveStorage(ctx.Platform, new PlayerPrefsSaveStorage()), config.startingMoney);
            ctx.Save.Load();

            ctx.Quality = new QualityApplier();
            foreach (var light in scene.ShadowLights) ctx.Quality.RegisterShadowLight(light);
            ctx.Quality.RegisterCamera(scene.MainCamera);
            ctx.Settings = new SettingsService(ctx.Save, ctx.Quality);
            ctx.Settings.Initialize();

            ctx.Localization = new LocalizationService();
            var language = ctx.Settings.Data.language;
            if (string.IsNullOrEmpty(language))
            {
                language = ResolveLanguage(ctx.Platform);
                ctx.Settings.SetLanguage(language);
            }
            ctx.Localization.SetLanguage(language);

            var audioGo = new GameObject("Audio");
            audioGo.transform.SetParent(transform, false);
            ctx.Audio = audioGo.AddComponent<AudioService>();
            ctx.Audio.Initialize(config.sounds, ctx.Settings.Data);

            ctx.Input = new InputService(ctx.Settings.Data);
            ctx.Ads = new AdService(ctx.Platform, ctx.Audio, ctx.Input);
            ctx.Economy = new EconomyService(ctx.Save);
            ctx.Objectives = new ObjectiveService(config.objectives, ctx.Save, ctx.Economy);

            ctx.Progression = new Shop.ShopProgression(ctx.Save, ctx.Economy);
            ctx.UpgradeEffects = new Shop.UpgradeEffects();
            ctx.Upgrades = new Shop.UpgradeService(config.upgrades, ctx.Save, ctx.Economy, ctx.Progression, ctx.UpgradeEffects);
            var workday = config.workday != null ? config.workday : ScriptableObject.CreateInstance<Workday.WorkdayConfig>();
            ctx.Day = new Workday.DayCycleService(workday, ctx.Save, ctx.Economy, ctx.Progression);

            var uiGo = new GameObject("UI");
            uiGo.transform.SetParent(transform, false);
            ctx.UI = uiGo.AddComponent<UIRoot>();
            ctx.UI.Build(config.uiTheme, new LocalizationBinder(ctx.Localization), ctx.Audio, ctx.Input);
            ctx.UI.BindSettings(ctx.Settings);
            ctx.UI.BuildDeferred();

            WireScene(ctx);

            _context = ctx;
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            gameObject.AddComponent<Debugging.DevTools>().Initialize(scene.CustomerSpawner, ctx.Economy, scene.BarberMode);
#endif
            _flow = gameObject.AddComponent<GameFlowController>();
            _flow.Initialize(ctx, scene);
            _platformBridge = new PlatformFlowBridge(ctx.Platform, _flow);
        }

        private static string ResolveLanguage(IPlatformService platform)
        {
            var hint = platform.LanguageHint;
            if (!string.IsNullOrEmpty(hint))
                foreach (var language in LocalizationService.Languages)
                    if (language.Code == hint) return hint;
            return LocalizationService.DetectSystemLanguage();
        }

        private void WireScene(GameContext ctx)
        {
            var player = scene.Player;
            player.Initialize(ctx.Input);
            scene.PlayerAudio.Initialize(player, ctx.Audio);

            scene.InteractionContext = new InteractionContext
            {
                Player = player.transform,
                Camera = scene.MainCamera,
                Controller = player,
                Hands = scene.Hands
            };
            scene.Interactor.Initialize(ctx.Input, scene.InteractionContext);

            var services = new InteractionServices
            {
                Audio = ctx.Audio,
                Objectives = ctx.Objectives,
                Save = ctx.Save,
                Toasts = ctx.UI.Hud,
                Localization = ctx.Localization
            };
            scene.Shop.Initialize(ctx.Save, ctx.Objectives, services, player.transform);
            ctx.Upgrades.BindScene(scene.Shop);
            ctx.Upgrades.Refresh();
            ctx.UI.Store.Bind(ctx.Upgrades, ctx.Progression, ctx.Economy);

            ctx.Day.ActiveCustomers = () => scene.CustomerSpawner != null ? scene.CustomerSpawner.Active.Count : 0;
            ctx.Day.SendHomeRequested += () => { if (scene.CustomerSpawner != null) scene.CustomerSpawner.SendWaitingCustomersHome(); };
            if (scene.Sign != null) scene.Sign.Attach(ctx.Day);

            scene.MenuDirector.Initialize(scene.CinematicCamera, ctx.UI.SceneFade);

            if (scene.BarberMode != null)
                scene.BarberMode.SetToolbox(ctx.Upgrades.BuildToolbox);
            if (scene.BarberMode != null)
                scene.BarberMode.Initialize(scene.CinematicCamera, player, scene.Hands, ctx.Input, ctx.Audio, ctx.Localization, ctx.UI.Barber, config.gameplayFieldOfView);

            if (scene.CustomerSpawner != null)
            {
                scene.CustomerSpawner.Initialize(new Customers.CustomerServices
                {
                    Audio = ctx.Audio,
                    Localization = ctx.Localization,
                    Economy = ctx.Economy,
                    Objectives = ctx.Objectives,
                    Save = ctx.Save,
                    Dialogue = ctx.UI.Conversation,
                    Reviews = ctx.UI.Reviews,
                    Toasts = ctx.UI.Hud,
                    Upgrades = ctx.UpgradeEffects,
                    Progression = ctx.Progression
                });
            }
            scene.Intro.Initialize(ctx, scene.CinematicCamera);
        }

        private void Start()
        {
            if (_flow == null) return;
            if (PendingStart.IntroRequested)
            {
                PendingStart.IntroRequested = false;
                _flow.StartIntro(skipApproach: true);
            }
            else
            {
                _flow.EnterMainMenu();
            }
        }

        private void Update()
        {
            if (_context == null) return;
            _context.Input.Tick();
            _context.Day.Tick(Time.deltaTime);
            _context.Save.Tick(Time.unscaledTime);
        }

        private void OnDestroy()
        {
            _context?.Input.Dispose();
        }
    }
}
