using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Audio;
using BarberSimulator.Customers;
using BarberSimulator.Economy;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Small review notification under the cash display: stars, quote, earnings. Never blocks play.</summary>
    public sealed class ReviewCardView : UIView, IReviewPresenter
    {
        private readonly Image[] _stars = new Image[5];
        private Text _quote;
        private Text _earnings;
        private Text _vipTag;
        private AudioService _audio;
        private RectTransform _card;
        private CanvasGroup _cardGroup;
        private readonly Queue<(ServicePayment payment, string quote)> _queue = new Queue<(ServicePayment, string)>();
        private Coroutine _routine;

        public void Bind(AudioService audio) => _audio = audio;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;
            Group.blocksRaycasts = false;
            _card = UIFactory.Rect("Card", Root);
            UIFactory.Anchor(_card, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-40f, -150f), new Vector2(420f, 170f));
            _cardGroup = Factory.Group(_card, 0f);
            var bg = Factory.Image("Background", _card, theme.roundedRect, theme.panel);
            UIFactory.Stretch(bg.rectTransform);
            var rule = Factory.Image("Rule", _card, null, theme.accent);
            UIFactory.Anchor(rule.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 0f), new Vector2(3f, 170f));

            for (int i = 0; i < 5; i++)
            {
                _stars[i] = Factory.Image("Star " + i, _card, theme.iconStar, theme.accent);
                UIFactory.Anchor(_stars[i].rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f + i * 34f, -18f), new Vector2(30f, 30f));
            }
            _quote = Factory.Label("Quote", _card, theme.bodyFont, 22, theme.textPrimary, TextAnchor.UpperLeft);
            UIFactory.Anchor(_quote.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -58f), new Vector2(380f, 60f));
            _earnings = Factory.Label("Earnings", _card, theme.semiBoldFont, 20, theme.accent, TextAnchor.UpperLeft);
            UIFactory.Anchor(_earnings.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(22f, -122f), new Vector2(380f, 40f));
            _earnings.lineSpacing = 1.1f;
            _vipTag = Factory.Label("Vip", _card, theme.semiBoldFont, 18, theme.vip, TextAnchor.UpperRight, "vip.tag", upper: true);
            UIFactory.Anchor(_vipTag.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-20f, -20f), new Vector2(120f, 26f));
            UIFactory.Spacing(_vipTag, 4f);
        }

        public void ShowReview(ServicePayment payment, string quote)
        {
            _queue.Enqueue((payment, quote));
            if (!IsVisible) Show(true);
            if (_routine == null) _routine = StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            while (_queue.Count > 0)
            {
                var (payment, quote) = _queue.Dequeue();
                // Stars start dark and are lit one by one once the card is in.
                for (int i = 0; i < 5; i++)
                {
                    _stars[i].color = new Color(1f, 1f, 1f, 0.15f);
                    _stars[i].rectTransform.localScale = Vector3.one;
                }
                _vipTag.gameObject.SetActive(payment.IsVip);
                _quote.text = "“" + quote + "”";
                string line = "+" + EconomyService.Format(payment.BasePrice) + "  " + Factory.Text.Get(payment.ServiceNameKey);
                if (payment.Tip > 0)
                {
                    line += "   +" + EconomyService.Format(payment.Tip) + " " + Factory.Text.Get("review.tip");
                    if (payment.StreakTipMultiplier > 1.001f)
                        line += " <color=#" + ColorUtility.ToHtmlStringRGB(Factory.Theme.flame) + ">×" + payment.StreakTipMultiplier.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) + "</color>";
                }
                string rep = payment.ReputationDelta >= 0f ? "+" + payment.ReputationDelta.ToString("0.#") : payment.ReputationDelta.ToString("0.#");
                line += "\n" + rep + " " + Factory.Text.Get("review.reputation");
                _earnings.text = line;

                var rest = new Vector2(-40f, -150f);
                yield return UIAnimation.FadeAndSlide(_cardGroup, _card, 1f, rest + new Vector2(30f, 0f), rest, 0.35f);
                yield return RevealStars(payment.Stars);
                yield return UIAnimation.Wait(4.2f);
                yield return UIAnimation.Fade(_cardGroup, 0f, 0.4f);
            }
            _routine = null;
        }

        /// <summary>Lights the earned stars one after another; every star plays the same chime a little higher.</summary>
        private IEnumerator RevealStars(int count)
        {
            var library = _audio != null ? _audio.Library : null;
            for (int i = 0; i < count && i < _stars.Length; i++)
            {
                yield return UIAnimation.Wait(0.16f);
                _stars[i].color = Factory.Theme.accent;
                StartCoroutine(UIAnimation.Scale(_stars[i].transform, Vector3.one * 1.6f, Vector3.one, 0.3f, overshoot: true));
                if (library != null) _audio.PlayUI(library.uiToast, 0.55f, 0.85f + 0.13f * i);
            }
        }

        private void OnDisable() => _routine = null;
    }
}
