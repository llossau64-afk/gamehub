using UnityEngine;

namespace BarberSimulator.Dialogue
{
    [CreateAssetMenu(menuName = "Barber Simulator/Dialogue/Speaker", fileName = "Speaker")]
    public sealed class SpeakerDefinition : ScriptableObject
    {
        [SerializeField] private string speakerId;
        [Tooltip("Localization key for the display name.")]
        [SerializeField] private string nameKey;
        [SerializeField] private Color nameColor = new Color(0.86f, 0.71f, 0.45f);
        [Tooltip("Portrait shown next to the subtitle while this speaker talks.")]
        [SerializeField] private Sprite portrait;
        [Tooltip("True for the player character: lines are rendered without a world speaker.")]
        [SerializeField] private bool isPlayer;

        public string SpeakerId => speakerId;
        public string NameKey => nameKey;
        public Color NameColor => nameColor;
        public Sprite Portrait => portrait;
        public bool IsPlayer => isPlayer;

        public void Configure(string id, string displayNameKey, Color color, bool player)
        {
            speakerId = id;
            nameKey = displayNameKey;
            nameColor = color;
            isPlayer = player;
        }

        public void SetPortrait(Sprite face) => portrait = face;
    }
}
