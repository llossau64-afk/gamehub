// Entry point and game state machine (port of main.js's Game class).
//   boot -> (first start | menu) -> garage <-> run -> summary -> run | garage
//   menu -> race select -> race -> podium -> results ; menu -> online lobby -> race
//
// The scene ("Scenes/Main.unity") holds "Game" (this), "Main Camera", "Sun" and a global post volume;
// anything missing is created. All game objects hang off a "WorldScene" root (world chunks, environment,
// cars, pickups, the persistent headlight / flash lights) and the Garage root far below it.
//
// Split over partial files:
//   GameBoot.cs         boot / loading, frame loop, keyboard, lifecycle, IGameHost + IOnlineController
//   GameBoot.Flow.cs    menu, first car, garage panels and purchases, runs, races, settings, progression
//   GameBoot.UI.cs      the IGameUI adapter onto the real UI, ui event wiring
//   GameBoot.Post.cs    colour grading per environment look (URP volume, DOWNFALL_URP only)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using Downfall.Audio;
using static Downfall.GameMesh;
using Random = UnityEngine.Random;
#if DOWNFALL_URP
using UnityEngine.Rendering.Universal;
#endif

namespace Downfall
{
    // runs before the UI / EventSystem so the menu navigation switch applies to this frame's key presses
    [DefaultExecutionOrder(-50)]
    public sealed partial class GameBoot : MonoBehaviour, IGameHost, IOnlineController
    {
        // the shared test version: 50 million to spend, once per save
        public const bool TEST_BUILD = true;
        public const double TEST_COINS = 50_000_000;

        // ------------------------------------------------------------------ state
        SaveManager _save;
        GameInput _input;
        public UI ui;
        GameUIAdapter uiAdapter;
        public OnlineGlue glue;
        public string state { get; set; } = "boot";
        public string quality = "medium";
        public bool paused;
        public Run run;

        Camera cam;
        Track _track;
        World _world;
        Env _env;
        Particles _particles;
        SkidMarks _skids;
        Debris _debris;
        Transform _worldScene;
        Light _headlight, _flashLight;
        public Garage garage;
        public CarView menuCar;
        GameObject sceneSun;
        public string mountainId, mapId;
        double menuT;
        bool looping, garageView, firstView = true;

        // debug switches from the command line (-bot -fixed -s <m> -race <id> -opp <n>), like ?bot ?fixed ?s= ?race= ?opp=
        readonly RunDebug _debug = new RunDebug();
        bool dbgFixed;
        string dbgRace;
        int? dbgOpp;

        // platform hooks (portal SDKs are a web thing: kept as no-ops)
        bool inGameplay;

        static AudioSys Au => AudioSys.A != null && AudioSys.A.Ready() ? AudioSys.A : null;

        // ------------------------------------------------------------------ IGameHost
        public SaveManager save => _save;
        IGameUI IGameHost.ui => uiAdapter;
        UI IOnlineController.ui => ui;
        public Track track => _track;
        public World world => _world;
        public Env env => _env;
        public GameInput input => _input;
        Camera IGameHost.camera => cam;
        public Camera mainCamera => cam;
        public Particles particles => _particles;
        public SkidMarks skids => _skids;
        public Debris debris => _debris;
        public Transform worldScene => _worldScene;
        public Light headlight => _headlight;
        public Light flashLight => _flashLight;
        public RunDebug debug => _debug;
        public bool onlineIsHost => glue?.online != null && glue.online.isHost;

        public void Platform(string ev)
        {
            // gameplayStart / gameplayStop / happytime: no portal SDK here
            if (ev == "gameplayStart") inGameplay = true;
            else if (ev == "gameplayStop") inGameplay = false;
        }

        // document.body.classList.toggle('cockpit' | 'race-mode')
        public void BodyClass(string cls, bool on)
        {
            if (ui == null) return;
            if (cls == "cockpit") ui.SetCockpit(on);
            else if (cls == "race-mode") { if (on) ui.SetRaceMode(true); else ui.RaceHudEnd(); }
        }

