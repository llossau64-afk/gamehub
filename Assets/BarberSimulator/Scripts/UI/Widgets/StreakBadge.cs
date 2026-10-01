using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// HUD badge for the haircut streak: a little flame (built from a dot and two diamonds), the streak count and the
    /// tip multiplier. Pops when the streak grows and shakes red when it is lost.
    /// </summary>
    public sealed class StreakBadge : MonoBehaviour
    {
        private UIFactory _factory;
        private RectTransform _root;
        private CanvasGroup _group;
        private RectTransform _flame;
        private Image _glow;
        private Text _count;
        private Text _caption;
        private Text _bonus;
        private Coroutine _routine;
        private bool _lost;
        private float _time;

        public int Shown { get; private set; }

        public void Build(UIFactory factory, Transform parent)
        {
            _factory = factory;
            var theme = factory.Theme;
            _root = UIFactory.Rect("Streak", parent);
            UIFactory.Anchor(_root, new Vector2(0.5f, 1f), new Vector2(0f, 1f), new Vector2(270f, -36f), new Vector2(190f, 76f));
            _group = factory.Group(_root, 0f);
            _group.blocksRaycasts = false;

            _glow = factory.Image("Glow", _root, theme.circleSoft, new Color(theme.flame.r, theme.flame.g, theme.flame.b, 0.4f));
            UIFactory.Anchor(_glow.rectTransform, new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(30f, 0f), new Vector2(110f, 110f));

            // Flame: a dot for the belly, two diamonds for the tip, a pale core.
            _flame = UIFactory.Rect("Flame", _root);
            UIFactory.Anchor(_flame, new Vector2(0f, 0.5f), new Vector2(0.5f, 0f), new Vector2(30f, -26f), new Vector2(48f, 56f));
            var belly = factory.Image("Belly", _flame, theme.circleSolid, theme.flame);
            UIFactory.Anchor(belly.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 0f), new Vector2(34f, 34f));
            var tip = factory.Image("Tip", _flame, theme.roundedRect, theme.flame);
            UIFactory.Anchor(tip.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0.5f), new Vector2(0f, 34f), new Vector2(22f, 22f));
            tip.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
            var core = factory.Image("Core", _flame, theme.circleSolid, theme.vip);
            UIFactory.Anchor(core.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 4f), new Vector2(18f, 18f));
            var coreTip = factory.Image("Core Tip", _flame, theme.roundedRect, theme.vip);
            UIFactory.Anchor(coreTip.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0.5f), new Vector2(0f, 20f), new Vector2(12f, 12f));
            coreTip.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);

            _count = factory.Label("Count", _root, theme.displayFont, 46, theme.textPrimary, TextAnchor.MiddleLeft);
            UIFactory.Anchor(_count.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(64f, 6f), new Vector2(60f, 56f));
            UIFactory.SoftShadow(_count, theme.shadow, new Vector2(0f, -2f));
            _caption = factory.Label("Caption", _root, theme.semiBoldFont, 14, theme.flame, TextAnchor.UpperLeft, "hud.streak", upper: true);
            UIFactory.Anchor(_caption.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(112f, 22f), new Vector2(80f, 20f));
            UIFactory.Spacing(_caption, 3f);
            _bonus = factory.Label("Bonus", _root, theme.semiBoldFont, 18, theme.vip, TextAnchor.UpperLeft);
            UIFactory.Anchor(_bonus.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(112f, 2f), new Vector2(110f, 24f));
        }

        /// <param name="bonusText">E.g. "×1.25 tips"; empty while there is no bonus yet.</param>
        public void SetStreak(int streak, string bonusText, bool animate)
        {
            if (_routine != null) { StopCoroutine(_routine); _routine = null; }
            _lost = false;
            int previous = Shown;
            Shown = streak;
            _root.anchoredPosition = RestPosition;
            _root.localScale = Vector3.one;
            _count.color = _factory.Theme.textPrimary;
            _count.text = streak.ToString();
            _bonus.text = bonusText ?? string.Empty;
            _bonus.gameObject.SetActive(!string.IsNullOrEmpty(bonusText));

            if (streak <= 0)
            {
                _group.alpha = 0f;
                return;
            }
            _group.alpha = 1f;
            if (animate && gameObject.activeInHierarchy)
                _routine = StartCoroutine(Pulse(previous <= 0 ? 1.45f : 1.3f));
        }

        /// <summary>The streak was broken: show the lost count in red, shake and fade out.</summary>
        public void ShowLost(int lostStreak)
        {
            if (_routine != null) { StopCoroutine(_routine); _routine = null; }
            Shown = 0;
            if (!gameObject.activeInHierarchy) { _group.alpha = 0f; return; }
            _count.text = lostStreak.ToString();
            _routine = StartCoroutine(Lose());
        }

        private static readonly Vector2 RestPosition = new Vector2(270f, -36f);

        private IEnumerator Pulse(float peak)
        {
            yield return UIAnimation.Scale(_root, Vector3.one * peak, Vector3.one, 0.45f, overshoot: true);
            _routine = null;
        }

        private IEnumerator Lose()
        {
            _lost = true;
            _count.color = new Color(0.9f, 0.32f, 0.26f);
            _group.alpha = 1f;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.unscaledDeltaTime / 0.7f;
                float shake = Mathf.Sin(t * 60f) * 8f * (1f - t);
                _root.anchoredPosition = RestPosition + new Vector2(shake, 0f);
                _group.alpha = t < 0.5f ? 1f : Mathf.Lerp(1f, 0f, (t - 0.5f) * 2f);
                yield return null;
            }
            _group.alpha = 0f;
            _root.anchoredPosition = RestPosition;
            _count.color = _factory.Theme.textPrimary;
            _lost = false;
            _routine = null;
        }

        private void Update()
        {
            if (_flame == null || Shown <= 0 || _lost) return;
            // The flame breathes: a slow wobble in height and a pulsing glow.
            _time += Time.unscaledDeltaTime;
            float wobble = Mathf.Sin(_time * 7f) * 0.06f + Mathf.Sin(_time * 11.3f) * 0.03f;
            _flame.localScale = new Vector3(1f - wobble * 0.5f, 1f + wobble, 1f);
            var glow = _glow.color;
            glow.a = 0.32f + 0.12f * Mathf.Sin(_time * 4f);
            _glow.color = glow;
        }

        private void OnDisable()
        {
            _routine = null;
            if (_group == null) return;
            // Coroutines stop with the object: never leave a half-played shake behind.
            _lost = false;
            _root.anchoredPosition = RestPosition;
            _root.localScale = Vector3.one;
            if (Shown <= 0) _group.alpha = 0f;
        }
    }
}
