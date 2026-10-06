using System.Collections.Generic;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Platform;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>
    /// The lobby: TEAM RED vs TEAM BLUE with every player's name, ready and connection state, the room code to share,
    /// and the match settings (only the host can change them).
    /// </summary>
    public sealed class LobbyScreen : UIScreen
    {
        static readonly string[] RoundLabels = { "5", "10", "15" };
        static readonly string[] TimeLabels = { "10 SEC", "15 SEC", "20 SEC" };
        static readonly string[] DifficultyLabels = { "EASY", "NORMAL", "HARD" };
        static readonly string[] TeamModeLabels = { "AUTO", "1V1", "2V2" };

        Text title;
        RectTransform codeCard;
        Text codeText;
        GameButton copyButton;
        readonly PlayerSlot[] slots = new PlayerSlot[4];
        Text hint;
        GameButton mainButton;
        GameButton switchButton;
        GameButton addBotButton;

        readonly List<(GameButton button, string id, Color color)> categoryChips = new List<(GameButton, string, Color)>();
        Segmented rounds, time, difficulty, teamMode;
        Text settingsNote;

        readonly HashSet<string> knownPlayers = new HashSet<string>();
        RoomSnapshot room;
        bool firstRefresh;

        protected override void OnBuild()
        {
            var back = GameButton.IconButton(Root, "arrow_back", 96f);
            UIFactory.Place((RectTransform)back.transform, new Vector2(0f, 1f), new Vector2(60f, -50f), new Vector2(96f, 96f), new Vector2(0f, 1f));
            back.OnClick = () => OnBack();

            title = UIFactory.Label(Root, "LOBBY", Theme.H1, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(title.rectTransform, new Vector2(0f, 1f), new Vector2(190f, -50f), new Vector2(700f, 96f), new Vector2(0f, 1f));

            BuildCodeCard();
            BuildTeams();
            BuildSettings();
            BuildActions();
        }

        // ───────────────────────── Build ─────────────────────────

        void BuildCodeCard()
        {
            var card = UIFactory.Panel(Root, "Room Code", Theme.Surface, Theme.Radius);
            codeCard = card.rectTransform;
            UIFactory.Place(codeCard, new Vector2(1f, 1f), new Vector2(-60f, -40f), new Vector2(760f, 116f), new Vector2(1f, 1f));
            var label = UIFactory.Label(codeCard, "ROOM CODE", Theme.Tiny, Theme.TextMuted, Theme.Bold, TextAnchor.LowerLeft);
            UIFactory.Stretch(label.rectTransform, 30f, 12f, 300f, 70f);
            codeText = UIFactory.Label(codeCard, "", Theme.H2, Theme.Accent, Theme.Bold, TextAnchor.UpperLeft);
            UIFactory.Stretch(codeText.rectTransform, 30f, 44f, 300f, 6f);
            copyButton = GameButton.Create(codeCard, "COPY CODE", ButtonStyle.Secondary, new Vector2(260f, 80f), "content_copy", Theme.Small);
            UIFactory.Place((RectTransform)copyButton.transform, new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(260f, 80f), new Vector2(1f, 0.5f));
            copyButton.OnClick = CopyCode;
        }

        void BuildTeams()
        {
            var area = UIFactory.Rect("Teams", Root);
            UIFactory.Place(area, new Vector2(0f, 1f), new Vector2(60f, -190f), new Vector2(1000f, 560f), new Vector2(0f, 1f));

            for (int team = 0; team < 2; team++)
            {
                float x = team == 0 ? 0f : 540f;
                var header = UIFactory.Label(area, Theme.TeamName(team), Theme.H3, Theme.TeamColor(team), Theme.Bold, TextAnchor.MiddleLeft);
                UIFactory.Place(header.rectTransform, new Vector2(0f, 1f), new Vector2(x + 6f, 0f), new Vector2(460f, 56f), new Vector2(0f, 1f));
                var bar = UIFactory.Panel(area, "Bar", Theme.TeamColor(team), 3f);
                UIFactory.Place(bar.rectTransform, new Vector2(0f, 1f), new Vector2(x + 6f, -60f), new Vector2(90f, 6f), new Vector2(0f, 1f));

                for (int i = 0; i < 2; i++)
                {
                    var slot = PlayerSlot.Create(area, team);
                    UIFactory.Place(slot.Rect, new Vector2(0f, 1f), new Vector2(x, -90f - i * 170f), new Vector2(460f, 150f), new Vector2(0f, 1f));
                    slots[team * 2 + i] = slot;
                }
            }

            var vs = UIFactory.Panel(area, "VS", Theme.SurfaceRaised, 40f);
            UIFactory.Place(vs.rectTransform, new Vector2(0f, 1f), new Vector2(500f, -240f), new Vector2(80f, 80f), new Vector2(0.5f, 0.5f));
            var vsText = UIFactory.Label(vs.rectTransform, "VS", Theme.Body, Theme.Text, Theme.Bold);
            UIFactory.Stretch(vsText.rectTransform);
        }

        void BuildSettings()
        {
            var card = UIFactory.Panel(Root, "Settings", Theme.Surface, Theme.RadiusLarge);
            var rt = card.rectTransform;
            UIFactory.Place(rt, new Vector2(1f, 1f), new Vector2(-60f, -190f), new Vector2(760f, 760f), new Vector2(1f, 1f));

            var header = UIFactory.Label(rt, "MATCH SETTINGS", Theme.Body, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(header.rectTransform, new Vector2(0f, 1f), new Vector2(34f, -22f), new Vector2(400f, 50f), new Vector2(0f, 1f));
            settingsNote = UIFactory.Label(rt, "", Theme.Tiny, Theme.TextMuted, Theme.Medium, TextAnchor.MiddleRight);
            UIFactory.Place(settingsNote.rectTransform, new Vector2(1f, 1f), new Vector2(-34f, -22f), new Vector2(320f, 50f), new Vector2(1f, 1f));

            var modeLabel = UIFactory.Label(rt, "MODE", Theme.Tiny, Theme.TextMuted, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(modeLabel.rectTransform, new Vector2(0f, 1f), new Vector2(34f, -82f), new Vector2(300f, 30f), new Vector2(0f, 1f));

            var categories = App.Content.Selectable();
            for (int i = 0; i < categories.Count && i < 8; i++)
            {
                var def = categories[i];
                Color color = App.Content.CategoryColor(def.id, Theme.Accent);
                var chip = GameButton.Create(rt, def.name, ButtonStyle.Secondary, new Vector2(168f, 84f), def.icon, Theme.Tiny, 16f, false);
                int col = i % 4, row = i / 4;
                UIFactory.Place((RectTransform)chip.transform, new Vector2(0f, 1f), new Vector2(34f + col * 176f, -118f - row * 92f), new Vector2(168f, 84f), new Vector2(0f, 1f));
                if (chip.IconImage != null)
                {
                    var irt = chip.IconImage.rectTransform;
                    irt.anchorMin = irt.anchorMax = new Vector2(0.5f, 1f);
                    irt.pivot = new Vector2(0.5f, 1f);
                    irt.anchoredPosition = new Vector2(0f, -10f);
                    irt.sizeDelta = new Vector2(34f, 34f);
                    UIFactory.Stretch(chip.Label.rectTransform, 6f, 46f, 6f, 4f);
                }
                string id = def.id;
                chip.OnClick = () => ChangeSetting(s => s.category = id);
                categoryChips.Add((chip, id, color));
            }

            float y = -320f;
            rounds = Row(rt, "ROUNDS", RoundLabels, ref y, i => ChangeSetting(s => s.rounds = MatchSettings.RoundOptions[i]));
            time = Row(rt, "ANSWER TIME", TimeLabels, ref y, i => ChangeSetting(s => s.answerTime = MatchSettings.AnswerTimeOptions[i]));
            difficulty = Row(rt, "DIFFICULTY", DifficultyLabels, ref y, i => ChangeSetting(s => s.difficulty = i));
            teamMode = Row(rt, "TEAM MODE", TeamModeLabels, ref y, i => ChangeSetting(s => s.teamMode = i));
        }

        Segmented Row(RectTransform parent, string label, string[] options, ref float y, System.Action<int> onChange)
        {
            var l = UIFactory.Label(parent, label, Theme.Small, Theme.Text, Theme.SemiBold, TextAnchor.MiddleLeft);
            UIFactory.Place(l.rectTransform, new Vector2(0f, 1f), new Vector2(34f, y), new Vector2(220f, 76f), new Vector2(0f, 1f));
            var seg = Segmented.Create(parent, options, 0, onChange, new Vector2(450f, 76f));
            UIFactory.Place((RectTransform)seg.transform, new Vector2(1f, 1f), new Vector2(-34f, y), new Vector2(450f, 76f), new Vector2(1f, 1f));
            y -= 104f;
            return seg;
        }

        void BuildActions()
        {
            hint = UIFactory.Label(Root, "", Theme.Small, Theme.TextMuted, Theme.SemiBold);
            UIFactory.Place(hint.rectTransform, new Vector2(0f, 0f), new Vector2(560f, 196f), new Vector2(1000f, 40f), new Vector2(0.5f, 0f));

            switchButton = GameButton.Create(Root, "SWITCH TEAM", ButtonStyle.Secondary, new Vector2(300f, 110f), "swap_horiz", Theme.Small);
            UIFactory.Place((RectTransform)switchButton.transform, new Vector2(0f, 0f), new Vector2(60f, 60f), new Vector2(300f, 110f), new Vector2(0f, 0f));
            switchButton.OnClick = SwitchTeam;

            mainButton = GameButton.Create(Root, "READY", ButtonStyle.Primary, new Vector2(400f, 110f), "check", Theme.H3);
            UIFactory.Place((RectTransform)mainButton.transform, new Vector2(0f, 0f), new Vector2(380f, 60f), new Vector2(400f, 110f), new Vector2(0f, 0f));
            mainButton.OnClick = MainAction;

            addBotButton = GameButton.Create(Root, "ADD BOT", ButtonStyle.Secondary, new Vector2(260f, 110f), "smart_toy", Theme.Small);
            UIFactory.Place((RectTransform)addBotButton.transform, new Vector2(0f, 0f), new Vector2(800f, 60f), new Vector2(260f, 110f), new Vector2(0f, 0f));
            addBotButton.OnClick = () => App.Flow.Net.AddBot();
        }

        // ───────────────────────── Refresh ─────────────────────────

        public override void OnShow(object argument)
        {
            knownPlayers.Clear();
            firstRefresh = true;
            App.Flow.RoomChanged += Refresh;
            App.Flow.Error += OnError;
            if (App.Flow.Room != null) Refresh(App.Flow.Room);
        }

        public override void OnHide()
        {
            App.Flow.RoomChanged -= Refresh;
            App.Flow.Error -= OnError;
        }

        void OnError(ErrorMsg e)
        {
            UI.Toast(RoomCommands.ErrorText(e.code), ToastKind.Error);
        }

        void Refresh(RoomSnapshot r)
        {
            if (r == null || r.state != (int)RoomState.Lobby) return;
            room = r;
            string me = App.Flow.MyId;
            bool host = App.Flow.IsHost;

            title.text = r.isLocal ? "PRACTICE" : r.isPublic ? "PUBLIC LOBBY" : "LOBBY";
            codeCard.gameObject.SetActive(!r.isLocal && !r.isPublic);
            codeText.text = Spaced(r.code);

            // Players by team, in join order.
            var byTeam = new List<RoomPlayerView>[] { new List<RoomPlayerView>(), new List<RoomPlayerView>() };
            foreach (var p in r.players) byTeam[p.team == Teams.Blue ? 1 : 0].Add(p);
            for (int team = 0; team < 2; team++)
            {
                for (int i = 0; i < 2; i++)
                {
                    var slot = slots[team * 2 + i];
                    var p = i < byTeam[team].Count ? byTeam[team][i] : null;
                    slot.Show(p, p != null && p.id == me, host, r.isLocal);
                }
            }

            // Join / leave feedback.
            var current = new HashSet<string>();
            foreach (var p in r.players) current.Add(p.id);
            if (!firstRefresh)
            {
                foreach (var id in current) if (!knownPlayers.Contains(id)) { UIFeedback.Play(Sfx.PlayerJoin); break; }
                foreach (var id in knownPlayers) if (!current.Contains(id)) { UIFeedback.Play(Sfx.PlayerLeave); break; }
            }
            knownPlayers.Clear();
            foreach (var id in current) knownPlayers.Add(id);
            if (firstRefresh) AnimateIn();
            firstRefresh = false;

            RefreshSettings(r.settings, host);
            RefreshActions(r, host);
        }

        void AnimateIn()
        {
            for (int i = 0; i < slots.Length; i++)
            {
                var g = UIFactory.Group(slots[i].Rect);
                g.alpha = 0f;
                Tween.Fade(g, 1f, 0.3f, Ease.OutCubic, 0.08f + i * 0.06f);
                Tween.ScaleFrom(slots[i].Rect, 0.9f, 1f, 0.35f, Ease.OutBack, 0.08f + i * 0.06f);
            }
        }

        void RefreshSettings(MatchSettings s, bool host)
        {
            foreach (var (button, id, color) in categoryChips)
            {
                button.SetSelected(id == s.category, color);
                button.Interactable = host || id == s.category;
                if (!host && button.Group != null) button.Group.alpha = id == s.category ? 1f : 0.45f;
            }
            rounds.SetSelected(System.Array.IndexOf(MatchSettings.RoundOptions, s.rounds), false);
            time.SetSelected(System.Array.IndexOf(MatchSettings.AnswerTimeOptions, s.answerTime), false);
            difficulty.SetSelected(Mathf.Clamp(s.difficulty, 0, 2), false);
            teamMode.SetSelected(Mathf.Clamp(s.teamMode, 0, 2), false);
            rounds.SetInteractable(host);
            time.SetInteractable(host);
            difficulty.SetInteractable(host);
            teamMode.SetInteractable(host);
            settingsNote.text = host ? "YOU ARE THE HOST" : "THE HOST CHOOSES";
        }

        void RefreshActions(RoomSnapshot r, bool host)
        {
            var me = App.Flow.Me;
            int myTeam = me != null ? me.team : 0;
            int otherCount = 0;
            foreach (var p in r.players) if (p.team != myTeam) otherCount++;
            switchButton.Interactable = otherCount < MatchRules.MaxPerTeam && r.players.Length > 0;
            addBotButton.gameObject.SetActive(host);
            addBotButton.Interactable = r.players.Length < MatchRules.MaxPlayers;

            if (host)
            {
                string problem = StartProblem(r);
                mainButton.SetLabel("START MATCH");
                mainButton.SetStyle(ButtonStyle.Primary);
                if (mainButton.IconImage != null) mainButton.IconImage.sprite = Shapes.Icon("play_arrow");
                mainButton.Interactable = problem == null;
                hint.text = problem ?? "EVERYONE IS READY";
                hint.color = problem == null ? Theme.Success : Theme.TextMuted;
            }
            else
            {
                bool ready = me != null && me.ready;
                mainButton.SetLabel(ready ? "NOT READY" : "READY");
                mainButton.SetStyle(ready ? ButtonStyle.Secondary : ButtonStyle.Primary);
                if (mainButton.IconImage != null) mainButton.IconImage.sprite = Shapes.Icon(ready ? "close" : "check");
                mainButton.Interactable = true;
                hint.text = ready ? "WAITING FOR THE HOST TO START" : "TAP READY WHEN YOU ARE SET";
                hint.color = Theme.TextMuted;
            }
        }

        /// <summary>Mirrors the server's start rules so the host sees why START is disabled.</summary>
        static string StartProblem(RoomSnapshot r)
        {
            int red = 0, blue = 0;
            foreach (var p in r.players)
            {
                if (p.team == Teams.Blue) blue++;
                else red++;
            }
            if (red == 0 || blue == 0) return "ADD A PLAYER OR BOT TO THE OTHER TEAM";
            var mode = (TeamMode)r.settings.teamMode;
            if (mode == TeamMode.OneVsOne && (red != 1 || blue != 1)) return "1V1 NEEDS ONE PLAYER PER TEAM";
            if (mode == TeamMode.TwoVsTwo && (red != 2 || blue != 2)) return "2V2 NEEDS TWO PLAYERS PER TEAM";
            foreach (var p in r.players)
            {
                if (p.isBot) continue;
                if (!p.connected) return "WAITING FOR A PLAYER TO RECONNECT";
                if (!p.isHost && !p.ready) return "WAITING FOR PLAYERS TO BE READY";
            }
            return null;
        }

        static string Spaced(string code)
        {
            if (string.IsNullOrEmpty(code)) return "";
            var chars = new char[code.Length * 2 - 1];
            for (int i = 0; i < code.Length; i++)
            {
                chars[i * 2] = code[i];
                if (i < code.Length - 1) chars[i * 2 + 1] = ' ';
            }
            return new string(chars);
        }

        // ───────────────────────── Actions ─────────────────────────

        void ChangeSetting(System.Action<MatchSettings> change)
        {
            if (room == null || !App.Flow.IsHost) return;
            var s = room.settings.Clone();
            change(s);
            App.Flow.Net.UpdateSettings(s);
        }

        void MainAction()
        {
            if (room == null) return;
            if (App.Flow.IsHost)
            {
                App.Flow.Net.StartMatch();
                return;
            }
            var me = App.Flow.Me;
            App.Flow.Net.SetReady(me == null || !me.ready);
        }

        void SwitchTeam()
        {
            var me = App.Flow.Me;
            if (me != null) App.Flow.Net.SetTeam(Teams.Other(me.team));
        }

        void CopyCode()
        {
            if (room == null) return;
            BrowserBridge.CopyToClipboard(room.code);
            copyButton.SetLabel("COPIED!");
            if (copyButton.IconImage != null) copyButton.IconImage.sprite = Shapes.Icon("check");
            copyButton.SetColors(Theme.Success, Theme.TextOnAccent);
            Tween.Punch(codeText.transform, 0.12f, 0.3f);
            UIFeedback.Play(Sfx.ScoreGain);
            Tween.Run(copyButton, Tween.ChCustom, 1.6f, _ => { }, Ease.Linear, 0f, () =>
            {
                copyButton.SetLabel("COPY CODE");
                if (copyButton.IconImage != null) copyButton.IconImage.sprite = Shapes.Icon("content_copy");
                copyButton.SetStyle(ButtonStyle.Secondary);
            });
        }

        public override bool OnBack()
        {
            UI.Confirm("LEAVE LOBBY?", "You will leave this room.", "LEAVE", "STAY", () => App.Flow.LeaveRoom());
            return true;
        }

        public override void OnKey(KeyCode key)
        {
            if (key == KeyCode.Return || key == KeyCode.Space) mainButton.Click();
        }

        // ───────────────────────── Player slot ─────────────────────────

        sealed class PlayerSlot
        {
            public RectTransform Rect;
            Image bg;
            Image strip;
            Avatar avatar;
            Text name;
            Text tags;
            Image crown;
            Text state;
            Image stateDot;
            Text empty;
            GameButton moveButton;
            GameButton removeButton;
            int team;
            string playerId;
            bool wasReady;

            public static PlayerSlot Create(Transform parent, int team)
            {
                var s = new PlayerSlot { team = team };
                s.bg = UIFactory.Panel(parent, "Slot", Theme.SurfaceRaised, Theme.Radius);
                s.Rect = s.bg.rectTransform;
                s.strip = UIFactory.Panel(s.Rect, "Strip", Theme.TeamColor(team), 4f);
                UIFactory.Place(s.strip.rectTransform, new Vector2(0f, 0.5f), new Vector2(12f, 0f), new Vector2(8f, 96f), new Vector2(0f, 0.5f));

                s.avatar = Avatar.Create(s.Rect, 92f);
                UIFactory.Place((RectTransform)s.avatar.transform, new Vector2(0f, 0.5f), new Vector2(38f, 0f), new Vector2(92f, 92f), new Vector2(0f, 0.5f));
                s.crown = UIFactory.Icon(s.Rect, "crown", 40f, Theme.Accent);
                UIFactory.Place(s.crown.rectTransform, new Vector2(0f, 0.5f), new Vector2(98f, 48f), new Vector2(40f, 40f), new Vector2(0.5f, 0.5f));
                s.crown.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -18f);

                s.name = UIFactory.Label(s.Rect, "", Theme.Body, Theme.Text, Theme.Bold, TextAnchor.LowerLeft);
                UIFactory.Stretch(s.name.rectTransform, 150f, 18f, 120f, 72f);
                s.name.horizontalOverflow = HorizontalWrapMode.Overflow;
                s.tags = UIFactory.Label(s.Rect, "", Theme.Tiny, Theme.Accent, Theme.Bold, TextAnchor.UpperLeft);
                UIFactory.Stretch(s.tags.rectTransform, 150f, 82f, 120f, 18f);

                s.stateDot = UIFactory.Image(s.Rect, "Dot", Theme.Success, Shapes.Circle);
                UIFactory.Place(s.stateDot.rectTransform, new Vector2(0f, 0.5f), new Vector2(150f, -36f), new Vector2(12f, 12f), new Vector2(0f, 0.5f));
                s.state = UIFactory.Label(s.Rect, "", Theme.Tiny, Theme.TextMuted, Theme.SemiBold, TextAnchor.MiddleLeft);
                UIFactory.Place(s.state.rectTransform, new Vector2(0f, 0.5f), new Vector2(170f, -36f), new Vector2(260f, 30f), new Vector2(0f, 0.5f));

                s.empty = UIFactory.Label(s.Rect, "WAITING FOR PLAYER", Theme.Small, Theme.TextFaint, Theme.SemiBold, TextAnchor.MiddleLeft);
                UIFactory.Stretch(s.empty.rectTransform, 150f, 0f, 20f, 0f);

                s.moveButton = GameButton.IconButton(s.Rect, "swap_horiz", 64f, ButtonStyle.Ghost);
                UIFactory.Place((RectTransform)s.moveButton.transform, new Vector2(1f, 0.5f), new Vector2(-92f, 0f), new Vector2(64f, 64f), new Vector2(1f, 0.5f));
                s.moveButton.OnClick = () => { if (s.playerId != null) App.Flow.Net.MovePlayer(s.playerId); };
                s.removeButton = GameButton.IconButton(s.Rect, "close", 64f, ButtonStyle.Ghost);
                UIFactory.Place((RectTransform)s.removeButton.transform, new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(64f, 64f), new Vector2(1f, 0.5f));
                s.removeButton.OnClick = () => { if (s.playerId != null) App.Flow.Net.RemoveBot(s.playerId); };
                return s;
            }

            static Core.App App => Core.App.Instance;

            public void Show(RoomPlayerView p, bool isMe, bool viewerIsHost, bool local)
            {
                bool has = p != null;
                bool changed = (p?.id) != playerId;
                playerId = p?.id;
                avatar.gameObject.SetActive(true);
                name.gameObject.SetActive(has);
                tags.gameObject.SetActive(has);
                state.gameObject.SetActive(has);
                stateDot.gameObject.SetActive(has);
                empty.gameObject.SetActive(!has);
                strip.color = has ? Theme.TeamColor(team) : new Color(1f, 1f, 1f, 0.06f);
                bg.color = has ? Theme.SurfaceRaised : Theme.Surface;
                crown.gameObject.SetActive(has && p.isHost);
                moveButton.gameObject.SetActive(has && viewerIsHost && p.isBot);
                removeButton.gameObject.SetActive(has && viewerIsHost && p.isBot);

                if (!has)
                {
                    avatar.SetEmpty();
                    return;
                }

                avatar.Set(p.name, p.avatar, p.isBot);
                avatar.SetHighlight(isMe, Theme.Accent);
                name.text = p.name;
                var t = new System.Text.StringBuilder();
                if (isMe) t.Append("YOU");
                if (p.isHost) t.Append(t.Length > 0 ? " · HOST" : "HOST");
                if (p.isBot) t.Append(t.Length > 0 ? " · BOT" : "BOT");
                tags.text = t.ToString();

                if (!p.connected)
                {
                    state.text = "RECONNECTING " + Mathf.CeilToInt(p.reconnectRemaining) + "s";
                    state.color = Theme.Warning;
                    stateDot.color = Theme.Warning;
                }
                else if (p.ready || p.isHost)
                {
                    state.text = p.isHost && !p.isBot ? "HOST" : "READY";
                    state.color = Theme.Success;
                    stateDot.color = Theme.Success;
                }
                else
                {
                    state.text = "NOT READY";
                    state.color = Theme.TextMuted;
                    stateDot.color = Theme.TextFaint;
                }

                if (changed) Tween.ScaleFrom(Rect, 0.92f, 1f, 0.3f, Ease.OutBack);
                else if (p.ready && !wasReady) Tween.Punch(Rect, 0.04f, 0.25f);
                wasReady = p.ready;
            }
        }
    }
}
