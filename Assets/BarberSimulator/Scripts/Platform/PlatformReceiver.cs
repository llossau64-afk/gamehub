using UnityEngine;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Persistent scene object that receives the browser's callbacks (JavaScript uses SendMessage by object name)
    /// and ticks the platform service. It survives scene reloads so a running ad is never orphaned.
    /// </summary>
    public sealed class PlatformReceiver : MonoBehaviour
    {
        /// <summary>The JavaScript plugin addresses this GameObject by name.</summary>
        public const string ObjectName = "BarberPlatformReceiver";

        private PlatformServiceBase _owner;

        public static PlatformReceiver Create(PlatformServiceBase owner)
        {
            var go = new GameObject(ObjectName);
            DontDestroyOnLoad(go);
            var receiver = go.AddComponent<PlatformReceiver>();
            receiver._owner = owner;
            return receiver;
        }

        public void EnsureAlive()
        {
            if (!gameObject.activeSelf) gameObject.SetActive(true);
        }

        // Called from JavaScript through SendMessage. Names must match Plugins/WebGL/BarberPlatform.jslib.
        public void OnPlatformInit(string result) => _owner?.ReceiveInit(result);
        public void OnAdStarted(string unused) => _owner?.HandleAdStarted();
        public void OnAdFinished(string unused) => _owner?.HandleAdFinished();
        public void OnAdError(string message) => _owner?.HandleAdError(message);

        private void Update()
        {
            _owner?.ReceiverTick(Time.realtimeSinceStartup);
        }
    }
}
