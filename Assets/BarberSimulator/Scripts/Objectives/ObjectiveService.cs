using System;
using BarberSimulator.Economy;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Objectives
{
    /// <summary>Runs the linear objective sequence and persists its state in <see cref="ProgressionData"/>.</summary>
    public sealed class ObjectiveService
    {
        private readonly ObjectiveSequence _sequence;
        private readonly SaveService _save;
        private readonly EconomyService _economy;
        private bool _running;

        public ObjectiveDefinition Current { get; private set; }
        public int Progress => _save.Data.progression.currentObjectiveProgress;
        public bool AllComplete => _running && Current == null;
        public ObjectiveSequence Sequence => _sequence;

        public event Action<ObjectiveDefinition> Started;
        public event Action<ObjectiveDefinition, int> ProgressChanged;
        public event Action<ObjectiveDefinition> Completed;
        public event Action SequenceCompleted;

        public ObjectiveService(ObjectiveSequence sequence, SaveService save, EconomyService economy)
        {
            _sequence = sequence;
            _save = save;
            _economy = economy;
        }

        /// <summary>Resumes from the saved objective, or starts the first one.</summary>
        public void Begin()
        {
            _running = true;
            var progression = _save.Data.progression;

            int index = string.IsNullOrEmpty(progression.currentObjectiveId) ? -1 : _sequence.IndexOf(progression.currentObjectiveId);
            if (index < 0)
            {
                // Either a fresh game or every objective was completed.
                bool finished = progression.completedObjectiveIds.Count > 0 && progression.completedObjectiveIds.Count >= _sequence.Objectives.Count;
                if (finished)
                {
                    Current = null;
                    SequenceCompleted?.Invoke();
                    return;
                }
                index = 0;
                progression.currentObjectiveProgress = 0;
            }

            StartObjective(index, resume: index >= 0 && progression.currentObjectiveId == _sequence.Objectives[index].ObjectiveId);
        }

        public void Stop()
        {
            _running = false;
        }

        /// <summary>Gameplay reports what happened; only the active objective reacts.</summary>
        public void Signal(string signal, int amount = 1)
        {
            if (!_running || Current == null || Current.Signal != signal) return;

            var progression = _save.Data.progression;
            progression.currentObjectiveProgress = Mathf.Min(Current.TargetCount, progression.currentObjectiveProgress + amount);
            _save.RequestSave();
            ProgressChanged?.Invoke(Current, progression.currentObjectiveProgress);

            if (progression.currentObjectiveProgress >= Current.TargetCount) CompleteCurrent();
        }

        /// <summary>Re-evaluates progress that might already be satisfied (e.g. trash collected before the objective started).</summary>
        public void SetProgress(string signal, int absoluteValue)
        {
            if (!_running || Current == null || Current.Signal != signal) return;
            int delta = absoluteValue - _save.Data.progression.currentObjectiveProgress;
            if (delta > 0) Signal(signal, delta);
        }

        private void StartObjective(int index, bool resume)
        {
            var progression = _save.Data.progression;
            Current = _sequence.Objectives[index];
            progression.currentObjectiveId = Current.ObjectiveId;
            if (!resume) progression.currentObjectiveProgress = 0;
            _save.RequestSave();
            Started?.Invoke(Current);
        }

        private void CompleteCurrent()
        {
            var finished = Current;
            var progression = _save.Data.progression;
            if (!progression.completedObjectiveIds.Contains(finished.ObjectiveId))
                progression.completedObjectiveIds.Add(finished.ObjectiveId);

            if (finished.RewardMoney > 0) _economy.Add(finished.RewardMoney);
            Completed?.Invoke(finished);

            int next = _sequence.IndexOf(finished.ObjectiveId) + 1;
            if (next < _sequence.Objectives.Count)
            {
                StartObjective(next, resume: false);
            }
            else
            {
                Current = null;
                progression.currentObjectiveId = string.Empty;
                progression.currentObjectiveProgress = 0;
                _save.RequestSave();
                SequenceCompleted?.Invoke();
            }
        }
    }
}
