using System.Collections.Generic;
using UnityEngine;
using BarberSimulator.Art;

namespace BarberSimulator.EditorTools
{
    /// <summary>Props of the workday loop and the shop upgrades: shop sign, laptop, coffee station, wall TV, neon sign.</summary>
    public sealed partial class PropFactory
    {
        // 5x7 pixel font for the signs (X = lit pixel). Only the letters the signs spell are defined.
        private static readonly Dictionary<char, string[]> PixelFont = new Dictionary<char, string[]>
        {
            { 'A', new[] { ".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" } },
            { 'B', new[] { "####.", "#...#", "#...#", "####.", "#...#", "#...#", "####." } },
            { 'C', new[] { ".###.", "#...#", "#....", "#....", "#....", "#...#", ".###." } },
            { 'D', new[] { "####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####." } },
            { 'E', new[] { "#####", "#....", "#....", "####.", "#....", "#....", "#####" } },
            { 'L', new[] { "#....", "#....", "#....", "#....", "#....", "#....", "#####" } },
            { 'N', new[] { "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#" } },
            { 'O', new[] { ".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###." } },
            { 'P', new[] { "####.", "#...#", "#...#", "####.", "#....", "#....", "#...." } },
            { 'R', new[] { "####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#" } },
            { 'S', new[] { ".####", "#....", "#....", ".###.", "....#", "....#", "####." } }
        };

        /// <summary>
        /// Writes <paramref name="text"/> with small boxes. <paramref name="faceSign"/> is the side the text is read
        /// from: +1 = by someone standing at +Z looking towards -Z (their right is -X, so the layout is mirrored),
        /// -1 = by someone at -Z looking towards +Z.
        /// </summary>
        private static void PixelText(MeshBuilder b, string text, Vector3 center, float pixel, float depth, int sub, int faceSign)
        {
            const int cols = 5, rows = 7;
            float total = (text.Length * (cols + 1) - 1) * pixel;
            float mirror = faceSign > 0 ? -1f : 1f;
            for (int c = 0; c < text.Length; c++)
            {
                string[] glyph;
                if (!PixelFont.TryGetValue(text[c], out glyph)) continue;
                for (int row = 0; row < rows; row++)
                for (int col = 0; col < cols; col++)
                {
                    if (glyph[row][col] != '#') continue;
                    float x = -total * 0.5f + (c * (cols + 1) + col + 0.5f) * pixel;
                    float y = (rows * 0.5f - row - 0.5f) * pixel;
                    b.Box(V(center.x + x * mirror, center.y + y, center.z), V(pixel * 0.92f, pixel * 0.92f, depth), sub, 0f, 0.1f);
                }
            }
        }

        // ================================================================== Open / Closed sign

        /// <summary>
        /// Wall-mounted flip sign. The origin is the mount point on the wall (back plate at z = 0, board in front).
        /// The "Board" child turns around Y: at rest it shows CLOSED towards +Z, after a half turn OPEN.
        /// </summary>
        public GameObject OpenClosedSign()
        {
            var root = Root("OpenClosedSign");
            Part(root.transform, "Mount", "OpenClosedSign_Mount", M(m.Brass, m.MetalDark), b =>
            {
                b.Box(V(0, 0, 0.006f), V(0.07f, 0.09f, 0.012f), 0, 0.003f, 0.2f);
                b.Cylinder(V(0, 0.028f, 0.012f), 0.004f, 0.02f, 8, 1, 0.1f, Rx(90f));
                // Arm out from the wall with a small hook the plaque hangs from.
                b.Cylinder(V(0, 0.03f, 0.05f), 0.0045f, 0.08f, 10, 0, 0.1f, Rx(90f));
                b.Cylinder(V(0, 0.016f, 0.085f), 0.0035f, 0.03f, 8, 0, 0.1f);
            });

            const float W = 0.36f, H = 0.18f, T = 0.018f;
            var boardGo = new GameObject("Board");
            boardGo.transform.SetParent(root.transform, false);
            boardGo.transform.localPosition = V(0, -0.1f, 0.085f);
            Part(boardGo.transform, "Plaque", "OpenClosedSign_Plaque", M(m.WoodDark, m.SignRed, m.SignGreen, m.SignLetters, m.Brass), b =>
            {
                b.Box(V(0, 0, 0), V(W, H, T), 0, 0.006f, 0.5f);
                // Two hanging eyes on top.
                b.Cylinder(V(-0.1f, H * 0.5f + 0.004f, 0), 0.006f, 0.012f, 8, 4, 0.1f);
                b.Cylinder(V(0.1f, H * 0.5f + 0.004f, 0), 0.006f, 0.012f, 8, 4, 0.1f);
                // CLOSED on the +Z face (red), OPEN on the -Z face (green; mirrored so it reads right after the turn).
                b.Box(V(0, 0, T * 0.5f + 0.0008f), V(W - 0.03f, H - 0.03f, 0.002f), 1, 0f, 0.1f);
                PixelText(b, "CLOSED", V(0, 0, T * 0.5f + 0.0032f), 0.0082f, 0.0024f, 3, 1);
                b.Box(V(0, 0, -T * 0.5f - 0.0008f), V(W - 0.03f, H - 0.03f, 0.002f), 2, 0f, 0.1f);
                PixelText(b, "OPEN", V(0, 0, -T * 0.5f - 0.0032f), 0.0125f, 0.0024f, 3, -1);
            });
            // Chains from the hook to the plaque eyes.
            Part(root.transform, "Chains", "OpenClosedSign_Chains", M(m.Brass), b =>
            {
                Tube(b, V(0, 0.016f, 0.085f), V(-0.1f, -0.1f + H * 0.5f + 0.008f, 0.085f), 0.0018f, 6, 0, false);
                Tube(b, V(0, 0.016f, 0.085f), V(0.1f, -0.1f + H * 0.5f + 0.008f, 0.085f), 0.0018f, 6, 0, false);
            });
            Col(root, V(0, -0.1f, 0.085f), V(W + 0.04f, H + 0.06f, 0.14f));
            return root;
        }

