using UnityEngine;

namespace BarberSimulator.Customers
{
    /// <summary>Pools of localized line keys; one is picked at random so customers don't repeat themselves.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Customers/Dialogue Set", fileName = "CustomerDialogue")]
    public sealed class CustomerDialogueSet : ScriptableObject
    {
        public string[] greetings = { };
        public string[] afterAgree = { };
        public string[] afterWait = { };
        public string[] waitingForChair = { };
        public string[] reactionGreat = { };
        public string[] reactionOkay = { };
        public string[] reactionBad = { };
        public string[] leaveImpatient = { };
        public string[] thanks = { };

        public static string Pick(string[] pool, System.Random rng) => pool != null && pool.Length > 0 ? pool[rng.Next(pool.Length)] : string.Empty;
    }
}
