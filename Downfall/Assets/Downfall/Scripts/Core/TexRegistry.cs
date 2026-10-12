using UnityEngine;

namespace Downfall
{
    /// <summary>Name → texture table so runtime code can reach textures that live under Art/Textures
    /// (outside Resources). Written by Downfall.EditorTools.MaterialBuilder to Resources/TexRegistry.asset.
    /// Keys are Art/Textures-relative paths without extension: "Generated/road_asphalt", "Terrain/grass_n",
    /// "nature/leaves_oak". Use <see cref="Mats.Tex"/>.</summary>
    public sealed class TexRegistry : ScriptableObject
    {
        public string[] keys = new string[0];
        public Texture2D[] textures = new Texture2D[0];
    }
}
