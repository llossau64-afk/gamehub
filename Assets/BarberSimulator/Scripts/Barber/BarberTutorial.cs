using BarberSimulator.Haircut;

namespace BarberSimulator.Barber
{
    /// <summary>
    /// Contextual coaching for the first customer: one short hint at a time that advances when the player
    /// actually does the step. Never blocks input.
    /// </summary>
    public sealed class BarberTutorial
    {
        public enum Step { SelectClipper, ShortGuard, LowerSides, LongerGuard, BlendUp, TrimTop, Finish, Done }

        public Step Current { get; private set; } = Step.SelectClipper;

        public string HintKey
        {
            get
            {
                switch (Current)
                {
                    case Step.SelectClipper: return "tut.fade.1";
                    case Step.ShortGuard: return "tut.fade.2";
                    case Step.LowerSides: return "tut.fade.3";
                    case Step.LongerGuard: return "tut.fade.4";
                    case Step.BlendUp: return "tut.fade.5";
                    case Step.TrimTop: return "tut.fade.6";
                    case Step.Finish: return "tut.fade.7";
                    default: return string.Empty;
                }
            }
        }

        /// <summary>Returns true when the step changed (so the UI can animate the new hint).</summary>
        public bool Update(HaircutSession session)
        {
            var before = Current;
            var tool = session.Tool;
            var grid = session.Grid;
            switch (Current)
            {
                case Step.SelectClipper:
                    if (tool != null && tool.type == BarberToolType.Clipper) Current = Step.ShortGuard;
                    break;
                case Step.ShortGuard:
                    if (tool != null && tool.type == BarberToolType.Clipper && session.CurrentGuardLength <= 0.32f) Current = Step.LowerSides;
                    break;
                case Step.LowerSides:
                    if (Touched(grid, HairBand.Lower) > 0.55f) Current = Step.LongerGuard;
                    break;
                case Step.LongerGuard:
                    if (tool != null && tool.type == BarberToolType.Clipper && session.CurrentGuardLength >= 0.55f) Current = Step.BlendUp;
                    break;
                case Step.BlendUp:
                    if (Touched(grid, HairBand.Middle) > 0.5f) Current = Step.TrimTop;
                    break;
                case Step.TrimTop:
                    if (grid.Stats(HairZone.Top).TouchedFraction > 0.35f) Current = Step.Finish;
                    break;
            }
            return before != Current;
        }

        public void MarkFinished() => Current = Step.Done;

        private static float Touched(HairGrid grid, HairBand band)
        {
            float left = grid.Stats(HairZone.LeftSide, band).TouchedFraction;
            float right = grid.Stats(HairZone.RightSide, band).TouchedFraction;
            float back = grid.Stats(HairZone.Back, band).TouchedFraction;
            return (left + right + back) / 3f;
        }
    }
}
