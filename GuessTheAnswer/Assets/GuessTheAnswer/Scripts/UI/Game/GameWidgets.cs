using GuessTheAnswer.Audio;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Game
{
    /// <summary>Team name, score with count-up, streak and the team's players (the active one highlighted).</summary>
    public sealed class TeamPanel
    {
        public RectTransform Rect;
        readonly int team;
        Text score;
        Text streak;
        Image streakIcon;
        Image glow;
        readonly Avatar[] avatars = new Avatar[2];
        readonly Text[] names = new Text[2];
        readonly Image[] marks = new Image[2];
        int shownScore;
        int targetScore;

        public int Team => team;

        TeamPanel(int team)
        {
            this.team = team;
        }

        public static TeamPanel Create(Transform parent, int team, bool mine)
        {
            var p = new TeamPanel(team);
            bool right = team == Teams.Blue;
            var bg = UIFactory.Panel(parent, Theme.TeamName(team), Theme.Surface, Theme.RadiusLarge);
            p.Rect = bg.rectTransform;
            var anchor = new Vector2(right ? 1f : 0f, 1f);
            UIFactory.Place(p.Rect, anchor, new Vector2(right ? -36f : 36f, -26f), new Vector2(540f, 168f), anchor);

            p.glow = UIFactory.Outline(p.Rect, Theme.TeamColor(team), Theme.RadiusLarge);
            p.glow.color = new Color(1f, 1f, 1f, 0f);

            var strip = UIFactory.Panel(p.Rect, "Strip", Theme.TeamColor(team), 4f);
            UIFactory.Place(strip.rectTransform, new Vector2(right ? 1f : 0f, 0.5f), new Vector2(right ? -14f : 14f, 0f), new Vector2(8f, 120f), new Vector2(right ? 1f : 0f, 0.5f));

            var align = right ? TextAnchor.UpperRight : TextAnchor.UpperLeft;
            var name = UIFactory.Label(p.Rect, Theme.TeamName(team) + (mine ? " · YOU" : ""), Theme.Small, Theme.TeamColor(team), Theme.Bold, align);
            UIFactory.Place(name.rectTransform, anchor, new Vector2(right ? -40f : 40f, -18f), new Vector2(460f, 34f), anchor);

            p.score = UIFactory.Label(p.Rect, "0", 72, Theme.Text, Theme.Bold, right ? TextAnchor.MiddleRight : TextAnchor.MiddleLeft);
            UIFactory.Place(p.score.rectTransform, new Vector2(right ? 1f : 0f, 0.5f), new Vector2(right ? -40f : 40f, -14f), new Vector2(260f, 90f), new Vector2(right ? 1f : 0f, 0.5f));

            p.streakIcon = UIFactory.Icon(p.Rect, "local_fire_department", 34f, Theme.Warning);
            UIFactory.Place(p.streakIcon.rectTransform, new Vector2(right ? 1f : 0f, 0f), new Vector2(right ? -40f : 40f, 22f), new Vector2(34f, 34f), new Vector2(right ? 1f : 0f, 0f));
            p.streak = UIFactory.Label(p.Rect, "", Theme.Small, Theme.Warning, Theme.Bold, right ? TextAnchor.MiddleRight : TextAnchor.MiddleLeft);
            UIFactory.Place(p.streak.rectTransform, new Vector2(right ? 1f : 0f, 0f), new Vector2(right ? -80f : 80f, 22f), new Vector2(160f, 34f), new Vector2(right ? 1f : 0f, 0f));

            for (int i = 0; i < 2; i++)
            {
                var av = Avatar.Create(p.Rect, 56f);
                float x = right ? 40f + i * 120f : -40f - i * 120f;
                UIFactory.Place((RectTransform)av.transform, new Vector2(right ? 0f : 1f, 0.5f), new Vector2(x, 14f), new Vector2(56f, 56f), new Vector2(right ? 0f : 1f, 0.5f));
                p.avatars[i] = av;
                var n = UIFactory.Label(p.Rect, "", Theme.Tiny, Theme.TextMuted, Theme.SemiBold);
                UIFactory.Place(n.rectTransform, new Vector2(right ? 0f : 1f, 0.5f), new Vector2(right ? x - 22f : x + 22f, -36f), new Vector2(110f, 26f), new Vector2(right ? 0f : 1f, 0.5f));
                n.horizontalOverflow = HorizontalWrapMode.Overflow;
                p.names[i] = n;
                var mark = UIFactory.Image(av.transform, "Mark", Theme.Success, Shapes.Circle);
                UIFactory.Place(mark.rectTransform, new Vector2(1f, 1f), new Vector2(4f, 4f), new Vector2(20f, 20f), new Vector2(1f, 1f));
                p.marks[i] = mark;
            }
            return p;
        }

        public void Render(MatchSnapshot s, string myId)
        {
            var view = s.teams != null && s.teams.Length > team ? s.teams[team] : null;
            if (view != null && view.score != targetScore)
            {
                targetScore = view.score;
                if (targetScore > shownScore) Tween.Punch(score.transform, 0.12f, 0.3f);
            }
            int st = view != null ? view.streak : 0;
            streak.text = st >= 2 ? st + " IN A ROW" : "";
            streakIcon.enabled = st >= 2;

            bool active = s.activeTeam == team && (s.phase == (int)MatchPhase.Question || s.phase == (int)MatchPhase.TurnIntro || s.phase == (int)MatchPhase.Locked);
            bool stealing = s.phase == (int)MatchPhase.Steal && s.steal != null && s.steal.team == team;
            var target = active || stealing ? new Color(Theme.TeamColor(team).r, Theme.TeamColor(team).g, Theme.TeamColor(team).b, 0.9f) : new Color(1f, 1f, 1f, 0.05f);
            if (glow.color != target) Tween.ColorTo(glow, target, Theme.Normal);

            int slot = 0;
            if (s.players != null)
            {
                foreach (var p in s.players)
                {
                    if (p.team != team || slot >= 2) continue;
                    avatars[slot].gameObject.SetActive(true);
                    avatars[slot].Set(p.name, p.avatar, p.isBot);
                    bool isActive = p.id == s.activePlayerId && s.phase != (int)MatchPhase.Finished;
                    avatars[slot].SetHighlight(isActive || p.id == myId, isActive ? Theme.Accent : new Color(1f, 1f, 1f, 0.35f));
                    names[slot].text = p.dropped ? "LEFT" : !p.connected ? "OFFLINE" : (p.id == myId ? "YOU" : Short(p.name));
                    names[slot].color = p.dropped || !p.connected ? Theme.Warning : Theme.TextMuted;
                    var g = UIFactory.Group(avatars[slot]);
                    g.alpha = p.dropped ? 0.35f : 1f;
                    bool tie = s.phase == (int)MatchPhase.TieBreakQuestion || s.phase == (int)MatchPhase.TieBreakReveal;
                    marks[slot].enabled = tie && p.tieBreakPick >= 0;
                    marks[slot].color = p.tieBreakWrong ? Theme.Danger : Theme.Success;
                    slot++;
                }
            }
            for (; slot < 2; slot++)
            {
                avatars[slot].gameObject.SetActive(false);
                names[slot].text = "";
            }
        }

        static string Short(string name)
        {
            if (string.IsNullOrEmpty(name)) return "";
            return name.Length <= 9 ? name : name.Substring(0, 8) + "…";
        }

        public void SnapScore(int value)
        {
            shownScore = targetScore = value;
            score.text = value.ToString();
        }

        /// <summary>Score count-up animation, called every frame.</summary>
        public void Tick(float dt)
        {
            if (shownScore == targetScore) return;
            int step = Mathf.Max(1, Mathf.CeilToInt(Mathf.Abs(targetScore - shownScore) * dt * 6f));
            shownScore = shownScore < targetScore ? Mathf.Min(targetScore, shownScore + step) : Mathf.Max(targetScore, shownScore - step);
            score.text = shownScore.ToString();
        }

        public Vector2 ScoreAnchorInParent(RectTransform parent)
        {
            Vector3 world = score.rectTransform.TransformPoint(score.rectTransform.rect.center);
            return (Vector2)parent.InverseTransformPoint(world);
        }
    }

    /// <summary>Circular countdown with the seconds in the middle. Gets warmer and ticks during the last 5 seconds.</summary>
    public sealed class TimerRing
    {
        public RectTransform Rect;
        Image fill;
        Text number;
        int lastSecond = -1;

        public static TimerRing Create(Transform parent, float size)
        {
            var t = new TimerRing();
            var bg = UIFactory.Image(parent, "Timer", Theme.Background, Shapes.Circle);
            t.Rect = bg.rectTransform;
            t.Rect.sizeDelta = new Vector2(size, size);
            // Own canvas: the ring redraws every frame without rebuilding the rest of the screen.
            bg.gameObject.AddComponent<Canvas>();
            var track = UIFactory.Image(t.Rect, "Track", new Color(1f, 1f, 1f, 0.08f), Shapes.Ring);
            UIFactory.Stretch(track.rectTransform, 8f, 8f, 8f, 8f);
            t.fill = UIFactory.Image(t.Rect, "Fill", Theme.Accent, Shapes.Ring);
            UIFactory.Stretch(t.fill.rectTransform, 8f, 8f, 8f, 8f);
            t.fill.type = Image.Type.Filled;
            t.fill.fillMethod = Image.FillMethod.Radial360;
            t.fill.fillOrigin = (int)Image.Origin360.Top;
            t.fill.fillClockwise = false;
            t.number = UIFactory.Label(t.Rect, "", Theme.H2, Theme.Text, Theme.Bold);
            UIFactory.Stretch(t.number.rectTransform);
            return t;
        }

        public void Show(bool visible)
        {
            Rect.gameObject.SetActive(visible);
            lastSecond = -1;
        }

        public void Set(float remaining, float total, bool ticking, bool paused)
        {
            float frac = total > 0f ? Mathf.Clamp01(remaining / total) : 0f;
            fill.fillAmount = frac;
            int seconds = Mathf.CeilToInt(Mathf.Max(0f, remaining));
            Color c = seconds <= 3 ? Theme.Danger : seconds <= 5 ? Theme.Warning : Theme.Accent;
            if (paused) c = Theme.TextFaint;
            fill.color = c;
            if (seconds != lastSecond)
            {
                lastSecond = seconds;
                number.text = seconds.ToString();
                number.color = seconds <= 5 && !paused ? c : Theme.Text;
                if (ticking && !paused && seconds <= 5 && seconds > 0)
                {
                    UIFeedback.Play(Sfx.TimerWarning);
                    Tween.Punch(Rect, 0.12f, 0.25f);
                }
            }
        }
    }

    /// <summary>A joker button (50/50, +8 SEC, TEAM VOTE, STEAL) with its keyboard key.</summary>
    public sealed class JokerButton
    {
        public GameButton Button;
        public JokerType Type;
        Text state;
        Image check;

        public static JokerButton Create(Transform parent, JokerType type, string title, string icon, string key, Vector2 size, bool showKey)
        {
            var j = new JokerButton { Type = type };
            j.Button = GameButton.Create(parent, title, ButtonStyle.Secondary, size, icon, Theme.Small, Theme.Radius);
            var rt = (RectTransform)j.Button.transform;
            UIFactory.Stretch(j.Button.Label.rectTransform, 84f, 8f, 16f, size.y * 0.42f);
            j.Button.Label.alignment = TextAnchor.LowerLeft;
            j.state = UIFactory.Label(rt, "", Theme.Tiny, Theme.TextMuted, Theme.SemiBold, TextAnchor.UpperLeft);
            UIFactory.Stretch(j.state.rectTransform, 84f, size.y * 0.58f, 16f, 6f);
            if (showKey)
            {
                var keyBg = UIFactory.Panel(rt, "Key", new Color(1f, 1f, 1f, 0.08f), 8f);
                UIFactory.Place(keyBg.rectTransform, new Vector2(1f, 1f), new Vector2(-10f, -10f), new Vector2(32f, 32f), new Vector2(1f, 1f));
                var k = UIFactory.Label(keyBg.rectTransform, key, Theme.Tiny, Theme.TextMuted, Theme.Bold);
                UIFactory.Stretch(k.rectTransform);
            }
            j.check = UIFactory.Icon(rt, "check", 28f, Theme.Success);
            UIFactory.Place(j.check.rectTransform, new Vector2(1f, 0f), new Vector2(-12f, 12f), new Vector2(28f, 28f), new Vector2(1f, 0f));
            j.check.enabled = false;
            return j;
        }

        public void Render(bool enabled, bool used, bool usable, string stateText)
        {
            Button.Interactable = usable;
            check.enabled = used;
            state.text = stateText;
            state.color = used ? Theme.Success : Theme.TextMuted;
            if (Button.Group != null && !usable) Button.Group.alpha = used ? 0.55f : enabled ? 0.75f : 0.35f;
        }
    }
}
