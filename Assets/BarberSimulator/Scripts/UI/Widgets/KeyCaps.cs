using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>One line of the controls reference: what it does and how to do it with keyboard + mouse or on touch.</summary>
    public readonly struct ControlEntry
    {
        public readonly string ActionKey;
        public readonly string[] Keys;
        /// <summary>Localization key of the touch gesture; the keys are ignored on touch.</summary>
        public readonly string TouchKey;

        public ControlEntry(string actionKey, string[] keys, string touchKey)
        {
            ActionKey = actionKey;
            Keys = keys;
            TouchKey = touchKey;
        }
    }

    /// <summary>The bindings the game really has (see InputService); shared by the settings screen and How to Play.</summary>
    public static class ControlsReference
    {
        public static readonly ControlEntry Move = new ControlEntry("controls.move", new[] { "W", "A", "S", "D" }, "controls.touch.move");
        public static readonly ControlEntry Look = new ControlEntry("controls.look", new[] { "MOUSE" }, "controls.touch.look");
        public static readonly ControlEntry Interact = new ControlEntry("controls.interact", new[] { "E" }, "controls.touch.interact");
        public static readonly ControlEntry Sprint = new ControlEntry("controls.sprint", new[] { "SHIFT" }, "controls.touch.none");
        public static readonly ControlEntry Pause = new ControlEntry("controls.pause", new[] { "ESC" }, "controls.touch.pause");
        public static readonly ControlEntry Back = new ControlEntry("controls.back", new[] { "ESC" }, "controls.touch.back");
        public static readonly ControlEntry OpenShop = new ControlEntry("controls.open_shop", new[] { "E" }, "controls.touch.open_shop");
        public static readonly ControlEntry Cut = new ControlEntry("controls.cut", new[] { "LMB" }, "controls.touch.cut");
        public static readonly ControlEntry Rotate = new ControlEntry("controls.rotate", new[] { "RMB", "WASD" }, "controls.touch.rotate");
        public static readonly ControlEntry Zoom = new ControlEntry("controls.zoom", new[] { "WHEEL" }, "controls.touch.zoom");
        public static readonly ControlEntry Tools = new ControlEntry("controls.tools", new[] { "1", "2", "3", "4" }, "controls.touch.tools");
        public static readonly ControlEntry Guard = new ControlEntry("controls.guard", new[] { "Q", "E" }, "controls.touch.guard");
        public static readonly ControlEntry Finish = new ControlEntry("controls.finish", new[] { "F" }, "controls.touch.finish");

        /// <summary>Everything, in the order the settings screen lists it.</summary>
        public static readonly ControlEntry[] All =
        {
            Move, Look, Interact, Sprint, OpenShop, Cut, Rotate, Zoom, Tools, Guard, Finish, Pause, Back
        };
    }

    /// <summary>Builds small keycap rows ("W A S D") from plain Images and Texts.</summary>
    public static class KeyCaps
    {
        public const float Height = 36f;

        /// <summary>Returns the row; its width is written to <paramref name="width"/>. Anchored right so it can sit at the end of a line.</summary>
        public static RectTransform Build(UIFactory f, Transform parent, string[] keys, out float width)
        {
            var theme = f.Theme;
            var row = UIFactory.Rect("Keys", parent);
            float x = 0f;
            for (int i = 0; i < keys.Length; i++)
            {
                string key = keys[i];
                float w = Mathf.Max(38f, 16f * key.Length + 22f);
                var cap = f.Image("Key " + key, row, null, theme.panelRaised);
                UIFactory.Anchor(cap.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(x, 0f), new Vector2(w, Height));
                var edge = f.Image("Edge", cap.rectTransform, null, new Color(1f, 0.95f, 0.85f, 0.16f));
                edge.rectTransform.anchorMin = new Vector2(0f, 0f);
                edge.rectTransform.anchorMax = new Vector2(1f, 0f);
                edge.rectTransform.pivot = new Vector2(0.5f, 0f);
                edge.rectTransform.sizeDelta = new Vector2(0f, 3f);
                var text = f.Label("Text", cap.rectTransform, theme.semiBoldFont, 16, theme.textPrimary, TextAnchor.MiddleCenter);
                text.text = key;
                UIFactory.Stretch(text.rectTransform, 0f, 0f, 0f, 1f);
                x += w + 8f;
            }
            width = Mathf.Max(0f, x - 8f);
            row.sizeDelta = new Vector2(width, Height);
            return row;
        }
    }
}
