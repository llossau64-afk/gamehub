namespace BarberSimulator.Dialogue
{
    /// <summary>Presentation of a single line. Implemented by the UI layer.</summary>
    public interface IDialogueView
    {
        void ShowLine(string speakerName, UnityEngine.Color nameColor, UnityEngine.Sprite portrait, string text);
        void HideLine();
        /// <summary>True while text is still being revealed.</summary>
        bool IsRevealing { get; }
        void CompleteReveal();
    }
}
