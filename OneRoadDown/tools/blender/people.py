"""Stylised story characters for ONE ROAD DOWN (story mode cutscenes).

    python tools/blender/people.py assets/models

One shared armature `rig` (hips, spine, chest, neck, head, shoulder/upperarm/forearm/hand,
thigh/shin/foot per side) and one skinned mesh per character, all bound to that rig:

    person_mara    mechanic mentor: overalls, white tee, red cap, ponytail
    person_kenji   ch.1/2 rival: red bomber jacket, spiky black hair
    person_lukas   ch.3 rival: black leather jacket, blond, shades
    person_elise   ch.4 rival: white racing jacket, brown bob
    person_vanta   final rival: black suit, purple stripes, visor helmet
    person_iris    sponsor rep: charcoal suit, hair bun

Baked actions (glTF animations, all loop): idle, wave, talk, armscross, cheer, walk, point.
Colours are vertex colours (one material, one draw call per character). Feet stand on
the origin plane; the character faces +z in game space (-y in Blender).

Rotations below are authored in the armature's rest frame (x = character's left,
y = back, z = up) and converted to bone-local quaternions, so poses read naturally.
"""
import math
import os
import sys
import bpy
from mathutils import Vector, Euler, Quaternion, Matrix

sys.path.insert(0, os.path.dirname(__file__))
from common import reset_scene

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)

FPS = 24

# ------------------------------------------------------------------ skeleton
BONES = [
    # name, head, tail, parent
    ('hips', (0, 0, 0.96), (0, 0, 1.08), None),
    ('spine', (0, 0, 1.08), (0, 0, 1.27), 'hips'),
    ('chest', (0, 0, 1.27), (0, 0, 1.46), 'spine'),
    ('neck', (0, 0, 1.46), (0, 0, 1.56), 'chest'),
    ('head', (0, 0, 1.56), (0, 0, 1.80), 'neck'),
]
for sd, sx in (('L', 1), ('R', -1)):
    BONES += [
        ('shoulder.' + sd, (0.04 * sx, 0, 1.42), (0.165 * sx, 0, 1.43), 'chest'),
        ('upperarm.' + sd, (0.185 * sx, 0, 1.415), (0.23 * sx, 0.01, 1.155), 'shoulder.' + sd),
        ('forearm.' + sd, (0.23 * sx, 0.01, 1.155), (0.255 * sx, -0.02, 0.92), 'upperarm.' + sd),
        ('hand.' + sd, (0.255 * sx, -0.02, 0.92), (0.262 * sx, -0.03, 0.82), 'forearm.' + sd),
        ('thigh.' + sd, (0.095 * sx, 0, 0.95), (0.105 * sx, 0.0, 0.52), 'hips'),
        ('shin.' + sd, (0.105 * sx, 0.0, 0.52), (0.11 * sx, 0.02, 0.095), 'thigh.' + sd),
        ('foot.' + sd, (0.11 * sx, 0.02, 0.095), (0.11 * sx, -0.11, 0.03), 'shin.' + sd),
    ]
BONE = {b[0]: b for b in BONES}