        // ------------------------------------------------------------------ IOnlineController
        public string DefaultMap() => raceSel ?? _save.data.lastMap ?? Maps.MAPS[0].id;
        public void ShowMenuCar()
        {
            if (menuCar == null) SetupMenuScene();
            if (menuCar != null) menuCar.visible = true;
        }
        public void MenuMusic() => Au?.musicGen?.SetMode("menu");
        public void StartRace(string mapId, IRaceNet net) => StartRace(mapId, null, net);

        // ------------------------------------------------------------------ construction (constructor of the JS Game)
        void Awake()
        {
            Application.targetFrameRate = -1;
            _save = new SaveManager();
            // test build: every save gets a one-time grant to try the whole dealership
            if (TEST_BUILD && _save.data.testGrant == 0)
            {
                _save.data.cash += TEST_COINS;
                _save.data.testGrant = TEST_COINS;
                _save.Save(); _save.Flush();
            }
            ParseDebug();
            _input = new GameInput();
            AudioSys.Create();
            ui = UI.Create(_input, transform);
            ui.SetTouch(_input.isTouch);
            uiAdapter = new GameUIAdapter(this);
            glue = new OnlineGlue(this);
            WireUI();
            glue.Wire(ui);
        }

        void Start() { StartCoroutine(Boot()); }

