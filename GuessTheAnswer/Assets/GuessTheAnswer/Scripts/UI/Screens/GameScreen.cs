using GuessTheAnswer.Audio;
using GuessTheAnswer.Core;
using GuessTheAnswer.Shared;
using GuessTheAnswer.UI.Game;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>
    /// The quiz screen. It renders the latest match snapshot from the authority (server or practice room) and turns
    /// taps / keys into intents. Nothing here decides scores or correctness.
    /// </summary>
    public sealed class GameScreen : UIScreen
    {
        static readonly string[] JokerTitles = { "50/50", "+8 SEC", "TEAM VOTE", "STEAL" };
        static readonly string[] JokerIcons = { "contrast", "more_time", "how_to_vote", "front_hand" };
        static readonly string[] JokerKeys = { "Q", "W", "E", "R" };

        TeamPanel[] teams;
        Text roundText;
        RectTransform categoryChip;
        Image categoryChipBg;
        Image categoryIcon;
        Text categoryText;
        RectTransform turnPill;
        Image turnPillBg;
        Text turnText;
        RectTransform questionCard;
        Text questionText;
        Text questionSub;
        TimerRing timer;
        AnswerCard[] answers;
        JokerButton[] jokers;
        RectTransform bannerRoot;
        CanvasGroup bannerGroup;
        Text bannerTitle;
        Text bannerSub;
        RectTransform pauseCard;
        Text pauseText;
        GameButton skipSteal;
        GameButton muteButton;

        MatchSnapshot snap;
        int lastPhaseSeq = -1;
        int lastResultSeq = -1;
        float deadline;
        float bannerUntil;
        int myPick = -1;
        bool voteSent;
        int countdownShown = -1;
        bool initialized;
        int panelsTeam = -1;

        public override MusicTrack Music => MusicTrack.Game;
        public override bool ShowBackground => false;

        static int Me_Team => App.Flow.MyTeam;
        static string MeId => App.Flow.MyId;

        protected override void OnBuild()
        {
            BuildTop();
            BuildQuestion();
            BuildAnswers();
            BuildJokers();
            BuildOverlays();
        }

        // ───────────────────────── Build ─────────────────────────

        void BuildTop()
        {
            teams = new TeamPanel[2];

            roundText = UIFactory.Label(Root, "ROUND 1 / 10", Theme.H3, Theme.Text, Theme.Bold);
            UIFactory.Place(roundText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -22f), new Vector2(700f, 52f), new Vector2(0.5f, 1f));

            categoryChipBg = UIFactory.Panel(Root, "Category", new Color(1f, 1f, 1f, 0.08f), 24f);
            categoryChip = categoryChipBg.rectTransform;
            UIFactory.Place(categoryChip, new Vector2(0.5f, 1f), new Vector2(0f, -80f), new Vector2(300f, 48f), new Vector2(0.5f, 1f));
            categoryIcon = UIFactory.Icon(categoryChip, "star", 30f, Theme.Accent);
            UIFactory.Place(categoryIcon.rectTransform, new Vector2(0f, 0.5f), new Vector2(20f, 0f), new Vector2(30f, 30f), new Vector2(0f, 0.5f));
            categoryText = UIFactory.Label(categoryChip, "CLASSIC", Theme.Small, Theme.Accent, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Stretch(categoryText.rectTransform, 60f, 0f, 16f, 0f);
            categoryText.horizontalOverflow = HorizontalWrapMode.Overflow;

            turnPillBg = UIFactory.Panel(Root, "Turn", Theme.Accent, 28f);
            turnPill = turnPillBg.rectTransform;
            UIFactory.Place(turnPill, new Vector2(0.5f, 1f), new Vector2(0f, -146f), new Vector2(560f, 56f), new Vector2(0.5f, 1f));
            turnText = UIFactory.Label(turnPill, "", Theme.Small, Theme.TextOnAccent, Theme.Bold);
            UIFactory.Stretch(turnText.rectTransform, 20f, 0f, 20f, 0f);
            turnText.horizontalOverflow = HorizontalWrapMode.Overflow;

            var menu = GameButton.IconButton(Root, "menu", 84f, ButtonStyle.Secondary);
            UIFactory.Place((RectTransform)menu.transform, new Vector2(0f, 0f), new Vector2(36f, 36f), new Vector2(84f, 84f), new Vector2(0f, 0f));
            menu.OnClick = () => UI.OpenPanel<GameMenuPanel>();

            muteButton = GameButton.IconButton(Root, "volume_up", 84f, ButtonStyle.Secondary);
            UIFactory.Place((RectTransform)muteButton.transform, new Vector2(1f, 0f), new Vector2(-36f, 36f), new Vector2(84f, 84f), new Vector2(1f, 0f));
            muteButton.OnClick = () =>
            {
                App.Settings.ToggleMute();
                RefreshMute();
            };
        }

        void BuildQuestion()
        {
            var card = UIFactory.Panel(Root, "Question", Theme.Surface, Theme.RadiusLarge);
            questionCard = card.rectTransform;
            UIFactory.Place(questionCard, new Vector2(0.5f, 1f), new Vector2(0f, -232f), new Vector2(1304f, 270f), new Vector2(0.5f, 1f));
            UIFactory.Shadow(questionCard, 24f, -12f, 0.45f);
            UIFactory.Outline(questionCard, new Color(1f, 1f, 1f, 0.06f), Theme.RadiusLarge);

            questionText = UIFactory.Label(questionCard, "", Theme.H2, Theme.Text, Theme.Bold);
            UIFactory.Stretch(questionText.rectTransform, 60f, 72f, 60f, 24f);
            UIFactory.Fit(questionText, 26);
            questionSub = UIFactory.Label(questionCard, "", Theme.Body, Theme.TextMuted, Theme.SemiBold);
            UIFactory.Stretch(questionSub.rectTransform, 60f, 170f, 60f, 20f);

            timer = TimerRing.Create(Root, 124f);
            UIFactory.Place(timer.Rect, new Vector2(0.5f, 1f), new Vector2(0f, -232f), new Vector2(124f, 124f), new Vector2(0.5f, 0.5f));
        }

        void BuildAnswers()
        {
            answers = new AnswerCard[4];
            var grid = UIFactory.Rect("Answers", Root);
            UIFactory.Place(grid, new Vector2(0.5f, 1f), new Vector2(0f, -528f), new Vector2(1304f, 308f), new Vector2(0.5f, 1f));
            for (int i = 0; i < 4; i++)
            {
                var a = AnswerCard.Create(grid, i, new Vector2(640f, 142f));
                a.Rect.anchorMin = a.Rect.anchorMax = new Vector2(0.5f, 0.5f);
                float x = i % 2 == 0 ? -332f : 332f;
                float y = i < 2 ? 83f : -83f;
                a.SetHome(new Vector2(x, y));
                a.Clicked = OnAnswer;
                answers[i] = a;
            }
        }

        void BuildJokers()
        {
            jokers = new JokerButton[4];
            var bar = UIFactory.Rect("Jokers", Root);
            UIFactory.Place(bar, new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(4 * 250f + 3 * 18f, 100f), new Vector2(0.5f, 0f));
            bool desktop = !Platform.BrowserBridge.IsMobile;
            for (int i = 0; i < 4; i++)
            {
                var j = JokerButton.Create(bar, (JokerType)i, JokerTitles[i], JokerIcons[i], JokerKeys[i], new Vector2(250f, 100f), desktop);
                UIFactory.Place((RectTransform)j.Button.transform, new Vector2(0f, 0.5f), new Vector2(i * 268f, 0f), new Vector2(250f, 100f), new Vector2(0f, 0.5f));
                var type = (JokerType)i;
                j.Button.ClickSound = Sfx.Joker;
                j.Button.OnClick = () => OnJoker(type);
                jokers[i] = j;
            }
        }

        void BuildOverlays()
        {
            var banner = UIFactory.Panel(Root, "Banner", new Color(0.06f, 0.07f, 0.13f, 0.94f), Theme.RadiusLarge);
            bannerRoot = banner.rectTransform;
            UIFactory.Place(bannerRoot, new Vector2(0.5f, 0.5f), new Vector2(0f, 0f), new Vector2(980f, 300f));
            UIFactory.Shadow(bannerRoot, 30f, -14f, 0.6f);
            bannerTitle = UIFactory.Label(bannerRoot, "", 96, Theme.Accent, Theme.Bold);
            UIFactory.Stretch(bannerTitle.rectTransform, 30f, 30f, 30f, 110f);
            UIFactory.Fit(bannerTitle, 48);
            bannerSub = UIFactory.Label(bannerRoot, "", Theme.H3, Theme.Text, Theme.SemiBold);
            UIFactory.Stretch(bannerSub.rectTransform, 30f, 196f, 30f, 30f);
            bannerGroup = UIFactory.Group(bannerRoot);
            bannerGroup.blocksRaycasts = false;
            bannerGroup.alpha = 0f;

            var pause = UIFactory.Panel(Root, "Reconnecting", Theme.SurfaceRaised, Theme.Radius);
            pauseCard = pause.rectTransform;
            UIFactory.Place(pauseCard, new Vector2(0.5f, 1f), new Vector2(0f, -520f), new Vector2(720f, 90f), new Vector2(0.5f, 0.5f));
            var sp = Spinner.Create(pauseCard, 44f, Theme.Warning);
            UIFactory.Place((RectTransform)sp.transform, new Vector2(0f, 0.5f), new Vector2(40f, 0f), new Vector2(44f, 44f), new Vector2(0f, 0.5f));
            pauseText = UIFactory.Label(pauseCard, "", Theme.Body, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Stretch(pauseText.rectTransform, 104f, 0f, 20f, 0f);
            pauseCard.gameObject.SetActive(false);

            skipSteal = GameButton.Create(Root, "SKIP", ButtonStyle.Secondary, new Vector2(220f, 84f), "close", Theme.Body);
            UIFactory.Place((RectTransform)skipSteal.transform, new Vector2(1f, 0f), new Vector2(-150f, 36f), new Vector2(220f, 84f), new Vector2(1f, 0f));
            skipSteal.OnClick = () =>
            {
                skipSteal.Interactable = false;
                App.Flow.Net.SkipSteal();
            };
            skipSteal.gameObject.SetActive(false);
        }

        // ───────────────────────── Lifecycle ─────────────────────────

        public override void OnShow(object argument)
        {
            // The panels mark "YOU" on the player's team, which can change between matches.
            int mine = Me_Team;
            if (teams[0] == null || panelsTeam != mine)
            {
                foreach (var t in teams) if (t != null) Destroy(t.Rect.gameObject);
                teams[0] = TeamPanel.Create(Root, Teams.Red, mine == Teams.Red);
                teams[1] = TeamPanel.Create(Root, Teams.Blue, mine == Teams.Blue);
                panelsTeam = mine;
                // Keep overlays (banner, reconnect notice) drawn above the panels.
                teams[0].Rect.SetAsFirstSibling();
                teams[1].Rect.SetAsFirstSibling();
            }
            lastPhaseSeq = -1;
            lastResultSeq = -1;
            initialized = false;
            myPick = -1;
            HideBanner(true);
            foreach (var a in answers)
            {
                a.SetState(AnswerState.Idle, false);
                a.Hide(false);
            }
            timer.Show(false);
            questionText.text = "";
            questionSub.text = "";
            RefreshMute();
            App.Flow.MatchChanged += Render;
            App.Flow.Error += OnError;
            if (App.Flow.Match != null) Render(App.Flow.Match);
        }

        public override void OnHide()
        {
            App.Flow.MatchChanged -= Render;
            App.Flow.Error -= OnError;
            UI.CloseAllPanels();
        }

        void RefreshMute()
        {
            if (muteButton.IconImage != null) muteButton.IconImage.sprite = Shapes.Icon(App.Settings.Muted ? "volume_off" : "volume_up");
        }

        void OnError(ErrorMsg e)
        {
            // The authority refused an input (e.g. the time ran out a moment earlier): unlock the cards again.
            if (snap == null) return;
            myPick = -1;
            voteSent = false;
            RefreshDetails(snap);
        }

        // ───────────────────────── Rendering ─────────────────────────

        MatchPhase Phase => snap != null ? (MatchPhase)snap.phase : MatchPhase.None;

        void Render(MatchSnapshot s)
        {
            if (s == null) return;
            // A fresh match (rematch) restarts the phase counter.
            if (s.phaseSeq < lastPhaseSeq) lastPhaseSeq = -1;
            bool newPhase = s.phaseSeq != lastPhaseSeq;
            snap = s;
            deadline = Time.unscaledTime + s.phaseRemaining;

            if (!initialized)
            {
                initialized = true;
                teams[0].SnapScore(s.teams.Length > 0 ? s.teams[0].score : 0);
                teams[1].SnapScore(s.teams.Length > 1 ? s.teams[1].score : 0);
                lastResultSeq = s.result != null ? s.result.seq : -1;
            }

            RenderHeader(s);
            foreach (var t in teams) t.Render(s, MeId);

            if (newPhase)
            {
                lastPhaseSeq = s.phaseSeq;
                EnterPhase(s);
            }
            if (s.result != null && s.result.seq != lastResultSeq && s.result.seq > 0)
            {
                lastResultSeq = s.result.seq;
                ShowResult(s);
            }
            RefreshDetails(s);
        }

        void RenderHeader(MatchSnapshot s)
        {
            bool tie = s.tieBreakNumber > 0 && s.phase >= (int)MatchPhase.TieBreakIntro;
            roundText.text = tie ? "TIE BREAKER" + (s.tieBreakNumber > 1 ? " " + s.tieBreakNumber : "") : "ROUND " + s.round + " / " + s.totalRounds;
            roundText.color = tie ? Theme.Accent : Theme.Text;

            string cat = s.question != null ? s.question.category : null;
            bool hasCat = !string.IsNullOrEmpty(cat);
            categoryChip.gameObject.SetActive(hasCat);
            if (hasCat)
            {
                var def = App.Content.Category(cat);
                Color c = App.Content.CategoryColor(cat, Theme.Accent);
                categoryIcon.sprite = Shapes.Icon(def != null ? def.icon : "help");
                categoryIcon.color = c;
                categoryText.text = App.Content.CategoryName(cat);
                categoryText.color = c;
                categoryChipBg.color = new Color(c.r, c.g, c.b, 0.14f);
                categoryChip.sizeDelta = new Vector2(Mathf.Max(200f, categoryText.preferredWidth + 92f), 48f);
            }
        }

        void EnterPhase(MatchSnapshot s)
        {
            var phase = (MatchPhase)s.phase;
            myPick = -1;
            voteSent = false;
            countdownShown = -1;
            skipSteal.gameObject.SetActive(false);

            switch (phase)
            {
                case MatchPhase.Intro:
                    HideAnswers();
                    timer.Show(false);
                    questionText.text = "GET READY";
                    questionSub.text = "TEAM RED  VS  TEAM BLUE";
                    ShowBanner("MATCH START", s.totalRounds + " ROUNDS · " + App.Content.CategoryName(s.question?.category ?? App.Flow.Room?.settings?.category), Theme.Accent, 2.2f);
                    UIFeedback.Play(Sfx.RoundStart);
                    break;

                case MatchPhase.TurnIntro:
                    {
                        HideAnswers();
                        timer.Show(false);
                        foreach (var a in answers) a.SetState(AnswerState.Idle, false);
                        questionText.text = "";
                        questionSub.text = "";
                        string who = PlayerName(s.activePlayerId);
                        bool mine = s.activePlayerId == MeId;
                        string title = mine ? "YOUR TURN!" : "ROUND " + s.round;
                        string sub = mine ? Theme.TeamName(s.activeTeam) + " · ROUND " + s.round : Theme.TeamName(s.activeTeam) + " · " + who;
                        ShowBanner(title, sub, Theme.TeamColor(s.activeTeam), 1.3f);
                        UIFeedback.Play(Sfx.RoundStart);
                        if (mine) UIFeedback.Vibrate(25);
                        break;
                    }

                case MatchPhase.Question:
                case MatchPhase.TieBreakQuestion:
                    HideBanner(false);
                    ShowQuestion(s);
                    if (phase == MatchPhase.TieBreakQuestion)
                    {
                        ShowBanner("GO!", "FIRST CORRECT ANSWER WINS", Theme.Accent, 0.8f);
                        UIFeedback.Play(Sfx.Go);
                    }
                    break;

                case MatchPhase.Locked:
                    timer.Show(false);
                    if (s.lockedIndex >= 0 && s.lockedIndex < 4)
                    {
                        answers[s.lockedIndex].SetState(AnswerState.Selected, true);
                        if (s.activePlayerId != MeId) UIFeedback.Play(Sfx.Lock);
                    }
                    break;

                case MatchPhase.Reveal:
                case MatchPhase.StealReveal:
                case MatchPhase.TieBreakReveal:
                    timer.Show(false);
                    ApplyReveal(s);
                    break;

                case MatchPhase.Steal:
                    {
                        bool mine = s.steal != null && s.steal.team == Me_Team;
                        timer.Show(true);
                        for (int i = 0; i < 4; i++)
                        {
                            if (i == s.lockedIndex) continue;
                            answers[i].SetState(s.steal.blocked[i] ? AnswerState.Removed : AnswerState.Idle, true);
                        }
                        ShowBanner("STEAL!", mine ? "PICK THE RIGHT ANSWER FOR +75" : Theme.TeamName(s.steal.team) + " CAN STEAL", Theme.TeamColor(s.steal.team), 1.2f);
                        UIFeedback.Play(Sfx.Steal);
                        if (mine)
                        {
                            skipSteal.gameObject.SetActive(true);
                            skipSteal.Interactable = true;
                            UIFeedback.Vibrate(30);
                        }
                        break;
                    }

                case MatchPhase.TieBreakIntro:
                    HideAnswers();
                    timer.Show(false);
                    foreach (var a in answers) a.SetState(AnswerState.Idle, false);
                    questionText.text = "TIE BREAKER";
                    questionSub.text = "EVERYONE ANSWERS · FIRST CORRECT ANSWER WINS";
                    ShowBanner("TIE BREAKER", "SCORES ARE LEVEL", Theme.Accent, 1.2f);
                    UIFeedback.Play(Sfx.RoundStart);
                    break;

                case MatchPhase.Finished:
                    {
                        timer.Show(false);
                        var end = s.end;
                        int winner = end != null ? end.winnerTeam : -1;
                        string title = winner < 0 ? (end != null && end.reason == (int)MatchEndReason.Cancelled ? "MATCH CANCELLED" : "IT'S A DRAW")
                            : winner == Me_Team ? "YOU WIN!" : Theme.TeamName(winner) + " WINS";
                        string sub = end != null && end.reason == (int)MatchEndReason.Forfeit ? "THE OTHER TEAM LEFT" : "FINAL RESULTS COMING UP";
                        ShowBanner(title, sub, winner < 0 ? Theme.Text : Theme.TeamColor(winner), 3f);
                        UIFeedback.Play(winner == Me_Team ? Sfx.Victory : winner < 0 ? Sfx.Whoosh : Sfx.Defeat);
                        break;
                    }
            }
        }

        void ShowQuestion(MatchSnapshot s)
        {
            var q = s.question;
            questionText.text = q != null ? q.text : "";
            questionSub.text = "";
            Tween.ScaleFrom(questionCard, 0.96f, 1f, 0.35f, Ease.OutBack);
            for (int i = 0; i < 4; i++)
            {
                var a = answers[i];
                a.SetText(q != null && q.answers != null && i < q.answers.Length ? q.answers[i] : "");
                a.SetTag(null, Theme.Accent);
                a.SetState(q != null && q.removed != null && q.removed[i] ? AnswerState.Removed : AnswerState.Idle, false);
                a.AnimateIn(0.06f + i * 0.05f);
            }
            timer.Show(true);
        }

        void HideAnswers()
        {
            foreach (var a in answers)
            {
                a.SetInteractable(false);
                a.SetTag(null, Theme.Accent);
                a.Hide(true);
            }
        }

        void ApplyReveal(MatchSnapshot s)
        {
            var q = s.question;
            int correct = q != null ? q.correctIndex : -1;
            var phase = (MatchPhase)s.phase;
            int wrongPick = -1;
            if (phase == MatchPhase.Reveal) wrongPick = s.lockedIndex;
            else if (phase == MatchPhase.StealReveal) wrongPick = s.steal != null ? s.steal.picked : -1;
            else if (phase == MatchPhase.TieBreakReveal)
            {
                foreach (var p in s.players) if (p.id == MeId && p.tieBreakWrong) wrongPick = p.tieBreakPick;
            }

            for (int i = 0; i < 4; i++)
            {
                var a = answers[i];
                a.SetInteractable(false);
                if (i == correct) a.SetState(AnswerState.Correct, true);
                else if (i == wrongPick && wrongPick >= 0) a.SetState(AnswerState.Wrong, true);
                else if (phase == MatchPhase.StealReveal && i == s.lockedIndex) a.SetState(AnswerState.Wrong, false);
                else if (correct >= 0 && a.State != AnswerState.Removed) a.SetState(AnswerState.Faded, true);
            }

            if (q != null && !string.IsNullOrEmpty(q.explanation) && correct >= 0) questionSub.text = q.explanation;
        }

        void ShowResult(MatchSnapshot s)
        {
            var r = s.result;
            var kind = (ResultKind)r.kind;
            bool mineTeam = r.team == Me_Team;
            switch (kind)
            {
                case ResultKind.Timeout:
                    ShowBanner("TIME'S UP", s.steal != null && s.steal.pending ? "NO ANSWER" : "NO POINTS THIS ROUND", Theme.Danger, 1.2f);
                    UIFeedback.Play(Sfx.Wrong);
                    if (mineTeam) UIFeedback.Vibrate(60);
                    break;
                case ResultKind.Answer:
                case ResultKind.Steal:
                case ResultKind.TieBreak:
                    if (r.correct)
                    {
                        UIFeedback.Play(Sfx.Correct);
                        if (mineTeam) UIFeedback.Vibrate(20);
                        if (kind == ResultKind.Steal) ShowBanner("STOLEN!", "+" + r.total + " FOR " + Theme.TeamName(r.team), Theme.TeamColor(r.team), 1.4f);
                        if (kind == ResultKind.TieBreak) ShowBanner(Theme.TeamName(r.team) + " WINS", PlayerName(r.playerId) + " GOT IT FIRST", Theme.TeamColor(r.team), 2f);
                        SpawnPoints(r);
                    }
                    else
                    {
                        UIFeedback.Play(Sfx.Wrong);
                        if (mineTeam) UIFeedback.Vibrate(60);
                    }
                    break;
                case ResultKind.StealSkipped:
                    break;
                case ResultKind.TieBreakNoWinner:
                    ShowBanner("NO WINNER YET", "NEXT QUESTION", Theme.Text, 1.8f);
                    UIFeedback.Play(Sfx.Wrong);
                    break;
            }
        }

        void SpawnPoints(ResultView r)
        {
            if (r.lines == null || r.lines.Length == 0) return;
            var floatLayer = (RectTransform)UI.Floating.transform;
            Vector2 origin;
            if (r.picked >= 0 && r.picked < 4)
            {
                var rt = answers[r.picked].Rect;
                origin = floatLayer.InverseTransformPoint(rt.TransformPoint(rt.rect.center));
            }
            else
            {
                origin = floatLayer.InverseTransformPoint(questionCard.TransformPoint(questionCard.rect.center));
            }
            Color color = Theme.TeamColor(r.team);
            for (int i = 0; i < r.lines.Length; i++)
            {
                var line = r.lines[i];
                string text = i == 0 ? "+" + line.points : "+" + line.points + " " + line.label;
                UI.Floating.Spawn(text, origin + new Vector2(0f, 20f - i * 8f), i == 0 ? Color.white : color, i == 0 ? Theme.H1 : Theme.H3, i * 0.18f, 140f + i * 50f);
            }
            UIFeedback.Play(Sfx.ScoreGain);
        }

        /// <summary>Per-snapshot details: who can tap, jokers, the turn pill, team vote, reconnect notice.</summary>
        void RefreshDetails(MatchSnapshot s)
        {
            var phase = (MatchPhase)s.phase;
            string me = MeId;
            int myTeam = Me_Team;
            bool myTurn = s.activePlayerId == me;
            bool voteMode = phase == MatchPhase.Question && s.teamVote != null && s.teamVote.requested && s.teamVote.responderId == me && s.teamVote.suggestion < 0 && !voteSent;
            bool stealMode = phase == MatchPhase.Steal && s.steal != null && s.steal.team == myTeam && myPick < 0;
            bool tieMode = phase == MatchPhase.TieBreakQuestion && myPick < 0 && MyTieBreakPick(s) < 0 && !MeDropped(s);
            bool answerMode = phase == MatchPhase.Question && myTurn && myPick < 0;

            for (int i = 0; i < 4; i++)
            {
                bool removed = s.question != null && s.question.removed != null && s.question.removed[i];
                bool blocked = stealMode && s.steal.blocked[i];
                var a = answers[i];
                if ((phase == MatchPhase.Question || phase == MatchPhase.TieBreakQuestion) && removed && a.State != AnswerState.Removed && a.State != AnswerState.Selected)
                    a.SetState(AnswerState.Removed, true);
                a.SetInteractable(!removed && !blocked && (answerMode || voteMode || stealMode || tieMode) && s.phase != (int)MatchPhase.Finished && !s.paused);
            }

            // Team vote: the suggestion is only in my team's snapshot.
            if (phase == MatchPhase.Question && s.teamVote != null && s.teamVote.suggestion >= 0 && s.teamVote.suggestion < 4)
            {
                for (int i = 0; i < 4; i++) answers[i].SetTag(i == s.teamVote.suggestion ? "TEAMMATE" : null, Theme.Accent);
            }

            RefreshTurnPill(s, myTurn, voteMode, stealMode);
            RefreshJokers(s, myTurn);

            if (s.paused)
            {
                pauseCard.gameObject.SetActive(true);
                var p = FindPlayer(s, s.pausedForPlayerId);
                pauseText.text = "PLAYER RECONNECTING... " + (p != null ? p.name + " · " + Mathf.CeilToInt(p.reconnectRemaining) + "s" : "");
            }
            else
            {
                pauseCard.gameObject.SetActive(false);
            }
        }

        void RefreshTurnPill(MatchSnapshot s, bool myTurn, bool voteMode, bool stealMode)
        {
            var phase = (MatchPhase)s.phase;
            string text = "";
            Color bg = Theme.SurfaceRaised;
            Color fg = Theme.Text;
            int myTeam = Me_Team;

            switch (phase)
            {
                case MatchPhase.TurnIntro:
                case MatchPhase.Question:
                case MatchPhase.Locked:
                    if (voteMode)
                    {
                        text = "TEAMMATE ASKS FOR HELP · TAP AN ANSWER";
                        bg = Theme.Accent;
                        fg = Theme.TextOnAccent;
                    }
                    else if (myTurn)
                    {
                        if (phase == MatchPhase.Question && s.teamVote != null && s.teamVote.suggestion >= 0)
                            text = "TEAMMATE THINKS: " + (char)('A' + s.teamVote.suggestion);
                        else if (phase == MatchPhase.Question && s.teamVote != null && s.teamVote.requested)
                            text = voteSent ? "YOUR TURN" : "WAITING FOR YOUR TEAMMATE'S VOTE...";
                        else text = "YOUR TURN";
                        bg = Theme.Accent;
                        fg = Theme.TextOnAccent;
                    }
                    else if (s.activeTeam == myTeam)
                    {
                        text = voteSent ? "VOTE SENT · TEAMMATE IS ANSWERING" : "TEAMMATE IS ANSWERING";
                        bg = Theme.TeamDark(myTeam);
                    }
                    else
                    {
                        text = "OPPONENT IS ANSWERING";
                        bg = Theme.TeamDark(s.activeTeam);
                    }
                    break;
                case MatchPhase.Steal:
                    text = stealMode ? "STEAL CHANCE! PICK AN ANSWER" : (s.steal != null && s.steal.team == myTeam ? "STEAL SENT" : "OPPONENTS CAN STEAL...");
                    bg = s.steal != null ? Theme.TeamDark(s.steal.team) : Theme.SurfaceRaised;
                    break;
                case MatchPhase.TieBreakIntro:
                case MatchPhase.TieBreakQuestion:
                    text = MyTieBreakPick(s) >= 0 ? "ANSWER LOCKED" : "EVERYONE ANSWERS · FIRST CORRECT WINS";
                    bg = Theme.SurfaceRaised;
                    break;
                default:
                    text = "";
                    break;
            }

            bool show = text.Length > 0;
            if (turnPill.gameObject.activeSelf != show) turnPill.gameObject.SetActive(show);
            if (!show) return;
            if (turnText.text != text)
            {
                turnText.text = text;
                Tween.ScaleFrom(turnPill, 0.9f, 1f, 0.25f, Ease.OutBack);
            }
            turnPillBg.color = bg;
            turnText.color = fg;
            turnPill.sizeDelta = new Vector2(Mathf.Clamp(turnText.preferredWidth + 60f, 360f, 740f), 56f);
        }

        void RefreshJokers(MatchSnapshot s, bool myTurn)
        {
            int myTeam = Me_Team;
            var team = s.teams != null && s.teams.Length > myTeam ? s.teams[myTeam] : null;
            bool canUseNow = myTurn && s.phase == (int)MatchPhase.Question && s.jokerThisTurn < 0 && myPick < 0 && !s.paused;
            for (int i = 0; i < 4; i++)
            {
                var j = jokers[i];
                bool enabled = team != null && team.jokerEnabled != null && team.jokerEnabled[i];
                bool used = team != null && team.jokerUsed != null && team.jokerUsed[i];
                string state;
                bool usable;
                if (j.Type == JokerType.Steal)
                {
                    usable = false;
                    state = used ? "USED" : "AFTER A WRONG ANSWER";
                }
                else
                {
                    usable = enabled && !used && canUseNow;
                    if (!enabled) state = j.Type == JokerType.TeamVote ? "2V2 ONLY" : "OFF";
                    else if (used) state = "USED";
                    else if (s.jokerThisTurn >= 0 && myTurn && s.phase == (int)MatchPhase.Question) state = "ONE PER QUESTION";
                    else state = "READY";
                }
                j.Render(enabled, used, usable, state);
            }
        }

        // ───────────────────────── Input ─────────────────────────

        void OnAnswer(int index)
        {
            if (snap == null) return;
            var phase = Phase;
            var net = App.Flow.Net;
            if (phase == MatchPhase.Question && snap.teamVote != null && snap.teamVote.requested && snap.teamVote.responderId == MeId && snap.activePlayerId != MeId)
            {
                if (voteSent) return;
                voteSent = true;
                answers[index].SetTag("YOUR VOTE", Theme.Accent);
                UIFeedback.Play(Sfx.Lock);
                net.SubmitTeamVote(index);
                RefreshDetails(snap);
                return;
            }

            if (myPick >= 0) return;
            myPick = index;
            answers[index].SetState(AnswerState.Selected, true);
            UIFeedback.Play(Sfx.Lock);
            UIFeedback.Vibrate(15);

            if (phase == MatchPhase.Steal) net.SubmitSteal(index);
            else net.SubmitAnswer(index);
            RefreshDetails(snap);
        }

        void OnJoker(JokerType type)
        {
            if (snap == null || snap.activePlayerId != MeId || Phase != MatchPhase.Question) return;
            App.Flow.Net.UseJoker(type);
            if (type == JokerType.ExtraTime) UI.Floating.Spawn("+8 SEC", (Vector2)UI.Floating.transform.InverseTransformPoint(timer.Rect.position), Theme.Accent, Theme.H3);
        }

        public override void OnKey(KeyCode key)
        {
            int answer = InputRouter.AnswerIndex(key);
            if (answer >= 0)
            {
                answers[answer].Press();
                return;
            }
            int joker = InputRouter.JokerSlot(key);
            if (joker >= 0 && jokers[joker].Button.Interactable) jokers[joker].Button.Click();
        }

        public override bool OnBack()
        {
            UI.OpenPanel<GameMenuPanel>();
            return true;
        }

        // ───────────────────────── Per frame ─────────────────────────

        void Update()
        {
            if (snap == null) return;
            float dt = Time.unscaledDeltaTime;
            foreach (var t in teams) t?.Tick(dt);

            var phase = Phase;
            float remaining = snap.paused ? snap.phaseRemaining : Mathf.Max(0f, deadline - Time.unscaledTime);
            if (phase == MatchPhase.Question || phase == MatchPhase.TieBreakQuestion || phase == MatchPhase.Steal)
            {
                timer.Set(remaining, Mathf.Max(1f, snap.phaseDuration), true, snap.paused);
            }

            if (phase == MatchPhase.TieBreakIntro && remaining <= 3f)
            {
                int n = remaining > 2f ? 3 : remaining > 1f ? 2 : remaining > 0.35f ? 1 : 0;
                if (n != countdownShown && n > 0)
                {
                    countdownShown = n;
                    ShowBanner(n.ToString(), "GET READY", Theme.Accent, 1.2f);
                    Tween.ScaleFrom(bannerTitle.transform, 1.6f, 1f, 0.3f, Ease.OutBack);
                    UIFeedback.Play(Sfx.Countdown);
                }
            }

            if (bannerUntil > 0f && Time.unscaledTime > bannerUntil) HideBanner(false);
        }

        // ───────────────────────── Helpers ─────────────────────────

        void ShowBanner(string title, string subtitle, Color color, float seconds)
        {
            bannerTitle.text = title;
            bannerTitle.color = color;
            bannerSub.text = subtitle ?? "";
            bannerUntil = Time.unscaledTime + seconds;
            if (bannerGroup.alpha < 0.5f)
            {
                Tween.Fade(bannerGroup, 1f, 0.15f);
                Tween.ScaleFrom(bannerRoot, 0.85f, 1f, 0.3f, Ease.OutBack);
            }
            else
            {
                Tween.Punch(bannerRoot, 0.04f, 0.2f);
            }
        }

        void HideBanner(bool instant)
        {
            bannerUntil = -1f;
            if (instant) bannerGroup.alpha = 0f;
            else Tween.Fade(bannerGroup, 0f, 0.18f);
        }

        static MatchPlayerView FindPlayer(MatchSnapshot s, string id)
        {
            if (s.players == null || id == null) return null;
            foreach (var p in s.players) if (p.id == id) return p;
            return null;
        }

        string PlayerName(string id)
        {
            var p = FindPlayer(snap, id);
            return p != null ? p.name : "";
        }

        static int MyTieBreakPick(MatchSnapshot s)
        {
            var p = FindPlayer(s, MeId);
            return p != null ? p.tieBreakPick : -1;
        }

        static bool MeDropped(MatchSnapshot s)
        {
            var p = FindPlayer(s, MeId);
            return p == null || p.dropped;
        }
    }

    /// <summary>In-game menu (ESC). The match keeps running for everyone else.</summary>
    public sealed class GameMenuPanel : UIPanel
    {
        protected override Vector2 CardSize => new Vector2(640f, 620f);

        protected override void OnBuild()
        {
            Title("MENU");
            var note = UIFactory.Label(Card, "The match keeps running while this is open.", Theme.Small, Theme.TextMuted, Theme.Medium);
            UIFactory.Place(note.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -116f), new Vector2(560f, 40f), new Vector2(0.5f, 1f));

            var resume = GameButton.Create(Card, "RESUME", ButtonStyle.Primary, new Vector2(460f, 100f), "play_arrow", Theme.H3);
            UIFactory.Place((RectTransform)resume.transform, new Vector2(0.5f, 1f), new Vector2(0f, -180f), new Vector2(460f, 100f), new Vector2(0.5f, 1f));
            resume.OnClick = Close;

            var settings = GameButton.Create(Card, "SETTINGS", ButtonStyle.Secondary, new Vector2(460f, 100f), "settings", Theme.H3);
            UIFactory.Place((RectTransform)settings.transform, new Vector2(0.5f, 1f), new Vector2(0f, -300f), new Vector2(460f, 100f), new Vector2(0.5f, 1f));
            settings.OnClick = () => UI.OpenPanel<SettingsPanel>();

            var leave = GameButton.Create(Card, "LEAVE MATCH", ButtonStyle.Danger, new Vector2(460f, 100f), "logout", Theme.H3);
            UIFactory.Place((RectTransform)leave.transform, new Vector2(0.5f, 1f), new Vector2(0f, -420f), new Vector2(460f, 100f), new Vector2(0.5f, 1f));
            leave.OnClick = () =>
            {
                Close();
                UI.Confirm("LEAVE MATCH?", "Your team will continue without you, or the match ends.", "LEAVE", "STAY", () => App.Flow.LeaveRoom());
            };
        }
    }
}
