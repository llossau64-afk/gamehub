using UnityEngine;

namespace BarberSimulator.Environment
{
    /// <summary>Base for cheap looping environment motion. Driven by <see cref="AmbientMotionDriver"/>, not by Update.</summary>
    public abstract class AmbientMotion : MonoBehaviour
    {
        public abstract void Tick(float time, float deltaTime);
    }
}
