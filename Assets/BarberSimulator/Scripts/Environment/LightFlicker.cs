using UnityEngine;

namespace BarberSimulator.Environment
{
    /// <summary>Very subtle intensity drift; an old fluorescent tube or tired bulb, never a strobe.</summary>
    public sealed class LightFlicker : AmbientMotion
    {
        [SerializeField] private Light target;
        [SerializeField] private Renderer emissiveRenderer;
        [SerializeField, Range(0f, 0.5f)] private float amount = 0.06f;
        [SerializeField] private float speed = 1.3f;
        [SerializeField, Range(0f, 1f)] private float dropoutChance = 0.002f;

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");
        private float _baseIntensity;
        private float _seed;
        private float _dropout;
        private Color _baseEmission;
        private MaterialPropertyBlock _block;

        public void Configure(Light lightSource, Renderer emissive, float flickerAmount, float flickerSpeed, float dropout)
        {
            target = lightSource;
            emissiveRenderer = emissive;
            amount = flickerAmount;
            speed = flickerSpeed;
            dropoutChance = dropout;
        }

        private void Awake()
        {
            _seed = Random.value * 50f;
            if (target != null) _baseIntensity = target.intensity;
            if (emissiveRenderer != null && emissiveRenderer.sharedMaterial != null && emissiveRenderer.sharedMaterial.HasProperty(EmissionColorId))
                _baseEmission = emissiveRenderer.sharedMaterial.GetColor(EmissionColorId);
        }

        public override void Tick(float time, float deltaTime)
        {
            if (Random.value < dropoutChance) _dropout = 1f;
            _dropout = Mathf.MoveTowards(_dropout, 0f, deltaTime * 9f);

            float noise = Mathf.PerlinNoise(time * speed, _seed) - 0.5f;
            float factor = 1f + noise * 2f * amount - _dropout * 0.35f;

            if (target != null) target.intensity = _baseIntensity * factor;
            if (emissiveRenderer != null)
            {
                if (_block == null) _block = new MaterialPropertyBlock();
                _block.SetColor(EmissionColorId, _baseEmission * factor);
                emissiveRenderer.SetPropertyBlock(_block);
            }
        }
    }
}
