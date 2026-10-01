using System;
using BarberSimulator.Input;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>
    /// Camera-centre probe that finds the focused <see cref="IInteractable"/>. Input (E key or touch button)
    /// arrives through <see cref="InputService.InteractPressed"/>, so there is one code path for every device.
    /// </summary>
    public sealed class Interactor : MonoBehaviour
    {
        [SerializeField] private float range = 2.3f;
        [SerializeField] private float probeRadius = 0.06f;
        [SerializeField] private LayerMask mask = ~0;

        private readonly RaycastHit[] _hits = new RaycastHit[8];
        private InputService _input;
        private InteractionContext _context;
        private IInteractable _focused;
        private InteractionPrompt _lastPrompt;
        private bool _lastCanInteract;
        private bool _active;

        public IInteractable Focused => _focused;

        /// <summary>(interactable or null, prompt, can interact)</summary>
        public event Action<IInteractable, InteractionPrompt, bool> FocusChanged;
        public event Action<IInteractable> Interacted;

        public void Initialize(InputService input, InteractionContext context)
        {
            _input = input;
            _context = context;
            _input.InteractPressed += OnInteractPressed;
        }

        private void OnDestroy()
        {
            if (_input != null) _input.InteractPressed -= OnInteractPressed;
        }

        public void SetActive(bool active)
        {
            _active = active;
            if (!active) SetFocus(null);
        }

        private void Update()
        {
            if (!_active || _context == null || _context.Camera == null) return;

            var camTransform = _context.Camera.transform;
            var ray = new Ray(camTransform.position, camTransform.forward);
            var found = Probe(ray);

            if (found != _focused)
            {
                SetFocus(found);
            }
            else if (_focused != null)
            {
                // Prompts can change while focused (door opened, object became unavailable).
                var prompt = _focused.GetPrompt(_context);
                bool can = _focused.CanInteract(_context);
                if (prompt.Verb != _lastPrompt.Verb || prompt.LabelKey != _lastPrompt.LabelKey || can != _lastCanInteract)
                {
                    _lastPrompt = prompt;
                    _lastCanInteract = can;
                    FocusChanged?.Invoke(_focused, prompt, can);
                }
            }
        }

        private IInteractable Probe(Ray ray)
        {
            int count = Physics.SphereCastNonAlloc(ray, probeRadius, _hits, range, mask, QueryTriggerInteraction.Collide);
            IInteractable best = null;
            float bestDistance = float.MaxValue;
            float blockerDistance = float.MaxValue;

            for (int i = 0; i < count; i++)
            {
                var hit = _hits[i];
                if (hit.collider.transform.IsChildOf(_context.Player)) continue;

                var interactable = hit.collider.GetComponentInParent<IInteractable>();
                if (interactable == null)
                {
                    if (!hit.collider.isTrigger && hit.distance < blockerDistance) blockerDistance = hit.distance;
                    continue;
                }

                if (hit.distance < bestDistance)
                {
                    best = interactable;
                    bestDistance = hit.distance;
                }
            }

            // Walls between the camera and the object block interaction.
            return bestDistance <= blockerDistance + 0.05f ? best : null;
        }

        private void SetFocus(IInteractable target)
        {
            if (_focused is IFocusable oldFocusable && (_focused as UnityEngine.Object) != null) oldFocusable.OnFocusLost();
            _focused = target;

            if (_focused != null)
            {
                if (_focused is IFocusable newFocusable) newFocusable.OnFocusGained();
                _lastPrompt = _focused.GetPrompt(_context);
                _lastCanInteract = _focused.CanInteract(_context);
                FocusChanged?.Invoke(_focused, _lastPrompt, _lastCanInteract);
            }
            else
            {
                FocusChanged?.Invoke(null, default, false);
            }
        }

        private void OnInteractPressed()
        {
            if (!_active || _focused == null) return;
            if (_focused is UnityEngine.Object unityObject && unityObject == null)
            {
                SetFocus(null);
                return;
            }
            if (!_focused.CanInteract(_context)) return;

            _focused.Interact(_context);
            Interacted?.Invoke(_focused);
        }
    }
}
