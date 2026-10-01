using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Objectives
{
    [CreateAssetMenu(menuName = "Barber Simulator/Objectives/Objective Sequence", fileName = "ObjectiveSequence")]
    public sealed class ObjectiveSequence : ScriptableObject
    {
        [SerializeField] private List<ObjectiveDefinition> objectives = new List<ObjectiveDefinition>();
        [Tooltip("Objective-panel text once every objective is done.")]
        [SerializeField] private string completedTitleKey;

        public IReadOnlyList<ObjectiveDefinition> Objectives => objectives;
        public string CompletedTitleKey => completedTitleKey;

        public void Configure(List<ObjectiveDefinition> list, string completedKey)
        {
            objectives = list;
            completedTitleKey = completedKey;
        }

        public int IndexOf(string objectiveId)
        {
            for (int i = 0; i < objectives.Count; i++)
                if (objectives[i] != null && objectives[i].ObjectiveId == objectiveId) return i;
            return -1;
        }
    }
}
