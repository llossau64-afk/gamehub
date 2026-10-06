using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// Keeps the 1920x1080 layout fully visible on any aspect ratio: wide screens (phones in landscape) scale by
    /// height, narrow ones (tablets, 4:3, 16:10) by width.
    /// </summary>
    [RequireComponent(typeof(CanvasScaler))]
    public sealed class ResponsiveScaler : MonoBehaviour
    {
        public static readonly Vector2 Reference = new Vector2(1920f, 1080f);
        CanvasScaler scaler;
        int lastW, lastH;

        void Awake()
        {
            scaler = GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = Reference;
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            Apply();
        }

        void Update()
        {
            if (Screen.width != lastW || Screen.height != lastH) Apply();
        }

        void Apply()
        {
            lastW = Screen.width;
            lastH = Screen.height;
            float aspect = lastH > 0 ? lastW / (float)lastH : 16f / 9f;
            scaler.matchWidthOrHeight = aspect >= Reference.x / Reference.y ? 1f : 0f;
        }
    }

    /// <summary>Insets its rect to Screen.safeArea so notches and rounded corners never cover controls.</summary>
    public sealed class SafeArea : MonoBehaviour
    {
        RectTransform rt;
        Rect last;
        int lastW, lastH;

        void Awake()
        {
            rt = (RectTransform)transform;
            Apply();
        }

        void Update()
        {
            if (Screen.safeArea != last || Screen.width != lastW || Screen.height != lastH) Apply();
        }

        void Apply()
        {
            last = Screen.safeArea;
            lastW = Screen.width;
            lastH = Screen.height;
            if (lastW <= 0 || lastH <= 0) return;
            var min = last.position;
            var max = last.position + last.size;
            min.x /= lastW;
            min.y /= lastH;
            max.x /= lastW;
            max.y /= lastH;
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }
    }

    /// <summary>Shows a "rotate your device" hint while a phone is held in portrait.</summary>
    public sealed class OrientationHint : MonoBehaviour
    {
        Graphic[] graphics;
        bool shown = true;

        public static OrientationHint Create(Transform parent)
        {
            var bg = UIFactory.Image(parent, "Orientation Hint", Theme.Background, Shapes.White, raycast: true);
            UIFactory.Stretch(bg.rectTransform, -400f, -400f, -400f, -400f);
            var hint = bg.gameObject.AddComponent<OrientationHint>();

            var icon = UIFactory.Icon(bg.rectTransform, "screen_rotation", 220f, Theme.Accent);
            icon.rectTransform.anchoredPosition = new Vector2(0f, 120f);
            var label = UIFactory.Label(bg.rectTransform, "ROTATE YOUR DEVICE", Theme.H2, Theme.Text, Theme.Bold);
            UIFactory.Place(label.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -60f), new Vector2(1400f, 80f));
            var sub = UIFactory.Label(bg.rectTransform, "Guess the Answer plays best in landscape.", Theme.Body, Theme.TextMuted);
            UIFactory.Place(sub.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -130f), new Vector2(1400f, 60f));
            hint.graphics = bg.GetComponentsInChildren<Graphic>(true);
            return hint;
        }

        void Update()
        {
            bool portrait = Screen.height > Screen.width * 1.05f && Platform.BrowserBridge.IsMobile;
            if (shown == portrait) return;
            shown = portrait;
            // Disabled graphics neither draw nor block input.
            foreach (var g in graphics) g.enabled = portrait;
        }
    }

    /// <summary>Optional FPS readout (Settings → Show FPS).</summary>
    public sealed class FpsCounter : MonoBehaviour
    {
        Text label;
        float timer;
        int frames;

        public static FpsCounter Create(Transform parent)
        {
            var t = UIFactory.Label(parent, "", Theme.Tiny, Theme.TextMuted, Theme.Medium, TextAnchor.UpperLeft, "FPS");
            UIFactory.Place(t.rectTransform, new Vector2(0f, 1f), new Vector2(12f, -8f), new Vector2(200f, 30f), new Vector2(0f, 1f));
            var c = t.gameObject.AddComponent<FpsCounter>();
            c.label = t;
            return c;
        }

        void Update()
        {
            frames++;
            timer += Time.unscaledDeltaTime;
            if (timer >= 0.5f)
            {
                label.text = Mathf.RoundToInt(frames / timer) + " FPS";
                frames = 0;
                timer = 0f;
            }
        }
    }
}
