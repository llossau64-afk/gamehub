namespace BarberSimulator.Save
{
    /// <summary>
    /// Platform persistence backend. The default implementation uses PlayerPrefs (IndexedDB on WebGL);
    /// a portal SDK backend (CrazyGames data module, etc.) can implement this interface later.
    /// </summary>
    public interface ISaveStorage
    {
        bool TryRead(string key, out string data);
        void Write(string key, string data);
        void Delete(string key);
        /// <summary>Forces buffered data to disk. Must be cheap enough to call after every save.</summary>
        void Flush();
    }
}
