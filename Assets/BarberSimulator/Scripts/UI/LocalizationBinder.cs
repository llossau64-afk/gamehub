using System.Collections.Generic;
using BarberSimulator.Localization;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Keeps every keyed UI label in sync with the current language.</summary>
    public sealed class LocalizationBinder
    {
        private readonly LocalizationService _localization;
        private readonly List<KeyValuePair<Text, string>> _bindings = new List<KeyValuePair<Text, string>>(128);
        private readonly List<System.Action> _callbacks = new List<System.Action>();

        public LocalizationService Service => _localization;

        public LocalizationBinder(LocalizationService localization)
        {
            _localization = localization;
            _localization.LanguageChanged += RefreshAll;
        }

        public void Bind(Text text, string key, bool upperCase = false)
        {
            _bindings.Add(new KeyValuePair<Text, string>(text, upperCase ? "^" + key : key));
            Apply(text, upperCase ? "^" + key : key);
        }

        /// <summary>For texts that are composed (e.g. "3 / 5"), the owner re-renders itself.</summary>
        public void OnLanguageChanged(System.Action callback) => _callbacks.Add(callback);

        public string Get(string key) => _localization.Get(key);

        private void Apply(Text text, string boundKey)
        {
            if (text == null) return;
            bool upper = boundKey.Length > 0 && boundKey[0] == '^';
            var value = _localization.Get(upper ? boundKey.Substring(1) : boundKey);
            text.text = upper ? value.ToUpperInvariant() : value;
        }

        private void RefreshAll()
        {
            foreach (var pair in _bindings) Apply(pair.Key, pair.Value);
            foreach (var callback in _callbacks) callback();
        }
    }
}
