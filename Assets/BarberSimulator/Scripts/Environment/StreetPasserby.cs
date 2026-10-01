using UnityEngine;

namespace BarberSimulator.Environment
{
    /// <summary>
    /// Soft silhouettes walking past the shop window. Each walker is a camera-facing quad that slides
    /// between two x positions with a light step bob, then waits a random time before the next pass.
    /// </summary>
    public sealed class StreetPasserby : AmbientMotion
    {
        [SerializeField] private Transform[] walkers;
        [SerializeField] private float minX = -9f;
        [SerializeField] private float maxX = 9f;
        [SerializeField] private Vector2 speedRange = new Vector2(1.1f, 1.6f);
        [SerializeField] private Vector2 waitRange = new Vector2(3f, 9f);

        private float[] _speed;
        private float[] _wait;
        private float[] _baseY;
        private int[] _direction;

        public void Configure(Transform[] walkerTransforms, float xMin, float xMax)
        {
            walkers = walkerTransforms;
            minX = xMin;
            maxX = xMax;
        }

        private void Awake()
        {
            int n = walkers.Length;
            _speed = new float[n];
            _wait = new float[n];
            _baseY = new float[n];
            _direction = new int[n];
            for (int i = 0; i < n; i++)
            {
                _baseY[i] = walkers[i].localPosition.y;
                _wait[i] = Random.Range(0f, waitRange.y);
                Restart(i);
            }
        }

        private void Restart(int i)
        {
            _direction[i] = Random.value > 0.5f ? 1 : -1;
            _speed[i] = Random.Range(speedRange.x, speedRange.y);
            var p = walkers[i].localPosition;
            p.x = _direction[i] > 0 ? minX : maxX;
            walkers[i].localPosition = p;
            var s = walkers[i].localScale;
            s.x = Mathf.Abs(s.x) * _direction[i];
            walkers[i].localScale = s;
        }

        public override void Tick(float time, float deltaTime)
        {
            for (int i = 0; i < walkers.Length; i++)
            {
                if (_wait[i] > 0f)
                {
                    _wait[i] -= deltaTime;
                    walkers[i].gameObject.SetActive(false);
                    continue;
                }

                var w = walkers[i];
                if (!w.gameObject.activeSelf) w.gameObject.SetActive(true);

                var p = w.localPosition;
                p.x += _direction[i] * _speed[i] * deltaTime;
                p.y = _baseY[i] + Mathf.Abs(Mathf.Sin(time * _speed[i] * 3.6f)) * 0.03f;
                w.localPosition = p;

                if (p.x > maxX || p.x < minX)
                {
                    _wait[i] = Random.Range(waitRange.x, waitRange.y);
                    Restart(i);
                }
            }
        }
    }
}
