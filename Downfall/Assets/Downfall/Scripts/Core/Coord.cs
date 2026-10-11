// The simulation keeps the browser build's right-handed coordinates (y up, cars face +z,
// +x is the driver's left). Unity is left-handed, so everything crosses over here with
// x mirrored: that is the same flip Unity's FBX/glTF importers apply, so imported models,
// generated meshes and simulated bodies all line up and the world looks like the web game.
using UnityEngine;

namespace Downfall
{
    public static class Coord
    {
        public static Vector3 ToUnity(Vector3 v) => new Vector3(-v.x, v.y, v.z);
        public static Vector3 ToUnity(double x, double y, double z) => new Vector3((float)-x, (float)y, (float)z);
        public static Vector3 FromUnity(Vector3 v) => new Vector3(-v.x, v.y, v.z);
        // A rotation mirrored across the x axis keeps its x part and flips y and z.
        public static Quaternion ToUnity(Quaternion q) => new Quaternion(q.x, -q.y, -q.z, q.w);
        public static Quaternion FromUnity(Quaternion q) => new Quaternion(q.x, -q.y, -q.z, q.w);
        // Simulation heading (radians, around +y, 0 = +z) to a Unity rotation.
        public static Quaternion Yaw(double hd) => Quaternion.Euler(0f, (float)(-hd * Mathf.Rad2Deg), 0f);

        // Builds a Unity mesh from simulation-space vertices: mirrors x and reverses the
        // triangle winding so faces keep pointing the right way.
        public static void ApplyToMesh(Mesh m, Vector3[] simVerts, int[] tris, Vector3[] simNormals = null)
        {
            var v = new Vector3[simVerts.Length];
            for (int i = 0; i < v.Length; i++) v[i] = ToUnity(simVerts[i]);
            var t = new int[tris.Length];
            for (int i = 0; i < tris.Length; i += 3) { t[i] = tris[i]; t[i + 1] = tris[i + 2]; t[i + 2] = tris[i + 1]; }
            if (v.Length > 65535) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.vertices = v;
            m.triangles = t;
            if (simNormals != null)
            {
                var n = new Vector3[simNormals.Length];
                for (int i = 0; i < n.Length; i++) n[i] = ToUnity(simNormals[i]);
                m.normals = n;
            }
            else m.RecalculateNormals();
            m.RecalculateBounds();
        }
    }
}
