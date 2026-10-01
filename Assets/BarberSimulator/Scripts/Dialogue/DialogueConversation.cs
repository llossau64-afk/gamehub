using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Dialogue
{
    [CreateAssetMenu(menuName = "Barber Simulator/Dialogue/Conversation", fileName = "Conversation")]
    public sealed class DialogueConversation : ScriptableObject
    {
        [SerializeField] private string conversationId;
        [SerializeField] private List<DialogueLine> lines = new List<DialogueLine>();

        public string ConversationId => conversationId;
        public IReadOnlyList<DialogueLine> Lines => lines;

        public void Configure(string id, List<DialogueLine> conversationLines)
        {
            conversationId = id;
            lines = conversationLines;
        }
    }
}
