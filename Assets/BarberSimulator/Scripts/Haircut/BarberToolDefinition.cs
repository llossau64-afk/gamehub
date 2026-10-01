using UnityEngine;

namespace BarberSimulator.Haircut
{
    public enum BarberToolType
    {
        Clipper,
        Trimmer,
        Scissors,
        Comb,
        Razor,
        HairDryer,
        Spray
    }

    /// <summary>
    /// Data for one tool model. Stats are deliberately few and readable so upgrades are understandable:
    /// speed (how fast it cuts), precision (how tight the cutting area is) and noise.
    /// </summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Haircut/Barber Tool", fileName = "BarberTool")]
    public sealed class BarberToolDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string toolId;
        public string nameKey;
        public BarberToolType type;
        public Sprite icon;
        public GameObject visualPrefab;
        public int price;
        public bool ownedByDefault = true;

        [Header("Cutting")]
        [Tooltip("Centimetres removed per second at full contact (clipper/trimmer).")]
        public float cutSpeed = 6f;
        [Range(0.5f, 1f)] public float precision = 0.8f;
        [Tooltip("Base cutting radius in degrees on the scalp.")]
        public float brushRadius = 11f;
        [Tooltip("Guard lengths in cm. Empty = tool cuts to minimumLength.")]
        public float[] guardLengths = { };
        public string[] guardLabels = { };
        public float minimumLength = 0.05f;
        [Tooltip("Scissors: cm removed per snip.")]
        public float snipAmount = 0.45f;
        [Tooltip("Scissors: shortest length scissors can produce.")]
        public float scissorsFloor = 0.9f;

        [Header("Audio")]
        public AudioClip startClip;
        public AudioClip loopClip;
        public AudioClip cuttingLayerClip;
        public AudioClip stopClip;
        public AudioClip[] actionClips = { };
        [Range(0f, 1f)] public float noise = 0.6f;

        public bool HasGuards => guardLengths != null && guardLengths.Length > 0;
        public bool IsMotorTool => type == BarberToolType.Clipper || type == BarberToolType.Trimmer;

        /// <summary>Effective brush radius: less precise tools spread a little wider.</summary>
        public float EffectiveRadius => brushRadius * Mathf.Lerp(1.25f, 0.9f, precision);
    }
}
