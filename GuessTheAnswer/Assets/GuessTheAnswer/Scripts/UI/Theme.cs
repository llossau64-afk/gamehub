using GuessTheAnswer.Shared;
using UnityEngine;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// The visual system: one dark palette, one accent colour (quiz-show yellow), team colours, type scale and spacing.
    /// Every screen uses these tokens, so the game looks consistent and is easy to restyle.
    /// </summary>
    public static class Theme
    {
        public static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }

        // Surfaces
        public static readonly Color Background = Hex("#0E1120");
        public static readonly Color BackgroundTop = Hex("#151A33");
        public static readonly Color Surface = Hex("#1A2038");
        public static readonly Color SurfaceRaised = Hex("#232A47");
        public static readonly Color SurfaceHover = Hex("#2B3356");
        public static readonly Color Stroke = Hex("#323B60");
        public static readonly Color Shadow = new Color(0f, 0f, 0f, 0.45f);
        public static readonly Color Scrim = new Color(0.03f, 0.04f, 0.08f, 0.78f);

        // Text
        public static readonly Color Text = Hex("#F3F5FB");
        public static readonly Color TextMuted = Hex("#8E97B8");
        public static readonly Color TextFaint = Hex("#5D6688");
        public static readonly Color TextOnAccent = Hex("#1B1405");

        // Accent and states
        public static readonly Color Accent = Hex("#FFC83D");
        public static readonly Color AccentDark = Hex("#E0A81E");
        public static readonly Color Success = Hex("#2FD27A");
        public static readonly Color Danger = Hex("#FF5468");
        public static readonly Color Warning = Hex("#FF9F43");

        // Teams
        public static readonly Color Red = Hex("#FF4F64");
        public static readonly Color RedDark = Hex("#7A2333");
        public static readonly Color Blue = Hex("#3F8CFF");
        public static readonly Color BlueDark = Hex("#1E3E79");

        public static Color TeamColor(int team) => team == Teams.Blue ? Blue : Red;
        public static Color TeamDark(int team) => team == Teams.Blue ? BlueDark : RedDark;
        public static string TeamName(int team) => team == Teams.Blue ? "TEAM BLUE" : "TEAM RED";

        static readonly Color[] AvatarColors =
        {
            Hex("#FF8A3D"), Hex("#36C5F0"), Hex("#9B6BFF"), Hex("#2FD27A"),
            Hex("#FF5C8A"), Hex("#FFC83D"), Hex("#4DD4C4"), Hex("#FF6B4A"),
        };

        public static Color AvatarColor(int avatar) => AvatarColors[Mathf.Abs(avatar) % AvatarColors.Length];
        public static int AvatarCount => AvatarColors.Length;

        // Type scale (reference resolution 1920x1080)
        public const int TitleSize = 96;
        public const int H1 = 64;
        public const int H2 = 44;
        public const int H3 = 34;
        public const int Body = 28;
        public const int Small = 22;
        public const int Tiny = 18;

        // Shape
        public const float Radius = 22f;
        public const float RadiusSmall = 14f;
        public const float RadiusLarge = 32f;
        public const float Gap = 20f;

        // Motion (seconds)
        public const float Fast = 0.12f;
        public const float Normal = 0.25f;
        public const float Slow = 0.4f;

        static Font bold, semibold, medium;

        public static Font Bold => bold ? bold : bold = LoadFont("Outfit-ExtraBold");
        public static Font SemiBold => semibold ? semibold : semibold = LoadFont("Outfit-SemiBold");
        public static Font Medium => medium ? medium : medium = LoadFont("Outfit-Medium");

        static Font LoadFont(string name)
        {
            var font = Resources.Load<Font>("GTA/Fonts/" + name);
            if (font == null)
            {
                // The built-in font keeps the game readable if the font asset is missing.
                font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            }
            return font;
        }
    }
}
