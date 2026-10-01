using System;
using System.Collections.Generic;
using BarberSimulator.Haircut;

namespace BarberSimulator.Barber
{
    /// <summary>Barber mode HUD contract (implemented by the UI layer).</summary>
    public interface IBarberModeView
    {
        event Action<int> ToolClicked;
        event Action<int> GuardClicked;
        event Action FinishClicked;
        event Action BackClicked;
        event Action FinishConfirmed;

        void Open(string customerName, string requestName, IReadOnlyList<string> checklistKeys, IReadOnlyList<BarberToolDefinition> tools, bool touch, bool isVip = false);
        void Close();
        void SetSelectedTool(int index, BarberToolDefinition tool);
        void SetGuards(string[] labels, int selected);
        void SetChecklist(Dictionary<string, int> status);
        void SetHint(string text);
        void SetAim(bool onHead, bool cutting);
        void SetTouchMode(bool touch);
        void AskFinishConfirmation();
    }
}
