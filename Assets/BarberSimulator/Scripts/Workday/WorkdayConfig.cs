using UnityEngine;

namespace BarberSimulator.Workday
{
    /// <summary>Length of the working day and what it costs to keep the shop.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Workday Config", fileName = "WorkdayConfig")]
    public sealed class WorkdayConfig : ScriptableObject
    {
        [Header("Clock")]
        [Range(0, 23)] public int openingHour = 9;
        [Range(1, 24)] public int closingHour = 18;
        [Tooltip("Real minutes one working day lasts once the shop is open.")]
        [Min(1f)] public float realMinutesPerDay = 9f;
        [Tooltip("After closing time customers still inside get this long to finish before they are sent home.")]
        [Min(10f)] public float closingGraceSeconds = 90f;

        [Header("Rent")]
        [Tooltip("Rent deducted at the end of every day. Rent that cannot be paid is waived (there is no debt).")]
        public int baseRent = 35;
        [Tooltip("Extra rent for every shop level above 1.")]
        public int rentPerLevel = 10;
        [Tooltip("The first day is rent free so the tutorial day cannot go wrong.")]
        public bool firstDayFree = true;

        public float OpeningMinutes => openingHour * 60f;
        public float ClosingMinutes => Mathf.Max(openingHour + 1, closingHour) * 60f;
        /// <summary>Game minutes that pass per real second while the shop is open.</summary>
        public float GameMinutesPerSecond => (ClosingMinutes - OpeningMinutes) / (Mathf.Max(1f, realMinutesPerDay) * 60f);

        public int RentFor(int day, int shopLevel)
        {
            if (firstDayFree && day <= 1) return 0;
            return Mathf.Max(0, baseRent + rentPerLevel * Mathf.Max(0, shopLevel - 1));
        }
    }
}
