using System;
using BarberSimulator.Input;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// On-screen controls for touch devices: dynamic joystick (left), look area (right), contextual USE button and
    /// pause button. Every control routes into <see cref="InputService"/>, never into gameplay directly.
    /// </summary>
    public sealed class TouchControlsView : MonoBehaviour
    {
        private VirtualJoystick _joystick;
        private CanvasGroup _group;
        private CanvasGroup _useGroup;
        private Text _useLabel;
        private Image _useIcon;
        private bool _useVisible;
        private float _useAlpha;

        public void Build(UIFactory f, InputService input, Action clickSound)
        {
            var root = (RectTransform)transform;
            UIFactory.Stretch(root);
            _group = f.Group(root);

            // Look area: whole screen, below everything else so buttons and joystick take priority.
            var look = UIFactory.Rect("Look Area", root);
            UIFactory.Stretch(look);
            UIFactory.HitArea(look);
            look.gameObject.AddComponent<TouchLookArea>().Configure(input.Touch);

            // Joystick region: bottom-left ~40% x 65%.
            var region = UIFactory.Rect("Joystick Region", root);
            region.anchorMin = new Vector2(0f, 0f);
            region.anchorMax = new Vector2(0.42f, 0.68f);
            region.offsetMin = Vector2.zero;
            region.offsetMax = Vector2.zero;
            UIFactory.HitArea(region);

            var visuals = UIFactory.Rect("Joystick", region);
            UIFactory.Anchor(visuals, Vector2.zero, new Vector2(0.5f, 0.5f), new Vector2(210f, 200f), new Vector2(220f, 220f));
            var visualGroup = f.Group(visuals, 0.4f);
            visualGroup.blocksRaycasts = false;
            var ring = f.Image("Ring", visuals, f.Theme.joystickRing, new Color(1f, 1f, 1f, 0.85f));
            UIFactory.Stretch(ring.rectTransform);
            var knob = f.Image("Knob", visuals, f.Theme.joystickKnob, new Color(1f, 0.97f, 0.92f, 0.9f));
            UIFactory.Anchor(knob.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(88f, 88f));

            _joystick = region.gameObject.AddComponent<VirtualJoystick>();
            _joystick.Configure(input.Touch, visuals, knob.rectTransform, visualGroup, 84f);

            // Contextual USE button, bottom-right.
            var use = UIFactory.Rect("Use Button", root);
            UIFactory.Anchor(use, new Vector2(1f, 0f), new Vector2(0.5f, 0.5f), new Vector2(-190f, 210f), new Vector2(150f, 150f));
            _useGroup = f.Group(use, 0f);
            var useBg = f.Image("Background", use, f.Theme.circleSolid, new Color(0.06f, 0.05f, 0.045f, 0.62f), raycast: true);
            UIFactory.Stretch(useBg.rectTransform);
            var useRing = f.Image("Ring", use, f.Theme.joystickRing, new Color(f.Theme.accent.r, f.Theme.accent.g, f.Theme.accent.b, 0.9f));
            UIFactory.Stretch(useRing.rectTransform);
            _useIcon = f.Image("Icon", use, f.Theme.iconHand, f.Theme.textPrimary);
            UIFactory.Anchor(_useIcon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 14f), new Vector2(52f, 52f));
            _useLabel = f.Label("Verb", use, f.Theme.semiBoldFont, 20, f.Theme.textPrimary, TextAnchor.MiddleCenter);
            UIFactory.Anchor(_useLabel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -34f), new Vector2(140f, 30f));
            UIFactory.Spacing(_useLabel, 2f);
            var useButton = use.gameObject.AddComponent<Button>();
            useButton.transition = Selectable.Transition.None;
            useButton.targetGraphic = useBg;
            useButton.onClick.AddListener(() =>
            {
                input.RequestInteract();
                StartCoroutine(UIAnimation.Scale(use, Vector3.one * 0.9f, Vector3.one, 0.22f, overshoot: true));
            });

            // Pause button, top-right corner.
            var pause = UIFactory.Rect("Pause Button", root);
            UIFactory.Anchor(pause, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-20f, -20f), new Vector2(84f, 84f));
            var pauseBg = f.Image("Background", pause, f.Theme.circleSolid, new Color(0.06f, 0.05f, 0.045f, 0.5f), raycast: true);
            UIFactory.Stretch(pauseBg.rectTransform);
            var pauseIcon = f.Image("Icon", pause, f.Theme.iconPause, f.Theme.textPrimary);
            UIFactory.Anchor(pauseIcon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(36f, 36f));
            var pauseButton = pause.gameObject.AddComponent<Button>();
            pauseButton.transition = Selectable.Transition.None;
            pauseButton.onClick.AddListener(() =>
            {
                clickSound?.Invoke();
                input.RequestPause();
            });

            UIAnimation.SetVisible(_useGroup, false);
        }

        public void ApplySettings(float opacity, bool dynamicJoystick)
        {
            _joystick.ApplySettings(opacity, dynamicJoystick);
        }

        public void SetUse(bool visible, string verb)
        {
            _useVisible = visible;
            if (visible) _useLabel.text = verb.ToUpperInvariant();
            _useGroup.interactable = visible;
            _useGroup.blocksRaycasts = visible;
        }

        private void Update()
        {
            _useAlpha = Mathf.MoveTowards(_useAlpha, _useVisible ? 1f : 0f, Time.unscaledDeltaTime / 0.15f);
            _useGroup.alpha = _useAlpha;
        }
    }
}
