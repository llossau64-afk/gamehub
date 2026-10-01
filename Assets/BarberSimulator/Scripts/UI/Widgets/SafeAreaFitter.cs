using UnityEngine;

namespace BarberSimulator.UI
{
    /// <summary>Keeps a RectTransform inside Screen.safeArea (notches, rounded corners, home indicators).</summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        [SerializeField] private float minimumMargin = 12f;

        private Rect _lastSafeArea;
        private Vector2Int _lastScreen;
        private RectTransform _rect;

        private void Awake()
        {
            _rect = (RectTransform)transform;
            Apply();
        }

        private void Update()
        {
            if (Screen.safeArea != _lastSafeArea || _lastScreen.x != Screen.width || _lastScreen.y != Screen.height) Apply();
        }

        private void Apply()
        {
            var safe = Screen.safeArea;
            _lastSafeArea = safe;
            _lastScreen = new Vector2Int(Screen.width, Screen.height);
            if (Screen.width <= 0 || Screen.height <= 0) return;

            var min = safe.position;
            var max = safe.position + safe.size;
            min.x = Mathf.Max(min.x, minimumMargin);
            min.y = Mathf.Max(min.y, minimumMargin);
            max.x = Mathf.Min(max.x, Screen.width - minimumMargin);
            max.y = Mathf.Min(max.y, Screen.height - minimumMargin);

            _rect.anchorMin = new Vector2(min.x / Screen.width, min.y / Screen.height);
            _rect.anchorMax = new Vector2(max.x / Screen.width, max.y / Screen.height);
            _rect.offsetMin = Vector2.zero;
            _rect.offsetMax = Vector2.zero;
        }
    }
}