        // ================================================================== Laptop

        /// <summary>Open laptop. Origin on the desk under the centre of the base; the screen faces +Z.</summary>
        public GameObject Laptop()
        {
            var root = Root("Laptop");
            Part(root.transform, "Laptop", "Laptop", M(m.ChromeDark, m.PlasticBlack, m.ScreenGlow, m.PlasticWhite), b =>
            {
                // Base with the key deck.
                b.Box(V(0, 0.008f, 0.0f), V(0.32f, 0.016f, 0.22f), 0, 0.004f, 0.3f);
                b.Box(V(0, 0.0165f, 0.015f), V(0.29f, 0.002f, 0.14f), 1, 0f, 0.2f);
                for (int row = 0; row < 4; row++)
                for (int col = 0; col < 11; col++)
                    b.Box(V(-0.125f + col * 0.025f, 0.0195f, -0.035f + row * 0.03f), V(0.021f, 0.004f, 0.024f), 0, 0.001f, 0.1f);
                b.Box(V(0, 0.0185f, 0.093f), V(0.09f, 0.0015f, 0.05f), 0, 0.0005f, 0.1f);
                // Lid hinged at the back edge, tilted slightly past vertical.
                b.Transform = TRS(V(0, 0.016f, -0.105f), Rx(-14f));
                b.Box(V(0, 0.1f, 0), V(0.32f, 0.2f, 0.008f), 0, 0.004f, 0.3f);
                b.Quad(V(0, 0.1f, 0.0045f), new Vector2(0.295f, 0.18f), 2);
                // A header bar and list rows so the screen reads as an interface.
                b.Box(V(0, 0.178f, 0.0052f), V(0.27f, 0.014f, 0.001f), 3, 0f, 0.1f);
                for (int i = 0; i < 4; i++)
                    b.Box(V(-0.04f, 0.145f - i * 0.03f, 0.0052f), V(0.17f, 0.016f, 0.001f), 3, 0f, 0.1f);
                b.Transform = Matrix4x4.identity;
            });
            Col(root, V(0, 0.11f, -0.02f), V(0.34f, 0.23f, 0.26f));
            return root;
        }

        // ================================================================== Coffee station

