using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Shared frame of the panels that open inside the main menu (settings, achievements, how to play, credits): a
    /// warm-black panel with a hairline border, the pole stripe, overline + title, a scrolling-friendly content area
    /// and a BACK button. Opening and closing fade and slide a few pixels on unscaled time (0.2 - 0.3 s); with "reduce
    /// motion" on, only the fade remains.
    /// </summary>
    public abstract class MenuPanelView : UIView
    {
        private const float SlideDistance = 36f;
        private const float OpenSeconds = 0.3f;
        private const float CloseSeconds = 0.2f;
        private const float HeaderHeight = 168f;
        private const float FooterHeight = 112f;
        private const float PanelInset = 48f;

        private Image _dim;
        private Vector2 _rest;

        protected RectTransform Panel { get; private set; }
        /// <summary>The area between header and footer. Children are laid out by the subclass.</summary>
        protected RectTransform Content { get; private set; }
        protected NavButton BackButton { get; private set; }
        protected float ContentWidth => PanelWidth - PanelInset * 2f;
        protected float ContentHeight => PanelHeight - HeaderHeight - FooterHeight;

        protected abstract float PanelWidth { get; }
        protected abstract float PanelHeight { get; }
        protected abstract string TitleKey { get; }
        protected abstract string OverlineKey { get; }

        public event Action BackClicked;
        public Action<NavButton> RegisterSounds { get; set; }

        /// <summary>The control that gets keyboard / gamepad focus when the panel opens.</summary>
        protected virtual Selectable DefaultSelectable => BackButton != null ? BackButton.Button : null;

        /// <summary>Darkens the whole 3D scene (used by the pause menu); the left side is always shaded for legibility.</summary>
        public void SetBackdrop(bool dark)
        {
            if (_dim != null) _dim.color = new Color(0f, 0f, 0f, dark ? 0.55f : 0.12f);
        }

        protected sealed override void OnBuild()
        {
            var theme = Factory.Theme;

            _dim = Factory.Image("Backdrop", Root, null, new Color(0f, 0f, 0f, 0.12f), raycast: true);
            UIFactory.Stretch(_dim.rectTransform);

            var shade = Factory.Image("Left Shade", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.9f));
            shade.rectTransform.anchorMin = new Vector2(0f, 0f);
            shade.rectTransform.anchorMax = new Vector2(0f, 1f);
            shade.rectTransform.pivot = new Vector2(0f, 0.5f);
            shade.rectTransform.sizeDelta = new Vector2(PanelWidth + 360f, 0f);

            Panel = UIFactory.Rect("Panel", Root);
            _rest = new Vector2(110f, 0f);
            UIFactory.Anchor(Panel, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), _rest, new Vector2(PanelWidth, PanelHeight));

            var bg = Factory.Image("Background", Panel, null, theme.panelSolid, raycast: true);
            UIFactory.Stretch(bg.rectTransform);
            AddBorder(Panel, theme.panelLine);

            var pole = BarberPoleStripe.Create(Factory, Panel, "Pole", vertical: false, length: 64f, thickness: 6f, bandWidth: 7f, speed: 12f);
            UIFactory.Anchor((RectTransform)pole.transform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(PanelInset, -34f), new Vector2(64f, 6f));

            var overline = Factory.Label("Overline", Panel, theme.semiBoldFont, 17, theme.accent, TextAnchor.UpperLeft, OverlineKey, upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(PanelInset, -50f), new Vector2(PanelWidth - PanelInset * 2f, 26f));
            UIFactory.Spacing(overline, 5f);

            var title = Factory.Label("Title", Panel, theme.displayFont, 58, theme.textPrimary, TextAnchor.UpperLeft, TitleKey);
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(PanelInset - 2f, -74f), new Vector2(PanelWidth - PanelInset * 2f, 76f));

            var rule = Factory.Image("Header Rule", Panel, null, theme.panelLine);
            rule.rectTransform.anchorMin = new Vector2(0f, 1f);
            rule.rectTransform.anchorMax = new Vector2(1f, 1f);
            rule.rectTransform.pivot = new Vector2(0.5f, 1f);
            rule.rectTransform.offsetMin = new Vector2(PanelInset, -HeaderHeight);
            rule.rectTransform.offsetMax = new Vector2(-PanelInset, -HeaderHeight + 1f);

            Content = UIFactory.Rect("Content", Panel);
            Content.anchorMin = Vector2.zero;
            Content.anchorMax = Vector2.one;
            Content.offsetMin = new Vector2(PanelInset, FooterHeight);
            Content.offsetMax = new Vector2(-PanelInset, -HeaderHeight - 8f);

            var footerRule = Factory.Image("Footer Rule", Panel, null, theme.panelLine);
            footerRule.rectTransform.anchorMin = new Vector2(0f, 0f);
            footerRule.rectTransform.anchorMax = new Vector2(1f, 0f);
            footerRule.rectTransform.pivot = new Vector2(0.5f, 0f);
            footerRule.rectTransform.offsetMin = new Vector2(PanelInset, FooterHeight - 8f);
            footerRule.rectTransform.offsetMax = new Vector2(-PanelInset, FooterHeight - 7f);

            BackButton = NavButtonFactory.Create(Factory, Panel, "Back", "common.back", NavStyle.Compact, 260f, () => BackClicked?.Invoke());
            UIFactory.Anchor((RectTransform)BackButton.transform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(PanelInset - 24f, 22f), new Vector2(260f, NavButtonFactory.HeightFor(NavStyle.Compact)));
            RegisterSounds?.Invoke(BackButton);

            OnBuildPanel(Content);
        }

        /// <summary>Build the panel body into <paramref name="content"/> (which is <see cref="ContentWidth"/> x <see cref="ContentHeight"/>).</summary>
        protected abstract void OnBuildPanel(RectTransform content);

        protected override void OnShown()
        {
            var target = DefaultSelectable;
            if (target != null && UnityEngine.EventSystems.EventSystem.current != null)
            {
                var nav = target.GetComponent<NavButton>();
                if (nav != null) nav.SelectSilently();
            }
        }

        protected override void OnShownInstant()
        {
            if (Panel != null) Panel.anchoredPosition = _rest;
        }

        protected override IEnumerator ShowRoutine()
        {
            var from = _rest + new Vector2(Motion() ? -SlideDistance : 0f, 0f);
            Panel.anchoredPosition = from;
            yield return UIAnimation.FadeAndSlide(Group, Panel, 1f, from, _rest, OpenSeconds);
        }

        protected override IEnumerator HideRoutine()
        {
            var to = _rest + new Vector2(Motion() ? -SlideDistance * 0.6f : 0f, 0f);
            yield return UIAnimation.FadeAndSlide(Group, Panel, 0f, Panel.anchoredPosition, to, CloseSeconds);
            Panel.anchoredPosition = _rest;
            gameObject.SetActive(false);
        }

        private static bool Motion() => !Settings.LiveSettings.ReduceMotion;

        // ---------------------------------------------------------------- shared helpers

        /// <summary>1 px outline made of four strips (no sprite needed, stays crisp at every scale).</summary>
        protected void AddBorder(RectTransform target, Color color)
        {
            for (int side = 0; side < 4; side++)
            {
                var line = Factory.Image("Border " + side, target, null, color);
                var rt = line.rectTransform;
                switch (side)
                {
                    case 0: rt.anchorMin = new Vector2(0f, 1f); rt.anchorMax = new Vector2(1f, 1f); rt.pivot = new Vector2(0.5f, 1f); rt.sizeDelta = new Vector2(0f, 1f); break;
                    case 1: rt.anchorMin = new Vector2(0f, 0f); rt.anchorMax = new Vector2(1f, 0f); rt.pivot = new Vector2(0.5f, 0f); rt.sizeDelta = new Vector2(0f, 1f); break;
                    case 2: rt.anchorMin = new Vector2(0f, 0f); rt.anchorMax = new Vector2(0f, 1f); rt.pivot = new Vector2(0f, 0.5f); rt.sizeDelta = new Vector2(1f, 0f); break;
                    default: rt.anchorMin = new Vector2(1f, 0f); rt.anchorMax = new Vector2(1f, 1f); rt.pivot = new Vector2(1f, 0.5f); rt.sizeDelta = new Vector2(1f, 0f); break;
                }
                rt.anchoredPosition = Vector2.zero;
            }
        }

        /// <summary>A vertically scrolling area with a layout-driven content column (mouse wheel, drag and touch).</summary>
        protected RectTransform CreateScroll(string name, Transform parent, out ScrollRect scroll, float spacing = 0f)
        {
            var viewport = UIFactory.Rect(name, parent);
            UIFactory.Stretch(viewport);
            viewport.gameObject.AddComponent<RectMask2D>();
            UIFactory.HitArea(viewport);

            var content = UIFactory.Rect("Items", viewport);
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.anchoredPosition = Vector2.zero;
            content.sizeDelta = new Vector2(0f, 0f);
            var layout = content.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = spacing;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = true;
            layout.childAlignment = TextAnchor.UpperLeft;
            var fitter = content.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            scroll = viewport.gameObject.AddComponent<ScrollRect>();
            scroll.content = content;
            scroll.viewport = viewport;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 40f;
            scroll.inertia = true;
            return content;
        }
    }
}
