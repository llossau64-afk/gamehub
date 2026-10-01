using System;
using UnityEngine;

namespace BarberSimulator.Interaction
{
    /// <summary>Trigger volume marking an area the player should look at during "Inspect your new shop".</summary>
    [RequireComponent(typeof(Collider))]
    public sealed class InspectionPoint : MonoBehaviour
    {
        [SerializeField] private string pointId;

        private Transform _player;
        private bool _visited;

        public string PointId => pointId;
        public event Action<InspectionPoint> Visited;

        public void Configure(string id)
        {
            pointId = id;
        }

        public void Bind(Transform player, bool alreadyVisited)
        {
            _player = player;
            _visited = alreadyVisited;
            GetComponent<Collider>().isTrigger = true;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (_visited || _player == null || !other.transform.IsChildOf(_player)) return;
            _visited = true;
            Visited?.Invoke(this);
        }
    }
}
