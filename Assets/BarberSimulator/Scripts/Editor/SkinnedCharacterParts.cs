using System;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;

namespace BarberSimulator.EditorTools
{
    /// <summary>
    /// The skinned character export written by Tools/AssetGen/blender/characters.py: triangle meshes in Unity space
    /// (character root at the origin, bind pose = the joint layout CharacterFactory builds) with four bone weights
    /// per vertex and the cranium ellipsoid that the hair shell has to fit. The first-person arm export uses the same
    /// format without weights (BuildMesh(null) gives a static mesh).
    /// </summary>
    [Serializable]
    public sealed class SkinnedCharacterParts
    {
        public const string RelativePath = "BarberSimulator/Art/Source/Characters/character_parts.json";
        public const string FirstPersonRelativePath = "BarberSimulator/Art/Source/Characters/first_person_arm.json";

        [Serializable]
        public sealed class Part
        {
            public string name;
            public float[] positions;
            public float[] normals;
            public float[] uvs;
            public int[] boneIndices;
            public float[] boneWeights;
            public int[] triangles;

            public Mesh BuildMesh(Matrix4x4[] bindposes)
            {
                int count = positions.Length / 3;
                var vertices = new Vector3[count];
                var meshNormals = new Vector3[count];
                var meshUvs = new Vector2[count];
                var weights = new BoneWeight[count];
                for (int i = 0; i < count; i++)
                {
                    vertices[i] = new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
                    meshNormals[i] = new Vector3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
                    meshUvs[i] = uvs.Length >= count * 2 ? new Vector2(uvs[i * 2], uvs[i * 2 + 1]) : Vector2.zero;
                    int w = i * 4;
                    if (boneIndices == null || boneIndices.Length < count * 4) continue;
                    weights[i] = new BoneWeight
                    {
                        boneIndex0 = boneIndices[w], weight0 = boneWeights[w],
                        boneIndex1 = boneIndices[w + 1], weight1 = boneWeights[w + 1],
                        boneIndex2 = boneIndices[w + 2], weight2 = boneWeights[w + 2],
                        boneIndex3 = boneIndices[w + 3], weight3 = boneWeights[w + 3]
                    };
                }

                var mesh = new Mesh { name = "CharSkinned_" + name };
                if (count > 65000) mesh.indexFormat = IndexFormat.UInt32;
                mesh.vertices = vertices;
                mesh.normals = meshNormals;
                mesh.uv = meshUvs;
                mesh.triangles = triangles;
                if (bindposes != null)
                {
                    mesh.boneWeights = weights;
                    mesh.bindposes = bindposes;
                }
                mesh.RecalculateBounds();
                return mesh;
            }
        }

        public int version;
        public string[] bones;
        public float[] skullCenter;
        public float[] skullRadii;
        public Part[] parts;

        /// <summary>Cranium centre in Head-joint space.</summary>
        public Vector3 SkullCenter => new Vector3(skullCenter[0], skullCenter[1], skullCenter[2]);
        public Vector3 SkullRadii => new Vector3(skullRadii[0], skullRadii[1], skullRadii[2]);

        /// <summary>Loads the export, or returns null (with a warning) when it is missing or unreadable.</summary>
        public static SkinnedCharacterParts Load(string relativePath = RelativePath)
        {
            var path = Path.Combine(Application.dataPath, relativePath);
            if (!File.Exists(path))
            {
                Debug.LogWarning("[Generator] Skinned character export missing (" + path + "); using the procedural body.");
                return null;
            }

            try
            {
                var data = JsonUtility.FromJson<SkinnedCharacterParts>(File.ReadAllText(path));
                if (data?.parts == null || data.parts.Length == 0 || data.bones == null) return null;
                return data;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Generator] Could not read the skinned character export: " + e.Message);
                return null;
            }
        }
    }
}
