using BarberSimulator.Save;

namespace BarberSimulator.Platform
{
    /// <summary>
    /// Save backend that prefers the portal's user data (CrazyGames data module, cloud synced when the player is
    /// logged in) and always mirrors to a local backend. Reads use the portal copy when it exists, otherwise the
    /// local one, so a missing or late SDK never loses progress.
    /// </summary>
    public sealed class PlatformSaveStorage : ISaveStorage
    {
        private readonly IPlatformService _platform;
        private readonly ISaveStorage _local;

        public PlatformSaveStorage(IPlatformService platform, ISaveStorage local)
        {
            _platform = platform;
            _local = local;
        }

        public bool TryRead(string key, out string data)
        {
            if (_platform != null && _platform.UserDataAvailable)
            {
                data = _platform.GetItem(key);
                if (!string.IsNullOrEmpty(data)) return true;
            }
            return _local.TryRead(key, out data);
        }

        public void Write(string key, string data)
        {
            _local.Write(key, data);
            if (_platform != null && _platform.UserDataAvailable) _platform.SetItem(key, data);
        }

        public void Delete(string key)
        {
            _local.Delete(key);
            if (_platform != null && _platform.UserDataAvailable) _platform.RemoveItem(key);
        }

        public void Flush()
        {
            _local.Flush();
        }
    }
}
