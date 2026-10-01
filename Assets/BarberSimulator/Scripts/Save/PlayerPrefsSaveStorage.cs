using UnityEngine;

namespace BarberSimulator.Save
{
    /// <summary>PlayerPrefs backend. On WebGL Unity stores PlayerPrefs in the browser's IndexedDB.</summary>
    public sealed class PlayerPrefsSaveStorage : ISaveStorage
    {
        public bool TryRead(string key, out string data)
        {
            data = PlayerPrefs.GetString(key, string.Empty);
            return !string.IsNullOrEmpty(data);
        }

        public void Write(string key, string data)
        {
            PlayerPrefs.SetString(key, data);
        }

        public void Delete(string key)
        {
            PlayerPrefs.DeleteKey(key);
        }

        public void Flush()
        {
            PlayerPrefs.Save();
        }
    }
}
