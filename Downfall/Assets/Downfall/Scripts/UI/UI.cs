// uGUI user interface (port of ui.js): loading screen, menus, garage panels, HUD, countdown,
// run summary, pause, settings, achievements, credits, toasts. Built entirely from code.
//
// UI is a MonoBehaviour on its own Screen Space Overlay canvas: `var ui = UI.Create(input);`
// Events work like the JS version: ui.On("menu", a => ...); the handler gets the single
// JS argument boxed (string / int / bool) or null.
using System;
using System.Collections.Generic;
using UnityEngine;
using Downfall.Audio;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Downfall
{
    public sealed partial class UI : MonoBehaviour
    {
        public const string PUBLIC_URL = "https://llossau64-afk.github.io/gamehub/OneRoadDown/";
        public static readonly string[] TIPS =
        {
            "Better suspension reduces landing damage.",
            "Armour protects your car but adds weight.",
            "Off-road tyres lose performance on asphalt.",
            "Fuel becomes increasingly important deeper into the mountain.",
            "Long descents cook weak brakes. Upgraded brakes resist fade.",
            "A turbo without cooling will overheat the engine.",
            "Hand-painted SHORTCUT signs mark the risky way down.",
            "Weight reduction makes every other upgrade work better.",
            "Engine power raises your speed ceiling; the transmission decides how far it goes.",
            "Snow tyres turn the Snow Line from a nightmare into a road.",
            "Torque pulls you out of hairpins and through mud.",
            "Repair kits are rare. Drive like you know that.",
            "A guard rail will stop you once. Maybe.",
        };
        public const float PAD = 34;
        public static bool Touching;

        public sealed class Scr { public string name; public RectTransform rt; public CanvasGroup cg; public bool show; public float speed = 1 / 0.45f; }

        public GameInput input;
        public Canvas canvas;
        public RectTransform root;
        public Speedo speedo;
        public readonly Dictionary<string, Scr> screens = new Dictionary<string, Scr>();
        // false while driving: arrow keys / WASD then belong to the car, not the menus
        public bool navEnabled = true;
        readonly Dictionary<string, Action<object>> handlers = new Dictionary<string, Action<object>>();
        bool touchMode, cineOn, raceMode, cockpit;

        public static UI Create(GameInput input = null, Transform parent = null)
        {
            var go = new GameObject("UI", typeof(RectTransform));
            if (parent) go.transform.SetParent(parent, false);
            go.layer = 5;
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            canvas.pixelPerfect = false;
            var sc = go.AddComponent<CanvasScaler>();
            sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            sc.referenceResolution = new Vector2(1920, 1080);
            sc.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            sc.matchWidthOrHeight = 0.5f;
            sc.referencePixelsPerUnit = 100;
            go.AddComponent<GraphicRaycaster>();
            if (FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                if (parent) es.transform.SetParent(parent, false);
            }
            var ui = go.AddComponent<UI>();
            ui.input = input;
            ui.canvas = canvas;
            ui.root = (RectTransform)go.transform;
            ui.touchMode = input != null && input.isTouch;
            ui.Build();
            return ui;
        }

        public void On(string name, Action<object> fn) => handlers[name] = fn;
        public void Emit(string name, object a = null) { if (handlers.TryGetValue(name, out var f) && f != null) f(a); }

        // ------------------------------------------------------------- timers / tweens (unscaled time)
        sealed class Timer { public int id; public float t; public Action a; }
        sealed class Anim { public float t, dur; public Action<float> f; public Action done; public object key; }
        readonly List<Timer> timers = new List<Timer>();
        readonly List<Anim> anims = new List<Anim>();
        readonly List<Timer> tScratch = new List<Timer>();
        readonly List<Anim> aScratch = new List<Anim>();
        int timerId;
        public int After(float sec, Action a) { var t = new Timer { id = ++timerId, t = sec, a = a }; timers.Add(t); return t.id; }
        public void Cancel(int id) { if (id != 0) timers.RemoveAll(x => x.id == id); }
        public void Animate(float dur, Action<float> f, Action done = null, object key = null)
        {
            if (key != null) anims.RemoveAll(x => x.key == key);
            anims.Add(new Anim { dur = Mathf.Max(1e-4f, dur), f = f, done = done, key = key });
            f(0);
        }

        // ------------------------------------------------------------- screens
        Scr NewScreen(string name)
        {
            var rt = K.Node(root, name).Fill();
            var cg = rt.gameObject.AddComponent<CanvasGroup>();
            cg.alpha = 0;
            rt.gameObject.SetActive(false);
            var s = new Scr { name = name, rt = rt, cg = cg };
            screens[name] = s;
            return s;
        }
        public void Show(string name, bool on = true)
        {
            if (!screens.TryGetValue(name, out var s)) return;
            s.show = on;
            if (on) s.rt.gameObject.SetActive(true);
        }
        public bool IsShown(string name) => screens.TryGetValue(name, out var s) && s.show;
        public void Only(params string[] names)
        {
            foreach (var kv in screens) if (kv.Key != "modal") Show(kv.Key, Array.IndexOf(names, kv.Key) >= 0);
            AutoFocus();
        }

        // body classes of the web version
        public void SetTouch(bool on) { touchMode = on; if (pauseBtn) pauseBtn.gameObject.SetActive(on); }
        public bool TouchMode => touchMode;
        public void SetRaceMode(bool on) { raceMode = on; ApplyRaceMode(); }
        public void SetCockpit(bool on) { cockpit = on; if (speedo != null) speedo.rt.gameObject.SetActive(!on); }

        // ------------------------------------------------------------- keyboard / gamepad navigation
        public bool Typing
        {
            get
            {
                var es = EventSystem.current;
                var g = es ? es.currentSelectedGameObject : null;
                var f = g ? g.GetComponent<InputField>() : null;
                return f != null && f.isFocused;
            }
        }
        public List<Selectable> Focusables()
        {
            var list = new List<Selectable>();
            foreach (var s in screens.Values)
            {
                if (ModalOpen ? s.name != "modal" : (!s.show || s.name == "modal")) continue;
                if (!s.rt.gameObject.activeInHierarchy) continue;
                foreach (var x in s.rt.GetComponentsInChildren<Selectable>())
                    if (x.IsInteractable() && x.isActiveAndEnabled && !(x is InputField) && !(x is Scrollbar)) list.Add(x);
            }
            if (!ModalOpen && pod.gameObject.activeInHierarchy) foreach (var x in pod.GetComponentsInChildren<Selectable>()) if (x.IsInteractable()) list.Add(x);
            return list;
        }
        public void FocusFirst(List<Selectable> list = null)
        {
            list ??= Focusables();
            if (list.Count == 0 || EventSystem.current == null) return;
            Selectable pref = null;
            foreach (var x in list) if (x is UiButton b && b.pref) { pref = b; break; }
            pref ??= list[0];
            EventSystem.current.SetSelectedGameObject(pref.gameObject);
            var sr = pref.GetComponentInParent<ScrollRect>();
            if (sr) K.ScrollIntoView(sr, (RectTransform)pref.transform);
        }
        // keep keyboard focus on the same control index when a panel is rebuilt
        int FocusIndex(Transform scope)
        {
            var es = EventSystem.current;
            if (!es || !es.currentSelectedGameObject) return -1;
            var l = scope.GetComponentsInChildren<Selectable>(false);
            for (int i = 0; i < l.Length; i++) if (l[i].gameObject == es.currentSelectedGameObject) return i;
            return -1;
        }
        void Refocus(Transform scope, int i)
        {
            if (i < 0 || !EventSystem.current) return;
            var l = scope.GetComponentsInChildren<Selectable>(false);
            if (l.Length > 0) EventSystem.current.SetSelectedGameObject(l[Mathf.Min(i, l.Length - 1)].gameObject);
        }
        public void AutoFocus()
        {
            After(0.12f, () =>
            {
                if (touchMode || EventSystem.current == null) return;
                var l = Focusables();
                var cur = EventSystem.current.currentSelectedGameObject;
                bool has = false;
                foreach (var x in l) if (cur == x.gameObject) { has = true; break; }
                if (l.Count > 0 && !has) FocusFirst(l);
            });
        }

        // ------------------------------------------------------------- frame
        void Update()
        {
            float dt = Mathf.Min(0.1f, Time.unscaledDeltaTime);
            tScratch.Clear(); tScratch.AddRange(timers);
            foreach (var t in tScratch)
            {
                t.t -= dt;
                if (t.t <= 0) { timers.Remove(t); try { t.a?.Invoke(); } catch (Exception e) { Debug.LogException(e); } }
            }
            aScratch.Clear(); aScratch.AddRange(anims);
            foreach (var a in aScratch)
            {
                a.t += dt;
                float k = Mathf.Clamp01(a.t / a.dur);
                try { a.f(k); } catch (Exception e) { Debug.LogException(e); anims.Remove(a); continue; }
                if (k >= 1) { anims.Remove(a); a.done?.Invoke(); }
            }
            bool modal = ModalOpen;
            foreach (var s in screens.Values)
            {
                bool vis = s.show;
                if (s.name == "touch") vis = vis && touchMode && !cineOn;
                float target = vis ? 1 : 0;
                if (s.cg.alpha != target) s.cg.alpha = Mathf.MoveTowards(s.cg.alpha, target, dt * s.speed);
                bool inter = s.show && (!modal || s.name == "modal");
                if (s.cg.interactable != inter) { s.cg.interactable = inter; s.cg.blocksRaycasts = inter; }
                if (!vis && s.cg.alpha <= 0 && s.rt.gameObject.activeSelf) s.rt.gameObject.SetActive(false);
                if (vis && !s.rt.gameObject.activeSelf) s.rt.gameObject.SetActive(true);
            }
            // fade overlay
            fadeImg.color = new Color(0, 0, 0, Mathf.MoveTowards(fadeImg.color.a, fadeOn ? 1 : 0, dt / 0.6f));
            fadeImg.raycastTarget = fadeImg.color.a > 0.5f;
            // film grain steps
            grainT += dt;
            if (grainT > 0.125f) { grainT = 0; grainStep = (grainStep + 1) % 4; var o = grainOff[grainStep]; grain.uvRect = new Rect(o.x / 128f, o.y / 128f, grain.uvRect.width, grain.uvRect.height); }
            var r = root.rect;
            grain.uvRect = new Rect(grain.uvRect.x, grain.uvRect.y, r.width / 128f, r.height / 128f);

            var es = EventSystem.current;
            if (es)
            {
                es.sendNavigationEvents = navEnabled && !Typing;
                if (navEnabled && !Typing)
                {
                    var cur = es.currentSelectedGameObject;
                    bool dead = cur == null || !cur.activeInHierarchy || (cur.GetComponent<Selectable>() is Selectable sel && !sel.IsInteractable());
                    if (dead && (GameInput.Pressed(KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.W, KeyCode.S, KeyCode.Return, KeyCode.KeypadEnter)
                        || Mathf.Abs(SafeAxis("Vertical")) > 0.5f))
                    { UiButton.kbFocus = true; FocusFirst(); }
                }
            }
            if (Input.GetMouseButtonDown(0) && Input.touchCount == 0) Touching = false;
            if (Input.touchCount > 0) Touching = true;
            fields.RemoveAll(x => !x.Item1);
            foreach (var (f, b) in fields) if (f && b) b.color = f.isFocused ? Pal.amber : Pal.line;
            HudFrame(dt);
        }
        static float SafeAxis(string n) { try { return Input.GetAxisRaw(n); } catch (Exception) { return 0; } }

        // ------------------------------------------------------------- build
        Image fadeImg, vignette;
        RawImage grain;
        RectTransform toastBox;
        bool fadeOn;
        float grainT; int grainStep;
        static readonly Vector2[] grainOff = { new Vector2(0, 0), new Vector2(-37, 19), new Vector2(23, -41), new Vector2(-11, -7) };

        void Build()
        {
            K.Clear(root);
            // dom order of the web version, later = on top
            BuildMenu();
            BuildFirst();
            BuildGarage();
            BuildHud();
            BuildTouch();
            BuildCount();
            BuildRaceSel();
            BuildOnline();
            BuildRaceRes();
            BuildSummary();
            BuildPause();
            BuildModal();
            var vg = K.Node(root, "vignette").Fill();
            var vr = vg.gameObject.AddComponent<RawImage>(); vr.texture = Tex.Vignette(); vr.raycastTarget = false;
            toastBox = K.Node(root, "toast");
            toastBox.anchorMin = toastBox.anchorMax = toastBox.pivot = new Vector2(.5f, 1);
            toastBox.anchoredPosition = new Vector2(0, -18);
            K.V(toastBox, 6, 0, 0, 0, 0, TextAnchor.UpperCenter, false);
            K.Fit(toastBox, true, true);
            BuildBoot();
            BuildCine();
            BuildPodium();
            fadeImg = K.Img(root, new Color(0, 0, 0, 0), Sprites.White, "fade");
            fadeImg.RT().Fill();
            var gr = K.Node(root, "grain").Fill();
            grain = gr.gameObject.AddComponent<RawImage>(); grain.texture = Tex.Grain(); grain.raycastTarget = false;
            grain.color = new Color(1, 1, 1, 0.018f);
            Show("boot", true);
            screens["boot"].cg.alpha = 1;
            SetTouch(touchMode);
        }

        // ---- shared pieces
        static RectTransform Box(Transform p, float ax, float ay, float x, float y, float w, float h, string name = "box") => K.Node(p, name).At(ax, ay, x, y, w, h);

        (Text title, Text sub) TopTitle(Transform s, string title, string sub)
        {
            var col = Box(s, 0, 1, PAD, -PAD, 1100, 80, "toptitle");
            K.V(col, 6, 0, 0, 0, 0, TextAnchor.UpperLeft, false);
            K.Fit(col, true, true);
            var t = K.Cond(col, title, 44, Color.white, 700, .051f);
            t.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .45f);
            var st = K.Txt(col, sub, Fonts.Body(500), 13, Pal.amber);
            return (t, st);
        }
        Text CashBox(Transform s, float y = -PAD)
        {
            var c = Box(s, 1, 1, -PAD, y, 300, 60, "cash");
            K.V(c, 4, 0, 0, 0, 0, TextAnchor.UpperRight, false);
            K.Txt(c, "CASH", Fonts.Body(500), 10.5f, Pal.ink3, TextAnchor.UpperRight, .1f);
            return K.Cond(c, "$0", 28, Pal.ink, 600, .019f, TextAnchor.UpperRight);
        }
        (Text l, Text r) PTitle(Transform p, int padL = 20, int padT = 16, int padB = 12)
        {
            var row = K.Node(p, "ptitle");
            K.H(row, 10, padL, padL, padT, padB, TextAnchor.MiddleLeft);
            var l = K.Txt(row, "", Fonts.Body(500), 12, Pal.ink2, TextAnchor.MiddleLeft, .1f);
            K.LE(l, -1, -1, 1);
            var r = K.Txt(row, "", Fonts.Body(500), 12, Pal.ink2, TextAnchor.MiddleRight, .1f);
            K.HLine(p, Pal.line);
            return (l, r);
        }

        // .btn (style 0 plain, 1 main, 2 amber)
        public UiButton Btn(Transform p, string label, int style, Action click, string sound = "click", bool small = false)
        {
            var bgI = K.Img(p, Pal.clear, Sprites.Round, "btn", true);
            var b = bgI.gameObject.AddComponent<UiButton>();
            b.targetGraphic = bgI; b.transition = Selectable.Transition.None;
            b.data = style;
            var ring = K.Border(bgI.transform, Pal.line2);
            var focus = K.Border(bgI.transform, Pal.amber, 5); focus.sprite = Sprites.Ring2; focus.enabled = false;
            var cg = bgI.gameObject.AddComponent<CanvasGroup>();
            int px = small ? 12 : 22, py = small ? 5 : 12;
            K.H(bgI, 0, px, px, py, py, TextAnchor.MiddleCenter);
            var t = K.Cond(bgI.transform, (label ?? "").ToUpperInvariant(), small ? 16 : 15, Pal.ink, 600, .07f, TextAnchor.MiddleCenter);
            b.label = t;
            b.paint = x =>
            {
                bool hot = x.hovered && x.IsInteractable();
                int s = x.data is int i ? i : 0;
                if (s == 1) { bgI.color = hot ? Color.white : Pal.ink; ring.color = Pal.clear; t.color = Pal.C(18, 18, 18); }
                else if (s == 2) { bgI.color = hot ? Pal.amberHi : Pal.amber; ring.color = Pal.clear; t.color = Pal.dark; }
                else { bgI.color = hot ? Pal.A(Pal.ink, .06f) : Pal.clear; ring.color = hot ? Pal.ink : Pal.line2; t.color = Pal.ink; }
                cg.alpha = x.interactable ? 1 : .35f;
                focus.enabled = x.Focus;
            };
            b.onClick.AddListener(() => { if (sound != null) AudioSys.A?.Ui(sound); click?.Invoke(); });
            b.Repaint();
            return b;
        }
        static void SetLabel(UiButton b, string s) { if (b && b.label) b.label.text = (s ?? "").ToUpperInvariant(); }
        static void SetStyle(UiButton b, int style) { b.data = style; b.Repaint(); }

        // .mitem: big menu entry with the sliding dash
        UiButton Mitem(Transform p, string label, string small, Action click, bool primary = false, float width = 460)
        {
            var img = K.Img(p, Pal.clear, Sprites.White, "mitem", true);
            K.LE(img, width, 47);
            var b = img.gameObject.AddComponent<UiButton>();
            b.targetGraphic = img; b.transition = Selectable.Transition.None;
            b.pref = primary; b.hoverSound = "hover";
            var dash = K.Img(img.transform, Pal.ink3, Sprites.White, "dash");
            dash.RT().At(0, .5f, 0, 0, 12, 1);
            var t = K.Cond(img.transform, MitemText(label, small), 25, Pal.A(Color.white, .78f), 600, .064f, TextAnchor.MiddleLeft);
            t.RT().At(0, .5f, 26, 0, width, 34);
            var fx = img.gameObject.AddComponent<MitemFx>();
            fx.b = b; fx.dash = dash.RT(); fx.dashImg = dash; fx.lab = t.RT(); fx.text = t;
            fx.c0 = primary ? Color.white : Pal.A(Color.white, .78f); fx.c1 = Color.white; fx.d0 = Pal.ink3; fx.d1 = Pal.amber;
            b.label = t;
            b.onClick.AddListener(() => { AudioSys.A?.Ui("click"); click?.Invoke(); });
            return b;
        }
        static string MitemText(string label, string small) => string.IsNullOrEmpty(small) ? label : label + "   <size=11><color=#ffffff6b>" + small + "</color></size>";

        // ------------------------------------------------------------- fade / toast
        public void Fade(bool on, Action then = null)
        {
            fadeOn = on;
            if (then != null) After(0.62f, then);
        }
        public System.Collections.IEnumerator FadeCo(bool on) { Fade(on); yield return new WaitForSecondsRealtime(0.62f); }

        public void Toast(string html, float ms = 0)
        {
            var p = K.Panel(toastBox, "toast", Pal.bg, Pal.line2, false);
            K.H(p, 12, 16, 16, 10, 10, TextAnchor.MiddleCenter);
            K.Cond(p.transform, K.Rich(html, Pal.amber), 13, Pal.ink, 600, .064f, TextAnchor.MiddleCenter);
            var cg = p.gameObject.AddComponent<CanvasGroup>();
            FeedAnim(cg, 3.4f);
            After(ms > 0 ? ms / 1000f : 3.4f, () => { if (p) Destroy(p.gameObject); });
        }
        // @keyframes feed: fade in over 8%, hold to 80%, fade out
        void FeedAnim(CanvasGroup cg, float dur)
        {
            Animate(dur, k =>
            {
                if (!cg) return;
                cg.alpha = k < 0.08f ? k / 0.08f : k < 0.8f ? 1 : 1 - (k - 0.8f) / 0.2f;
            });
        }

        // ------------------------------------------------------------- boot
        RawImage bootArt;
        CanvasGroup bootLogo, bootPress, bootTip;
        Image bootBar;
        Text bootStatus, bootTipText;
        bool bootReady;
        int tipTimer;

        void BuildBoot()
        {
            var s = NewScreen("boot");
            var bg = K.Img(s.rt, Pal.C(5, 5, 6), Sprites.White, "bg", true); bg.RT().Fill();
            var art = K.Node(s.rt, "art").Fill();
            bootArt = art.gameObject.AddComponent<RawImage>(); bootArt.color = new Color(1, 1, 1, 0); bootArt.raycastTarget = false;
            var logo = K.Node(s.rt, "logo");
            logo.anchorMin = new Vector2(0, 1); logo.anchorMax = new Vector2(1, 1); logo.pivot = new Vector2(.5f, 1);
            logo.anchoredPosition = new Vector2(0, -1080 * 0.34f); logo.sizeDelta = new Vector2(0, 220);
            K.V(logo, 0, 0, 0, 0, 0, TextAnchor.UpperCenter, false);
            bootLogo = logo.gameObject.AddComponent<CanvasGroup>(); bootLogo.alpha = 0;
            Logotype(logo, 112, TextAnchor.UpperCenter);
            var tag = K.Cond(logo, "20 TRACKS · 8 COUNTRIES · UP TO 8 DRIVERS ONLINE", 14, Pal.ink2, 500, .1f, TextAnchor.UpperCenter);
            K.LE(tag, -1, 30);
            var press = K.Cond(s.rt, "CLICK OR PRESS ANY KEY", 13, Pal.ink2, 500, .1f, TextAnchor.MiddleCenter);
            press.RT().At(.5f, 0, 0, 1080 * 0.18f, 800, 24);
            bootPress = press.gameObject.AddComponent<CanvasGroup>(); bootPress.alpha = 0;
            var foot = K.Node(s.rt, "foot");
            foot.anchorMin = new Vector2(0, 0); foot.anchorMax = new Vector2(1, 0); foot.pivot = new Vector2(.5f, 0);
            foot.anchoredPosition = new Vector2(0, PAD); foot.sizeDelta = new Vector2(-2 * PAD, 110);
            var tip = K.Node(foot, "tip").At(0, 1, 0, 0, 620, 70);
            K.V(tip, 6);
            bootTip = tip.gameObject.AddComponent<CanvasGroup>();
            K.Cond(tip, "TIP", 11, Pal.amber, 600, .096f);
            bootTipText = K.Body(tip, "", 15, Pal.ink2);
            var bar = K.Img(foot, Pal.line, Sprites.White, "bar");
            bar.RT().Span(0, 0, 1, 0, 0, 0, 228, 0); bar.RT().sizeDelta = new Vector2(-228, 2); bar.RT().anchoredPosition = new Vector2(-114, 8);
            bootBar = K.Img(bar.transform, Pal.ink, Sprites.White, "fill");
            bootBar.RT().anchorMin = Vector2.zero; bootBar.RT().anchorMax = new Vector2(0, 1); bootBar.RT().offsetMin = bootBar.RT().offsetMax = Vector2.zero;
            bootStatus = K.Cond(foot, "STARTING ENGINE…", 12, Pal.ink2, 500, .09f, TextAnchor.MiddleRight);
            bootStatus.RT().At(1, 0, 0, 0, 210, 18);
        }
        // DOWNFALL + NO BRAKES
        void Logotype(Transform p, float size, TextAnchor a)
        {
            var t = K.Cond(p, "DOWNFALL", size, Color.white, 700, a == TextAnchor.UpperCenter ? .045f : .02f, a);
            t.lineSpacing = 0.9f;
            t.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .5f);
            var thin = K.Cond(p, "NO BRAKES", size * 0.26f, Pal.amber, 600, .5f, a);
            K.LE(thin, -1, size * 0.26f * 1.9f);
        }

        public void BootArt()
        {
            if (bootArt.texture == null) bootArt.texture = PaintBootArt(960, 540);
            Animate(2.2f, k => bootArt.color = new Color(1, 1, 1, k), null, bootArt);
            After(0.3f, () => Animate(1.6f, k => bootLogo.alpha = k, null, bootLogo));
        }
        public void SetLoad(double p, string text = null)
        {
            bootBar.RT().anchorMax = new Vector2(Mathf.Clamp01((float)p), 1);
            if (!string.IsNullOrEmpty(text)) bootStatus.text = text;
        }
        public void CycleTips()
        {
            int i = Mathf.FloorToInt(UnityEngine.Random.value * TIPS.Length);
            void Next()
            {
                Animate(0.5f, k => bootTip.alpha = 1 - k, () =>
                {
                    bootTipText.text = TIPS[i++ % TIPS.Length];
                    Animate(0.5f, k => bootTip.alpha = k);
                }, bootTip);
                tipTimer = After(4.2f, Next);
            }
            bootTipText.text = TIPS[i++ % TIPS.Length];
            tipTimer = After(4.2f, Next);
        }
        public void BootReady()
        {
            bootReady = true;
            bootStatus.text = "READY";
            Animate(0.8f, k => bootPress.alpha = k, Breathe, bootPress);
        }
        void Breathe()
        {
            if (!bootReady) return;
            Animate(2.4f, k => bootPress.alpha = Mathf.Lerp(1, .35f, Mathf.Sin(k * Mathf.PI)), Breathe, bootPress);
        }
        public void EndBoot() { Cancel(tipTimer); bootReady = false; Show("boot", false); }

        static Texture2D PaintBootArt(int W, int H)
        {
            // painted mountain backdrop: layered ridges, mist and a thin road line (css px space 1920x1080)
            float CW = 1920, CH = 1080, s = CW / W;
            var px = new Color[W * H];
            var sky = new (float, Color)[] { (0, Pal.Parse("#1d2632", Color.black)), (.55f, Pal.Parse("#5d6a74", Color.gray)), (1, Pal.Parse("#2a2d30", Color.black)) };
            for (int y = 0; y < H; y++) { var c = Tex.Sample(sky, (y + .5f) / H); for (int x = 0; x < W; x++) px[y * W + x] = c; }
            void Blend(int x, int y, Color c) { if (x < 0 || y < 0 || x >= W || y >= H) return; int i = y * W + x; px[i] = Color.Lerp(px[i], new Color(c.r, c.g, c.b, 1), c.a); }
            var R = new Rng(11);
            var layers = new (string col, float bas, float amp)[] { ("#46525c", .32f, .36f), ("#3a444c", .42f, .3f), ("#2c343a", .55f, .26f), ("#1e2428", .7f, .2f), ("#121619", .86f, .14f) };
            for (int li = 0; li < layers.Length; li++)
            {
                var (cs, bas, amp) = layers[li];
                var col = Pal.Parse(cs, Color.black);
                var peaks = new List<Vector2>();
                for (float x = 0; x <= CW + 20; x += 18)
                {
                    double n = Math.Sin(x * 0.004 + li * 2) * 0.5 + Math.Sin(x * 0.011 + li) * 0.3 + (R.Next() - 0.5) * 0.12;
                    peaks.Add(new Vector2(x, (float)(CH * (bas - amp * 0.5 * (n + 0.6)))));
                }
                for (int x = 0; x < W; x++)
                {
                    float cx = (x + .5f) * s;
                    int j = Mathf.Clamp((int)(cx / 18), 0, peaks.Count - 2);
                    float ry = Mathf.Lerp(peaks[j].y, peaks[j + 1].y, (cx - peaks[j].x) / 18f);
                    for (int y = Mathf.Max(0, (int)(ry / s)); y < H; y++) px[y * W + x] = col;
                }
                if (li == 0)
                {
                    var snow = new Color(225 / 255f, 230 / 255f, 235 / 255f, .55f);
                    foreach (var p in peaks)
                    {
                        if (p.y >= CH * 0.2f) continue;
                        for (float yy = 0; yy <= 14; yy += s)
                        {
                            float half = 12 * yy / 14;
                            for (float xx = -half; xx <= half; xx += s) Blend((int)((p.x + xx) / s), (int)((p.y + yy) / s), snow);
                        }
                    }
                }
                float m0 = CH * bas - 30;
                for (int y = Mathf.Max(0, (int)(m0 / s)); y < Mathf.Min(H, (int)((m0 + 90) / s)); y++)
                {
                    float f = ((y + .5f) * s - m0) / 90f;
                    float a = 0.12f * (1 - Mathf.Abs(f - 0.5f) * 2);
                    var mc = new Color(160 / 255f, 172 / 255f, 180 / 255f, Mathf.Max(0, a));
                    for (int x = 0; x < W; x++) Blend(x, y, mc);
                }
            }
            var road = new Color(200 / 255f, 190 / 255f, 170 / 255f, .35f);
            float rx = CW * 0.62f, ry2 = CH * 0.58f;
            for (int i = 0; i < 6; i++)
            {
                float dx = (i % 2 == 1 ? -1 : 1) * CW * (0.08f + i * 0.03f);
                Vector2 a = new Vector2(rx, ry2), c = new Vector2(rx + dx, ry2 + CH * 0.02f), b = new Vector2(rx + dx * 0.9f, ry2 + CH * 0.05f);
                for (int k = 0; k <= 400; k++)
                {
                    float t = k / 400f;
                    var q = (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
                    Blend((int)(q.x / s), (int)(q.y / s), road);
                }
                rx += dx * 0.9f; ry2 += CH * 0.05f;
            }
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.HideAndDontSave };
            var flip = new Color[W * H];
            for (int y = 0; y < H; y++) Array.Copy(px, y * W, flip, (H - 1 - y) * W, W);
            tex.SetPixels(flip); tex.Apply(false, true);
            return tex;
        }

        // ------------------------------------------------------------- menu
        Text mRaces, mGift, mCar, mCash, mSub;
        RectTransform mGiftKv;
        UiButton mContinue, mMountain, mAch;

        void BuildMenu()
        {
            var s = NewScreen("menu");
            var g1 = K.Node(s.rt, "shade").Fill().gameObject.AddComponent<RawImage>();
            g1.texture = Tex.Gradient(true, (0, Pal.C(8, 9, 10, .88f)), (.26f, Pal.C(8, 9, 10, .72f)), (.52f, Pal.C(8, 9, 10, .15f)), (.7f, Pal.clear)); g1.raycastTarget = false;
            var g2 = K.Node(s.rt, "shade2").Fill().gameObject.AddComponent<RawImage>();
            g2.texture = Tex.Gradient(false, (0, Pal.clear), (.78f, Pal.clear), (1, Pal.C(8, 9, 10, .75f))); g2.raycastTarget = false;
            var col = Box(s.rt, 0, .5f, PAD, 20, 460, 700, "col");
            K.V(col, 0, 0, 0, 0, 0, TextAnchor.MiddleLeft, false);
            Logotype(col, 104, TextAnchor.UpperLeft);
            K.Spacer(col, -1, 8);
            K.HLine(col, Pal.A(Color.white, .14f));
            K.Spacer(col, -1, 12);
            mSub = K.Cond(col, "RACING · 20 TRACKS · 8 COUNTRIES", 12, Pal.A(Color.white, .62f), 500, .22f);
            K.Spacer(col, -1, 40);
            var list = K.Col(col, 2, "mlist");
            Mitem(list, "RACE", "OFFLINE · VS BOTS", () => Emit("menu", "race"), true);
            Mitem(list, "PLAY WITH A FRIEND", "ONE-TIME INVITE LINK", () => Emit("menu", "friend"));
            Mitem(list, "ONLINE", "QUICK MATCH · LOBBIES", () => Emit("menu", "online"));
            Mitem(list, "GARAGE", null, () => Emit("menu", "garage"));
            mContinue = Mitem(list, "MOUNTAIN RUN", "", () => Emit("menu", "continue"));
            mMountain = Mitem(list, "MOUNTAIN", "", () => Emit("menu", "mountain"));
            Mitem(list, "SETTINGS", null, () => Emit("menu", "settings"));
            mAch = Mitem(list, "ACHIEVEMENTS", "", () => Emit("menu", "achievements"));
            Mitem(list, "CREDITS", null, () => Emit("menu", "credits"));
            // info bar
            var bar = K.Img(s.rt, Pal.C(8, 9, 10, .6f), Sprites.White, "infobar");
            var br = bar.RT(); br.anchorMin = Vector2.zero; br.anchorMax = new Vector2(1, 0); br.pivot = new Vector2(.5f, 0); br.sizeDelta = new Vector2(0, 66); br.anchoredPosition = Vector2.zero;
            var top = K.Img(bar.transform, Pal.A(Color.white, .08f), Sprites.White, "line"); top.RT().Span(0, 1, 1, 1, 0, 0, 0, -1);
            K.H(bar, 56, (int)PAD, (int)PAD, 10, 10, TextAnchor.LowerLeft);
            Text Kv(string label, out RectTransform kv)
            {
                kv = K.Col(bar.transform, 5, "kv");
                K.Txt(kv, label, Fonts.Body(500), 10.5f, Pal.ink3, TextAnchor.UpperLeft, .1f);
                return K.Cond(kv, "—", 20, Pal.ink, 600, .026f);
            }
            mRaces = Kv("RACES", out _);
            mGift = Kv("FREE CAR", out mGiftKv);
            mCar = Kv("CURRENT CAR", out _);
            mCash = Kv("CASH", out _);
            K.Spacer(bar.transform, -1, -1, 1);
            K.Cond(bar.transform, "v1.0 · UNITY EDITION", 10.5f, Pal.ink3, 500, .096f);
        }

        public void SetMenu(MenuData d)
        {
            mRaces.text = d.races.ToString();
            mGift.text = string.IsNullOrEmpty(d.gift) ? "—" : K.Rich(d.gift);
            mGiftKv.gameObject.SetActive(!string.IsNullOrEmpty(d.gift));
            mContinue.label.text = MitemText("MOUNTAIN RUN", U.FmtKm(d.best) + " KM BEST");
            mCar.text = string.IsNullOrEmpty(d.car) ? "—" : d.car;
            mCash.text = U.FmtMoney(d.cash);
            mAch.label.text = MitemText("ACHIEVEMENTS", d.ach);
            mMountain.label.text = MitemText("MOUNTAIN", d.mountain);
            mMountain.gameObject.SetActive(d.mountains > 1);
            mSub.text = d.mountainTitle ?? "";
        }

        // ------------------------------------------------------------- countdown
        Text cRecB, cNum;
        RectTransform cRec;
        void BuildCount()
        {
            var s = NewScreen("count");
            cRec = Box(s.rt, .5f, 1, 0, -1080 * 0.26f, 800, 90, "rec");
            K.V(cRec, 8, 0, 0, 0, 0, TextAnchor.UpperCenter, false);
            K.Cond(cRec, "CURRENT RECORD", 13, Pal.ink2, 500, .1f, TextAnchor.UpperCenter);
            cRecB = K.Cond(cRec, "0.00 KM", 46, Pal.ink, 700, .026f, TextAnchor.UpperCenter);
            cNum = K.Cond(s.rt, "", 170, Pal.ink, 700, .016f, TextAnchor.MiddleCenter);
            cNum.RT().At(.5f, .5f, 0, 0, 900, 240);
            cNum.gameObject.AddComponent<Shadow>().effectColor = new Color(0, 0, 0, .4f);
        }
        // 3 · 2 · 1 · GO; onTick gets each value, done fires when the screen starts to hide
        public void Countdown(double best, Action<string> onTick, Action done = null)
        {
            cRecB.text = U.FmtKm(best) + " KM";
            cRec.gameObject.SetActive(best > 0);
            Show("count", true);
            cNum.text = "";
            string[] seq = { "3", "2", "1", "GO" };
            float t = 0.9f;
            foreach (var v in seq)
            {
                var vv = v;
                After(t, () =>
                {
                    cNum.text = vv;
                    Animate(0.8f, k =>
                    {
                        var c = cNum.color;
                        float sc = k < 0.15f ? Mathf.Lerp(1.4f, 1, k / 0.15f) : k < 0.8f ? 1 : Mathf.Lerp(1, .94f, (k - .8f) / .2f);
                        c.a = k < 0.15f ? k / 0.15f : k < 0.8f ? 1 : 1 - (k - .8f) / .2f;
                        cNum.color = c; cNum.transform.localScale = Vector3.one * sc;
                    }, null, cNum);
                    onTick?.Invoke(vv);
                });
                t += v == "GO" ? 0.45f : 0.65f;
            }
            After(t, () =>
            {
                cRec.gameObject.SetActive(false);
                After(0.4f, () => Show("count", false));
                done?.Invoke();
            });
        }

        // ------------------------------------------------------------- summary
        RectTransform sumPanel;
        void BuildSummary()
        {
            var s = NewScreen("summary");
            var dim = K.Img(s.rt, Pal.C(5, 5, 6, .45f), Sprites.White, "dim", true); dim.RT().Fill();
            sumPanel = CenterPanel(s.rt, 520, 0.96f, out _).RT();
        }
        // a centred .panel with a scrolling body that grows to maxVh of the screen
        Image CenterPanel(Transform p, float width, float maxVh, out RectTransform body, int padX = 0, int padY = 0)
        {
            var panel = K.Panel(p, "panel");
            panel.RT().At(.5f, .5f, 0, 0, width, 400);
            K.V(panel, 0);
            K.Fit(panel, false, true);
            var sc = K.Scroll(panel.transform, out body);
            body.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(padX, padX, padY, padY);
            var le = K.LE(sc, -1, 300);
            var fs = sc.gameObject.AddComponent<FitScroll>();
            fs.le = le; fs.content = body; fs.max = () => root.rect.height * maxVh;
            return panel;
        }
        static RectTransform BodyOf(RectTransform panel) => (RectTransform)panel.Find("scroll/viewport/content");

        public void Summary(SummaryData d)
        {
            var body = BodyOf(sumPanel);
            K.Clear(body);
            var why = K.Cond(body, d.reason, 12, Pal.red, 600, .1f); Pad(why, 26, 22, 26, 0);
            var h2 = K.Cond(body, d.title, 40, Pal.ink, 700, .058f); Pad(h2, 26, 6, 26, 0);
            var bigd = K.Node(body, "bigd"); K.H(bigd, 10, 26, 26, 6, 18, TextAnchor.LowerLeft);
            K.Cond(bigd, U.FmtKm(d.distance) + "<size=20><color=" + Pal.Hex(Pal.ink2) + ">  KM</color></size>", 54, Pal.ink, 700);
            K.Spacer(bigd, -1, -1, 1);
            if (d.record)
            {
                var badge = K.Img(bigd, Pal.amber, Sprites.White, "rec"); K.H(badge, 0, 10, 10, 6, 6, TextAnchor.MiddleCenter);
                K.Cond(badge.transform, "NEW RECORD", 14, Pal.dark, 700, .096f);
            }
            K.HLine(body, Pal.line);
            var lines = K.Col(body, 0, "lines"); lines.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(26, 26, 10, 10);
            var rows = new List<CanvasGroup>();
            foreach (var l in d.lines) rows.Add(LineRow(lines, l[0], l[1], false));
            rows.Add(LineRow(lines, "TOTAL", U.FmtMoney(d.total), true));
            var cond = K.Node(body, "cond"); K.H(cond, 6, 26, 26, 4, 16, TextAnchor.MiddleLeft);
            foreach (var kv in d.condition)
            {
                var chip = K.Node(cond, "chip"); K.V(chip, 2, 0, 0, 5, 5, TextAnchor.UpperCenter); K.LE(chip, -1, -1, 1);
                K.Border(chip, Pal.line);
                K.Cond(chip, kv.Key, 10, Pal.ink2, 600, .038f, TextAnchor.UpperCenter);
                K.Cond(chip, Mathf.RoundToInt((float)kv.Value * 100) + "%", 15, Pal.ink, 700, 0, TextAnchor.UpperCenter);
            }
            if (!string.IsNullOrEmpty(d.next))
            {
                K.HLine(body, Pal.line);
                var nx = K.Body(body, K.Rich(d.next, Pal.amber), 13, Pal.ink2); Pad(nx, 26, 12, 26, 12);
            }
            var foot = K.Node(body, "foot"); K.H(foot, 10, 26, 26, 16, 22, TextAnchor.MiddleCenter);
            var bg = Btn(foot, "GARAGE", 0, () => Emit("toGarage")); K.LE(bg, -1, -1, 1);
            var br = Btn(foot, "RETRY", 1, () => Emit("retry"), "buy"); K.LE(br, -1, -1, 1); br.pref = true;
            br.label.text = "RETRY  <size=12><color=#12121280>[R]</color></size>";
            Show("summary", true);
            AutoFocus();
            for (int i = 0; i < rows.Count; i++)
            {
                var cg = rows[i];
                After(0.25f + i * 0.16f, () => { if (!cg) return; Animate(0.3f, k => { if (cg) cg.alpha = k; }); AudioSys.A?.Ui("hover"); });
            }
        }
        static void Pad(Component c, int l, int t, int r, int b)
        {
            // wrap a text in a padded holder (css padding/margins)
            var holder = K.Node(c.transform.parent, c.name + "-pad");
            holder.SetSiblingIndex(c.transform.GetSiblingIndex());
            c.transform.SetParent(holder, false);
            K.V(holder, 0, l, r, t, b);
        }
        CanvasGroup LineRow(Transform p, string a, string b, bool total, bool show = false)
        {
            var row = K.Node(p, "line");
            var cg = row.gameObject.AddComponent<CanvasGroup>(); cg.alpha = show ? 1 : 0;
            if (total) { var top = K.Img(row, Pal.line2, Sprites.White, "top"); top.RT().Span(0, 1, 1, 1, 0, 0, 0, -1); top.gameObject.AddComponent<LayoutElement>().ignoreLayout = true; }
            K.H(row, 10, 0, 0, total ? 13 : 7, 7, TextAnchor.MiddleLeft);
            var l = K.Cond(row, a, total ? 17 : 14, total ? Pal.ink : Pal.ink2, 500, .064f); K.LE(l, -1, -1, 1);
            K.Cond(row, b, total ? 26 : 14, total ? Pal.amber : Pal.ink, 600, .019f, TextAnchor.MiddleRight);
            return cg;
        }

        // ------------------------------------------------------------- pause
        void BuildPause()
        {
            var s = NewScreen("pause");
            var dim = K.Img(s.rt, Pal.C(5, 5, 6, .6f), Sprites.White, "dim", true); dim.RT().Fill();
            var col = Box(s.rt, .5f, .5f, 0, 0, 340, 300, "col");
            K.V(col, 2, 0, 0, 0, 0, TextAnchor.MiddleCenter, false);
            K.Fit(col, false, true);
            var h = K.Cond(col, "PAUSED", 34, Pal.ink, 700, .096f, TextAnchor.UpperCenter); K.LE(h, 340, 64);
            Mitem(col, "RESUME", null, () => Emit("pauseMenu", "resume"), true, 300);
            Mitem(col, "RESTART RUN", null, () => Emit("pauseMenu", "restart"), false, 300);
            Mitem(col, "SETTINGS", null, () => Emit("pauseMenu", "settings"), false, 300);
            Mitem(col, "BACK TO GARAGE", null, () => Emit("pauseMenu", "garage"), false, 300);
        }

        // ------------------------------------------------------------- modal
        Text modalTitle;
        RectTransform modalBody;
        void BuildModal()
        {
            var s = NewScreen("modal");
            s.speed = 1 / 0.3f;
            var dim = K.Img(s.rt, Pal.C(5, 5, 6, .55f), Sprites.White, "dim", true); dim.RT().Fill();
            var db = dim.gameObject.AddComponent<Button>(); db.transition = Selectable.Transition.None;
            db.navigation = new Navigation { mode = Navigation.Mode.None };
            db.onClick.AddListener(CloseModal);
            var panel = K.Panel(s.rt, "panel");
            panel.RT().At(.5f, .5f, 0, 0, 640, 400);
            K.V(panel, 0);
            K.Fit(panel, false, true);
            var pt = K.Node(panel.transform, "ptitle"); K.H(pt, 10, 20, 20, 12, 12, TextAnchor.MiddleLeft);
            modalTitle = K.Txt(pt, "", Fonts.Body(500), 12, Pal.ink2, TextAnchor.MiddleLeft, .1f); K.LE(modalTitle, -1, -1, 1);
            Btn(pt, "CLOSE", 0, CloseModal, "back", true);
            K.HLine(panel.transform, Pal.line);
            var sc = K.Scroll(panel.transform, out modalBody);
            modalBody.GetComponent<VerticalLayoutGroup>().padding = new RectOffset(20, 20, 8, 20);
            var le = K.LE(sc, -1, 300);
            var fs = sc.gameObject.AddComponent<FitScroll>(); fs.le = le; fs.content = modalBody; fs.max = () => root.rect.height * 0.86f - 60;
        }
        public bool ModalOpen => screens.TryGetValue("modal", out var m) && m.show;
        // fill(body) builds the content; html of the web version is replaced by code
        public void OpenModal(string title, Action<RectTransform> fill)
        {
            modalTitle.text = title;
            K.Clear(modalBody);
            fill?.Invoke(modalBody);
            modalBody.anchoredPosition = Vector2.zero;
            Show("modal", true);
            AutoFocus();
        }
        public void CloseModal()
        {
            if (!ModalOpen) return;
            Show("modal", false);
            Emit("modalClosed");
            AutoFocus();
        }

        RectTransform SRow(Transform body, string label)
        {
            var row = K.Node(body, "srow");
            K.H(row, 18, 0, 0, 13, 13, TextAnchor.MiddleLeft);
            var l = K.Cond(row, label, 14, Pal.ink2, 500, .064f); K.LE(l, -1, -1, 1);
            var bl = K.Img(row, Pal.line, Sprites.White, "hr"); bl.RT().Span(0, 0, 1, 0, 0, -1, 0, 0); bl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            return row;
        }
        UiSlider Range(Transform p, float value, Action<float> change)
        {
            var r = K.Node(p, "range"); K.LE(r, 200, 20);
            var track = K.Img(r, Pal.line2, Sprites.White, "track", true); track.RT().anchorMin = new Vector2(0, .5f); track.RT().anchorMax = new Vector2(1, .5f); track.RT().sizeDelta = new Vector2(0, 2);
            var area = K.Node(r, "area").Fill(7, 0, 7, 0);
            var handle = K.Img(area, Pal.ink, Sprites.White, "handle", true); handle.RT().sizeDelta = new Vector2(14, 14);
            var focus = K.Border(handle.transform, Pal.amber, 4); focus.sprite = Sprites.Ring2; focus.enabled = false;
            var sl = r.gameObject.AddComponent<UiSlider>();
            sl.handleRect = handle.RT(); sl.targetGraphic = handle; sl.transition = Selectable.Transition.None;
            sl.minValue = 0; sl.maxValue = 1; sl.direction = Slider.Direction.LeftToRight;
            sl.SetValueWithoutNotify(value);
            sl.paint = x => focus.enabled = x.Focus;
            sl.onValueChanged.AddListener(v => { v = Mathf.Round(v / 0.05f) * 0.05f; change(v); });
            return sl;
        }
        void Seg(Transform p, string[][] opts, string cur, Action<string> pick)
        {
            var seg = K.Node(p, "seg"); K.H(seg, 0, 1, 1, 1, 1, TextAnchor.MiddleLeft);
            K.Border(seg, Pal.line2);
            var all = new List<UiButton>();
            foreach (var o in opts)
            {
                var img = K.Img(seg, Pal.clear, Sprites.White, "opt", true);
                K.H(img, 0, 12, 12, 8, 8, TextAnchor.MiddleCenter);
                var b = img.gameObject.AddComponent<UiButton>(); b.targetGraphic = img; b.transition = Selectable.Transition.None;
                var t = K.Cond(img.transform, o[1], 12, Pal.ink2, 600, .051f, TextAnchor.MiddleCenter);
                var focus = K.Border(img.transform, Pal.amber, 3); focus.sprite = Sprites.Ring2; focus.enabled = false;
                b.label = t; b.on = o[0] == cur; b.data = o[0];
                b.paint = x => { img.color = x.on ? Pal.ink : x.Hot ? Pal.A(Pal.ink, .06f) : Pal.clear; t.color = x.on ? Pal.C(17, 17, 17) : Pal.ink2; focus.enabled = x.Focus; };
                all.Add(b);
                b.onClick.AddListener(() =>
                {
                    foreach (var y in all) { y.on = y == b; y.Repaint(); }
                    AudioSys.A?.Ui("click");
                    pick((string)b.data);
                });
                b.Repaint();
            }
        }

        // onChange(key, value): value is double for the sliders and shake, bool for on/off, else string; ("reset", true)
        public void Settings(Downfall.Settings set, Action<string, object> onChange)
        {
            string B(bool v) => v ? "true" : "false";
            string N(double v) => v.ToString(System.Globalization.CultureInfo.InvariantCulture);
            OpenModal("SETTINGS", body =>
            {
                Range(SRow(body, "MASTER VOLUME"), (float)set.master, v => onChange("master", (double)v));
                Range(SRow(body, "MUSIC"), (float)set.music, v => onChange("music", (double)v));
                Range(SRow(body, "SOUND EFFECTS"), (float)set.sfx, v => onChange("sfx", (double)v));
                Seg(SRow(body, "GRAPHICS"), new[] { new[] { "auto", "AUTO" }, new[] { "low", "LOW" }, new[] { "medium", "MEDIUM" }, new[] { "high", "HIGH" } }, set.quality, v => onChange("quality", v));
                Seg(SRow(body, "CAMERA"), new[] { new[] { "chase", "CHASE" }, new[] { "far", "FAR" }, new[] { "hood", "HOOD" }, new[] { "cockpit", "FIRST PERSON" } }, set.camera, v => onChange("camera", v));
                Seg(SRow(body, "SPEED UNITS"), new[] { new[] { "kmh", "KM/H" }, new[] { "mph", "MPH" } }, set.units, v => onChange("units", v));
                Seg(SRow(body, "DRIVING ASSIST"), new[] { new[] { "true", "ON" }, new[] { "false", "OFF" } }, B(set.assist), v => onChange("assist", v == "true"));
                Seg(SRow(body, "CAMERA SHAKE"), new[] { new[] { "1", "ON" }, new[] { "0.4", "LOW" }, new[] { "0", "OFF" } }, N(set.shake), v => onChange("shake", double.Parse(v, System.Globalization.CultureInfo.InvariantCulture)));
                Seg(SRow(body, "SHOW FPS"), new[] { new[] { "true", "ON" }, new[] { "false", "OFF" } }, B(set.showFps), v => onChange("showFps", v == "true"));
                var cr = SRow(body, "CONTROLS");
                K.Cond(cr, "W/UP GAS · S/DOWN BRAKE/REVERSE · A D STEER\nSPACE HANDBRAKE · SHIFT TURBO · C CAMERA · ESC PAUSE", 13, Pal.ink2, 500, .12f, TextAnchor.MiddleRight);
                var rr = SRow(body, "SAVE DATA");
                bool armed = false;
                UiButton rb = null;
                rb = Btn(rr, "RESET PROGRESS", 0, () =>
                {
                    if (armed) { onChange("reset", true); return; }
                    armed = true; SetLabel(rb, "CLICK AGAIN TO ERASE EVERYTHING");
                }, "click", true);
            });
        }

        public void Achievements(IList<AchItem> list)
        {
            int done = 0;
            foreach (var a in list) if (a.done) done++;
            OpenModal($"ACHIEVEMENTS · {done}/{list.Count}", body =>
            {
                foreach (var a in list)
                {
                    var row = K.Node(body, "ach"); K.H(row, 14, 0, 0, 12, 12, TextAnchor.MiddleLeft);
                    var bl = K.Img(row, Pal.line, Sprites.White, "hr"); bl.RT().Span(0, 0, 1, 0, 0, -1, 0, 0); bl.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                    var ic = K.Img(row, a.done ? Pal.amber2 : Pal.clear, Sprites.White, "ic"); K.LE(ic, 34, 34);
                    K.Border(ic.transform, a.done ? Pal.amber : Pal.line2);
                    if (a.done)
                    {
                        var chk = K.Node(ic.transform, "chk").Fill(8, 8, 8, 8).gameObject.AddComponent<Vec2D>();
                        chk.design = new Vector2(10, 10); chk.raycastTarget = false;
                        chk.Stroke(new List<Vector2> { new Vector2(1, 5.2f), new Vector2(4, 8), new Vector2(9, 2) }, 1.6f, Pal.amber);
                        chk.Commit();
                    }
                    else { var dot = K.Cond(ic.transform, "·", 14, Pal.ink3, 700, 0, TextAnchor.MiddleCenter); dot.RT().Fill(); }
                    var mid = K.Col(row, 3); K.LE(mid, -1, -1, 1);
                    K.Cond(mid, a.name, 15, Pal.ink, 600, .058f);
                    K.Body(mid, a.desc, 13, Pal.ink2);
                    K.Cond(row, U.FmtMoney(a.reward), 13, a.done ? Pal.amber : Pal.ink3, 600, .032f, TextAnchor.MiddleRight);
                }
            });
        }

        public void Credits()
        {
            OpenModal("CREDITS", body =>
            {
                void H4(string s) { K.Spacer(body, -1, 16); K.Cond(body, s, 13, Pal.amber, 600, .096f); K.Spacer(body, -1, 2); }
                void P(string s) { var t = K.Body(body, s, 14, Pal.ink2); t.lineSpacing = 1.15f; }
                H4("DOWNFALL: NO BRAKES"); P("A downhill driving progression game. Cars, trees, buildings, animals and the workshop were modelled with Blender scripts made for this game; sounds and music are synthesised live.");
                H4("DESIGN, CODE, VEHICLES, WORLD"); P("Originally built for the browser with three.js (MIT licence); this edition runs on Unity.");
                H4("THIRD-PARTY MODELS"); P("Fox: model by PixelMannen (CC0), rigging and animation by tomkranis (CC-BY 4.0), glTF conversion by AsoboStudio and scurest (CC-BY 4.0).\nDrinks fridge: Eric Chadwick / Darmstadt Graphics Group, based on \"Commercial Fridge\" by Sean Thomas (CC-BY 4.0).\nBarn lamp: Eric Chadwick / Wayfair LLC (CC-BY 4.0). All from the Khronos glTF Sample Assets.");
                H4("SOUND"); P("All engine notes, tyres, impacts, weather and music are synthesised live.");
                H4("TYPE"); P("Barlow and Barlow Condensed by Jeremy Tribby (SIL Open Font Licence).");
                H4("VEHICLES"); P("All vehicles and the Montagna Motors dealership are fictional and carry no real brands or logos.");
                H4("THANKS"); P("To everyone who ever drove a bad car down a good road.");
            });
        }
    }
}
