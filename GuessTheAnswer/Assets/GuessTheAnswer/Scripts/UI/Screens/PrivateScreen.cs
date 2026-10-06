using System.Text;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Multiplayer;
using GuessTheAnswer.Shared;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI.Screens
{
    /// <summary>
    /// PRIVATE GAME: create a room, or join one with a 6-character code. Codes can be typed on a keyboard or tapped
    /// on the built-in keypad, which only offers characters that can appear in a code (no 0/O, 1/I).
    /// </summary>
    public sealed class PrivateScreen : UIScreen
    {
        RectTransform choiceView;
        RectTransform joinView;
        RectTransform codeRow;
        readonly Image[] boxes = new Image[RoomCode.Length];
        readonly Text[] boxText = new Text[RoomCode.Length];
        Text error;
        Text title;
        GameButton joinButton;
        Spinner spinner;
        readonly StringBuilder code = new StringBuilder(RoomCode.Length);
        bool joining;
        bool creating;
        float waitTimeout;

        protected override void OnBuild()
        {
            var back = GameButton.IconButton(Root, "arrow_back", 96f);
            UIFactory.Place((RectTransform)back.transform, new Vector2(0f, 1f), new Vector2(60f, -50f), new Vector2(96f, 96f), new Vector2(0f, 1f));
            back.OnClick = () => OnBack();

            title = UIFactory.Label(Root, "PRIVATE GAME", Theme.H1, Theme.Text, Theme.Bold, TextAnchor.MiddleLeft);
            UIFactory.Place(title.rectTransform, new Vector2(0f, 1f), new Vector2(190f, -50f), new Vector2(1000f, 96f), new Vector2(0f, 1f));

            BuildChoice();
            BuildJoin();

            spinner = Spinner.Create(Root, 90f, Theme.Accent);
            UIFactory.Place((RectTransform)spinner.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(90f, 90f));
            spinner.gameObject.SetActive(false);
        }

        void BuildChoice()
        {
            choiceView = UIFactory.Stretch(UIFactory.Rect("Choice", Root));

            var create = MenuCard.Create(choiceView, "CREATE GAME", "GET A CODE TO SHARE WITH FRIENDS", "add", ButtonStyle.Primary, new Vector2(620f, 300f), Theme.H1);
            UIFactory.Place((RectTransform)create.transform, new Vector2(0.5f, 0.5f), new Vector2(-330f, -20f), new Vector2(620f, 300f));
            create.OnClick = Create;

            var join = MenuCard.Create(choiceView, "JOIN GAME", "ENTER A FRIEND'S ROOM CODE", "login", ButtonStyle.Secondary, new Vector2(620f, 300f), Theme.H1);
            UIFactory.Place((RectTransform)join.transform, new Vector2(0.5f, 0.5f), new Vector2(330f, -20f), new Vector2(620f, 300f));
            join.OnClick = () => ShowJoin(null);
        }

        void BuildJoin()
        {
            joinView = UIFactory.Stretch(UIFactory.Rect("Join", Root));

            var label = UIFactory.Label(joinView, "ENTER ROOM CODE", Theme.H3, Theme.TextMuted, Theme.Bold);
            UIFactory.Place(label.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -170f), new Vector2(900f, 50f), new Vector2(0.5f, 1f));

            codeRow = UIFactory.Rect("Code", joinView);
            UIFactory.Place(codeRow, new Vector2(0.5f, 1f), new Vector2(0f, -240f), new Vector2(6 * 112f + 5 * 18f, 136f), new Vector2(0.5f, 1f));
            for (int i = 0; i < RoomCode.Length; i++)
            {
                var box = UIFactory.Panel(codeRow, "Box " + i, Theme.Surface, 20f);
                UIFactory.Place(box.rectTransform, new Vector2(0f, 0.5f), new Vector2(i * 130f, 0f), new Vector2(112f, 136f), new Vector2(0f, 0.5f));
                boxes[i] = box;
                boxText[i] = UIFactory.Label(box.rectTransform, "", Theme.H1, Theme.Text, Theme.Bold);
                UIFactory.Stretch(boxText[i].rectTransform);
            }

            error = UIFactory.Label(joinView, "", Theme.Body, Theme.Danger, Theme.Bold);
            UIFactory.Place(error.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -392f), new Vector2(900f, 44f), new Vector2(0.5f, 1f));

            // Keypad: the room-code alphabet in four rows of eight, plus delete.
            var pad = UIFactory.Rect("Keypad", joinView);
            const float key = 112f, gap = 12f;
            UIFactory.Place(pad, new Vector2(0.5f, 1f), new Vector2(0f, -452f), new Vector2(8 * key + 7 * gap, 4 * 84f + 3 * gap), new Vector2(0.5f, 1f));
            for (int i = 0; i < RoomCode.Alphabet.Length; i++)
            {
                char c = RoomCode.Alphabet[i];
                var b = GameButton.Create(pad, c.ToString(), ButtonStyle.Secondary, new Vector2(key, 84f), null, Theme.H3, 16f, false);
                b.HoverSound = false;
                b.Cooldown = 0.05f;
                int col = i % 8, row = i / 8;
                UIFactory.Place((RectTransform)b.transform, new Vector2(0f, 1f), new Vector2(col * (key + gap), -row * (84f + gap)), new Vector2(key, 84f), new Vector2(0f, 1f));
                b.OnClick = () => Type(c);
            }

            var del = GameButton.Create(joinView, "DELETE", ButtonStyle.Secondary, new Vector2(300f, 100f), "backspace", Theme.Body);
            UIFactory.Place((RectTransform)del.transform, new Vector2(0.5f, 0f), new Vector2(-170f, 60f), new Vector2(300f, 100f), new Vector2(0.5f, 0f));
            del.OnClick = Delete;

            joinButton = GameButton.Create(joinView, "JOIN", ButtonStyle.Primary, new Vector2(300f, 100f), "login", Theme.H3);
            UIFactory.Place((RectTransform)joinButton.transform, new Vector2(0.5f, 0f), new Vector2(170f, 60f), new Vector2(300f, 100f), new Vector2(0.5f, 0f));
            joinButton.OnClick = Join;
        }

        public override void OnShow(object argument)
        {
            joining = false;
            creating = false;
            spinner.gameObject.SetActive(false);
            App.Flow.Error -= OnError;
            App.Flow.Error += OnError;
            if (argument is string prefilled) ShowJoin(prefilled);
            else ShowChoice();
        }

        public override void OnHide()
        {
            App.Flow.Error -= OnError;
        }

        void ShowChoice()
        {
            title.text = "PRIVATE GAME";
            choiceView.gameObject.SetActive(true);
            joinView.gameObject.SetActive(false);
        }

        void ShowJoin(string prefilled)
        {
            title.text = "JOIN GAME";
            choiceView.gameObject.SetActive(false);
            joinView.gameObject.SetActive(true);
            code.Clear();
            error.text = "";
            if (!string.IsNullOrEmpty(prefilled)) code.Append(prefilled);
            RefreshCode();
            if (code.Length == RoomCode.Length) Join();
        }

        void Create()
        {
            if (creating) return;
            creating = true;
            waitTimeout = Time.unscaledTime + 10f;
            spinner.gameObject.SetActive(true);
            choiceView.gameObject.SetActive(false);
            App.Flow.CreatePrivate();
        }

        void Type(char c)
        {
            if (joining) return;
            c = char.ToUpperInvariant(c);
            if (!RoomCode.IsAllowedChar(c)) return;
            if (code.Length >= RoomCode.Length) return;
            code.Append(c);
            error.text = "";
            RefreshCode();
            Tween.Punch(boxes[code.Length - 1].transform, 0.1f, 0.2f);
            if (code.Length == RoomCode.Length) Join();
        }

        void Delete()
        {
            if (joining || code.Length == 0) return;
            code.Length--;
            error.text = "";
            RefreshCode();
        }

        void RefreshCode()
        {
            for (int i = 0; i < RoomCode.Length; i++)
            {
                bool filled = i < code.Length;
                boxText[i].text = filled ? code[i].ToString() : "";
                bool cursor = i == code.Length;
                boxes[i].color = cursor ? Theme.SurfaceHover : filled ? Theme.SurfaceRaised : Theme.Surface;
            }
            joinButton.Interactable = code.Length == RoomCode.Length && !joining;
        }

        void Join()
        {
            if (joining || code.Length != RoomCode.Length) return;
            joining = true;
            waitTimeout = Time.unscaledTime + 10f;
            joinButton.Interactable = false;
            joinButton.SetLabel("JOINING...");
            App.Flow.JoinPrivate(code.ToString());
        }

        void OnError(ErrorMsg e)
        {
            if (creating)
            {
                creating = false;
                spinner.gameObject.SetActive(false);
                ShowChoice();
                UI.Toast(RoomCommands.ErrorText(e.code), ToastKind.Error);
                return;
            }
            if (!joining) return;
            ShowJoinError(e.code == "OFFLINE" ? "NO CONNECTION TO THE SERVER" : RoomCommands.ErrorText(e.code));
        }

        void ShowJoinError(string text)
        {
            joining = false;
            joinButton.SetLabel("JOIN");
            error.text = text;
            UIFeedback.Play(Sfx.Wrong);
            Tween.Shake(codeRow, 18f, 0.4f);
            RefreshCode();
        }

        void Update()
        {
            if ((joining || creating) && Time.unscaledTime > waitTimeout)
            {
                bool offline = App.Net.OnlineStatus != ConnectionStatus.Connected;
                if (joining) ShowJoinError(offline ? "NO CONNECTION TO THE SERVER" : "NO ANSWER FROM THE SERVER");
                if (creating)
                {
                    creating = false;
                    spinner.gameObject.SetActive(false);
                    ShowChoice();
                    UI.Toast(offline ? "NO CONNECTION TO THE SERVER" : "NO ANSWER FROM THE SERVER", ToastKind.Error);
                }
            }
        }

        public override bool OnBack()
        {
            if (joinView.gameObject.activeSelf && !joining)
            {
                ShowChoice();
                return true;
            }
            App.Flow.EnterMainMenu();
            return true;
        }

        public override void OnKey(KeyCode key)
        {
            if (!joinView.gameObject.activeSelf) return;
            if (key == KeyCode.Backspace) Delete();
            else if (key == KeyCode.Return) Join();
        }

        public override void OnText(char c)
        {
            if (joinView.gameObject.activeSelf) Type(c);
        }
    }
}