def make_rig():
    arm = bpy.data.armatures.new('rig')
    ob = bpy.data.objects.new('rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, h, t, parent in BONES:
        b = arm.edit_bones.new(name)
        b.head = h; b.tail = t
        b.roll = 0
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        eb[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


# ------------------------------------------------------------------ mesh builder with skin weights
class Body:
    def __init__(self):
        self.v = []   # positions
        self.c = []   # colours (r, g, b)
        self.w = []   # {bone: weight}
        self.f = []   # faces (vertex index tuples)

    def vert(self, p, col, w):
        self.v.append(tuple(p)); self.c.append(col); self.w.append(w)
        return len(self.v) - 1

    def loft(self, rings, sides=10, cap0=True, cap1=True):
        """rings: list of (center, rx, ry, col, weights[, axis-x-vector]). Ellipse sections
        perpendicular to the path; rx along the side vector, ry along the other."""
        pts = [Vector(r[0]) for r in rings]
        n = len(pts)
        frames = []
        prev = None
        for i in range(n):
            t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
            side = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
            if len(rings[i]) > 5 and rings[i][5] is not None:
                side = Vector(rings[i][5])
            side = (side - t * side.dot(t)).normalized()
            if prev is not None and side.dot(prev) < 0:
                side = -side
            prev = side
            other = t.cross(side).normalized()
            frames.append((t, side, other))
        idx = []
        for i, r in enumerate(rings):
            c, rx, ry, col, w = r[0], r[1], r[2], r[3], r[4]
            t, s, o = frames[i]
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                p = Vector(c) + s * (math.cos(a) * rx) + o * (math.sin(a) * ry)
                ring.append(self.vert(p, col, w))
            idx.append(ring)
        for i in range(n - 1):
            a, b = idx[i], idx[i + 1]
            for k in range(sides):
                k2 = (k + 1) % sides
                self.f.append((a[k], a[k2], b[k2], b[k]))
        # rounded caps: two shrinking rings and a tip vertex
        for end, ring_i, sgn in ((cap0, 0, -1), (cap1, n - 1, 1)):
            if not end:
                continue
            c, rx, ry, col, w = rings[ring_i][:5]
            t, s, o = frames[ring_i]
            last = idx[ring_i]
            for frac, shrink in ((0.45, 0.82), (0.8, 0.45)):
                ring = []
                for k in range(sides):
                    a = 2 * math.pi * k / sides
                    p = Vector(c) + t * (sgn * frac * min(rx, ry) * 0.9) + s * (math.cos(a) * rx * shrink) + o * (math.sin(a) * ry * shrink)
                    ring.append(self.vert(p, col, w))
                for k in range(sides):
                    k2 = (k + 1) % sides
                    if sgn > 0:
                        self.f.append((last[k], last[k2], ring[k2], ring[k]))
                    else:
                        self.f.append((ring[k], ring[k2], last[k2], last[k]))
                last = ring
            tip = self.vert(Vector(c) + t * (sgn * min(rx, ry) * 0.95), col, w)
            for k in range(sides):
                k2 = (k + 1) % sides
                if sgn > 0:
                    self.f.append((last[k], last[k2], tip))
                else:
                    self.f.append((last[k2], last[k], tip))

    def ellipsoid(self, c, r, col, w, segs=10, rings=7, rot=None):
        """UV sphere scaled by r=(rx, ry, rz); optional rotation Euler (radians, XYZ)."""
        R = Euler(rot, 'XYZ').to_matrix() if rot else Matrix.Identity(3)
        cv = Vector(c)
        top = self.vert(cv + R @ Vector((0, 0, r[2])), col, w)
        grid = []
        for i in range(1, rings):
            th = math.pi * i / rings
            row = []
            for k in range(segs):
                ph = 2 * math.pi * k / segs
                p = Vector((math.sin(th) * math.cos(ph) * r[0], math.sin(th) * math.sin(ph) * r[1], math.cos(th) * r[2]))
                row.append(self.vert(cv + R @ p, col, w))
            grid.append(row)
        bot = self.vert(cv + R @ Vector((0, 0, -r[2])), col, w)
        for k in range(segs):
            k2 = (k + 1) % segs
            self.f.append((top, grid[0][k], grid[0][k2]))
            self.f.append((bot, grid[-1][k2], grid[-1][k]))
        for i in range(len(grid) - 1):
            a, b = grid[i], grid[i + 1]
            for k in range(segs):
                k2 = (k + 1) % segs
                self.f.append((a[k], b[k], b[k2], a[k2]))

    def build(self, name, rig, mat):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        for p in me.polygons:
            p.use_smooth = True
        ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        for i, col in enumerate(self.c):
            ca.data[i].color_srgb = (col[0], col[1], col[2], 1.0)
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i, w in enumerate(self.w):
            tot = sum(w.values())
            for b, x in w.items():
                if b not in groups:
                    groups[b] = ob.vertex_groups.new(name=b)
                groups[b].add([i], x / tot, 'REPLACE')
        ob.parent = rig
        mod = ob.modifiers.new('rig', 'ARMATURE')
        mod.object = rig
        return ob


def W(**kw):
    return {k.replace('_L', '.L').replace('_R', '.R'): v for k, v in kw.items()}


def hexc(h):
    """sRGB hex -> 0..1 tuple (colour attribute set in sRGB)."""
    return (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)


# ------------------------------------------------------------------ character builder
def person(spec):
    B = Body()
    skin = hexc(spec['skin'])
    top = hexc(spec['top'])
    top2 = hexc(spec.get('top2', spec['top']))      # waist / lower torso
    pants = hexc(spec['pants'])
    shoe = hexc(spec.get('shoe', 0x2a2a2a))
    sole = hexc(spec.get('sole', 0xe8e4dc))
    hair = hexc(spec.get('hair', 0x2a1e16))
    sleeve = spec.get('sleeve', 'long')               # long | short
    arm_col = hexc(spec.get('arm', spec['top']))
    hand_col = hexc(spec['glove']) if spec.get('glove') is not None else skin
    dark = hexc(0x1a1414)
    bulk = spec.get('bulk', 1.0) * 1.09              # jacket thickness
    # ---- pelvis + legs
    B.loft([
        ((0, 0.0, 0.86), 0.14, 0.1, pants, W(hips=1)),
        ((0, 0.0, 0.93), 0.168, 0.112, pants, W(hips=1)),
        ((0, 0.0, 1.01), 0.165, 0.108, pants, W(hips=0.8, spine=0.2)),
    ], sides=12, cap0=True, cap1=False)
    for sx, sd in ((1, 'L'), (-1, 'R')):
        th, sh, ft = 'thigh.' + sd, 'shin.' + sd, 'foot.' + sd
        B.loft([
            ((0.088 * sx, 0.0, 0.93), 0.092, 0.095, pants, {'hips': 0.5, th: 0.5}),
            ((0.097 * sx, 0.0, 0.84), 0.088, 0.09, pants, {th: 1}),
            ((0.102 * sx, 0.0, 0.66), 0.074, 0.077, pants, {th: 1}),
            ((0.105 * sx, 0.0, 0.53), 0.063, 0.066, pants, {th: 0.5, sh: 0.5}),
            ((0.107 * sx, 0.008, 0.42), 0.061, 0.066, pants, {sh: 1}),
            ((0.11 * sx, 0.015, 0.22), 0.051, 0.054, pants, {sh: 1}),
            ((0.11 * sx, 0.02, 0.11), 0.049, 0.051, pants, {sh: 1}),
        ], sides=10, cap0=False, cap1=True)
        # shoe + sole
        B.ellipsoid((0.11 * sx, -0.035, 0.06), (0.058, 0.13, 0.058), shoe, {ft: 1}, segs=10, rings=6)
        B.ellipsoid((0.11 * sx, -0.035, 0.022), (0.062, 0.136, 0.024), sole, {ft: 1}, segs=10, rings=4)
    # ---- torso
    B.loft([
        ((0, 0.0, 0.98), 0.15 * bulk, 0.1 * bulk, top2, W(hips=0.7, spine=0.3)),
        ((0, 0.0, 1.06), 0.145 * bulk, 0.096 * bulk, top2, W(hips=0.3, spine=0.7)),
        ((0, 0.0, 1.16), 0.142 * bulk, 0.094 * bulk, top2, W(spine=1)),
        ((0, 0.0, 1.2), 0.146 * bulk, 0.097 * bulk, top, W(spine=0.8, chest=0.2)),
        ((0, 0.0, 1.29), 0.158 * bulk, 0.104 * bulk, top, W(spine=0.4, chest=0.6)),
        ((0, 0.0, 1.38), 0.17 * bulk, 0.106 * bulk, top, W(chest=1)),
        ((0, 0.0, 1.45), 0.158 * bulk, 0.095 * bulk, top, W(chest=1)),
        ((0, 0.0, 1.497), 0.09, 0.066, top, W(chest=0.6, neck=0.4)),
    ], sides=12, cap0=False, cap1=False)
    # shoulders (fill the joint)
    for sx, sd in ((1, 'L'), (-1, 'R')):
        B.ellipsoid((0.165 * sx, 0.0, 1.415), (0.07 * bulk, 0.065 * bulk, 0.06 * bulk), top, {'chest': 0.5, 'upperarm.' + sd: 0.5}, segs=10, rings=6)
    # ---- neck + head
    B.loft([
        ((0, 0.008, 1.47), 0.052, 0.05, skin, W(neck=1)),
        ((0, 0.008, 1.55), 0.048, 0.048, skin, W(neck=0.6, head=0.4)),
        ((0, 0.008, 1.6), 0.046, 0.048, skin, W(head=1)),
    ], sides=10, cap0=False, cap1=False)
    hd = W(head=1)
    # skull + jaw as one lofted shape (no seams on the face)
    B.loft([
        ((0, -0.045, 1.566), 0.032, 0.026, skin, hd),
        ((0, -0.032, 1.59), 0.056, 0.058, skin, hd),
        ((0, -0.016, 1.62), 0.075, 0.084, skin, hd),
        ((0, -0.008, 1.66), 0.088, 0.098, skin, hd),
        ((0, -0.004, 1.70), 0.09, 0.1, skin, hd),
        ((0, 0.0, 1.74), 0.083, 0.093, skin, hd),
        ((0, 0.003, 1.768), 0.06, 0.068, skin, hd),
        ((0, 0.005, 1.782), 0.03, 0.035, skin, hd),
    ], sides=16, cap0=True, cap1=True)
    B.ellipsoid((0, -0.104, 1.668), (0.016, 0.022, 0.028), skin, hd, segs=8, rings=5)   # nose
    for sx in (1, -1):
        B.ellipsoid((0.088 * sx, 0.0, 1.67), (0.014, 0.024, 0.03), skin, hd, segs=8, rings=5)  # ears
        B.ellipsoid((0.034 * sx, -0.093, 1.697), (0.014, 0.008, 0.016), dark, hd, segs=8, rings=5)  # eyes
        B.ellipsoid((0.036 * sx, -0.094, 1.726), (0.022, 0.007, 0.006), hair if not spec.get('brow') else hexc(spec['brow']), hd, segs=8, rings=4, rot=(0, -0.12 * sx, 0))
    B.ellipsoid((0, -0.097, 1.626), (0.022, 0.007, 0.0065), hexc(spec.get('lip', 0x8a4a40)), hd, segs=8, rings=4)
    # ---- arms
    for sx, sd in ((1, 'L'), (-1, 'R')):
        ua, fa, hn = 'upperarm.' + sd, 'forearm.' + sd, 'hand.' + sd
        arm_top = top if sleeve == 'long' else top
        low = arm_col if sleeve == 'long' else skin
        rings = [
            ((0.19 * sx, 0.0, 1.415), 0.058 * bulk, 0.06 * bulk, arm_top, {ua: 1}),
            ((0.205 * sx, 0.004, 1.32), 0.054 * bulk, 0.056 * bulk, arm_top, {ua: 1}),
        ]
        if sleeve == 'short':
            rings += [((0.212 * sx, 0.006, 1.27), 0.056, 0.058, arm_top, {ua: 1}),
                      ((0.213 * sx, 0.006, 1.265), 0.047, 0.049, skin, {ua: 1})]
        rings += [
            ((0.225 * sx, 0.008, 1.2), 0.05 * (bulk if sleeve == 'long' else 1), 0.051 * (bulk if sleeve == 'long' else 1), low, {ua: 1}),
            ((0.23 * sx, 0.01, 1.155), 0.046 * (bulk if sleeve == 'long' else 1), 0.047 * (bulk if sleeve == 'long' else 1), low, {ua: 0.5, fa: 0.5}),
            ((0.238 * sx, 0.0, 1.08), 0.045, 0.046, low, {fa: 1}),
            ((0.25 * sx, -0.014, 0.97), 0.036, 0.039, low, {fa: 1}),
        ]
        if spec.get('cuff') is not None:
            rings += [((0.252 * sx, -0.016, 0.945), 0.039, 0.042, hexc(spec['cuff']), {fa: 1})]
        B.loft(rings, sides=10, cap0=False, cap1=True)
        # hand: palm + thumb
        B.ellipsoid((0.258 * sx, -0.025, 0.872), (0.031, 0.05, 0.06), hand_col, {hn: 1}, segs=8, rings=6)
        B.ellipsoid((0.246 * sx, -0.064, 0.895), (0.017, 0.017, 0.034), hand_col, {hn: 1}, segs=6, rings=5, rot=(0.4, 0, 0))
    # ---- hair / headwear
    style = spec.get('style')
    if style == 'cap':
        cap = hexc(spec['cap'])
        B.ellipsoid((0, 0.004, 1.737), (0.098, 0.109, 0.085), cap, hd, segs=16, rings=8)
        B.ellipsoid((0, -0.11, 1.742), (0.084, 0.07, 0.011), cap, hd, segs=12, rings=4, rot=(-0.15, 0, 0))
        B.ellipsoid((0, 0.06, 1.65), (0.075, 0.06, 0.06), hair, hd, segs=10, rings=6)
        B.loft([((0, 0.098, 1.67), 0.026, 0.024, hair, hd), ((0, 0.12, 1.6), 0.03, 0.026, hair, hd), ((0, 0.125, 1.5), 0.02, 0.018, hair, W(head=0.7, neck=0.3))], sides=8)
        for sx in (1, -1):
            B.ellipsoid((0.078 * sx, 0.01, 1.66), (0.02, 0.05, 0.05), hair, hd, segs=8, rings=5)
    elif style == 'spiky':
        B.ellipsoid((0, 0.012, 1.717), (0.096, 0.106, 0.1), hair, hd, segs=14, rings=8)
        for i, (x, y, z, rx, ry) in enumerate([(0, -0.05, 1.79, -0.7, 0), (0.05, -0.02, 1.79, -0.3, 0.5), (-0.05, -0.02, 1.79, -0.3, -0.5), (0.03, 0.05, 1.79, 0.5, 0.4), (-0.03, 0.05, 1.79, 0.5, -0.4), (0, 0.08, 1.75, 1.0, 0)]):
            B.ellipsoid((x, y, z), (0.03, 0.03, 0.055), hair, hd, segs=6, rings=4, rot=(rx, ry, 0))
    elif style == 'short':
        B.ellipsoid((0, 0.014, 1.717), (0.095, 0.105, 0.1), hair, hd, segs=14, rings=8)
        B.ellipsoid((0, -0.06, 1.765), (0.075, 0.05, 0.035), hair, hd, segs=10, rings=5, rot=(-0.3, 0, 0))
    elif style == 'bob':
        B.ellipsoid((0, 0.02, 1.698), (0.104, 0.111, 0.125), hair, hd, segs=14, rings=9)
        for sx in (1, -1):
            B.ellipsoid((0.083 * sx, -0.02, 1.63), (0.032, 0.07, 0.07), hair, hd, segs=8, rings=6)
        B.ellipsoid((0, -0.07, 1.765), (0.08, 0.045, 0.03), hair, hd, segs=10, rings=5, rot=(-0.35, 0, 0))
    elif style == 'bun':
        B.ellipsoid((0, 0.014, 1.717), (0.096, 0.105, 0.1), hair, hd, segs=14, rings=8)
        B.ellipsoid((0, 0.1, 1.75), (0.045, 0.045, 0.045), hair, hd, segs=10, rings=6)
    elif style == 'helmet':
        hel = hexc(spec['helmet'])
        B.ellipsoid((0, 0.0, 1.685), (0.128, 0.138, 0.142), hel, hd, segs=16, rings=10)
        B.ellipsoid((0, -0.07, 1.68), (0.105, 0.085, 0.06), hexc(spec['visor']), hd, segs=14, rings=6)
        B.ellipsoid((0, 0.0, 1.795), (0.03, 0.12, 0.03), hexc(spec.get('stripe', 0x7a3ad0)), hd, segs=8, rings=5)
    # ---- extras
    for ex in spec.get('extras', []):
        kind = ex[0]
        if kind == 'bib':   # overalls bib + straps
            col = hexc(ex[1])
            B.ellipsoid((0, -0.095, 1.26), (0.13, 0.025, 0.12), col, W(spine=0.4, chest=0.6), segs=12, rings=6)
            for sx in (1, -1):
                B.loft([((0.085 * sx, -0.113, 1.33), 0.02, 0.008, col, W(chest=1), (1, 0, 0)), ((0.1 * sx, -0.092, 1.45), 0.02, 0.008, col, W(chest=1), (1, 0, 0)), ((0.1 * sx, 0.06, 1.47), 0.02, 0.008, col, W(chest=1), (1, 0, 0)), ((0.09 * sx, 0.115, 1.33), 0.02, 0.008, col, W(chest=1), (1, 0, 0))], sides=6)
            B.ellipsoid((0.125, -0.07, 0.92), (0.012, 0.03, 0.05), hexc(0x9a3a2a), W(hips=1), segs=6, rings=4)  # red rag
        elif kind == 'zip':   # open jacket: shirt showing down the front
            col = hexc(ex[1])
            B.ellipsoid((0, -0.099 * bulk, 1.31), (0.045, 0.01, 0.13), col, W(spine=0.4, chest=0.6), segs=10, rings=6)
        elif kind == 'collar':
            col = hexc(ex[1])
            B.loft([((0, 0.0, 1.46), 0.1, 0.075, col, W(chest=1)), ((0, 0.0, 1.51), 0.075, 0.065, col, W(chest=0.5, neck=0.5))], sides=12, cap0=False, cap1=False)
        elif kind == 'shades':
            B.ellipsoid((0, -0.094, 1.698), (0.074, 0.012, 0.018), hexc(0x101012), hd, segs=12, rings=4)
        elif kind == 'stripe':   # vertical side stripes on legs + arms (race suit)
            col = hexc(ex[1])
            for sx, sd in ((1, 'L'), (-1, 'R')):
                B.loft([((0.165 * sx, 0.0, 0.88), 0.012, 0.03, col, {'thigh.' + sd: 1}, (0, 1, 0)), ((0.16 * sx, 0.005, 0.66), 0.01, 0.026, col, {'thigh.' + sd: 1}, (0, 1, 0)), ((0.155 * sx, 0.008, 0.53), 0.009, 0.022, col, {'thigh.' + sd: 0.5, 'shin.' + sd: 0.5}, (0, 1, 0)), ((0.153 * sx, 0.02, 0.2), 0.008, 0.02, col, {'shin.' + sd: 1}, (0, 1, 0))], sides=6)
                B.loft([((0.245 * sx, 0.004, 1.38), 0.01, 0.022, col, {'upperarm.' + sd: 1}, (0, 1, 0)), ((0.262 * sx, 0.01, 1.16), 0.009, 0.02, col, {'upperarm.' + sd: 0.5, 'forearm.' + sd: 0.5}, (0, 1, 0)), ((0.28 * sx, -0.012, 0.98), 0.008, 0.018, col, {'forearm.' + sd: 1}, (0, 1, 0))], sides=6)
        elif kind == 'belt':
            col = hexc(ex[1])
            B.loft([((0, 0.0, 1.0), 0.156 * bulk, 0.104 * bulk, col, W(hips=0.7, spine=0.3)), ((0, 0.0, 1.035), 0.155 * bulk, 0.103 * bulk, col, W(hips=0.5, spine=0.5))], sides=12, cap0=False, cap1=False)
            B.ellipsoid((0, -0.105 * bulk, 1.017), (0.025, 0.008, 0.016), hexc(0xb8b2a0), W(hips=1), segs=6, rings=4)
        elif kind == 'tie':
            B.loft([((0, -0.1, 1.44), 0.018, 0.006, hexc(ex[1]), W(chest=1), (1, 0, 0)), ((0, -0.112, 1.33), 0.026, 0.006, hexc(ex[1]), W(chest=1), (1, 0, 0)), ((0, -0.105, 1.2), 0.02, 0.006, hexc(ex[1]), W(spine=1), (1, 0, 0))], sides=6)
        elif kind == 'logo':   # small chest patch
            B.ellipsoid((0.07, -0.098 * bulk, 1.36), (0.025, 0.008, 0.02), hexc(ex[1]), W(chest=1), segs=8, rings=4)
    return B


CHARACTERS = {
    'mara': dict(skin=0xb07a58, top=0xe8e4dc, top2=0x2f4a5c, pants=0x2f4a5c, arm=0xe8e4dc, sleeve='short', shoe=0x4a3426, sole=0x2a2420,
                 hair=0x3a2418, style='cap', cap=0xb3362a, glove=None, lip=0x8a4a42, extras=[('bib', 0x2f4a5c)]),
    'kenji': dict(skin=0xd8b08c, top=0xb42a26, top2=0xb42a26, pants=0x26303e, shoe=0xe8e8e8, sole=0xd0d0d0, hair=0x141414, style='spiky', cuff=0x1a1a1a,
                  bulk=1.08, extras=[('zip', 0x1c1c1c), ('collar', 0x1a1a1a), ('logo', 0xf0c020)]),
    'lukas': dict(skin=0xe0b898, top=0x1c1c1e, top2=0x1c1c1e, pants=0x5a5e66, shoe=0x1a1a1a, sole=0x1a1a1a, hair=0xd8b860, brow=0xa08040, style='short',
                  bulk=1.06, extras=[('zip', 0x8a8e94), ('collar', 0x1c1c1e), ('shades', 0), ('belt', 0x2a2a2a)]),
    'elise': dict(skin=0xe6c0a2, top=0xeceae4, top2=0xeceae4, pants=0x1e2a44, shoe=0x1e2a44, sole=0xe8e4dc, hair=0x5a3420, style='bob', cuff=0x2a5ab8, lip=0xa04a50,
                  bulk=1.04, extras=[('collar', 0x2a5ab8), ('logo', 0x2a5ab8)]),
    'vanta': dict(skin=0x9a6a50, top=0x121214, top2=0x121214, pants=0x121214, shoe=0x0c0c0c, sole=0x3a2a5a, style='helmet', helmet=0x161618, visor=0x5a2a9a,
                  stripe=0x8a4ae0, glove=0x0c0c0c, bulk=1.03, extras=[('stripe', 0x8a4ae0), ('collar', 0x121214)]),
    'iris': dict(skin=0xc89070, top=0x3a3c42, top2=0x3a3c42, pants=0x3a3c42, shoe=0x141414, sole=0x141414, hair=0x1a1210, style='bun', lip=0x9a3a44,
                 extras=[('zip', 0xf0eee8), ('tie', 0xe2a33b), ('collar', 0x3a3c42)]),
}


# ------------------------------------------------------------------ animation
REST = {}


def rest_q(name):
    if name not in REST:
        h, t = Vector(BONE[name][1]), Vector(BONE[name][2])
        y = (t - h).normalized()
        # bone matrix with roll 0 (same convention Blender uses for edit bones)
        m = bpy.data.objects['rig'].data.bones[name].matrix_local.to_3x3()
        REST[name] = m.to_quaternion()
    return REST[name]


def local_rot(name, deg):
    """deg = (x, y, z) degrees about armature axes, applied X then Y then Z."""
    R = Euler([math.radians(a) for a in deg], 'XYZ').to_quaternion()
    M = rest_q(name)
    return M.inverted() @ R @ M


def local_loc(name, off):
    M = rest_q(name).to_matrix()
    return M.inverted() @ Vector(off)


def blend(a, b, k):
    out = {}
    for key in set(a) | set(b):
        va, vb = a.get(key, (0, 0, 0)), b.get(key, (0, 0, 0))
        out[key] = tuple(va[i] + (vb[i] - va[i]) * k for i in range(3))
    return out


def add(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            o = out.get(k, (0, 0, 0))
            out[k] = (o[0] + v[0], o[1] + v[1], o[2] + v[2])
    return out


# a relaxed stance everything builds on: arms slightly out and bent, knees soft
BASE = {
    'upperarm.L': (4, -9, 0), 'upperarm.R': (4, 9, 0),
    'forearm.L': (-12, 0, 0), 'forearm.R': (-12, 0, 0),
    'hand.L': (0, 0, -8), 'hand.R': (0, 0, 8),
    'thigh.L': (-2, -2, 0), 'thigh.R': (-2, 2, 0),
    'shin.L': (4, 0, 0), 'shin.R': (4, 0, 0),
    'foot.L': (-2, 0, 0), 'foot.R': (-2, 0, 0),
}


def S(t, period, phase=0.0):
    return math.sin(2 * math.pi * (t / period + phase))


def idle_pose(t, L):
    b = S(t, L)
    return add(BASE, {
        'chest': (b * 1.6, 0, 0), 'spine': (b * 0.6, S(t, L, 0.25) * 1.2, 0),
        'hips': (0, S(t, L, 0.25) * 1.5, S(t, L, 0.5) * 2),
        'head': (S(t, L, 0.1) * 2, 0, S(t, L * 0.5, 0.3) * 4),
        'upperarm.L': (b * 1.5, -b * 1.5, 0), 'upperarm.R': (b * 1.5, b * 1.5, 0),
    }), {'hips': (0, 0, b * 0.004)}


def wave_pose(t, L):
    p, loc = idle_pose(t, L)
    w = S(t, L / 3)
    p = add(p, {
        'upperarm.R': (-10, 150, -10),
        'forearm.R': (-20, -40 + w * 26, 0),
        'hand.R': (0, w * 10, 0),
        'head': (-3, 0, -8), 'chest': (0, 3, -6),
    })
    return p, loc


def talk_pose(t, L):
    p, loc = idle_pose(t, L)
    g1, g2 = S(t, L / 2), S(t, L / 2, 0.37)
    p = add(p, {
        'upperarm.L': (-18 + g1 * 6, -6, 0), 'upperarm.R': (-22 + g2 * 8, 6, 0),
        'forearm.L': (-58 + g1 * 14, 0, 14 + g2 * 10), 'forearm.R': (-64 + g2 * 16, 0, -12 + g1 * 10),
        'hand.L': (g2 * 12, 0, 0), 'hand.R': (g1 * 12, 0, 0),
        'head': (S(t, L / 4) * 4, 0, S(t, L / 2, 0.2) * 6),
        'chest': (0, 0, S(t, L / 2, 0.1) * 4),
    })
    return p, loc


def cross_pose(t, L):
    b = S(t, L)
    p = add(BASE, {
        'chest': (b * 1.6 - 2, 0, 0), 'hips': (0, 2, 4),
        'head': (S(t, L, 0.2) * 2 - 2, 0, 6 + S(t, L * 0.5) * 3),
        'upperarm.L': (-30, 10, 0), 'upperarm.R': (-30, -10, 0),
        'forearm.L': (-68, 0, -82), 'forearm.R': (-58, 0, 80),
        'hand.L': (0, 0, 10), 'hand.R': (0, 0, -10),
        'thigh.L': (-2, -6, -6), 'thigh.R': (0, 4, 4),
    })
    return p, {'hips': (0.01, 0, b * 0.003)}


def cheer_pose(t, L):
    k = 0.5 + 0.5 * S(t, L / 2)
    p = add(BASE, {
        'upperarm.L': (-20, -150 + k * 20, 0), 'upperarm.R': (-20, 150 - k * 20, 0),
        'forearm.L': (-20 - k * 30, 0, 0), 'forearm.R': (-20 - k * 30, 0, 0),
        'chest': (-6, 0, 0), 'head': (-12, 0, S(t, L / 2) * 5),
        'thigh.L': (-k * 6, -2, 0), 'thigh.R': (-k * 6, 2, 0), 'shin.L': (k * 12, 0, 0), 'shin.R': (k * 12, 0, 0),
    })
    return p, {'hips': (0, 0, -k * 0.03)}


def walk_pose(t, L):
    s, c = S(t, L), S(t, L, 0.25)
    p = add(BASE, {
        'thigh.L': (-s * 26, -2, 0), 'thigh.R': (s * 26, 2, 0),
        'shin.L': (max(0, c) * 40 + 6, 0, 0), 'shin.R': (max(0, -c) * 40 + 6, 0, 0),
        'foot.L': (s * 10, 0, 0), 'foot.R': (-s * 10, 0, 0),
        'upperarm.L': (s * 22, -2, 0), 'upperarm.R': (-s * 22, 2, 0),
        'forearm.L': (-18 + min(0, s) * 10, 0, 0), 'forearm.R': (-18 - max(0, s) * 10, 0, 0),
        'hips': (0, 0, s * 5), 'chest': (2, 0, -s * 7), 'head': (0, 0, s * 2),
    })
    return p, {'hips': (0, 0, abs(c) * 0.025 - 0.012)}


def point_pose(t, L):
    p, loc = idle_pose(t, L)
    p = add(p, {
        'upperarm.R': (-80, 14, 6), 'forearm.R': (-6, 0, 0), 'hand.R': (0, 0, 0),
        'head': (0, 0, -14), 'chest': (0, 0, -10),
        'upperarm.L': (0, 0, 10), 'forearm.L': (-50, 0, 40),
    })
    return p, loc


ACTIONS = [
    ('idle', 96, idle_pose, 8),
    ('wave', 72, wave_pose, 6),
    ('talk', 96, talk_pose, 6),
    ('armscross', 96, cross_pose, 8),
    ('cheer', 36, cheer_pose, 3),
    ('walk', 28, walk_pose, 2),
    ('point', 72, point_pose, 8),
]


def bake_actions(rig):
    rig.animation_data_create()
    names = [b[0] for b in BONES]
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    made = []
    for name, frames, fn, step in ACTIONS:
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        rig.animation_data.action = act
        L = frames / FPS
        for f in range(0, frames + 1, step):
            t = f / FPS
            pose, locs = fn(t % L if f < frames else 0.0, L)
            for bn in names:
                pb = rig.pose.bones[bn]
                q = local_rot(bn, pose.get(bn, (0, 0, 0)))
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f + 1)
                if bn == 'hips':
                    pb.location = local_loc(bn, locs.get('hips', (0, 0, 0)))
                    pb.keyframe_insert('location', frame=f + 1)
        # NLA strip so the exporter picks every action up
        tr = rig.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 1, act)
        tr.mute = True
        rig.animation_data.action = None
        made.append(act)
    # rest pose
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    return made


def main():
    reset_scene()
    rig = make_rig()
    mat = bpy.data.materials.new('person')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.72
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    nt.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
    objs = [rig]
    for cid, spec in CHARACTERS.items():
        B = person(spec)
        ob = B.build('person_' + cid, rig, mat)
        tris = sum(len(f) - 2 for f in B.f)
        print(cid, 'verts', len(B.v), 'tris', tris)
        objs.append(ob)
    bake_actions(rig)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(OUT, 'people.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_normals=True, export_yup=True, export_skins=True, export_animations=True,
        export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_step=1,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_def_bones=False,
        export_optimize_animation_size=True, export_lights=False, export_materials='EXPORT',
    )
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


main()
