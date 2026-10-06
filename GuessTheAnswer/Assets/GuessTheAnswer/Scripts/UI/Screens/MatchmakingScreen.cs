using GuessTheAnswer.Audio;
using GuessTheAnswer.Multiplayer;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>
    /// Public matchmaking: animated search, players found (1 / 2 or 1 / 4), cancel, an optional bot fill after a
    /// while, then MATCH FOUND with a 3-2-1 countdown straight into the game.
    /// </summary>
    public sealed class MatchmakingScreen : UIScreen
    {
        Text title;
        Text status;
        Text found;
        Text countdown;
        RectTransform slots;
        Image[] slotDots = new Image[0];
        Spinner spinner;
        RectTransform pulse;
        Image pulseImage;
        GameButton cancel;
        GameButton bots;
        Text modeLabel;

        QueueKind mode;
        float searchTime;
        bool matchFound;
        float countdownEnd;
        int lastCount = -1;
        int lastShownFound = -1;
        QueueStatusMsg lastStatus;

        protected override void OnBuild()
        {
            modeLabel = UIFactory.Label(Root, "PUBLIC GAME · 1V1", Theme.Body, Theme.Accent, Theme.Bold);
            UIFactory.Place(modeLabel.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -90f), new Vector2(900f, 50f), new Vector2(0.5f, 1f));

            var ring = UIFactory.Image(Root, "Pulse", new Color(1f, 0.78f, 0.24f, 0.18f), Shapes.Circle);
            pulse = ring.rectTransform;
            pulseImage = ring;
            UIFactory.Place(pulse, new Vector2(0.5f, 0.5f), new Vector2(0f, 150f), new Vector2(220f, 220f));
            spinner = Spinner.Create(Root, 170f, Theme.Accent);
            UIFactory.Place((RectTransform)spinner.transform, new Vector2(0.5f, 0.5f), new Vector2(0f, 150f), new Vector2(170f, 170f));
            var icon = UIFactory.Icon(Root, "search", 74f, Theme.Text);
            icon.rectTransform.anchoredPosition = new Vector2(0f, 150f);

            countdown = UIFactory.Label(Root, "", 150, Theme.Accent, Theme.Bold);
            UIFactory.Place(countdown.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, 150f), new Vector2(400f, 220f));

            title = UIFactory.Label(Root, "SEARCHING FOR PLAYERS...", Theme.H1, Theme.Text, Theme.Bold);
            UIFactory.Place(title.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -40f), new Vector2(1400f, 90f));

            found = UIFactory.Label(Root, "PLAYERS FOUND 1 / 2", Theme.H3, Theme.TextMuted, Theme.SemiBold);
            UIFactory.Place(found.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -110f), new Vector2(900f, 50f));

            slots = UIFactory.Rect("Slots", Root);
            UIFactory.Place(slots, new Vector2(0.5f, 0.5f), new Vector2(0f, -180f), new Vector2(400f, 40f));

            status = UIFactory.Label(Root, "", Theme.Small, Theme.TextFaint, Theme.Medium);
            UIFactory.Place(status.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, -240f), new Vector2(900f, 40f));

            cancel = GameButton.Create(Root, "CANCEL SEARCH", ButtonStyle.Secondary, new Vector2(380f, 100f), "close");
            UIFactory.Place((RectTransform)cancel.transform, new Vector2(0.5f, 0f), new Vector2(-200f, 80f), new Vector2(380f, 100f), new Vector2(0.5f, 0f));
            cancel.OnClick = () => App.Flow.CancelSearch();

            bots = GameButton.Create(Root, "PLAY WITH BOTS", ButtonStyle.Primary, new Vector2(380f, 100f), "smart_toy");
            UIFactory.Place((RectTransform)bots.transform, new Vector2(0.5f, 0f), new Vector2(200f, 80f), new Vector2(380f, 100f), new Vector2(0.5f, 0f));
            bots.OnClick = () =>
            {
                bots.Interactable = false;
                App.Flow.Net.FillWithBots();
            };
        }

        public override void OnShow(object argument)
        {
            mode = argument is QueueKind m ? m : QueueKind.OneVsOne;
            modeLabel.text = mode == QueueKind.TwoVsTwo ? "PUBLIC GAME · 2V2" : "PUBLIC GAME · 1V1";
            searchTime = 0f;
            matchFound = false;
            lastCount = -1;
            lastShownFound = -1;
            lastStatus = null;
            countdown.text = "";
            spinner.gameObject.SetActive(true);
            title.text = "SEARCHING FOR PLAYERS...";
            title.color = Theme.Text;
            cancel.gameObject.SetActive(true);
            bots.gameObject.SetActive(false);
            bots.Interactable = true;
            BuildSlots(mode == QueueKind.TwoVsTwo ? 4 : 2);
            SetFound(1);

            App.Flow.QueueChanged += OnQueue;
            App.Flow.MatchFound += OnFound;
        }

        public override void OnHide()
        {
            App.Flow.QueueChanged -= OnQueue;
            App.Flow.MatchFound -= OnFound;
        }

        void BuildSlots(int count)
        {
            UIFactory.Clear(slots);
            slotDots = new Image[count];
            float width = count * 34f + (count - 1) * 18f;
            for (int i = 0; i < count; i++)
            {
                var d = UIFactory.Image(slots, "Slot", Theme.Surface, Shapes.Circle);
                UIFactory.Place(d.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(-width / 2f + 17f + i * 52f, 0f), new Vector2(34f, 34f));
                slotDots[i] = d;
            }
        }

        void SetFound(int count)
        {
            int needed = slotDots.Length;
            count = Mathf.Clamp(count, 1, needed);
            found.text = "PLAYERS FOUND " + count + " / " + needed;
            for (int i = 0; i < slotDots.Length; i++)
            {
                bool on = i < count;
                slotDots[i].color = on ? Theme.Accent : Theme.Surface;
                if (on && i >= lastShownFound && lastShownFound >= 0) Tween.Punch(slotDots[i].transform, 0.4f, 0.3f);
            }
            if (count > lastShownFound && lastShownFound >= 1) UIFeedback.Play(Sfx.PlayerJoin);
            lastShownFound = count;
        }

        void OnQueue(QueueStatusMsg s)
        {
            if (!s.searching || matchFound) return;
            lastStatus = s;
            searchTime = s.elapsed;
            SetFound(s.found + 1);
        }

        void OnFound(MatchFoundMsg f)
        {
            matchFound = true;
            countdownEnd = Time.unscaledTime + Mathf.Max(1f, f.countdown);
            spinner.gameObject.SetActive(false);
            cancel.gameObject.SetActive(false);
            bots.gameObject.SetActive(false);
            title.text = "MATCH FOUND";
            title.color = Theme.Accent;
            Tween.ScaleFrom(title.transform, 1.3f, 1f, 0.45f, Ease.OutBack);
            SetFound(slotDots.Length);
            status.text = "LOADING MATCH...";
        }

        void Update()
        {
            float t = Time.unscaledTime;
            float s = 1f + 0.35f * Mathf.Repeat(t * 0.8f, 1f);
            pulse.localScale = new Vector3(s, s, 1f);
            var c = pulseImage.color;
            c.a = 0.22f * (1f - Mathf.Repeat(t * 0.8f, 1f));
            pulseImage.color = c;

            if (matchFound)
            {
                int remaining = Mathf.CeilToInt(countdownEnd - t);
                if (remaining != lastCount && remaining >= 1)
                {
                    lastCount = remaining;
                    countdown.text = remaining.ToString();
                    Tween.ScaleFrom(countdown.transform, 1.6f, 1f, 0.35f, Ease.OutBack);
                    UIFeedback.Play(Sfx.Countdown);
                }
                else if (remaining < 1 && countdown.text != "")
                {
                    countdown.text = "";
                }
                return;
            }

            searchTime += Time.unscaledDeltaTime;
            var net = App.Net.OnlineStatus;
            if (net == ConnectionStatus.Connecting || net == ConnectionStatus.Reconnecting) status.text = "CONNECTING...";
            else if (lastStatus != null && lastStatus.expanded) status.text = "EXPANDING SEARCH...";
            else status.text = "SEARCHING" + new string('.', 1 + (int)(t * 2f) % 3);

            bool showBots = lastStatus != null && lastStatus.botsAvailable;
            if (showBots && !bots.gameObject.activeSelf)
            {
                bots.gameObject.SetActive(true);
                Tween.ScaleFrom(bots.transform, 0.8f, 1f, 0.35f, Ease.OutBack);
            }
        }

        public override bool OnBack()
        {
            if (!matchFound) App.Flow.CancelSearch();
            return true;
        }
    }
}
