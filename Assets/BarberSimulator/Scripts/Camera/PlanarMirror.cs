using BarberSimulator.Save;
using UnityEngine;
using UnityEngine.Rendering;

namespace BarberSimulator.CameraSystems
{
    /// <summary>
    /// Real planar reflection for the barber mirror. Renders a reflected copy of the main camera into a
    /// half-resolution texture, only while the mirror is visible and close enough. Disabled on Low quality,
    /// where the shader falls back to a dark glass tint.
    /// </summary>
    [RequireComponent(typeof(Renderer))]
    [DefaultExecutionOrder(1000)]
    public sealed class PlanarMirror : MonoBehaviour
    {
        private static readonly int ReflectionTexId = Shader.PropertyToID("_ReflectionTex");
        private static readonly int HasReflectionId = Shader.PropertyToID("_HasReflection");

        [SerializeField] private Camera sourceCamera;
        [SerializeField] private float maxDistance = 9f;
        [SerializeField] private float clipPlaneOffset = 0.02f;
        [SerializeField] private LayerMask reflectLayers = ~0;

        private Renderer _renderer;
        private Camera _mirrorCamera;
        private RenderTexture _texture;
        private MaterialPropertyBlock _block;
        private bool _enabledByQuality = true;
        private float _resolutionScale = 0.5f;
        private bool _renderingMirror;

        public void Configure(Camera cameraToReflect)
        {
            sourceCamera = cameraToReflect;
        }

        public void ApplyQuality(QualityTier tier)
        {
            // A second scene render is the most expensive effect in the game: only High gets the live mirror.
            // Low/Medium use the reflection probe fallback in the shader, which still reads as a mirror.
            _enabledByQuality = tier == QualityTier.High;
            _resolutionScale = 0.6f;
            if (!_enabledByQuality) SetHasReflection(false);
        }

        private void Awake()
        {
            _renderer = GetComponent<Renderer>();
            _block = new MaterialPropertyBlock();

            var go = new GameObject("Mirror Camera");
            go.hideFlags = HideFlags.DontSave;
            go.transform.SetParent(transform, false);
            _mirrorCamera = go.AddComponent<Camera>();
            _mirrorCamera.enabled = false;
            SetHasReflection(false);
        }

        private void OnEnable()
        {
            RenderPipelineManager.beginCameraRendering += OnBeginCamera;
            RenderPipelineManager.endCameraRendering += OnEndCamera;
        }

        private void OnDisable()
        {
            RenderPipelineManager.beginCameraRendering -= OnBeginCamera;
            RenderPipelineManager.endCameraRendering -= OnEndCamera;
            if (_mirrorCamera != null) _mirrorCamera.enabled = false;
        }

        private void OnDestroy()
        {
            if (_texture != null) _texture.Release();
        }

        private void LateUpdate()
        {
            bool shouldRender = _enabledByQuality && sourceCamera != null && _renderer.isVisible &&
                                (sourceCamera.transform.position - transform.position).sqrMagnitude < maxDistance * maxDistance;

            _mirrorCamera.enabled = shouldRender;
            SetHasReflection(shouldRender);
            if (!shouldRender) return;

            EnsureTexture();
            UpdateMirrorCamera();
        }

        private void EnsureTexture()
        {
            int width = Mathf.Max(64, Mathf.RoundToInt(sourceCamera.pixelWidth * _resolutionScale));
            int height = Mathf.Max(64, Mathf.RoundToInt(sourceCamera.pixelHeight * _resolutionScale));
            if (_texture != null && _texture.width == width && _texture.height == height) return;

            if (_texture != null) _texture.Release();
            _texture = new RenderTexture(width, height, 16, RenderTextureFormat.Default)
            {
                name = "Mirror Reflection",
                hideFlags = HideFlags.DontSave
            };
            _mirrorCamera.targetTexture = _texture;
            _renderer.GetPropertyBlock(_block);
            _block.SetTexture(ReflectionTexId, _texture);
            _renderer.SetPropertyBlock(_block);
        }

        private void UpdateMirrorCamera()
        {
            // Mirror plane: the renderer's forward axis faces into the room.
            var normal = transform.forward;
            var point = transform.position;

            _mirrorCamera.CopyFrom(sourceCamera);
            _mirrorCamera.targetTexture = _texture;
            _mirrorCamera.cullingMask = reflectLayers & sourceCamera.cullingMask;
            _mirrorCamera.depth = sourceCamera.depth - 1f;

            float d = -Vector3.Dot(normal, point) - clipPlaneOffset;
            var plane = new Vector4(normal.x, normal.y, normal.z, d);
            var reflection = CalculateReflectionMatrix(plane);

            var sourceTransform = sourceCamera.transform;
            var reflectedPosition = reflection.MultiplyPoint(sourceTransform.position);
            var reflectedForward = reflection.MultiplyVector(sourceTransform.forward);
            var reflectedUp = reflection.MultiplyVector(sourceTransform.up);
            _mirrorCamera.transform.SetPositionAndRotation(reflectedPosition, Quaternion.LookRotation(reflectedForward, reflectedUp));

            _mirrorCamera.worldToCameraMatrix = sourceCamera.worldToCameraMatrix * reflection;

            // Oblique near plane so nothing behind the mirror leaks into the reflection.
            var clipPlane = CameraSpacePlane(_mirrorCamera, point, normal);
            _mirrorCamera.projectionMatrix = sourceCamera.CalculateObliqueMatrix(clipPlane);
        }

        private void OnBeginCamera(ScriptableRenderContext context, Camera cam)
        {
            if (cam != _mirrorCamera) return;
            _renderingMirror = true;
            GL.invertCulling = true;
        }

        private void OnEndCamera(ScriptableRenderContext context, Camera cam)
        {
            if (!_renderingMirror || cam != _mirrorCamera) return;
            _renderingMirror = false;
            GL.invertCulling = false;
        }

        private void SetHasReflection(bool value)
        {
            if (_renderer == null) return;
            _renderer.GetPropertyBlock(_block);
            _block.SetFloat(HasReflectionId, value ? 1f : 0f);
            _renderer.SetPropertyBlock(_block);
        }

        private Vector4 CameraSpacePlane(Camera cam, Vector3 position, Vector3 normal)
        {
            var offsetPosition = position + normal * clipPlaneOffset;
            var m = cam.worldToCameraMatrix;
            var cPos = m.MultiplyPoint(offsetPosition);
            var cNormal = m.MultiplyVector(normal).normalized;
            return new Vector4(cNormal.x, cNormal.y, cNormal.z, -Vector3.Dot(cPos, cNormal));
        }

        private static Matrix4x4 CalculateReflectionMatrix(Vector4 plane)
        {
            var m = Matrix4x4.identity;
            m.m00 = 1f - 2f * plane.x * plane.x;
            m.m01 = -2f * plane.x * plane.y;
            m.m02 = -2f * plane.x * plane.z;
            m.m03 = -2f * plane.w * plane.x;
            m.m10 = -2f * plane.y * plane.x;
            m.m11 = 1f - 2f * plane.y * plane.y;
            m.m12 = -2f * plane.y * plane.z;
            m.m13 = -2f * plane.w * plane.y;
            m.m20 = -2f * plane.z * plane.x;
            m.m21 = -2f * plane.z * plane.y;
            m.m22 = 1f - 2f * plane.z * plane.z;
            m.m23 = -2f * plane.w * plane.z;
            m.m30 = 0f;
            m.m31 = 0f;
            m.m32 = 0f;
            m.m33 = 1f;
            return m;
        }
    }
}
