using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>Helpers that build styled uGUI elements in code. All layout values are in reference pixels (1920x1080).</summary>
    public static class UIFactory
    {
        static int uiLayer = -1;

        static int UILayer
        {
            get
            {
                if (uiLayer < 0)
                {
                    uiLayer = LayerMask.NameToLayer("UI");
                    if (uiLayer < 0) uiLayer = 0;
                }
                return uiLayer;
            }
        }

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = UILayer;
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        public static RectTransform Stretch(RectTransform rt, float left = 0f, float top = 0f, float right = 0f, float bottom = 0f)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.offsetMin = new Vector2(left, bottom);
            rt.offsetMax = new Vector2(-right, -top);
            return rt;
        }

        /// <summary>Anchors at a normalized point of the parent (0..1) and places the element there.</summary>
        public static RectTransform Place(RectTransform rt, Vector2 anchor, Vector2 position, Vector2 size, Vector2? pivot = null)
        {
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = pivot ?? anchor;
            rt.sizeDelta = size;
            rt.anchoredPosition = position;
            return rt;
        }

        public static RectTransform Place(RectTransform rt, float ax, float ay, float x, float y, float w, float h)
        {
            return Place(rt, new Vector2(ax, ay), new Vector2(x, y), new Vector2(w, h));
        }

        public static Image Image(Transform parent, string name, Color color, Sprite sprite = null, bool raycast = false)
        {
            var rt = Rect(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = raycast;
            return img;
        }

        /// <summary>A rounded panel. Radius is in reference pixels.</summary>
        public static Image Panel(Transform parent, string name, Color color, float radius = Theme.Radius, bool raycast = false)
        {
            var img = Image(parent, name, color, Shapes.Rounded, raycast);
            MakeRounded(img, radius);
            return img;
        }

        public static void MakeRounded(Image img, float radius)
        {
            img.sprite = Shapes.Rounded;
            img.type = UnityEngine.UI.Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = Shapes.RadiusMultiplier(radius);
        }

        public static Image Outline(Transform parent, Color color, float radius = Theme.Radius)
        {
            var img = Image(parent, "Outline", color, Shapes.RoundedOutline);
            img.type = UnityEngine.UI.Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = Shapes.RadiusMultiplier(radius);
            Stretch(img.rectTransform);
            return img;
        }

        /// <summary>A soft drop shadow as the first child of the target (so it renders behind the target's content).</summary>
        public static Image Shadow(RectTransform target, float spread = 18f, float offsetY = -10f, float alpha = 0.5f)
        {
            var img = Image(target, "Shadow", new Color(0f, 0f, 0f, alpha), Shapes.SoftShadow);
            img.type = UnityEngine.UI.Image.Type.Sliced;
            img.pixelsPerUnitMultiplier = Shapes.ShadowBorder / Mathf.Max(8f, spread + 24f);
            float pad = spread + 24f;
            Stretch(img.rectTransform, -pad, -pad - offsetY, -pad, -pad + offsetY);
            img.transform.SetAsFirstSibling();
            return img;
        }

        public static Text Label(Transform parent, string text, int size, Color color, Font font = null, TextAnchor align = TextAnchor.MiddleCenter, string name = "Label")
        {
            var rt = Rect(name, parent);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = font != null ? font : Theme.SemiBold;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.text = text;
            t.raycastTarget = false;
            t.supportRichText = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            return t;
        }

        /// <summary>Shrinks the text to fit its box (down to minSize).</summary>
        public static Text Fit(Text text, int minSize)
        {
            text.resizeTextForBestFit = true;
            text.resizeTextMinSize = minSize;
            text.resizeTextMaxSize = text.fontSize;
            text.verticalOverflow = VerticalWrapMode.Truncate;
            return text;
        }

        public static Image Icon(Transform parent, string icon, float size, Color color)
        {
            var img = Image(parent, "Icon " + icon, color, Shapes.Icon(icon));
            img.preserveAspect = true;
            img.rectTransform.sizeDelta = new Vector2(size, size);
            return img;
        }

        public static CanvasGroup Group(Component c)
        {
            var g = c.GetComponent<CanvasGroup>();
            return g != null ? g : c.gameObject.AddComponent<CanvasGroup>();
        }

        public static HorizontalLayoutGroup Row(RectTransform rt, float spacing, TextAnchor align = TextAnchor.MiddleCenter, bool expand = false)
        {
            var h = rt.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.childAlignment = align;
            h.childControlWidth = expand;
            h.childControlHeight = expand;
            h.childForceExpandWidth = expand;
            h.childForceExpandHeight = expand;
            return h;
        }

        public static VerticalLayoutGroup Column(RectTransform rt, float spacing, TextAnchor align = TextAnchor.UpperCenter, bool expand = false)
        {
            var v = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.childAlignment = align;
            v.childControlWidth = expand;
            v.childControlHeight = expand;
            v.childForceExpandWidth = expand;
            v.childForceExpandHeight = expand;
            return v;
        }

        public static LayoutElement Size(Component c, float width, float height)
        {
            var le = c.GetComponent<LayoutElement>();
            if (le == null) le = c.gameObject.AddComponent<LayoutElement>();
            if (width >= 0) le.preferredWidth = width;
            if (height >= 0) le.preferredHeight = height;
            var rt = (RectTransform)c.transform;
            rt.sizeDelta = new Vector2(width >= 0 ? width : rt.sizeDelta.x, height >= 0 ? height : rt.sizeDelta.y);
            return le;
        }

        public static void Clear(Transform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--) Object.Destroy(parent.GetChild(i).gameObject);
        }
    }
}
