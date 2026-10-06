namespace GuessTheAnswer.Server
{
    /// <summary>
    /// A player identity on the server. It outlives a single WebSocket so a player whose connection drops
    /// can come back with the same id (and token) and continue the match.
    /// </summary>
    public sealed class PlayerSession
    {
        public string PlayerId;
        public string Token;
        public string Name;
        public int Avatar;

        public ClientConnection Connection;
        public double DisconnectedAt;
        public double LastMessageAt;

        public string RoomCode;
        public bool InQueue;

        public bool IsConnected => Connection != null && Connection.IsOpen;
    }
}
