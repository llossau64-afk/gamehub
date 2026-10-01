using System;
using System.Collections.Generic;

namespace BarberSimulator.NPC
{
    public interface IState
    {
        void Enter();
        void Tick(float deltaTime);
        void Exit();
    }

    /// <summary>Minimal keyed state machine shared by NPC brains (customers now, employees later).</summary>
    public sealed class StateMachine<TKey>
    {
        private readonly Dictionary<TKey, IState> _states = new Dictionary<TKey, IState>();
        private IState _current;

        public TKey CurrentKey { get; private set; }
        public bool HasState => _current != null;
        public event Action<TKey, TKey> Changed;

        public void Add(TKey key, IState state) => _states[key] = state;

        public void Change(TKey key)
        {
            if (!_states.TryGetValue(key, out var next))
                throw new ArgumentException($"State {key} is not registered.");

            var previous = CurrentKey;
            _current?.Exit();
            _current = next;
            CurrentKey = key;
            _current.Enter();
            Changed?.Invoke(previous, key);
        }

        public void Tick(float deltaTime) => _current?.Tick(deltaTime);
    }
}
