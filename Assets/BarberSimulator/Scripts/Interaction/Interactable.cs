using BarberSimulator.Audio;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>
    /// Base component for interactables: subtle highlight while focused (brightens the base colour through a
    /// MaterialPropertyBlock, so materials stay shared) and access to shared services.
    /// </summary>
    public abstract class Interactable : MonoBehaviour, IInteractable, IFocusable
    {
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");

        [SerializeField] private Renderer[] highlightRenderers;
        [SerializeField] private float highlightBoost = 0.22f;

        private MaterialPropertyBlock _block;
        private Color[] _baseColors;
        private float _highlight;
        private float _highlightTarget;

        protected InteractionServices Services { get; private set; }

        public void Bind(InteractionServices services)
        {
            Services = services;
            OnBound();
        }

        protected virtual void OnBound() { }

        public void SetHighlightRenderers(Renderer[] renderers)
        {
            highlightRenderers = renderers;
        }

        public abstract bool CanInteract(InteractionContext context);
        public abstract InteractionPrompt GetPrompt(InteractionContext context);
        public abstract void Interact(InteractionContext context);

        public virtual void OnFocusGained()
        {
            _highlightTarget = 1f;
            enabled = true;
        }

        public virtual void OnFocusLost()
        {
            _highlightTarget = 0f;
            enabled = true;
        }

        /// <summary>Objects whose renderers are already tinted through property blocks (characters) opt out.</summary>
        protected virtual bool UsesHighlight => true;

        protected virtual void Awake()
        {
            if (!UsesHighlight) highlightRenderers = new Renderer[0];
            else if (highlightRenderers == null || highlightRenderers.Length == 0)
                highlightRenderers = GetComponentsInChildren<Renderer>();

            _baseColors = new Color[highlightRenderers.Length];
            for (int i = 0; i < highlightRenderers.Length; i++)
            {
                var material = highlightRenderers[i] != null ? highlightRenderers[i].sharedMaterial : null;
                _baseColors[i] = material != null && material.HasProperty(BaseColorId) ? material.GetColor(BaseColorId) : Color.white;
            }

            // Only ticks while a highlight transition is running.
            enabled = false;
        }

        protected virtual void Update()
        {
            _highlight = Mathf.MoveTowards(_highlight, _highlightTarget, Time.unscaledDeltaTime * 5f);
            ApplyHighlight(Easing.SmoothStep(_highlight));
            if (Mathf.Approximately(_highlight, _highlightTarget)) enabled = false;
        }

        private void ApplyHighlight(float amount)
        {
            if (_block == null) _block = new MaterialPropertyBlock();
            for (int i = 0; i < highlightRenderers.Length; i++)
            {
                var r = highlightRenderers[i];
                if (r == null) continue;
                if (amount <= 0.001f)
                {
                    r.SetPropertyBlock(null);
                    continue;
                }
                var c = _baseColors[i];
                var lifted = Color.Lerp(c, Color.white, highlightBoost * amount);
                lifted *= 1f + highlightBoost * 0.6f * amount;
                lifted.a = c.a;
                _block.SetColor(BaseColorId, lifted);
                r.SetPropertyBlock(_block);
            }
        }

        protected void ClearHighlight()
        {
            _highlight = _highlightTarget = 0f;
            ApplyHighlight(0f);
        }
    }

    /// <summary>Services interactables are allowed to use. Passed in once by the shop when the scene starts.</summary>
    public sealed class InteractionServices
    {
        public AudioService Audio;
        public Objectives.ObjectiveService Objectives;
        public Save.SaveService Save;
        public UI.IToastPresenter Toasts;
        public Localization.LocalizationService Localization;
    }
}
