using System;
using UnityEngine;

namespace GuessTheAnswer.Save
{
    /// <summary>
    /// Loads and stores <see cref="SaveData"/> as JSON in PlayerPrefs (IndexedDB in WebGL builds).
    /// Writes are batched: <see cref="MarkDirty"/> schedules a save, <see cref="Flush"/> writes it.
    /// </summary>
    public sealed class SaveManager
    {
        const string Key = "gta_save_v1";
        const float SaveDelay = 0.75f;

        float saveAt = -1f;

        public SaveData Data { get; private set; }

        public void Load()
        {
            Data = null;
            try
            {
                string json = PlayerPrefs.GetString(Key, string.Empty);
                if (!string.IsNullOrEmpty(json)) Data = JsonUtility.FromJson<SaveData>(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Save] Could not read the save, starting fresh: " + e.Message);
            }

            if (Data == null) Data = new SaveData();
            Migrate(Data);
        }

        static void Migrate(SaveData data)
        {
            if (data.settings == null) data.settings = new SettingsData();
            if (data.stats == null) data.stats = new StatsData();
            if (data.profile == null) data.profile = new ProfileData();
            if (data.resume == null) data.resume = new ResumeData();
            if (data.profile.unlockedCosmetics == null) data.profile.unlockedCosmetics = new string[0];
            data.settings.masterVolume = Mathf.Clamp01(data.settings.masterVolume);
            data.settings.musicVolume = Mathf.Clamp01(data.settings.musicVolume);
            data.settings.sfxVolume = Mathf.Clamp01(data.settings.sfxVolume);
            data.version = SaveData.CurrentVersion;
        }

        public void MarkDirty()
        {
            if (saveAt < 0f) saveAt = Time.unscaledTime + SaveDelay;
        }

        public void Tick()
        {
            if (saveAt >= 0f && Time.unscaledTime >= saveAt) Flush();
        }

        public void Flush()
        {
            saveAt = -1f;
            if (Data == null) return;
            try
            {
                PlayerPrefs.SetString(Key, JsonUtility.ToJson(Data));
                PlayerPrefs.Save();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Save] Could not write the save: " + e.Message);
            }
        }

        public void ResetAll()
        {
            PlayerPrefs.DeleteKey(Key);
            PlayerPrefs.Save();
            Data = new SaveData();
        }
    }
}
