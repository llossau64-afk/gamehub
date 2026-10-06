using System;
using System.Collections.Generic;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Save;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// Builds the canvases (background, screens, overlay), owns the screens and modal panels, runs the transitions
    /// between them and routes keyboard input to whatever is on top.
    /// </summary>
    public sealed class UIManager : MonoBehaviour
    {
        readonly Dictionary<Type, UIScreen> screens = new Dictionary<Type, UIScreen>();
        readonly Dictionary<Type, UIPanel> panels = new Dictionary<Type, UIPanel>();
        readonly List<UIPanel> openPanels = new List<UIPanel>();

        RectTransform screenLayer;
        RectTransform panelLayer;
        RectTransform overlayLayer;
        FpsCounter fps;

        public BackgroundFX Background { get; private set; }
        public Toasts Toasts { get; private set; }
        public FloatingText Floating { get; private set; }
        public Confetti Confetti { get; private set; }
        public RectTransform OverlayLayer => overlayLayer;
        public UIScreen Current { get; private set; }
        public bool HasOpenPanel => openPanels.Count > 0;

        public event Action<UIScreen> ScreenChanged;

        public void Initialize()
        {
            if (FindAnyEventSystem() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                es.transform.SetParent(transform, false);
            }

            var bgCanvas = CreateCanvas("Canvas Background", 0);
            Background = BackgroundFX.Create(bgCanvas.transform);

            var mainCanvas = CreateCanvas("Canvas Screens", 10);
            screenLayer = SafeRoot(mainCanvas.transform, "Screens");

            var panelCanvas = CreateCanvas("Canvas Panels", 20);
            panelLayer = UIFactory.Stretch(UIFactory.Rect("Panels", panelCanvas.transform));

            var overlayCanvas = CreateCanvas("Canvas Overlay", 30);
            overlayLayer = SafeRoot(overlayCanvas.transform, "Overlay");
            Floating = FloatingText.Create(overlayLayer);
            Confetti = Confetti.Create(overlayCanvas.transform, 90);
            Toasts = Toasts.Create(overlayLayer);
            fps = FpsCounter.Create(overlayLayer);
            fps.gameObject.SetActive(false);
            OrientationHint.Create(overlayCanvas.transform);
        }

        static EventSystem FindAnyEventSystem()
        {
            return EventSystem.current != null ? EventSystem.current : UnityEngine.Object.FindFirstObjectByType<EventSystem>();
        }

        Canvas CreateCanvas(string name, int order)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(transform, false);
            go.layer = LayerMask.NameToLayer("UI") >= 0 ? LayerMask.NameToLayer("UI") : 0;
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = order;
            canvas.pixelPerfect = false;
            go.AddComponent<ResponsiveScaler>();
            return canvas;
        }

        static RectTransform SafeRoot(Transform canvas, string name)
        {
            var rt = UIFactory.Rect(name, canvas);
            UIFactory.Stretch(rt);
            rt.gameObject.AddComponent<SafeArea>();
            return rt;
        }

        public void ApplyQuality(GraphicsQuality quality, bool showFps)
        {
            Background.SetQuality(quality);
            fps.gameObject.SetActive(showFps);
        }

        // ───────────────────────── Screens ─────────────────────────

        public T Get<T>() where T : UIScreen
        {
            if (screens.TryGetValue(typeof(T), out var s)) return (T)s;
            var rt = UIFactory.Rect(typeof(T).Name, screenLayer);
            UIFactory.Stretch(rt);
            var screen = rt.gameObject.AddComponent<T>();
            screen.Build(this);
            rt.gameObject.SetActive(false);
            screens.Add(typeof(T), screen);
            return screen;
        }

        public T Show<T>(object argument = null) where T : UIScreen
        {
            var next = Get<T>();
            ShowScreen(next, argument);
            return next;
        }

        void ShowScreen(UIScreen next, object argument)
        {
            var previous = Current;
            if (previous == next)
            {
                next.OnShow(argument);
                return;
            }

            if (previous != null)
            {
                previous.SetVisible(false);
                previous.OnHide();
                previous.Group.blocksRaycasts = false;
                var prevRoot = previous.Root;
                Tween.Fade(previous.Group, 0f, 0.16f, Ease.OutCubic, 0f, () =>
                {
                    if (!previous.IsVisible) prevRoot.gameObject.SetActive(false);
                });
                Tween.Move(prevRoot, new Vector2(-50f, 0f), 0.16f);
            }

            Current = next;
            next.gameObject.SetActive(true);
            next.Root.SetAsLastSibling();
            next.SetVisible(true);
            next.Group.alpha = 0f;
            next.Group.blocksRaycasts = true;
            next.Root.anchoredPosition = new Vector2(60f, 0f);
            Tween.Fade(next.Group, 1f, 0.28f, Ease.OutCubic, 0.06f);
            Tween.Move(next.Root, Vector2.zero, 0.34f, Ease.OutQuint, 0.06f);
            Background.SetIntensity(next.ShowBackground ? 1f : 0.35f);
            next.OnShow(argument);
            ScreenChanged?.Invoke(next);
        }

        // ───────────────────────── Panels ─────────────────────────

        public T OpenPanel<T>(object argument = null) where T : UIPanel
        {
            if (!panels.TryGetValue(typeof(T), out var panel))
            {
                var rt = UIFactory.Rect(typeof(T).Name, panelLayer);
                panel = rt.gameObject.AddComponent<T>();
                panel.Build(this);
                panels.Add(typeof(T), panel);
            }
            if (!openPanels.Contains(panel)) openPanels.Add(panel);
            panel.gameObject.SetActive(true);
            panel.transform.SetAsLastSibling();
            var group = UIFactory.Group(panel);
            group.alpha = 0f;
            group.blocksRaycasts = true;
            Tween.Fade(group, 1f, 0.2f);
            var card = panel.transform.Find("Card");
            if (card != null) Tween.ScaleFrom(card, 0.92f, 1f, 0.3f, Ease.OutBack);
            UIFeedback.Play(Sfx.Whoosh);
            panel.OnOpen(argument);
            return (T)panel;
        }

        public void ClosePanel(UIPanel panel)
        {
            if (panel == null || !openPanels.Remove(panel)) return;
            panel.OnClose();
            var group = UIFactory.Group(panel);
            group.blocksRaycasts = false;
            Tween.Fade(group, 0f, 0.16f, Ease.OutCubic, 0f, () =>
            {
                if (!openPanels.Contains(panel)) panel.gameObject.SetActive(false);
            });
        }

        public void CloseAllPanels()
        {
            for (int i = openPanels.Count - 1; i >= 0; i--) ClosePanel(openPanels[i]);
        }

        public bool IsOpen<T>() where T : UIPanel
        {
            return panels.TryGetValue(typeof(T), out var p) && openPanels.Contains(p);
        }

        // ───────────────────────── Messages ─────────────────────────

        public void Toast(string message, ToastKind kind = ToastKind.Info)
        {
            Toasts.Show(message, kind);
        }

        public void Confirm(string title, string message, string yes, string no, Action onYes, Action onNo = null)
        {
            var dialog = OpenPanel<ConfirmDialog>();
            dialog.Setup(title, message, yes, no, onYes, onNo);
        }

        // ───────────────────────── Input ─────────────────────────

        public void HandleKey(KeyCode key)
        {
            if (openPanels.Count > 0)
            {
                var top = openPanels[openPanels.Count - 1];
                if (key == KeyCode.Escape) top.TryDismiss();
                else top.OnKey(key);
                return;
            }
            if (Current == null) return;
            if (key == KeyCode.Escape) Current.OnBack();
            else Current.OnKey(key);
        }

        public void HandleText(char c)
        {
            if (openPanels.Count > 0)
            {
                openPanels[openPanels.Count - 1].OnText(c);
                return;
            }
            if (Current != null) Current.OnText(c);
        }
    }

    /// <summary>Yes/no confirmation.</summary>
    public sealed class ConfirmDialog : UIPanel
    {
        Text title;
        Text message;
        GameButton yes;
        GameButton no;
        Action onYes;
        Action onNo;

        protected override Vector2 CardSize => new Vector2(860f, 440f);

        protected override void OnBuild()
        {
            title = Title("", false);
            message = UIFactory.Label(Card, "", Theme.Body, Theme.TextMuted, Theme.Medium);
            UIFactory.Place(message.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, 20f), new Vector2(740f, 140f));

            no = GameButton.Create(Card, "CANCEL", ButtonStyle.Secondary, new Vector2(330f, 96f));
            UIFactory.Place((RectTransform)no.transform, new Vector2(0.5f, 0f), new Vector2(-180f, 60f), new Vector2(330f, 96f), new Vector2(0.5f, 0f));
            no.OnClick = () =>
            {
                var cb = onNo;
                Close();
                cb?.Invoke();
            };

            yes = GameButton.Create(Card, "OK", ButtonStyle.Primary, new Vector2(330f, 96f));
            UIFactory.Place((RectTransform)yes.transform, new Vector2(0.5f, 0f), new Vector2(180f, 60f), new Vector2(330f, 96f), new Vector2(0.5f, 0f));
            yes.OnClick = () =>
            {
                var cb = onYes;
                Close();
                cb?.Invoke();
            };
        }

        public void Setup(string titleText, string messageText, string yesText, string noText, Action yesAction, Action noAction)
        {
            title.text = titleText;
            message.text = messageText;
            yes.SetLabel(yesText);
            no.SetLabel(noText);
            onYes = yesAction;
            onNo = noAction;
        }

        public override void OnKey(KeyCode key)
        {
            if (key == KeyCode.Return || key == KeyCode.KeypadEnter) yes.Click();
        }
    }
}
