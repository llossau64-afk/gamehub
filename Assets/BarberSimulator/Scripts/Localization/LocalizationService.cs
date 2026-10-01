using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Localization
{
    /// <summary>
    /// Key/value string tables loaded from Resources/BarberSimulator/Localization/{code}.txt.
    /// Format: one "key = value" per line, '#' comments, "\n" for line breaks.
    /// </summary>
    public sealed class LocalizationService
    {
        public const string DefaultLanguage = "en";
        private const string ResourceFolder = "BarberSimulator/Localization/";

        public static readonly LanguageInfo[] Languages =
        {
            new LanguageInfo("en", "English"),
            new LanguageInfo("de", "Deutsch")
        };

        private readonly Dictionary<string, string> _table = new Dictionary<string, string>(256);
        private readonly Dictionary<string, string> _fallback = new Dictionary<string, string>(256);

        public string CurrentLanguage { get; private set; } = DefaultLanguage;
        public event Action LanguageChanged;

        public LocalizationService()
        {
            LoadInto(DefaultLanguage, _fallback);
        }

        public static string DetectSystemLanguage()
        {
            return Application.systemLanguage == SystemLanguage.German ? "de" : DefaultLanguage;
        }

        public void SetLanguage(string code)
        {
            if (string.IsNullOrEmpty(code)) code = DefaultLanguage;
            if (code == CurrentLanguage && _table.Count > 0) return;

            CurrentLanguage = code;
            _table.Clear();
            if (code != DefaultLanguage) LoadInto(code, _table);
            LanguageChanged?.Invoke();
        }

        public string Get(string key)
        {
            if (string.IsNullOrEmpty(key)) return string.Empty;
            if (_table.TryGetValue(key, out var value)) return value;
            if (_fallback.TryGetValue(key, out value)) return value;
            return key;
        }

        public string Format(string key, params object[] args)
        {
            return string.Format(Get(key), args);
        }

        public static string GetDisplayName(string code)
        {
            foreach (var language in Languages)
                if (language.Code == code) return language.DisplayName;
            return code;
        }

        public string NextLanguage()
        {
            for (int i = 0; i < Languages.Length; i++)
                if (Languages[i].Code == CurrentLanguage)
                    return Languages[(i + 1) % Languages.Length].Code;
            return DefaultLanguage;
        }

        private static void LoadInto(string code, Dictionary<string, string> target)
        {
            var asset = Resources.Load<TextAsset>(ResourceFolder + code);
            if (asset == null)
            {
                Debug.LogWarning($"[Localization] Missing table '{code}'.");
                return;
            }

            var lines = asset.text.Split('\n');
            foreach (var raw in lines)
            {
                var line = raw.Trim();
                if (line.Length == 0 || line[0] == '#') continue;
                int split = line.IndexOf('=');
                if (split <= 0) continue;
                var key = line.Substring(0, split).Trim();
                var value = line.Substring(split + 1).Trim().Replace("\\n", "\n");
                target[key] = value;
            }

            Resources.UnloadAsset(asset);
        }
    }

    public readonly struct LanguageInfo
    {
        public readonly string Code;
        public readonly string DisplayName;

        public LanguageInfo(string code, string displayName)
        {
            Code = code;
            DisplayName = displayName;
        }
    }
}
