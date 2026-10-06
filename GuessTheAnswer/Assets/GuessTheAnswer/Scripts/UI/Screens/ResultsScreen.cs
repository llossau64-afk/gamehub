using GuessTheAnswer.Audio;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>Winner reveal, final scores with count-up, team statistics and REMATCH / LOBBY / MENU.</summary>
    public sealed class ResultsScreen : UIScreen
    {
        static readonly string[] StatNames = { "CORRECT ANSWERS", "FASTEST ANSWER", "BEST STREAK", "JOKERS USED", "TOTAL SCORE" };

        Text title;
        Text subtitle;
        Text[] scores = new Text[2];
        Image[] crowns = new Image[2];
        Text[,] cells = new Text[5, 2];
        Text mvp;
        GameButton rematch;
        GameButton lobby;
        GameButton menu;
        RectTransform statsCard;

        int[] targetScores = new int[2];
        float countStart;
        bool counting;

        protected override void OnBuild()
        {
            title = UIFactory.Label(Root, "", 104, Theme.Accent, Theme.Bold);
            UIFactory.Place(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -40f), new Vector2(1600f, 130f), new Vector2(0.5f, 1f));
            UIFactory.Fit(title, 60);
            subtitle = UIFactory.Label(Root, "", Theme.H3, Theme.TextMuted, Theme.SemiBold);
            UIFactory.Place(subtitle.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -170f), new Vector2(1400f, 50f), new Vector2(0.5f, 1f));

            for (int t = 0; t < 2; t++)
            {
                float x = t == 0 ? -330f : 330f;
                var label = UIFactory.Label(Root, Theme.TeamName(t), Theme.Body, Theme.TeamColor(t), Theme.Bold);
                UIFactory.Place(label.rectTransform, new Vector2(0.5f, 1f), new Vector2(x, -240f), new Vector2(500f, 44f), new Vector2(0.5f, 1f));
                scores[t] = UIFactory.Label(Root, "0", 120, Theme.Text, Theme.Bold);
                UIFactory.Place(scores[t].rectTransform, new Vector2(0.5f, 1f), new Vector2(x, -280f), new Vector2(500f, 140f), new Vector2(0.5f, 1f));
                // The crown sits just left of the winning team's name.
                crowns[t] = UIFactory.Icon(Root, "crown", 48f, Theme.Accent);
                UIFactory.Place(crowns[t].rectTransform, new Vector2(0.5f, 1f), new Vector2(x - 150f, -238f), new Vector2(48f, 48f), new Vector2(0.5f, 1f));
            }
            var vs = UIFactory.Label(Root, "VS", Theme.H2, Theme.TextFaint, Theme.Bold);
            UIFactory.Place(vs.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -320f), new Vector2(200f, 60f), new Vector2(0.5f, 1f));

            var card = UIFactory.Panel(Root, "Stats", Theme.Surface, Theme.RadiusLarge);
            statsCard = card.rectTransform;
            UIFactory.Place(statsCard, new Vector2(0.5f, 1f), new Vector2(0f, -440f), new Vector2(1100f, 380f), new Vector2(0.5f, 1f));
            for (int r = 0; r < StatNames.Length; r++)
            {
                float y = -30f - r * 66f;
                if (r > 0)
                {
                    var line = UIFactory.Image(statsCard, "Line", new Color(1f, 1f, 1f, 0.05f), Shapes.White);
                    UIFactory.Place(line.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, y + 2f), new Vector2(1020f, 2f), new Vector2(0.5f, 0.5f));
                }
                var name = UIFactory.Label(statsCard, StatNames[r], Theme.Small, Theme.TextMuted, Theme.SemiBold);
                UIFactory.Place(name.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, y), new Vector2(460f, 60f), new Vector2(0.5f, 1f));
                for (int t = 0; t < 2; t++)
                {
                    var cell = UIFactory.Label(statsCard, "-", Theme.H3, Theme.Text, Theme.Bold);
                    UIFactory.Place(cell.rectTransform, new Vector2(0.5f, 1f), new Vector2(t == 0 ? -380f : 380f, y), new Vector2(280f, 60f), new Vector2(0.5f, 1f));
                    cells[r, t] = cell;
                }
            }

            mvp = UIFactory.Label(Root, "", Theme.Body, Theme.Accent, Theme.Bold);
            UIFactory.Place(mvp.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -834f), new Vector2(1000f, 44f), new Vector2(0.5f, 1f));

            rematch = GameButton.Create(Root, "REMATCH", ButtonStyle.Primary, new Vector2(420f, 110f), "refresh", Theme.H3);
            UIFactory.Place((RectTransform)rematch.transform, new Vector2(0.5f, 0f), new Vector2(-450f, 50f), new Vector2(420f, 110f), new Vector2(0.5f, 0f));
            rematch.OnClick = () =>
            {
                rematch.Interactable = false;
                App.Flow.Net.RequestRematch();
            };

            lobby = GameButton.Create(Root, "RETURN TO LOBBY", ButtonStyle.Secondary, new Vector2(420f, 110f), "groups", Theme.Body);
            UIFactory.Place((RectTransform)lobby.transform, new Vector2(0.5f, 0f), new Vector2(0f, 50f), new Vector2(420f, 110f), new Vector2(0.5f, 0f));
            lobby.OnClick = () => App.Flow.Net.ReturnToLobby();

            menu = GameButton.Create(Root, "MAIN MENU", ButtonStyle.Ghost, new Vector2(420f, 110f), "logout", Theme.Body);
            UIFactory.Place((RectTransform)menu.transform, new Vector2(0.5f, 0f), new Vector2(450f, 50f), new Vector2(420f, 110f), new Vector2(0.5f, 0f));
            menu.OnClick = () => App.Flow.MainMenuAfterResults();
        }

        public override void OnShow(object argument)
        {
            App.Flow.RoomChanged += OnRoom;
            Fill(App.Flow.Match);
            if (App.Flow.Room != null) OnRoom(App.Flow.Room);
            rematch.Interactable = true;
        }

        public override void OnHide()
        {
            App.Flow.RoomChanged -= OnRoom;
            UI.Confetti.Stop();
        }

        void Fill(MatchSnapshot m)
        {
            var end = m?.end;
            int myTeam = App.Flow.MyTeam;
            int winner = end != null ? end.winnerTeam : -1;
            bool cancelled = end != null && end.reason == (int)MatchEndReason.Cancelled;

            if (cancelled)
            {
                title.text = "MATCH CANCELLED";
                title.color = Theme.Text;
                subtitle.text = "A PLAYER LEFT BEFORE THE MATCH GOT GOING";
            }
            else if (winner < 0)
            {
                title.text = "IT'S A DRAW";
                title.color = Theme.Text;
                subtitle.text = "EVENLY MATCHED!";
            }
            else
            {
                title.text = Theme.TeamName(winner) + " WINS";
                title.color = Theme.TeamColor(winner);
                subtitle.text = winner == myTeam ? "VICTORY! GREAT TEAMWORK" : "SO CLOSE. GO AGAIN?";
                if (end.reason == (int)MatchEndReason.TieBreak) subtitle.text += " · WON ON THE TIE BREAKER";
                if (end.reason == (int)MatchEndReason.Forfeit) subtitle.text = "THE OTHER TEAM LEFT THE MATCH";
            }
            Tween.ScaleFrom(title.transform, 0.6f, 1f, 0.55f, Ease.OutBack);

            for (int t = 0; t < 2; t++)
            {
                var st = end != null && end.stats != null && end.stats.Length > t ? end.stats[t] : null;
                targetScores[t] = st != null ? st.score : 0;
                scores[t].text = "0";
                crowns[t].enabled = winner == t;
                if (winner == t) Tween.ScaleFrom(crowns[t].transform, 0f, 1f, 0.5f, Ease.OutBack, 1.2f);
                cells[0, t].text = st != null ? st.correct + " / " + st.answered : "-";
                cells[1, t].text = st != null && st.fastest >= 0f ? st.fastest.ToString("0.0") + "s" : "-";
                cells[2, t].text = st != null ? st.bestStreak.ToString() : "-";
                cells[3, t].text = st != null ? st.jokersUsed.ToString() : "-";
                cells[4, t].text = st != null ? st.score.ToString() : "-";
            }
            Highlight(end);

            string mvpName = null;
            if (end != null && m.players != null)
            {
                foreach (var p in m.players) if (p.id == end.mvpPlayerId) mvpName = p.name;
            }
            mvp.text = mvpName != null ? "MVP · " + mvpName : "";

            countStart = Time.unscaledTime + 0.4f;
            counting = true;

            var g = UIFactory.Group(statsCard);
            g.alpha = 0f;
            Tween.Fade(g, 1f, 0.4f, Ease.OutCubic, 0.5f);
            Tween.ScaleFrom(statsCard, 0.95f, 1f, 0.45f, Ease.OutBack, 0.5f);

            if (winner >= 0 && winner == myTeam && !cancelled) UI.Confetti.Burst(90);
        }

        void Highlight(MatchEndView end)
        {
            if (end == null || end.stats == null || end.stats.Length < 2) return;
            var a = end.stats[0];
            var b = end.stats[1];
            SetBetter(0, a.correct, b.correct, true);
            SetBetter(1, a.fastest < 0 ? float.MaxValue : a.fastest, b.fastest < 0 ? float.MaxValue : b.fastest, false);
            SetBetter(2, a.bestStreak, b.bestStreak, true);
            for (int t = 0; t < 2; t++) cells[3, t].color = Theme.Text;
            SetBetter(4, a.score, b.score, true);
        }

        void SetBetter(int row, float red, float blue, bool higherIsBetter)
        {
            int best = red == blue ? -1 : ((red > blue) == higherIsBetter ? 0 : 1);
            for (int t = 0; t < 2; t++) cells[row, t].color = best == t ? Theme.TeamColor(t) : Theme.Text;
        }

        void OnRoom(RoomSnapshot room)
        {
            if (room == null) return;
            int humans = 0;
            foreach (var p in room.players) if (!p.isBot && p.connected) humans++;
            int votes = room.rematchVotes != null ? room.rematchVotes.Length : 0;
            bool voted = false;
            if (room.rematchVotes != null)
            {
                foreach (var v in room.rematchVotes) if (v == App.Flow.MyId) voted = true;
            }
            rematch.SetLabel(voted ? "WAITING " + votes + "/" + humans : votes > 0 ? "REMATCH " + votes + "/" + humans : "REMATCH");
            rematch.Interactable = !voted && room.state == (int)RoomState.PostMatch;
            if (votes > 0 && !voted) Tween.Punch(rematch.transform, 0.06f, 0.3f);
        }

        void Update()
        {
            if (!counting) return;
            float t = Mathf.Clamp01((Time.unscaledTime - countStart) / 1.2f);
            if (t <= 0f) return;
            float e = Tween.Evaluate(Ease.OutCubic, t);
            for (int i = 0; i < 2; i++) scores[i].text = Mathf.RoundToInt(targetScores[i] * e).ToString();
            if (t >= 1f)
            {
                counting = false;
                UIFeedback.Play(Sfx.ScoreGain);
            }
        }

        public override bool OnBack()
        {
            App.Flow.MainMenuAfterResults();
            return true;
        }

        public override void OnKey(KeyCode key)
        {
            if (key == KeyCode.Return || key == KeyCode.Space) rematch.Click();
        }
    }
}
