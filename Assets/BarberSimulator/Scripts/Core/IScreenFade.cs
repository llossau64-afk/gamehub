using System.Collections;

namespace BarberSimulator.Core
{
    /// <summary>A full-screen black overlay. Implemented by the UI layer, consumed by cinematics.</summary>
    public interface IScreenFade
    {
        float Alpha { get; }
        IEnumerator FadeTo(float alpha, float duration);
        void SetAlpha(float alpha);
    }
}
