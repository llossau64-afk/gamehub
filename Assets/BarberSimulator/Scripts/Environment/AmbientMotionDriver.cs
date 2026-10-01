using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Environment
{
    /// <summary>Single Update loop for every fan, barber pole, flicker and passer-by in the scene.</summary>
    public sealed class AmbientMotionDriver : MonoBehaviour
    {
        [SerializeField] private List<AmbientMotion> motions = new List<AmbientMotion>();

        public void SetMotions(List<AmbientMotion> list)
        {
            motions = list;
        }

        private void Update()
        {
            float time = Time.time;
            float dt = Time.deltaTime;
            for (int i = 0; i < motions.Count; i++)
            {
                var motion = motions[i];
                if (motion != null && motion.isActiveAndEnabled) motion.Tick(time, dt);
            }
        }
    }
}
