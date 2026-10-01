using BarberSimulator.Characters;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// Seat convention: a chair's "SeatPoint" sits on the seat surface, facing the way a seated person looks.
    /// The character root stays on the floor under it and the animator lifts the pelvis to the seat.
    /// </summary>
    public static class Seating
    {
        private const float PelvisAboveSeat = 0.07f;

        public static void PlaceOnSeat(Transform character, ProceduralCharacterAnimator animator, Transform seatPoint)
        {
            var chairRoot = seatPoint.parent != null ? seatPoint.parent : seatPoint;
            float floorY = chairRoot.position.y;
            var position = seatPoint.position;
            character.SetPositionAndRotation(new Vector3(position.x, floorY, position.z), Quaternion.Euler(0f, seatPoint.eulerAngles.y, 0f));
            if (animator == null) return;
            animator.SeatPelvisHeight = position.y - floorY + PelvisAboveSeat;
            animator.Pose = CharacterPose.Sit;
        }
    }
}
