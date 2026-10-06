using UnityEditor;

namespace GuessTheAnswer.EditorTools
{
    /// <summary>Import rules that keep the WebGL build small: icons become compressed, mip-free sprites.</summary>
    public sealed class ImportSettings : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.Contains("/Resources/GTA/Icons/")) return;
            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            importer.maxTextureSize = 128;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.wrapMode = UnityEngine.TextureWrapMode.Clamp;
            importer.filterMode = UnityEngine.FilterMode.Bilinear;
        }

        void OnPreprocessAudio()
        {
            // Optional replacement sounds in Resources/GTA/Audio: compressed, music streamed.
            if (!assetPath.Contains("/Resources/GTA/Audio/")) return;
            var importer = (AudioImporter)assetImporter;
            var s = importer.defaultSampleSettings;
            s.compressionFormat = UnityEngine.AudioCompressionFormat.Vorbis;
            s.quality = 0.5f;
            s.loadType = assetPath.Contains("Music_") ? UnityEngine.AudioClipLoadType.CompressedInMemory : UnityEngine.AudioClipLoadType.DecompressOnLoad;
            importer.defaultSampleSettings = s;
            importer.forceToMono = true;
        }
    }
}
