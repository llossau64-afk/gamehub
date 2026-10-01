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
        [Tooltip("VIP customers: gold name tag and label.")]
        public Color vip = new Color(1f, 0.82f, 0.28f);
        [Tooltip("Streak badge and its flame.")]
        public Color flame = new Color(1f, 0.5f, 0.16f);

        [Header("Menu palette")]
        [Tooltip("Barber pole red (#A83A32). Selected indicators, the primary action and the logo stripe.")]
        public Color barberRed = new Color(0.659f, 0.227f, 0.196f);
        [Tooltip("Barber pole blue (#2F4A6B). Logo stripe and quiet secondary accents.")]
        public Color barberBlue = new Color(0.184f, 0.290f, 0.420f);
        [Tooltip("Warm black used for the menu panels.")]
        public Color panelSolid = new Color(0.067f, 0.059f, 0.053f, 0.97f);
        [Tooltip("Slightly lifted charcoal for cards and keycaps.")]
        public Color panelRaised = new Color(0.118f, 0.104f, 0.092f, 1f);
        [Tooltip("Dark leather brown for locked card medallions and subtle fills.")]
        public Color leather = new Color(0.20f, 0.14f, 0.10f, 1f);

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
