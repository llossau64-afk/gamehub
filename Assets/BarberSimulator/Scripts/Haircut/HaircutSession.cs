using UnityEngine;

namespace BarberSimulator.Haircut
{
    /// <summary>
    /// One haircut in progress: owns the grid, the request and the current tool/guard and applies tool
    /// actions. Independent from input, camera and rendering so the same logic can later be driven by an
    /// employee simulation.
    /// </summary>
    public sealed class HaircutSession
    {
        private float _snipTimer;
        private float _combSoundTimer;

        public HairGrid Grid { get; }
        public HaircutRequest Request { get; }
        public float Leniency { get; }
        public BarberToolDefinition Tool { get; private set; }
        public int GuardIndex { get; private set; }
        public bool IsTutorial { get; }

        /// <summary>Raised when a scissor snip or comb stroke happened (for audio/particles).</summary>
        public event System.Action<BarberToolType, Vector3> ToolAction;

        public HaircutSession(HairGrid grid, HaircutRequest request, float leniency, bool tutorial)
        {
            Grid = grid;
            Request = request;
            Leniency = leniency;
            IsTutorial = tutorial;
        }

        public float CurrentGuardLength => Tool != null && Tool.HasGuards
            ? Tool.guardLengths[Mathf.Clamp(GuardIndex, 0, Tool.guardLengths.Length - 1)]
            : Tool != null ? Tool.minimumLength : 0f;

        public void SelectTool(BarberToolDefinition tool)
        {
            Tool = tool;
            if (tool != null && tool.HasGuards) GuardIndex = Mathf.Clamp(GuardIndex, 0, tool.guardLengths.Length - 1);
        }

        public void SelectGuard(int index)
        {
            if (Tool == null || !Tool.HasGuards) return;
            GuardIndex = Mathf.Clamp(index, 0, Tool.guardLengths.Length - 1);
        }

        public void StepGuard(int delta) => SelectGuard(GuardIndex + delta);

        /// <summary>
        /// Applies the current tool at a scalp direction (head-local unit vector) for one frame.
        /// Returns centimetres of hair removed this frame (drives particles and the cutting sound layer).
        /// </summary>
        public float Apply(Vector3 headDirection, float deltaTime, bool active)
        {
            if (Tool == null) return 0f;
            Grid.DecayComb(deltaTime);

            switch (Tool.type)
            {
                case BarberToolType.Clipper:
                case BarberToolType.Trimmer:
                    return active ? ApplyMotorTool(headDirection, deltaTime) : 0f;
                case BarberToolType.Scissors:
                    return active ? ApplyScissors(headDirection, deltaTime) : ResetSnip();
                case BarberToolType.Comb:
                    if (active) ApplyComb(headDirection, deltaTime);
                    return 0f;
                default:
                    return 0f;
            }
        }

        private float ResetSnip()
        {
            _snipTimer = 0f;
            return 0f;
        }

        private float ApplyMotorTool(Vector3 direction, float deltaTime)
        {
            float target = CurrentGuardLength;
            float speed = Tool.cutSpeed * deltaTime;
            return Grid.ApplyBrush(direction, Tool.EffectiveRadius, (ref HairGrid.Cell cell, float weight) =>
            {
                if (cell.Length <= target) return 0f;
                // A guard never cuts below its length; the brush edge cuts less so passes blend naturally.
                float edgeTarget = Mathf.Lerp(cell.Length, target, Mathf.Clamp01(weight * 1.6f));
                cell.Length = Mathf.Max(edgeTarget, cell.Length - speed * (0.35f + weight));
                return 0f;
            });
        }

        private float ApplyScissors(Vector3 direction, float deltaTime)
        {
            // Holding the button snips rhythmically; the first snip is immediate.
            _snipTimer -= deltaTime;
            if (_snipTimer > 0f) return 0f;
            _snipTimer = 0.28f;

            float floor = Tool.scissorsFloor;
            float average = Grid.AverageInBrush(direction, Tool.EffectiveRadius);
            float amount = Tool.snipAmount;
            float removed = Grid.ApplyBrush(direction, Tool.EffectiveRadius, (ref HairGrid.Cell cell, float weight) =>
            {
                if (cell.Length <= floor) return 0f;
                float next = cell.Length - amount * weight;
                // Scissor-over-comb: combed hair is cut level with the area average, evening out lumps.
                if (cell.Combed > 0.3f) next = Mathf.Min(next, Mathf.Lerp(next, average - amount * 0.5f, cell.Combed * 0.7f));
                cell.Length = Mathf.Max(floor, next);
                return 0f;
            });
            ToolAction?.Invoke(BarberToolType.Scissors, direction);
            return removed;
        }

        private void ApplyComb(Vector3 direction, float deltaTime)
        {
            Grid.ApplyBrush(direction, Tool.EffectiveRadius * 1.3f, (ref HairGrid.Cell cell, float weight) =>
            {
                cell.Combed = Mathf.Min(1f, cell.Combed + weight * deltaTime * 3f);
                return 0f;
            });
            _combSoundTimer -= deltaTime;
            if (_combSoundTimer <= 0f)
            {
                _combSoundTimer = 0.45f;
                ToolAction?.Invoke(BarberToolType.Comb, direction);
            }
        }

        public HaircutResult Evaluate() => HaircutEvaluator.Evaluate(Grid, Request, Leniency);
    }
}