        void ParseDebug()
        {
            string[] args;
            try { args = Environment.GetCommandLineArgs(); } catch (Exception) { return; }
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i].ToLowerInvariant(), next = i + 1 < args.Length ? args[i + 1] : null;
                if (a == "-bot") _debug.bot = true;
                else if (a == "-fixed") dbgFixed = true;
                else if (a == "-s" && next != null && double.TryParse(next, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var s)) _debug.startS = s;
                else if (a == "-race" && next != null) dbgRace = next;
                else if (a == "-opp" && next != null && int.TryParse(next, out var o)) dbgOpp = o;
            }
        }

        // ------------------------------------------------------------------ boot
        IEnumerator Boot()
        {
            ui.CycleTips();
            Platform("loadingStart");
            ui.BootArt();
            var sv = _save.data;
            Au?.SetVolumes((float)sv.settings.master, (float)sv.settings.music, (float)sv.settings.sfx);
            // renderer
            quality = PickQuality();
            ApplyQualityLevel(quality);
            SetupCamera();
            ui.SetLoad(0.08, "LOADING VEHICLES…");
            yield return null;
            ui.SetLoad(0.1, "PLANTING FORESTS…");
            // assets (initMaterials + loadAssets): materials load lazily from Resources; warm them all here
            var defs = MatDefs.All;
            for (int i = 0; i < defs.Count; i++)
            {
                try { Mats.Get(defs[i].name); } catch (Exception) { }
                if (i % 12 == 11) { ui.SetLoad(0.1 + (i + 1) / (double)defs.Count * 0.12, "PLANTING FORESTS…"); yield return null; }
            }
            ui.SetLoad(0.22, "BUILDING MOUNTAIN…");
            yield return null;
            LoadMountain(sv.mountain);
            ui.SetLoad(0.38, "PREPARING ROAD…");
            for (int i = 0; i < 12; i++)
            {
                int left = _world.Update(30, 2);
                ui.SetLoad(0.38 + i * 0.03, "PREPARING ROAD…");
                yield return null;
                if (left == 0) break;
            }
            ui.SetLoad(0.78, "OPENING THE WORKSHOP…");
            yield return null;
            garage = new Garage(quality);
            garage.SetLevel(sv.garageLevel);
            garage.visible = false;
            ui.SetLoad(0.9, "STARTING ENGINE…");
            SetupMenuScene();
            _env.Update(0.016f, _track, 30, cam, menuCar != null ? Coord.FromUnity(menuCar.group.position) : Vector3.zero, 0);
            // lights that come and go during play exist from the start (the web build learned that adding a
            // light mid-race recompiles every shader: a freeze). They stay for the whole session.
            CreatePersistentLights();
            yield return null;
            ui.SetLoad(1, "READY");
            Platform("loadingStop");
            looping = true;
            yield return new WaitForSecondsRealtime(0.4f);
            ui.BootReady();
            // wait for a gesture (a key, a click, a touch, a pad button)
            yield return null;
            while (!(Input.anyKeyDown || Input.touchCount > 0)) yield return null;
            Au?.Starter();
            Au?.Burst(freq: 140, type: FilterType.Lowpass, dur: 1.2f, gain: 0.3f, buf: NoiseBufs.Brown, delay: 0.7f);
            yield return ui.FadeCo(true);
            ui.EndBoot();
            if (!sv.firstStartDone || sv.owned.Count == 0) EnterFirst();
            else if (dbgRace != null && Maps.MapById(dbgRace) != null) { EnterMenu(); StartRace(dbgRace, dbgOpp ?? 5, null); }
            else EnterMenu();
            yield return new WaitForSecondsRealtime(0.15f);
            ui.Fade(false);
        }

        string PickQuality()
        {
            var q = _save.data.settings.quality;
            if (q != "auto" && (q == "low" || q == "medium" || q == "high")) return q;
            if (_input.isTouch) return "low";
            int cores = SystemInfo.processorCount > 0 ? SystemInfo.processorCount : 4;
            return cores >= 8 ? "high" : "medium";
        }

        // the project has three quality levels Low / Medium / High (each with its URP asset)
        static void ApplyQualityLevel(string q)
        {
            var names = QualitySettings.names;
            if (names == null || names.Length == 0) return;
            int idx = -1;
            for (int i = 0; i < names.Length; i++) if (string.Equals(names[i], q, StringComparison.OrdinalIgnoreCase)) idx = i;
            if (idx < 0) idx = q == "low" ? 0 : q == "high" ? names.Length - 1 : Mathf.Min(1, names.Length - 1);
            if (idx != QualitySettings.GetQualityLevel()) QualitySettings.SetQualityLevel(idx, true);
        }

        void SetupCamera()
        {
            var go = GameObject.Find("Main Camera");
            cam = go ? go.GetComponent<Camera>() : null;
            if (!cam) cam = Camera.main;
            if (!cam)
            {
                go = new GameObject("Main Camera") { tag = "MainCamera" };
                cam = go.AddComponent<Camera>();
            }
            if (!FindObjectOfType<AudioListener>()) cam.gameObject.AddComponent<AudioListener>();
            cam.fieldOfView = 60;
            cam.nearClipPlane = 0.15f;
            cam.farClipPlane = 6000;
            cam.allowHDR = true;
            cam.allowMSAA = quality != "low";
            cam.clearFlags = CameraClearFlags.Skybox;
#if DOWNFALL_URP
            var cd = cam.GetUniversalAdditionalCameraData();
            if (cd != null) cd.renderPostProcessing = quality != "low";
#endif
            // the environment brings its own sun; the scene's placeholder would double the light
            sceneSun = GameObject.Find("Sun");
            if (sceneSun) sceneSun.SetActive(false);
            PostInit();
        }

        void CreatePersistentLights()
        {
            var hg = new GameObject("headlight");
            hg.transform.SetParent(_worldScene, false);
            _headlight = hg.AddComponent<Light>();
            _headlight.type = LightType.Spot;
            _headlight.color = MatDef.Hex(0xfff0d8);
            _headlight.intensity = 0;
            _headlight.range = 60;
            _headlight.spotAngle = 0.5f * 2 * Mathf.Rad2Deg;
            _headlight.shadows = LightShadows.None;
            var fg = new GameObject("flashLight");
            fg.transform.SetParent(_worldScene, false);
            _flashLight = fg.AddComponent<Light>();
            _flashLight.type = LightType.Point;
            _flashLight.color = MatDef.Hex(0xffa040);
            _flashLight.intensity = 0;
            _flashLight.range = 30;
            _flashLight.shadows = LightShadows.None;
        }

        public void LoadMountain(string id) => LoadTrack(Mountains.MountainById(id));
        public void LoadTrack(MountainDef m)
        {
            if (_world != null) _world.Dispose();
            if (_worldScene == null)
            {
                _worldScene = new GameObject("WorldScene").transform;
                _env = new Env(quality, _worldScene);
                _particles = new Particles(quality);
                _skids = new SkidMarks();
            }
            _track = new Track(m);
            _world = new World(_track, quality, _worldScene);
            _debris?.Clear();
            var t = _track;
            _debris = new Debris((x, z) => t.Height(x, z));
            mountainId = m.circuit != null || m.kind != null ? null : m.id;
            mapId = m.kind != null ? m.id : null;
            if (menuCar != null) { menuCar.Dispose(); menuCar = null; }
        }

        // ------------------------------------------------------------------ frame
        void Update()
        {
            if (!looping) return;
            float dt = Mathf.Min(0.05f, Time.unscaledDeltaTime);
            if (dbgFixed) dt = 1 / 30f;
            _input.Update(dt);
            try { glue.Update(Time.unscaledDeltaTime); } catch (Exception e) { Debug.LogException(e); }
            try { Frame(dt); } catch (Exception e) { Debug.LogException(e); }
            _save.Tick(dt);
        }

        bool Typing => ui != null && ui.Typing;

        // menus are keyboard driven everywhere except while driving
        bool NavActive()
        {
            if (state == "boot") return false;
            if (state == "run") return paused || ui.ModalOpen || (run != null && run.ended);
            return true;
        }

        static readonly KeyCode[] HKEYS = { KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.A, KeyCode.D };
        bool CarouselTab => tab == "vehicles" || tab == "dealer";

        // main.js keydown handler + the key part of update()
        void Keys()
        {
            bool typing = Typing, modal = ui.ModalOpen;
            bool suppress = false;
            if (!typing)
            {
                if (state == "garage" && !modal && CarouselTab)
                {
                    if (GameInput.Pressed(KeyCode.LeftArrow, KeyCode.A)) crStep(-1);
                    else if (GameInput.Pressed(KeyCode.RightArrow, KeyCode.D)) crStep(1);
                    if (GameInput.Pressed(KeyCode.Return, KeyCode.KeypadEnter)) { crAct(); suppress = true; }
                    if (GameInput.Down(HKEYS)) suppress = true;
                }
                if (state == "first" && !modal && !choosing)
                {
                    int n = Cars.STARTERS.Length;
                    if (GameInput.Pressed(KeyCode.LeftArrow, KeyCode.A)) { firstIdx = (firstIdx + n - 1) % n; UpdateFirst(); Au?.Ui("click"); }
                    if (GameInput.Pressed(KeyCode.RightArrow, KeyCode.D)) { firstIdx = (firstIdx + 1) % n; UpdateFirst(); Au?.Ui("click"); }
                    if (GameInput.Down(HKEYS)) suppress = true;
                }
                if (state == "garage" && !modal && GameInput.Pressed(KeyCode.Q, KeyCode.E)) { CycleTab(GameInput.Pressed(KeyCode.E) ? 1 : -1); suppress = true; }
            }
            // menu navigation on / off (off while driving); applied to the EventSystem before it runs this frame
            ui.navEnabled = NavActive() && !suppress;
            var es = EventSystem.current;
            if (es) es.sendNavigationEvents = ui.navEnabled && !typing;
            if (typing) return;

            if (_input.PausePressed)
            {
                if (ui.ModalOpen) ui.CloseModal();
                else if (state == "run" && !(run != null && run.ended)) Pause(!paused);
                else if (state == "garage" && !installingNow) { Au?.Ui("back"); Gtab("menu"); }
                else if (state == "racesel") { Au?.Ui("back"); ui.Emit("raceBack"); }
                else if (state == "online" && !ui.ModalOpen) { Au?.Ui("back"); ui.Emit("olBack"); }
            }
            bool net = run is Race rr && rr.online;
            if (state == "run" && run != null && run.ended && !paused && GameInput.Pressed(KeyCode.R) && !net) Retry();
            if (state == "run" && run != null && run.ended && GameInput.Pressed(KeyCode.G)) ui.Emit("toGarage");
            // camera switching (C / pad Y) is read by Run.Update itself through input.CameraPressed
        }

        void Frame(float dt)
        {
            Keys();
            // garage room vs. the mountain
            bool gv = state == "garage" || state == "first";
            if (gv != garageView || firstView) SetGarageView(gv);
            firstView = false;

            if (gv)
            {
                garage.Update(dt, cam);
                Au?.ambience?.Update(dt, pWind: 0.05f, pRoom: 1);
                Au?.SetReverb(0.25f);
                ApplyPost(GARAGE_LOOK);
                return;
            }
            if (state == "run" && run != null && run.vehicle != null)
            {
                if (!paused) run.Update(dt);
                var v = run.vehicle;
                double s = run.maxS;
                var q = v.lastQuery;
                double inTunnel = _track.tunnel[Math.Max(0, Math.Min(_track.N - 1, q.idx))] != 0 && Math.Abs(q.d) < q.halfW + 2 ? 1 : 0;
                var focus = run.model != null ? Coord.FromUnity(run.model.group.position) : Coord.FromUnity(cam.transform.position);
                _env.Update(paused ? 0 : dt, _track, Math.Max(s, q.s), cam, focus, inTunnel);
                _world.Update2(dt, Coord.FromUnity(cam.transform.position), _env.look, cam);
                ApplyPost(PostLook(_env.look));
                DrawFx(dt, false);
                return;
            }
            // menu / boot: slow orbit around the parked car
            menuT += dt;
            if (menuCar != null)
            {
                var c = Coord.FromUnity(menuCar.group.position);
                double a = 0.9 + menuT * 0.05;
                double rad = 7.5 + Math.Sin(menuT * 0.07) * 1.2;
                double px = c.x + Math.Sin(a) * rad, py = c.y + 1.4 + Math.Sin(menuT * 0.11) * 0.3, pz = c.z + Math.Cos(a) * rad;
                double th = _track.Height(px, pz);
                if (py < th + 0.8) py = th + 0.8;
                var pos = Coord.ToUnity(px, py, pz);
                var look = Coord.ToUnity(c.x - 1.5 * Math.Cos(a), c.y + 0.6, c.z + 1.5 * Math.Sin(a));
                cam.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(look - pos, Vector3.up));
                cam.fieldOfView = 46;
                _env.Update(dt, _track, 40, cam, c, 0);
                Au?.ambience?.Update(dt, pWind: 0.45f, pBirds: 0.8f, pTrees: 0.7f);
                Au?.SetReverb(0);
                // cooling engine ticks
                if (Au != null && Random.value < dt * 0.25f) Au.Tone(freq: 2800 + Random.value * 1500, type: Wave.Triangle, dur: 0.02f, gain: 0.02f);
            }
            else _env.Update(dt, _track, 40, cam, Coord.FromUnity(cam.transform.position), 0);
            _world.Update2(dt, Coord.FromUnity(cam.transform.position), _env.look, cam);
            ApplyPost(PostLook(_env.look));
            DrawFx(dt, true);
        }

        // point sprites and skid marks are drawn immediate-mode every frame; Run.Effects (and the podium)
        // tick the particles and debris during a run, the menu ticks them here
        void DrawFx(float dt, bool tick)
        {
            if (tick) { _particles.Update(dt); _debris.Update(dt); }
            _particles.Draw(cam);
            _skids.Draw();
        }

        // the garage is its own "scene" in the web build: show one, hide the other and restore the
        // world's render settings (the garage switches fog to linear and clears to a solid colour)
        void SetGarageView(bool on)
        {
            garageView = on;
            if (garage != null) garage.visible = on;
            if (_worldScene) _worldScene.gameObject.SetActive(!on);
            if (_env != null && _env.sun) _env.sun.enabled = !on;
            if (!on)
            {
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.ExponentialSquared;
                RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
                if (_env != null) RenderSettings.sun = _env.sun;
                if (cam) cam.clearFlags = CameraClearFlags.Skybox;
            }
        }

        // ------------------------------------------------------------------ lifecycle
        void OnApplicationFocus(bool focus)
        {
            // window blur: pause a running run
            if (!focus && state == "run" && run != null && run.active && !paused) Pause(true);
        }
        void OnApplicationPause(bool p)
        {
            if (!p) return;
            _save?.Flush();
            if (state == "run" && run != null && run.active && !paused) Pause(true);
        }
        void OnApplicationQuit() { _save?.Flush(); }
        void OnDestroy()
        {
            _save?.Flush();
            AudioListener.pause = false;
        }

        // ------------------------------------------------------------------ coroutine helpers
        void Co(IEnumerator e) => StartCoroutine(e);
        static WaitForSecondsRealtime Wait(float s) => new WaitForSecondsRealtime(s);
        // ui.fade(true).then(() => { f(); ui.fade(false); })
        void FadeThen(Action f) => ui.Fade(true, () => { f(); ui.Fade(false); });
    }
}