        /// <summary>A small cabinet with an espresso machine and cups. Origin on the floor, front towards +Z.</summary>
        public GameObject CoffeeStation()
        {
            var root = Root("CoffeeStation");
            Part(root.transform, "Cabinet", "CoffeeStation_Cabinet", M(m.WoodDark, m.Countertop, m.Brass), b =>
            {
                b.Box(V(0, 0.42f, 0), V(0.62f, 0.84f, 0.42f), 0, 0.01f, 0.5f);
                b.Box(V(0, 0.855f, 0.01f), V(0.68f, 0.03f, 0.46f), 1, 0.006f, 0.5f);
                b.Box(V(0, 0.55f, 0.213f), V(0.54f, 0.5f, 0.006f), 0, 0.003f, 0.5f);
                b.Box(V(0, 0.25f, 0.213f), V(0.54f, 0.3f, 0.006f), 0, 0.003f, 0.5f);
                b.Cylinder(V(0.2f, 0.55f, 0.228f), 0.01f, 0.03f, 10, 2, 0.1f, Rx(90f));
                b.Cylinder(V(0.2f, 0.25f, 0.228f), 0.01f, 0.03f, 10, 2, 0.1f, Rx(90f));
            });
            Part(root.transform, "Machine", "CoffeeStation_Machine", M(m.Chrome, m.PlasticBlack, m.Brass, m.MetalDark, m.Ceramic, m.BulbWarm), b =>
            {
                float y0 = 0.87f;
                // Body, top plate and cup warmer rail.
                b.Box(V(-0.06f, y0 + 0.17f, -0.04f), V(0.34f, 0.34f, 0.3f), 0, 0.016f, 0.3f);
                b.Box(V(-0.06f, y0 + 0.345f, -0.04f), V(0.35f, 0.012f, 0.31f), 3, 0.004f, 0.2f);
                b.Box(V(-0.06f, y0 + 0.02f, 0.0f), V(0.34f, 0.02f, 0.36f), 1, 0.004f, 0.2f);
                // Group head with portafilter and handle.
                b.Cylinder(V(-0.06f, y0 + 0.2f, 0.135f), 0.035f, 0.05f, 16, 1, 0.1f);
                b.Cylinder(V(-0.06f, y0 + 0.165f, 0.135f), 0.032f, 0.03f, 16, 3, 0.1f);
                Tube(b, V(-0.06f, y0 + 0.165f, 0.15f), V(-0.06f, y0 + 0.155f, 0.25f), 0.009f, 10, 1);
                // Gauge and indicator light.
                b.Cylinder(V(-0.14f, y0 + 0.27f, 0.112f), 0.022f, 0.012f, 18, 4, 0.1f, Rx(90f));
                b.Cylinder(V(0.0f, y0 + 0.27f, 0.112f), 0.008f, 0.012f, 10, 5, 0.1f, Rx(90f));
                // Drip tray and two cups.
                b.Box(V(-0.06f, y0 + 0.035f, 0.17f), V(0.3f, 0.012f, 0.12f), 3, 0.003f, 0.2f);
                for (int i = 0; i < 2; i++)
                {
                    b.Lathe(V(-0.13f + i * 0.14f, y0 + 0.041f, 0.17f), Pr(0.0f, 0f, 0.026f, 0f, 0.034f, 0.055f, 0.031f, 0.055f), 16, 4, true, false, 0.2f);
                }
                // Bean hopper on the side.
                b.Lathe(V(0.18f, y0, -0.05f), Pr(0.04f, 0.0f, 0.05f, 0.12f, 0.062f, 0.2f), 16, 1, true, false, 0.3f);
            });
            Col(root, V(0, 0.65f, 0), V(0.68f, 1.3f, 0.5f));
            return root;
        }

        // ================================================================== Wall TV

        /// <summary>Flat-screen TV on a wall bracket. Origin at the wall, screen faces +Z, centre of the TV at y = 0.</summary>
        public GameObject WallTv()
        {
            var root = Root("WallTv");
            const float W = 1.0f, H = 0.58f;
            Part(root.transform, "Tv", "WallTv", M(m.PlasticBlack, m.ScreenGlow, m.MetalDark, m.PlasticWhite), b =>
            {
                b.Box(V(0, 0, 0.05f), V(W, H, 0.04f), 0, 0.008f, 0.3f);
                b.Quad(V(0, 0, 0.0715f), new Vector2(W - 0.04f, H - 0.04f), 1);
                // Bracket and a stylised picture: a title bar and two content tiles.
                b.Box(V(0, 0, 0.015f), V(0.3f, 0.2f, 0.03f), 2, 0.004f, 0.2f);
                b.Box(V(0, H * 0.5f - 0.07f, 0.0725f), V(W - 0.14f, 0.05f, 0.001f), 3, 0f, 0.1f);
                b.Box(V(-0.2f, -0.04f, 0.0725f), V(0.36f, 0.26f, 0.001f), 3, 0f, 0.1f);
                b.Box(V(0.2f, -0.04f, 0.0725f), V(0.36f, 0.26f, 0.001f), 3, 0f, 0.1f);
                // Power LED.
                b.Box(V(W * 0.5f - 0.04f, -H * 0.5f + 0.012f, 0.0725f), V(0.01f, 0.004f, 0.001f), 3, 0f, 0.1f);
            });
            Col(root, V(0, 0, 0.04f), V(W, H, 0.09f));
            return root;
        }

        // ================================================================== Neon sign

        /// <summary>Window neon reading BARBER, readable from the street (-Z). Origin at the centre of the sign.</summary>
        public GameObject NeonSign()
        {
            var root = Root("NeonSign");
            Part(root.transform, "Neon", "NeonSign", M(m.NeonPink, m.Chrome), b =>
            {
                PixelText(b, "BARBER", V(0, 0, 0), 0.0165f, 0.014f, 0, -1);
                // Hanging frame: top rail and two drop rods.
                float half = 6 * 6 * 0.0165f * 0.5f;
                Tube(b, V(-half, 0.085f, 0), V(half, 0.085f, 0), 0.004f, 8, 1);
                Tube(b, V(-half + 0.03f, 0.085f, 0), V(-half + 0.03f, 0.17f, 0), 0.0025f, 6, 1);
                Tube(b, V(half - 0.03f, 0.085f, 0), V(half - 0.03f, 0.17f, 0), 0.0025f, 6, 1);
            });
            return root;
        }
    }
}
