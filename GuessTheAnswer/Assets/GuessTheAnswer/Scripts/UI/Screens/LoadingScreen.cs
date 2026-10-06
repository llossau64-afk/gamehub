using GuessTheAnswer.Audio;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>Logo, tagline and a progress bar. Continues the look of the HTML loader so the hand-over is seamless.</summary>
    public sealed class LoadingScreen : UIScreen
    {
        RectTransform fill;
        Text percent;
        Text status;
        float shown;
        float target;

        public override MusicTrack Music => MusicTrack.None;

        protected override void OnBuild()
        {
            var logo = Logo.Create(Root, 1.05f);
            UIFactory.Place(logo, new Vector2(0.5f, 0.5f), new Vector2(0f, 110f), logo.sizeDelta);

            var tagline = UIFactory.Label(Root, "THINK FAST. GUESS TOGETHER.", Theme.Body, Theme.TextMuted, Theme.SemiBold);
            UIFactory.Place(tagline.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -40f), new Vector2(1000f, 50f));

            var track = UIFactory.Panel(Root, "Track", Theme.Surface, 10f);
            UIFactory.Place(track.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -150f), new Vector2(720f, 20f));
            var fillImg = UIFactory.Panel(track.rectTransform, "Fill", Theme.Accent, 10f);
            fill = fillImg.rectTransform;
            fill.anchorMin = new Vector2(0f, 0f);
            fill.anchorMax = new Vector2(0f, 1f);
            fill.pivot = new Vector2(0f, 0.5f);
            fill.sizeDelta = new Vector2(0f, 0f);

            status = UIFactory.Label(Root, "LOADING...", Theme.Small, Theme.TextMuted, Theme.Medium, TextAnchor.MiddleLeft);
            UIFactory.Place(status.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(-360f, -195f), new Vector2(560f, 40f), new Vector2(0f, 0.5f));
            percent = UIFactory.Label(Root, "0%", Theme.Small, Theme.Text, Theme.Bold, TextAnchor.MiddleRight);
            UIFactory.Place(percent.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(360f, -195f), new Vector2(200f, 40f), new Vector2(1f, 0.5f));
        }

        public void SetProgress(float value, string message)
        {
            target = Mathf.Clamp01(value);
            if (!string.IsNullOrEmpty(message)) status.text = message + "...";
        }

        void Update()
        {
            shown = Mathf.MoveTowards(shown, target, Time.unscaledDeltaTime * 1.6f);
            fill.sizeDelta = new Vector2(720f * shown, 0f);
            percent.text = Mathf.RoundToInt(shown * 100f) + "%";
        }
    }
}
