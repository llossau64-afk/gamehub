using System;
using System.Collections;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Gameplay;
using GuessTheAnswer.Multiplayer;
using GuessTheAnswer.Platform;
using GuessTheAnswer.Questions;
using GuessTheAnswer.Save;
using GuessTheAnswer.Settings;
using GuessTheAnswer.Shared;
using GuessTheAnswer.UI;
using GuessTheAnswer.UI.Screens;
using UnityEngine;

namespace GuessTheAnswer.Core
{
    /// <summary>
    /// Composition root. Lives on one persistent object, creates every manager in order, runs the loading sequence
    /// and gives screens access to the services. Each manager keeps its own responsibility.
    /// </summary>
    public sealed class App : MonoBehaviour
    {
        public static App Instance { get; private set; }

        public GameConfig Config { get; private set; }
        public SaveManager Save { get; private set; }
        public SettingsManager Settings { get; private set; }
        public AudioManager Audio { get; private set; }
        public UIManager UI { get; private set; }
        public NetworkManager Net { get; private set; }
        public ContentLibrary Content { get; private set; }
        public IPlatformService Platform { get; private set; }
        public GameFlow Flow { get; private set; }
        public InputRouter Input { get; private set; }
        public bool IsReady { get; private set; }

        public string Nickname => Save.Data.nickname;
        public int AvatarIndex => Save.Data.avatar;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Application.runInBackground = true; // keep the connection alive while the tab is in the background
            Input = new InputRouter();
            StartCoroutine(Boot());
        }

        IEnumerator Boot()
        {
            Config = GameConfig.Load();
            Save = new SaveManager();
            Save.Load();
            EnsureProfile();

            Audio = gameObject.AddComponent<AudioManager>();
            Settings = new SettingsManager(Save, Audio);
            Settings.ApplyAll();
            UIFeedback.Sound = s => Audio.Play(s);
            UIFeedback.Haptic = ms => { if (Settings.Haptics) BrowserBridge.Vibrate(ms); };

            UI = gameObject.AddComponent<UIManager>();
            UI.Initialize();
            UI.ApplyQuality(Settings.Graphics, Settings.ShowFps);
            Settings.Changed += () => UI.ApplyQuality(Settings.Graphics, Settings.ShowFps);
            var loading = UI.Show<LoadingScreen>();

#if UNITY_WEBGL && !UNITY_EDITOR
            Platform = gameObject.AddComponent<WebPlatformService>();
#else
            Platform = new NullPlatformService();
#endif
            Platform.LoadingStart();
            BrowserBridge.RegisterVisibility(gameObject.name);

            // 1) Questions and categories.
            Content = new ContentLibrary();
            yield return Content.Load(p => loading.SetProgress(p * 0.25f, "LOADING QUESTIONS"));

            // 2) Sounds and music (generated on the device).
            yield return Audio.Prepare(p => loading.SetProgress(0.25f + p * 0.55f, "TUNING THE BUZZERS"));

            // 3) Multiplayer services. The server connection opens in the background.
            Net = gameObject.AddComponent<NetworkManager>();
            var resume = Save.Data.resume;
            bool canResume = !string.IsNullOrEmpty(resume.playerId)
                && DateTimeOffset.UtcNow.ToUnixTimeSeconds() - resume.savedAtUnix < (long)MatchRules.ReconnectGraceSeconds + 30;
            var online = new OnlineMultiplayerService(WebSocketFactory.Create(transform), Config.ResolveServerUrl(), MakeHello,
                canResume ? resume.playerId : null, canResume ? resume.token : null);
            online.IdentityChanged += (id, token) =>
            {
                Save.Data.resume.playerId = id;
                Save.Data.resume.token = token;
                Save.Data.resume.savedAtUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                Save.MarkDirty();
            };
            var local = new LocalMultiplayerService(Content.Bank, MakeHello);
            Net.Initialize(online, local);
            Flow = new GameFlow(this);
            UI.ScreenChanged += screen =>
            {
                if (screen.Music != MusicTrack.None) Audio.PlayMusic(screen.Music);
            };
            ConnectionBanner.Create(UI.OverlayLayer, Flow);
            Net.UseOnline();

            loading.SetProgress(0.9f, "CONNECTING");
            float waitUntil = Time.unscaledTime + 1.2f;
            while (Time.unscaledTime < waitUntil && Net.OnlineStatus == ConnectionStatus.Connecting) yield return null;

            loading.SetProgress(1f, "READY");
            yield return new WaitForSecondsRealtime(0.35f);

            IsReady = true;
            Platform.LoadingFinished();
            Flow.EnterInitialScreen();
            if (!Flow.InRoom) Flow.HandleLaunchParameters();
        }

        void EnsureProfile()
        {
            var data = Save.Data;
            if (string.IsNullOrEmpty(data.nickname))
            {
                data.nickname = PlayerNames.Random(XorShiftRandom.FromTime());
                data.avatar = UnityEngine.Random.Range(0, Theme.AvatarCount);
                Save.MarkDirty();
            }
        }

        HelloMsg MakeHello()
        {
            return new HelloMsg { name = Save.Data.nickname, avatar = Save.Data.avatar };
        }

        public void SetProfile(string nickname, int avatar)
        {
            Save.Data.nickname = PlayerNames.Sanitize(nickname);
            Save.Data.avatar = Mathf.Clamp(avatar, 0, Theme.AvatarCount - 1);
            Save.MarkDirty();
            // Rooms show the name sent at connect time; outside a room, update it right away.
            if (Flow != null && !Flow.InRoom) Net.Online.Reintroduce();
        }

        void Update()
        {
            Save?.Tick();
            if (IsReady)
            {
                Input.Poll(UI);
                Flow.Tick(Time.unscaledDeltaTime);
            }
        }

        // ───────────────────────── Browser / app focus ─────────────────────────

        /// <summary>From JavaScript: "0" when the tab is hidden, "1" when visible.</summary>
        public void OnBrowserVisibility(string visible)
        {
            Audio?.SetHidden(visible == "0");
            if (visible == "0") Save?.Flush();
        }

        public void OnBrowserFocus(string focused)
        {
        }

        void OnApplicationPause(bool paused)
        {
            if (paused) Save?.Flush();
#if !UNITY_WEBGL || UNITY_EDITOR
            Audio?.SetHidden(paused);
#endif
        }

        void OnApplicationQuit()
        {
            Save?.Flush();
        }
    }
}
