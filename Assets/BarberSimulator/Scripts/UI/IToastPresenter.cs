namespace BarberSimulator.UI
{
    /// <summary>Short, unobtrusive messages ("Locked for now", "+$25").</summary>
    public interface IToastPresenter
    {
        void ShowToast(string text);
    }
}
