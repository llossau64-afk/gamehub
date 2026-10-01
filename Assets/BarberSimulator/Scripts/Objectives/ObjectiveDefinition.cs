using UnityEngine;

namespace BarberSimulator.Objectives
{
    /// <summary>
    /// One step of the guided progression. Progress is driven by string signals (see <see cref="ObjectiveSignals"/>)
    /// so gameplay objects never need to know which objective is active.
    /// </summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Objectives/Objective", fileName = "Objective")]
    public sealed class ObjectiveDefinition : ScriptableObject
    {
        [SerializeField] private string objectiveId;
        [SerializeField] private string titleKey;
        [Tooltip("Optional hint shown once when the objective starts (if tutorial hints are enabled).")]
        [SerializeField] private string hintKey;
        [SerializeField] private string signal;
        [SerializeField, Min(1)] private int targetCount = 1;
        [SerializeField] private int rewardMoney;

        public string ObjectiveId => objectiveId;
        public string TitleKey => titleKey;
        public string HintKey => hintKey;
        public string Signal => signal;
        public int TargetCount => targetCount;
        public int RewardMoney => rewardMoney;

        public void Configure(string id, string title, string hint, string progressSignal, int target, int reward)
        {
            objectiveId = id;
            titleKey = title;
            hintKey = hint;
            signal = progressSignal;
            targetCount = Mathf.Max(1, target);
            rewardMoney = reward;
        }
    }
}
