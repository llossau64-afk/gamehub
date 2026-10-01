using UnityEngine;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Every font, colour and sprite the UI uses. Views never hardcode styling, so the look can be
    /// tuned in one asset.
    /// </summary>
    [CreateAssetMenu(menuName = "Barber Simulator/UI/Theme", fileName = "UITheme")]
    public sealed class UITheme : ScriptableObject
    {
        [Header("Fonts")]
        public Font displayFont;
        public Font bodyFont;
        public Font mediumFont;
        public Font semiBoldFont;

        [Header("Colours")]
        public Color textPrimary = new Color(0.93f, 0.89f, 0.82f);
        public Color textMuted = new Color(0.66f, 0.62f, 0.56f);
        public Color textDisabled = new Color(0.45f, 0.42f, 0.38f, 0.8f);
        public Color accent = new Color(0.79f, 0.64f, 0.38f);
        public Color accentDeep = new Color(0.55f, 0.18f, 0.14f);
        public Color panel = new Color(0.06f, 0.05f, 0.045f, 0.88f);
        public Color panelLine = new Color(1f, 0.95f, 0.85f, 0.12f);
        public Color shadow = new Color(0f, 0f, 0f, 0.55f);

        [Header("Sprites")]
        public Sprite roundedRect;
        public Sprite circleSolid;
        public Sprite circleSoft;
        public Sprite gradientLeft;
        public Sprite gradientBottom;
        public Sprite vignette;
        public Sprite joystickRing;
        public Sprite joystickKnob;
        public Sprite crosshairDot;
        public Sprite iconHand;
        public Sprite iconPause;
        public Sprite iconGear;
        public Sprite iconCheck;
        public Sprite iconScissors;
        public Sprite iconStar;

        [Header("Motion")]
        [Tooltip("Hover / tap response time in seconds (150-250 ms).")]
        public float hoverDuration = 0.18f;
        public float panelFadeDuration = 0.35f;
    }
}
