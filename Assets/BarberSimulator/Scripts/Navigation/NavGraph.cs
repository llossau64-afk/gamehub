using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Navigation
{
    /// <summary>
    /// Authored walk graph for NPCs. The shop is small and fully hand-laid-out, so a waypoint graph gives
    /// deterministic, furniture-free routes (always through the real door) with zero runtime baking cost — a better
    /// fit for WebGL than a runtime NavMesh. New rooms register their nodes and links when they are unlocked.
    /// </summary>
    public sealed class NavGraph : MonoBehaviour
    {
        [Serializable]
        public sealed class Link
        {
            public Transform a;
            public Transform b;
        }

        [SerializeField] private List<Transform> nodes = new List<Transform>();
        [SerializeField] private List<Link> links = new List<Link>();

        private Dictionary<Transform, List<Transform>> _adjacency;

        public IReadOnlyList<Transform> Nodes => nodes;

        public void Configure(List<Transform> graphNodes, List<Link> graphLinks)
        {
            nodes = graphNodes;
            links = graphLinks;
            _adjacency = null;
        }

        /// <summary>Adds nodes/links at runtime (future expansions).</summary>
        public void Register(IEnumerable<Transform> extraNodes, IEnumerable<Link> extraLinks)
        {
            nodes.AddRange(extraNodes);
            links.AddRange(extraLinks);
            _adjacency = null;
        }

        public Transform Find(string nodeName)
        {
            foreach (var n in nodes)
                if (n != null && n.name == nodeName) return n;
            return null;
        }

        public Transform Nearest(Vector3 position)
        {
            Transform best = null;
            float bestDistance = float.MaxValue;
            foreach (var n in nodes)
            {
                if (n == null) continue;
                float d = (n.position - position).sqrMagnitude;
                if (d < bestDistance) { bestDistance = d; best = n; }
            }
            return best;
        }

        private void BuildAdjacency()
        {
            _adjacency = new Dictionary<Transform, List<Transform>>();
            foreach (var n in nodes) if (n != null) _adjacency[n] = new List<Transform>();
            foreach (var link in links)
            {
                if (link.a == null || link.b == null) continue;
                if (!_adjacency.ContainsKey(link.a)) _adjacency[link.a] = new List<Transform>();
                if (!_adjacency.ContainsKey(link.b)) _adjacency[link.b] = new List<Transform>();
                _adjacency[link.a].Add(link.b);
                _adjacency[link.b].Add(link.a);
            }
        }

        /// <summary>A* from the node nearest to <paramref name="from"/> to <paramref name="goal"/>. Returns world points.</summary>
        public List<Vector3> FindPath(Vector3 from, Transform goal)
        {
            if (_adjacency == null) BuildAdjacency();
            var result = new List<Vector3>();
            var start = Nearest(from);
            if (start == null || goal == null) return result;

            var open = new List<Transform> { start };
            var cameFrom = new Dictionary<Transform, Transform>();
            var g = new Dictionary<Transform, float> { [start] = 0f };

            while (open.Count > 0)
            {
                Transform current = open[0];
                float bestF = float.MaxValue;
                foreach (var n in open)
                {
                    float f = g[n] + Vector3.Distance(n.position, goal.position);
                    if (f < bestF) { bestF = f; current = n; }
                }

                if (current == goal)
                {
                    var stack = new List<Vector3>();
                    var walk = current;
                    while (walk != null)
                    {
                        stack.Add(walk.position);
                        cameFrom.TryGetValue(walk, out walk);
                    }
                    stack.Reverse();
                    // Skip the start node if we are already past it towards the next one.
                    if (stack.Count > 1 && Vector3.Distance(from, stack[1]) < Vector3.Distance(stack[0], stack[1])) stack.RemoveAt(0);
                    return stack;
                }

                open.Remove(current);
                if (!_adjacency.TryGetValue(current, out var neighbours)) continue;
                foreach (var next in neighbours)
                {
                    float tentative = g[current] + Vector3.Distance(current.position, next.position);
                    if (g.TryGetValue(next, out float existing) && tentative >= existing) continue;
                    g[next] = tentative;
                    cameFrom[next] = current;
                    if (!open.Contains(next)) open.Add(next);
                }
            }

            result.Add(goal.position);
            return result;
        }

        private void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.3f, 0.9f, 0.5f, 0.8f);
            foreach (var n in nodes) if (n != null) Gizmos.DrawWireSphere(n.position + Vector3.up * 0.05f, 0.08f);
            foreach (var l in links) if (l.a != null && l.b != null) Gizmos.DrawLine(l.a.position + Vector3.up * 0.05f, l.b.position + Vector3.up * 0.05f);
        }
    }
}
