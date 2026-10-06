using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>The game's wordmark: a tilted "?" quiz card next to GUESS THE / ANSWER.</summary>
    public static class Logo
    {
        public static RectTransform Create(Transform parent, float scale = 1f)
        {
            var root = UIFactory.Rect("Logo", parent);
            root.sizeDelta = new Vector2(820f, 220f) * scale;

            var badge = UIFactory.Panel(root, "Badge", Theme.Accent, 34f * scale);
            UIFactory.Place(badge.rectTransform, new Vector2(0f, 0.5f), new Vector2(10f * scale, 0f), new Vector2(180f, 180f) * scale, new Vector2(0f, 0.5f));
            badge.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 7f);
            UIFactory.Shadow(badge.rectTransform, 18f, -10f, 0.5f);
            var q = UIFactory.Label(badge.rectTransform, "?", Mathf.RoundToInt(140 * scale), Theme.TextOnAccent, Theme.Bold);
            UIFactory.Stretch(q.rectTransform, 0f, 0f, 0f, 8f * scale);

            var line1 = UIFactory.Label(root, "GUESS THE", Mathf.RoundToInt(58 * scale), Theme.Text, Theme.Bold, TextAnchor.LowerLeft);
            UIFactory.Place(line1.rectTransform, new Vector2(0f, 0.5f), new Vector2(230f * scale, 24f * scale), new Vector2(600f, 80f) * scale, new Vector2(0f, 0f));
            var line2 = UIFactory.Label(root, "ANSWER", Mathf.RoundToInt(112 * scale), Theme.Accent, Theme.Bold, TextAnchor.UpperLeft);
            UIFactory.Place(line2.rectTransform, new Vector2(0f, 0.5f), new Vector2(224f * scale, 34f * scale), new Vector2(620f, 130f) * scale, new Vector2(0f, 1f));
            return root;
        }
    }

    /// <summary>Big menu card: icon tile, title and a short subtitle.</summary>
    public static class MenuCard
    {
        public static GameButton Create(Transform parent, string title, string subtitle, string icon, ButtonStyle style, Vector2 size, int titleSize = Theme.H3)
        {
            var btn = GameButton.Create(parent, null, style, size, null, Theme.Body, Theme.RadiusLarge);
            btn.HoverScale = 1.025f;
            var rt = (RectTransform)btn.transform;
            var (bg, fg) = GameButton.Colors(style);
            bool accent = style == ButtonStyle.Primary;

            float tile = Mathf.Min(size.y - 40f, 110f);
            var tileImg = UIFactory.Panel(rt, "Tile", accent ? new Color(0f, 0f, 0f, 0.12f) : new Color(1f, 1f, 1f, 0.06f), Theme.Radius);
            UIFactory.Place(tileImg.rectTransform, new Vector2(0f, 0.5f), new Vector2(26f, 0f), new Vector2(tile, tile), new Vector2(0f, 0.5f));
            var iconImg = UIFactory.Icon(tileImg.rectTransform, icon, tile * 0.56f, fg);
            iconImg.rectTransform.anchoredPosition = Vector2.zero;

            float textLeft = 26f + tile + 26f;
            bool hasSub = !string.IsNullOrEmpty(subtitle);
            var titleText = UIFactory.Label(rt, title, titleSize, fg, Theme.Bold, hasSub ? TextAnchor.LowerLeft : TextAnchor.MiddleLeft);
            // With a subtitle the title sits in the upper half, the subtitle in the lower half.
            UIFactory.Stretch(titleText.rectTransform, textLeft, 0f, 24f, hasSub ? size.y * 0.5f - 4f : 0f);
            UIFactory.Fit(titleText, titleSize - 10);
            btn.Label = titleText;

            if (hasSub)
            {
                var sub = UIFactory.Label(rt, subtitle, Theme.Small, accent ? new Color(fg.r, fg.g, fg.b, 0.7f) : Theme.TextMuted, Theme.Medium, TextAnchor.UpperLeft, "Subtitle");
                UIFactory.Stretch(sub.rectTransform, textLeft, size.y * 0.5f + 6f, 24f, 0f);
            }
            btn.SetColors(bg, fg);
            return btn;
        }
    }
}
