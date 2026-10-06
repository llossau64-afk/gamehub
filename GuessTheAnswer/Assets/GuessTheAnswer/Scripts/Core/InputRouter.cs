using GuessTheAnswer.UI;
using UnityEngine;

namespace GuessTheAnswer.Core
{
    /// <summary>
    /// Keyboard support for desktop: 1-4 answers, Q W E R jokers, ESC back/menu, Enter confirm, typing for codes and
    /// names. Mouse and touch go through the EventSystem. Only a fixed list of keys is polled each frame.
    /// </summary>
    public sealed class InputRouter
    {
        static readonly KeyCode[] Keys =
        {
            KeyCode.Alpha1, KeyCode.Alpha2, KeyCode.Alpha3, KeyCode.Alpha4,
            KeyCode.Keypad1, KeyCode.Keypad2, KeyCode.Keypad3, KeyCode.Keypad4,
            KeyCode.Q, KeyCode.W, KeyCode.E, KeyCode.R,
            KeyCode.Escape, KeyCode.Return, KeyCode.KeypadEnter, KeyCode.Backspace, KeyCode.Space,
        };

        public void Poll(UIManager ui)
        {
            for (int i = 0; i < Keys.Length; i++)
            {
                if (Input.GetKeyDown(Keys[i])) ui.HandleKey(Normalize(Keys[i]));
            }

            string typed = Input.inputString;
            if (string.IsNullOrEmpty(typed)) return;
            for (int i = 0; i < typed.Length; i++)
            {
                char c = typed[i];
                if (char.IsLetterOrDigit(c)) ui.HandleText(c);
            }
        }

        static KeyCode Normalize(KeyCode key)
        {
            switch (key)
            {
                case KeyCode.Keypad1: return KeyCode.Alpha1;
                case KeyCode.Keypad2: return KeyCode.Alpha2;
                case KeyCode.Keypad3: return KeyCode.Alpha3;
                case KeyCode.Keypad4: return KeyCode.Alpha4;
                case KeyCode.KeypadEnter: return KeyCode.Return;
                default: return key;
            }
        }

        /// <summary>0-3 for the answer keys, -1 otherwise.</summary>
        public static int AnswerIndex(KeyCode key)
        {
            switch (key)
            {
                case KeyCode.Alpha1: return 0;
                case KeyCode.Alpha2: return 1;
                case KeyCode.Alpha3: return 2;
                case KeyCode.Alpha4: return 3;
                default: return -1;
            }
        }

        /// <summary>Q W E R → 50/50, +8 SEC, TEAM VOTE, STEAL slot (0-3), -1 otherwise.</summary>
        public static int JokerSlot(KeyCode key)
        {
            switch (key)
            {
                case KeyCode.Q: return 0;
                case KeyCode.W: return 1;
                case KeyCode.E: return 2;
                case KeyCode.R: return 3;
                default: return -1;
            }
        }
    }
}
