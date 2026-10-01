using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Adapts the CanvasScaler to the browser window: height-matched on landscape/ultrawide, width-matched on
    /// narrow or portrait windows, and slightly larger on small touch screens so tap targets stay comfortable.
    /// </summary>
    [RequireComponent(typeof(CanvasScaler))]
    public sealed class ResponsiveCanvasScaler : MonoBehaviour
    {
        private CanvasScaler _scaler;
        private Vector2Int _last;
        private bool _touchMode;

        public float Aspect { get; private set; }

        private void Awake()
        {
            _scaler = GetComponent<CanvasScaler>();
            _scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            _scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            Apply();
        }

        public void SetTouchMode(bool touch)
        {
            if (_touchMode == touch) return;
            _touchMode = touch;
            Apply();
        }

        private void Update()
        {
            if (_last.x != Screen.width || _last.y != Screen.height) Apply();
        }

        private void Apply()
        {
            _last = new Vector2Int(Screen.width, Screen.height);
            Aspect = Screen.height > 0 ? (float)Screen.width / Screen.height : 16f / 9f;

            // 16:9 and wider -> match height. Narrower (16:10, 4:3, portrait) -> blend towards width so the
            // left menu column never runs off-screen.
            float match = Mathf.InverseLerp(1.0f, 1.7f, Aspect);
            _scaler.matchWidthOrHeight = match;

            // Phones in landscape have ~400 px tall logical screens; scale reference down to enlarge the UI a bit.
            float reference = 1080f;
            if (_touchMode)
            {
                float dpi = Screen.dpi > 0f ? Screen.dpi : 160f;
                float physicalHeightInches = Screen.height / dpi;
                if (physicalHeightInches < 3.6f) reference = 900f;
            }
            _scaler.referenceResolution = new Vector2(reference * 16f / 9f, reference);
        }
    }
}
