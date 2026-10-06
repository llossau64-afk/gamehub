using System;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// Applies a player's room/match message to a <see cref="RoomController"/>. Shared by the game server and the
    /// offline practice mode, so both run exactly the same command handling.
    /// </summary>
    public static class RoomCommands
    {
        /// <summary>The payload class of a room command, or null when the type is not a room command.</summary>
        public static Type PayloadType(string type)
        {
            switch (type)
            {
                case Msg.SetReady: return typeof(ReadyMsg);
                case Msg.SetTeam: return typeof(TeamMsg);
                case Msg.UpdateSettings: return typeof(SettingsMsg);
                case Msg.RemoveBot:
                case Msg.MovePlayer: return typeof(PlayerRefMsg);
                case Msg.Answer:
                case Msg.TeamVote:
                case Msg.Steal: return typeof(IndexMsg);
                case Msg.UseJoker: return typeof(JokerMsg);
                case Msg.AddBot:
                case Msg.StartMatch:
                case Msg.SkipSteal:
                case Msg.Rematch:
                case Msg.ToLobby: return typeof(EmptyMsg);
                default: return null;
            }
        }

        public static bool IsRoomCommand(string type) => PayloadType(type) != null;

        /// <summary>Returns null on success or an ErrorCodes value.</summary>
        public static string Apply(RoomController room, string playerId, string type, object payload, double now)
        {
            if (room == null) return ErrorCodes.NotInRoom;
            if (!room.Contains(playerId)) return ErrorCodes.NotInRoom;
            switch (type)
            {
                case Msg.SetReady: return payload is ReadyMsg r ? room.SetReady(playerId, r.ready) : ErrorCodes.BadRequest;
                case Msg.SetTeam: return payload is TeamMsg t ? room.SetTeam(playerId, t.team) : ErrorCodes.BadRequest;
                case Msg.UpdateSettings: return payload is SettingsMsg s ? room.UpdateSettings(playerId, s.settings) : ErrorCodes.BadRequest;
                case Msg.AddBot: return room.HostAddBot(playerId);
                case Msg.RemoveBot: return payload is PlayerRefMsg rb ? room.HostRemoveBot(playerId, rb.playerId) : ErrorCodes.BadRequest;
                case Msg.MovePlayer: return payload is PlayerRefMsg mp ? room.MovePlayer(playerId, mp.playerId) : ErrorCodes.BadRequest;
                case Msg.StartMatch: return room.StartMatch(playerId, now);
                case Msg.Answer: return payload is IndexMsg a ? room.Answer(playerId, a.index, now) : ErrorCodes.BadRequest;
                case Msg.UseJoker: return payload is JokerMsg j ? room.UseJoker(playerId, j.joker, now) : ErrorCodes.BadRequest;
                case Msg.TeamVote: return payload is IndexMsg v ? room.TeamVote(playerId, v.index, now) : ErrorCodes.BadRequest;
                case Msg.Steal: return payload is IndexMsg st ? room.Steal(playerId, st.index, now) : ErrorCodes.BadRequest;
                case Msg.SkipSteal: return room.SkipSteal(playerId, now);
                case Msg.Rematch: return room.Rematch(playerId, now);
                case Msg.ToLobby: return room.ToLobby(playerId);
                default: return ErrorCodes.BadRequest;
            }
        }

        public static string ErrorText(string code)
        {
            switch (code)
            {
                case ErrorCodes.RoomNotFound: return "ROOM NOT FOUND";
                case ErrorCodes.InvalidCode: return "ROOM NOT FOUND";
                case ErrorCodes.RoomFull: return "ROOM IS FULL";
                case ErrorCodes.GameStarted: return "GAME ALREADY STARTED";
                case ErrorCodes.NotHost: return "ONLY THE HOST CAN DO THAT";
                case ErrorCodes.NotEnoughPlayers: return "NOT ENOUGH PLAYERS";
                case ErrorCodes.TeamsInvalid: return "TEAMS DON'T MATCH THE MODE";
                case ErrorCodes.PlayersNotReady: return "WAITING FOR PLAYERS TO BE READY";
                case ErrorCodes.PlayerReconnecting: return "A PLAYER IS RECONNECTING";
                case ErrorCodes.TeamFull: return "THAT TEAM IS FULL";
                case ErrorCodes.NotInRoom: return "YOU ARE NOT IN A ROOM";
                case ErrorCodes.ServerFull: return "SERVER IS FULL, TRY AGAIN SOON";
                case ErrorCodes.VersionMismatch: return "NEW VERSION AVAILABLE, PLEASE RELOAD";
                case ErrorCodes.SessionExpired: return "YOUR PREVIOUS GAME HAS ENDED";
                case ErrorCodes.RateLimited: return "SLOW DOWN";
                default: return "NOT POSSIBLE RIGHT NOW";
            }
        }
    }
}
