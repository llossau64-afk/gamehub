using System;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// Wire format: every WebSocket text frame is an <see cref="Envelope"/> whose <c>d</c> field holds the JSON of the payload.
    /// The nested string keeps the format friendly to Unity's JsonUtility, which cannot parse polymorphic objects.
    /// </summary>
    [Serializable]
    public class Envelope
    {
        public string t;
        public string d;
    }

    public static class ProtocolInfo
    {
        public const int Version = 1;
    }

    /// <summary>Message type names. C = client to server, S = server to client.</summary>
    public static class Msg
    {
        // Client → server
        public const string Hello = "hello";
        public const string CreateRoom = "createRoom";
        public const string JoinRoom = "joinRoom";
        public const string LeaveRoom = "leaveRoom";
        public const string SetReady = "setReady";
        public const string SetTeam = "setTeam";
        public const string UpdateSettings = "updateSettings";
        public const string AddBot = "addBot";
        public const string RemoveBot = "removeBot";
        public const string MovePlayer = "movePlayer";
        public const string StartMatch = "startMatch";
        public const string Queue = "queue";
        public const string CancelQueue = "cancelQueue";
        public const string QueueFillBots = "queueFillBots";
        public const string Answer = "answer";
        public const string UseJoker = "useJoker";
        public const string TeamVote = "teamVote";
        public const string Steal = "steal";
        public const string SkipSteal = "skipSteal";
        public const string Rematch = "rematch";
        public const string ToLobby = "toLobby";
        public const string Ping = "ping";

        // Server → client
        public const string Welcome = "welcome";
        public const string Error = "error";
        public const string Room = "room";
        public const string Match = "match";
        public const string Left = "left";
        public const string QueueStatus = "queueStatus";
        public const string MatchFound = "matchFound";
        public const string Pong = "pong";
    }

    public static class ErrorCodes
    {
        public const string RoomNotFound = "ROOM_NOT_FOUND";
        public const string RoomFull = "ROOM_FULL";
        public const string GameStarted = "GAME_ALREADY_STARTED";
        public const string InvalidCode = "INVALID_CODE";
        public const string NotInRoom = "NOT_IN_ROOM";
        public const string AlreadyInRoom = "ALREADY_IN_ROOM";
        public const string NotHost = "NOT_HOST";
        public const string NotEnoughPlayers = "NOT_ENOUGH_PLAYERS";
        public const string TeamsInvalid = "TEAMS_INVALID";
        public const string PlayersNotReady = "PLAYERS_NOT_READY";
        public const string PlayerReconnecting = "PLAYER_RECONNECTING";
        public const string TeamFull = "TEAM_FULL";
        public const string NotAllowed = "NOT_ALLOWED";
        public const string BadRequest = "BAD_REQUEST";
        public const string VersionMismatch = "VERSION_MISMATCH";
        public const string SessionExpired = "SESSION_EXPIRED";
        public const string ServerFull = "SERVER_FULL";
        public const string RateLimited = "RATE_LIMITED";
    }

    public static class LeaveReasons
    {
        public const string Left = "left";
        public const string Timeout = "timeout";
        public const string RoomClosed = "room_closed";
        public const string Kicked = "kicked";
    }

    // ───────────────────────── Client → server payloads ─────────────────────────

    [Serializable]
    public class HelloMsg
    {
        public int version = ProtocolInfo.Version;
        public string name;
        public int avatar;
        /// <summary>Set when resuming an earlier session after a dropped connection.</summary>
        public string playerId;
        public string token;
    }

    [Serializable]
    public class CreateRoomMsg
    {
        public MatchSettings settings = new MatchSettings();
    }

    [Serializable]
    public class JoinRoomMsg
    {
        public string code;
    }

    [Serializable]
    public class ReadyMsg
    {
        public bool ready;
    }

    [Serializable]
    public class TeamMsg
    {
        public int team;
    }

    [Serializable]
    public class SettingsMsg
    {
        public MatchSettings settings = new MatchSettings();
    }

    [Serializable]
    public class PlayerRefMsg
    {
        public string playerId;
    }

    [Serializable]
    public class QueueMsg
    {
        public int mode = (int)QueueMode.OneVsOne;
    }

    [Serializable]
    public class IndexMsg
    {
        public int index = -1;
    }

    [Serializable]
    public class JokerMsg
    {
        public int joker;
    }

    [Serializable]
    public class EmptyMsg
    {
    }

    // ───────────────────────── Server → client payloads ─────────────────────────

    [Serializable]
    public class WelcomeMsg
    {
        public string playerId;
        public string token;
        public bool resumed;
        public int serverVersion = ProtocolInfo.Version;
    }

    [Serializable]
    public class ErrorMsg
    {
        public string code;
        public string message;
    }

    [Serializable]
    public class LeftMsg
    {
        public string code;
        public string reason;
    }

    [Serializable]
    public class QueueStatusMsg
    {
        public int mode;
        public int found;
        public int needed;
        public float elapsed;
        public bool expanded;
        public bool botsAvailable;
        public bool searching;
    }

    [Serializable]
    public class MatchFoundMsg
    {
        public string code;
        public float countdown;
    }
}
