using System;
using UnityEngine;

namespace BarberSimulator.Save
{
    /// <summary>
    /// Single owner of persisted state. Gameplay code mutates <see cref="Data"/> and calls
    /// <see cref="RequestSave"/>; nothing else talks to the storage backend directly.
    /// </summary>
    public sealed class SaveService
    {
        private const string SaveKey = "barbersim.save.v1";

        private readonly ISaveStorage _storage;
        private readonly int _startingMoney;
        private bool _dirty;
        private float _nextAllowedWriteTime;

        public SaveData Data { get; private set; }
        public bool HasActiveGame => Data != null && Data.hasActiveGame;

        public event Action Saved;

        public SaveService(ISaveStorage storage, int startingMoney)
        {
            _storage = storage;
            _startingMoney = startingMoney;
        }

        public void Load()
        {
            Data = null;
            if (_storage.TryRead(SaveKey, out var json))
            {
                try
                {
                    Data = JsonUtility.FromJson<SaveData>(json);
                    if (Data != null) Data = SaveMigrator.Migrate(Data);
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[Save] Could not parse save data, starting fresh. {e.Message}");
                    Data = null;
                }
            }

            if (Data == null)
            {
                Data = new SaveData();
                Data.player.money = _startingMoney;
            }

            SaveMigrator.Sanitize(Data, _startingMoney);
        }

        public void StartNewGame()
        {
            Data.ResetProgress(_startingMoney);
            SaveNow();
        }

        /// <summary>Marks data dirty; written on the next <see cref="Tick"/> (throttled) to keep WebGL IndexedDB writes cheap.</summary>
        public void RequestSave()
        {
            _dirty = true;
        }

        public void Tick(float unscaledTime)
        {
            if (!_dirty || unscaledTime < _nextAllowedWriteTime) return;
            SaveNow();
            _nextAllowedWriteTime = unscaledTime + 1.5f;
        }

        public void SaveNow()
        {
            _dirty = false;
            Data.version = SaveData.CurrentVersion;
            Data.lastSavedUtc = DateTime.UtcNow.ToString("o");
            try
            {
                _storage.Write(SaveKey, JsonUtility.ToJson(Data));
                _storage.Flush();
                Saved?.Invoke();
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] Writing save data failed: {e.Message}");
            }
        }

        public void DeleteAll()
        {
            _storage.Delete(SaveKey);
            _storage.Flush();
            var settings = Data?.settings;
            Data = new SaveData();
            if (settings != null) Data.settings = settings;
            Data.player.money = _startingMoney;
        }
    }
}
