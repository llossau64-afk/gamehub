using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Asks phone players in portrait to rotate; the game is designed for landscape.</summary>
    public sealed class OrientationHint : MonoBehaviour
    {
        private CanvasGroup _group;
        private bool _touchDevice;

        public void Build(UIFactory f)
        {
            var root = (RectTransform)transform;
            UIFactory.Stretch(root);
            _group = f.Group(root, 0f);

            var dim = f.Image("Dim", root, null, new Color(0.04f, 0.035f, 0.03f, 0.94f), raycast: true);
            UIFactory.Stretch(dim.rectTransform);

            // Simple phone glyph turned sideways: accent body with a dark screen.
            var phone = f.Image("Phone", root, f.Theme.roundedRect, f.Theme.accent);
            UIFactory.Anchor(phone.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 100f), new Vector2(84f, 146f));
            phone.rectTransform.localRotation = Quaternion.Euler(0f, 0f, -90f);
            var screen = f.Image("Screen", phone.rectTransform, f.Theme.roundedRect, new Color(0.04f, 0.035f, 0.03f, 1f));
            UIFactory.Stretch(screen.rectTransform, 7f, 7f, 14f, 14f);

            var text = f.Label("Text", root, f.Theme.mediumFont, 40, f.Theme.textPrimary, TextAnchor.MiddleCenter, "hint.rotate_device");
            UIFactory.Anchor(text.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -70f), new Vector2(900f, 160f));

            _touchDevice = Application.isMobilePlatform;
            UIAnimation.SetVisible(_group, false);
        }

        private void Update()
        {
            bool show = _touchDevice && Screen.height > Screen.width * 1.05f;
            float target = show ? 1f : 0f;
            if (Mathf.Approximately(_group.alpha, target)) return;
            _group.alpha = Mathf.MoveTowards(_group.alpha, target, Time.unscaledDeltaTime * 4f);
            _group.blocksRaycasts = _group.alpha > 0.5f;
        }
    }
}
