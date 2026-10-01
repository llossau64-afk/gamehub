using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Full-screen loading screen: logo, a small animated barber pole, "Loading…", a thin progress bar and a tip that
    /// changes every few seconds. <c>Show()</c> / <c>SetProgress(float)</c> / <c>Hide()</c> are all a caller needs.
    /// The displayed bar eases towards the reported value, so a coarse progress still moves smoothly. Runs on unscaled
    /// time, so it also animates while the game is paused or the scene is loading.
    /// </summary>
    public sealed class LoadingView : UIView
    {
        public const int TipCount = 6;
        private const float TipSeconds = 4.5f;
        private const float BarWidth = 560f;

        private Image _fill;
        private Text _percent;
        private Text _tip;
        private CanvasGroup _tipGroup;
        private float _target;
        private float _shown;
        private float _tipTimer;
        private int _tipIndex;
        private bool _tipSwapping;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var bg = Factory.Image("Background", Root, null, new Color(0.045f, 0.04f, 0.036f, 1f), raycast: true);
            UIFactory.Stretch(bg.rectTransform);

            var centre = UIFactory.Rect("Centre", Root);
            UIFactory.Anchor(centre, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 20f), new Vector2(760f, 560f));

            var pole = BarberPoleStripe.Create(Factory, centre, "Pole", vertical: true, length: 150f, thickness: 38f, bandWidth: 16f, speed: 46f);
            UIFactory.Anchor((RectTransform)pole.transform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, 0f), new Vector2(38f, 150f));
            AddCap((RectTransform)pole.transform, true);
            AddCap((RectTransform)pole.transform, false);

            var title = Factory.Label("Title", centre, theme.displayFont, 76, theme.textPrimary, TextAnchor.UpperCenter);
            title.text = "BARBER SHOP";
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -188f), new Vector2(760f, 96f));
            UIFactory.Spacing(title, 2f);

            var subtitle = Factory.Label("Subtitle", centre, theme.semiBoldFont, 24, theme.accent, TextAnchor.UpperCenter);
            subtitle.text = "SIMULATOR";
            UIFactory.Anchor(subtitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -284f), new Vector2(520f, 34f));
            UIFactory.Spacing(subtitle, 13f);

            var loading = Factory.Label("Loading", centre, theme.mediumFont, 22, theme.textMuted, TextAnchor.UpperLeft, "loading.title", upper: true);
            UIFactory.Anchor(loading.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, 1f), new Vector2(-BarWidth * 0.5f, -372f), new Vector2(300f, 30f));
            UIFactory.Spacing(loading, 4f);

            _percent = Factory.Label("Percent", centre, theme.semiBoldFont, 20, theme.textMuted, TextAnchor.UpperRight);
            UIFactory.Anchor(_percent.rectTransform, new Vector2(0.5f, 1f), new Vector2(1f, 1f), new Vector2(BarWidth * 0.5f, -374f), new Vector2(120f, 30f));

            var track = Factory.Image("Track", centre, null, new Color(1f, 0.95f, 0.85f, 0.14f));
            UIFactory.Anchor(track.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -412f), new Vector2(BarWidth, 4f));
            _fill = Factory.Image("Fill", track.rectTransform, null, theme.barberRed);
            _fill.rectTransform.anchorMin = new Vector2(0f, 0f);
            _fill.rectTransform.anchorMax = new Vector2(0f, 1f);
            _fill.rectTransform.pivot = new Vector2(0f, 0.5f);
            _fill.rectTransform.anchoredPosition = Vector2.zero;
            _fill.rectTransform.sizeDelta = new Vector2(0f, 0f);

            var tipRect = UIFactory.Rect("Tip", Root);
            UIFactory.Anchor(tipRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 90f), new Vector2(1000f, 90f));
            _tipGroup = Factory.Group(tipRect);
            var label = Factory.Label("Label", tipRect, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperCenter, "loading.tip_label", upper: true);
            UIFactory.Anchor(label.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(600f, 24f));
            UIFactory.Spacing(label, 5f);
            _tip = Factory.Label("Text", tipRect, theme.bodyFont, 26, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_tip.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -34f), new Vector2(980f, 56f));

            Factory.Text.OnLanguageChanged(() => { if (_tip != null) _tip.text = Factory.Text.Get(TipKey(_tipIndex)); });
        }

        private void AddCap(RectTransform pole, bool top)
        {
            var theme = Factory.Theme;
            var cap = Factory.Image(top ? "Top Cap" : "Bottom Cap", pole.parent, null, theme.accent);
            UIFactory.Anchor(cap.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, top ? 0f : 1f), new Vector2(0f, top ? 0f : -150f), new Vector2(50f, 8f));
        }

        private static string TipKey(int index) => "loading.tip." + (index % TipCount + 1);

        /// <summary>0..1. The bar eases towards it.</summary>
        public void SetProgress(float progress)
        {
            _target = Mathf.Clamp01(progress);
            if (!isActiveAndEnabled) _shown = _target;
        }

        protected override void OnShown()
        {
            _target = 0f;
            _shown = 0f;
            RenderProgress();
            _tipIndex = Random.Range(0, TipCount);
            _tip.text = Factory.Text.Get(TipKey(_tipIndex));
            _tipGroup.alpha = 1f;
            _tipTimer = 0f;
            _tipSwapping = false;
        }

        protected override IEnumerator ShowRoutine()
        {
            yield return UIAnimation.Fade(Group, 1f, 0.15f);
        }

        protected override IEnumerator HideRoutine()
        {
            // Let the bar finish so the screen never disappears at 60 %.
            _target = 1f;
            yield return UIAnimation.Wait(0.12f);
            yield return UIAnimation.Fade(Group, 0f, 0.35f);
            gameObject.SetActive(false);
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            _shown = Mathf.MoveTowards(_shown, _target, dt * (0.35f + Mathf.Abs(_target - _shown)));
            RenderProgress();

            _tipTimer += dt;
            if (_tipTimer >= TipSeconds && !_tipSwapping)
            {
                _tipTimer = 0f;
                StartCoroutine(SwapTip());
            }
        }

        private void RenderProgress()
        {
            _fill.rectTransform.sizeDelta = new Vector2(BarWidth * _shown, 0f);
            _percent.text = Mathf.RoundToInt(_shown * 100f) + "%";
        }

        private IEnumerator SwapTip()
        {
            _tipSwapping = true;
            yield return UIAnimation.Fade(_tipGroup, 0f, 0.25f);
            _tipIndex = (_tipIndex + 1) % TipCount;
            _tip.text = Factory.Text.Get(TipKey(_tipIndex));
            yield return UIAnimation.Fade(_tipGroup, 1f, 0.3f);
            _tipSwapping = false;
        }
    }
}
