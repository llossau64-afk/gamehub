using BarberSimulator.Audio;
using BarberSimulator.Input;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Builds the canvas stack and every view from code (styled by <see cref="UITheme"/>):
    /// scene fade (under the UI) → main UI (safe-area aware) → global fade (over everything).
    /// </summary>
    public sealed class UIRoot : MonoBehaviour
    {
        public ScreenFader SceneFade { get; private set; }
        public ScreenFader GlobalFade { get; private set; }
        public MainMenuView MainMenu { get; private set; }
        public SettingsView Settings { get; private set; }
        public CreditsView Credits { get; private set; }
        public PauseView Pause { get; private set; }
        public HudView Hud { get; private set; }
        public CinematicView Cinematic { get; private set; }
        public BarberModeView Barber { get; private set; }
        public GameplayDialogueView Conversation { get; private set; }
        public ReviewCardView Reviews { get; private set; }
        public ShopStoreView Store { get; private set; }
        public DaySummaryView Summary { get; private set; }
        public AchievementsView Achievements { get; private set; }
        public HowToPlayView HowToPlay { get; private set; }
        /// <summary>Full-screen loading screen with logo, barber pole, progress bar and tips (above every fade).</summary>
        public LoadingView Loading { get; private set; }
        public MenuAudioManager MenuAudio { get; private set; }
        public UIFactory Factory { get; private set; }

        private ResponsiveCanvasScaler _scaler;
        private AudioService _audio;

        public void Build(UITheme theme, LocalizationBinder binder, AudioService audio, InputService input)
        {
            _audio = audio;
            Factory = new UIFactory(theme, binder);
            EnsureEventSystem();

            SceneFade = CreateFader("Scene Fade", 0, 0f);
            var main = CreateCanvas("Main UI", 10, out _scaler);
            var safe = UIFactory.Rect("Safe Area", main.transform);
            safe.gameObject.AddComponent<SafeAreaFitter>();

            Hud = CreateView<HudView>("HUD", safe, v => { });
            Hud.BuildTouchControls(input, audio.PlayClick);
            Barber = CreateView<BarberModeView>("Barber Mode", safe, v => v.Bind(input, audio.PlayClick));
            Conversation = CreateView<GameplayDialogueView>("Conversation", safe, v => v.Bind(input, audio.PlayClick));
            Reviews = CreateView<ReviewCardView>("Reviews", safe, v => v.Bind(audio));
            Store = CreateView<ShopStoreView>("Shop Store", safe, v => v.RegisterSounds = RegisterSounds);
            Summary = CreateView<DaySummaryView>("Day Summary", safe, v => v.RegisterSounds = RegisterSounds);
            Cinematic = CreateView<CinematicView>("Cinematic", safe, v => { });

            var menuAudioGo = new GameObject("Menu Audio");
            menuAudioGo.transform.SetParent(transform, false);
            MenuAudio = menuAudioGo.AddComponent<MenuAudioManager>();
            MenuAudio.Initialize(audio);

            MainMenu = CreateView<MainMenuView>("Main Menu", safe, v =>
            {
                v.RegisterSounds = RegisterNavSounds;
                v.MenuAudio = MenuAudio;
            });
            Credits = CreateView<CreditsView>("Credits", safe, v => v.RegisterSounds = RegisterNavSounds);
            Pause = CreateView<PauseView>("Pause", safe, v => v.RegisterSounds = RegisterSounds);
            Achievements = CreateView<AchievementsView>("Achievements", safe, v => v.RegisterSounds = RegisterNavSounds);
            HowToPlay = CreateView<HowToPlayView>("How To Play", safe, v => v.RegisterSounds = RegisterNavSounds);
            Settings = CreateView<SettingsView>("Settings", safe, v => v.RegisterSounds = RegisterNavSounds);

            GlobalFade = CreateFader("Global Fade", 100, 0f);

            var loadingCanvas = CreateCanvas("Loading", 105, out _);
            Loading = CreateView<LoadingView>("Loading Screen", loadingCanvas.transform, v => { });

            var orientationCanvas = CreateCanvas("Orientation Hint", 110, out _);
            var hint = UIFactory.Rect("Rotate Device", orientationCanvas.transform);
            hint.gameObject.AddComponent<OrientationHint>().Build(Factory);
        }

        /// <summary>Settings need services bound before their controls are built.</summary>
        public void BindSettings(Settings.SettingsService settings)
        {
            Settings.Bind(settings, _audio.PlayHover, _audio.PlayClick);
        }

        public void SetTouchMode(bool touch)
        {
            _scaler.SetTouchMode(touch);
            Hud.SetTouchMode(touch);
            HowToPlay.SetTouchMode(touch);
            if (Settings != null) Settings.SetTouchMode(touch);
        }

        private void RegisterSounds(MenuButton button)
        {
            button.Hovered += _audio.PlayHover;
            button.Button.onClick.AddListener(_audio.PlayClick);
        }

        private void RegisterNavSounds(NavButton button)
        {
            button.Hovered += _audio.PlayHover;
            button.Button.onClick.AddListener(_audio.PlayClick);
        }

        private T CreateView<T>(string name, Transform parent, System.Action<T> preBuild) where T : UIView
        {
            var rect = UIFactory.Rect(name, parent);
            UIFactory.Stretch(rect);
            var view = rect.gameObject.AddComponent<T>();
            preBuild(view);
            if (view is SettingsView) return view; // built in BuildDeferred once services exist
            view.Build(Factory);
            return view;
        }

        public void BuildDeferred()
        {
            Settings.Build(Factory);
        }

        private Canvas CreateCanvas(string name, int order, out ResponsiveCanvasScaler responsive)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(transform, false);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = order;
            canvas.pixelPerfect = false;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.referencePixelsPerUnit = 100f;
            responsive = go.AddComponent<ResponsiveCanvasScaler>();
            go.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        private ScreenFader CreateFader(string name, int order, float startAlpha)
        {
            var canvas = CreateCanvas(name, order, out _);
            var image = Factory.Image("Fade", canvas.transform, null, Color.black);
            UIFactory.Stretch(image.rectTransform);
            var fader = canvas.gameObject.AddComponent<ScreenFader>();
            fader.Configure(image);
            fader.SetAlpha(startAlpha);
            return fader;
        }

        private void EnsureEventSystem()
        {
            if (EventSystem.current != null) return;
            var go = new GameObject("EventSystem");
            go.transform.SetParent(transform, false);
            go.AddComponent<EventSystem>();
            var module = go.AddComponent<InputSystemUIInputModule>();
            module.AssignDefaultActions();
        }
    }
}
