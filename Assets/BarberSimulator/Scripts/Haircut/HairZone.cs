namespace BarberSimulator.Haircut
{
    /// <summary>Logical regions of the scalp. Requests and evaluation work on these, never on raw cells.</summary>
    public enum HairZone
    {
        None = 0,
        Top = 1,
        Front = 2,
        Crown = 3,
        LeftSide = 4,
        RightSide = 5,
        LeftTemple = 6,
        RightTemple = 7,
        Back = 8,
        Nape = 9
    }

    /// <summary>Height band inside the sides and the back. Fades are built across these.</summary>
    public enum HairBand
    {
        Any = 0,
        Lower = 1,
        Middle = 2,
        Upper = 3
    }

    public static class HairZoneUtility
    {
        public static bool IsSide(HairZone zone) => zone == HairZone.LeftSide || zone == HairZone.RightSide;
        public static bool HasBands(HairZone zone) => IsSide(zone) || zone == HairZone.Back;

        /// <summary>Localization key for the zone label shown in hints and checklists.</summary>
        public static string NameKey(HairZone zone) => "zone." + zone.ToString().ToLowerInvariant();
    }
}
