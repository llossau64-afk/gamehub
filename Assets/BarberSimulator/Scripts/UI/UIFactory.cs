using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Builds styled uGUI elements from code. Keeps views short and consistent.</summary>
    public sealed class UIFactory
    {
        public UITheme Theme { get; }
        public LocalizationBinder Text { get; }

        public UIFactory(UITheme theme, LocalizationBinder binder)
        {
            Theme = theme;
            Text = binder;
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5; // UI
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        public static RectTransform Stretch(RectTransform rt, float left = 0f, float right = 0f, float top = 0f, float bottom = 0f)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(left, bottom);
            rt.offsetMax = new Vector2(-right, -top);
            return rt;
        }

        public static RectTransform Anchor(RectTransform rt, Vector2 anchor, Vector2 pivot, Vector2 position, Vector2 size)
        {
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = position;
            rt.sizeDelta = size;
            return rt;
        }

        public CanvasGroup Group(RectTransform rt, float alpha = 1f)
        {
            var group = rt.gameObject.AddComponent<CanvasGroup>();
            group.alpha = alpha;
            return group;
        }

        public Image Image(string name, Transform parent, Sprite sprite, Color color, bool raycast = false)
        {
            var rt = Rect(name, parent);
            var image = rt.gameObject.AddComponent<Image>();
            image.sprite = sprite;
            image.color = color;
            image.raycastTarget = raycast;
            if (sprite != null && sprite.border.sqrMagnitude > 0f) image.type = UnityEngine.UI.Image.Type.Sliced;
            return image;
        }

        public Text Label(string name, Transform parent, Font font, int size, Color color, TextAnchor align, string key = null, bool upper = false)
        {
            var rt = Rect(name, parent);
            var text = rt.gameObject.AddComponent<Text>();
            text.font = font != null ? font : Theme.bodyFont;
            text.fontSize = size;
            text.color = color;
            text.alignment = align;
            text.raycastTarget = false;
            text.supportRichText = true;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.alignByGeometry = false;
            if (!string.IsNullOrEmpty(key)) Text.Bind(text, key, upper);
            return text;
        }

        public static LetterSpacing Spacing(Text text, float spacing)
        {
            var effect = text.gameObject.AddComponent<LetterSpacing>();
            effect.Spacing = spacing;
            return effect;
        }

        public static Shadow SoftShadow(Graphic graphic, Color color, Vector2 distance)
        {
            var shadow = graphic.gameObject.AddComponent<Shadow>();
            shadow.effectColor = color;
            shadow.effectDistance = distance;
            return shadow;
        }

        /// <summary>A transparent but raycastable hit area.</summary>
        public static Image HitArea(RectTransform rt)
        {
            var image = rt.gameObject.AddComponent<Image>();
            image.color = new Color(0f, 0f, 0f, 0f);
            image.raycastTarget = true;
            return image;
        }

        public static Button PlainButton(RectTransform rt)
        {
            HitArea(rt);
            var button = rt.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.None;
            return button;
        }
    }
}
