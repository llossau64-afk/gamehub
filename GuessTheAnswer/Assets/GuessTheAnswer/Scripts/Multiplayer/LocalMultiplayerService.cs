using System.Collections.Generic;
using GuessTheAnswer.Shared;
using UnityEngine;

namespace GuessTheAnswer.Multiplayer
{
    /// <summary>
    /// PRACTICE mode: a room with bots that runs on this device. It uses the same RoomController and MatchEngine as
    /// the server, so it is not a fake of online play but the real rules without other people. Works offline.
    /// </summary>
    public sealed class LocalMultiplayerService : MultiplayerServiceBase, IRoomOutput
    {
        public const string PlayerId = "local-player";
        public const string RoomName = "PRACTICE";

        readonly QuestionBank bank;
        readonly System.Func<HelloMsg> helloFactory;
        readonly Queue<(string type, object payload)> inbox = new Queue<(string, object)>();
        RoomController room;

        public override bool IsLocal => true;

        public LocalMultiplayerService(QuestionBank bank, System.Func<HelloMsg> helloFactory)
        {
            this.bank = bank;
            this.helloFactory = helloFactory;
            LocalPlayerId = PlayerId;
        }

        static double Now => Time.realtimeSinceStartupAsDouble;

        public override void Connect() => SetStatus(ConnectionStatus.Connected);

        public override void Disconnect()
        {
            room = null;
            inbox.Clear();
            SetStatus(ConnectionStatus.Offline);
        }

        protected override void Send(string type, object payload)
        {
            string error = null;
            switch (type)
            {
                case Msg.CreateRoom:
                    {
                        var hello = helloFactory();
                        var settings = (payload as CreateRoomMsg)?.settings ?? new MatchSettings();
                        room = new RoomController(RoomName, false, true, settings, bank, XorShiftRandom.FromTime(), this);
                        room.TryJoin(PlayerId, hello.name, hello.avatar, Now);
                        room.AddBot();
                        room.Flush(Now);
                        return;
                    }
                case Msg.LeaveRoom:
                    if (room != null) room.Leave(PlayerId, Now);
                    room = null;
                    return;
                case Msg.JoinRoom:
                    error = ErrorCodes.RoomNotFound;
                    break;
                case Msg.Queue:
                case Msg.QueueFillBots:
                    error = ErrorCodes.NotAllowed;
                    break;
                case Msg.CancelQueue:
                case Msg.Ping:
                    return;
                default:
                    if (!RoomCommands.IsRoomCommand(type))
                    {
                        error = ErrorCodes.BadRequest;
                        break;
                    }
                    error = RoomCommands.Apply(room, PlayerId, type, payload, Now);
                    if (room != null) room.Flush(Now);
                    break;
            }
            if (error != null) inbox.Enqueue((Msg.Error, new ErrorMsg { code = error, message = RoomCommands.ErrorText(error) }));
        }

        void IRoomOutput.Send(string playerId, string type, object payload)
        {
            if (playerId == PlayerId) inbox.Enqueue((type, payload));
        }

        public override void Tick(float deltaTime)
        {
            if (room != null)
            {
                room.Tick(Now);
                room.Flush(Now);
            }

            // Deliver after ticking; a handler may send new commands, which queue for the next frame.
            int count = inbox.Count;
            for (int i = 0; i < count; i++)
            {
                var (type, payload) = inbox.Dequeue();
                switch (type)
                {
                    case Msg.Room: RaiseRoom((RoomSnapshot)payload); break;
                    case Msg.Match: RaiseMatch((MatchSnapshot)payload); break;
                    case Msg.Error: RaiseError((ErrorMsg)payload); break;
                    case Msg.Left: RaiseLeft((LeftMsg)payload); break;
                }
            }
        }
    }
}
