using UnityEngine;

namespace BarberSimulator.Characters
{
    /// <summary>Authored appearance (story characters such as the previous owner). Customers can use random data instead.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Characters/Appearance", fileName = "Appearance")]
    public sealed class CharacterAppearance : ScriptableObject
    {
        [SerializeField] private CharacterAppearanceData data;

        public CharacterAppearanceData Data => data;

        public void Configure(CharacterAppearanceData appearance)
        {
            data = appearance;
        }
    }
}
