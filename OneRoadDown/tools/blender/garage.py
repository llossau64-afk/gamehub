"""Workshop and showroom props for ONE ROAD DOWN.

    python tools/blender/garage.py assets/models

Blender space (z up, props face -y). Every prop is one root empty `g_<name>` with one
mesh per material. Hard-surface parts get small bevels so edges catch the light.
"""
import math
import os
import sys
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(__file__))
from common import reset_scene, value_noise, make_image

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(5)

# ------------------------------------------------------------------ materials
M = {}


def tex_mat(name, rgb_fn, rough=0.6, metal=0.0, size=256):
    img = np.ones((size, size, 4), np.float32)
    img[..., :3] = np.clip(rgb_fn(size), 0, 1)
    image = make_image('gt_' + name, img)
    m = bpy.data.materials.new('g_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    t = m.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = image
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    M[name] = m
    return m


def col_mat(name, color, rough=0.5, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.new('g_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 2.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    M[name] = m
    return m


def init_mats():
    col_mat('red', (0.55, 0.05, 0.03), 0.3, 0.3)
    col_mat('blue', (0.08, 0.22, 0.45), 0.35, 0.4)
    col_mat('yellow', (0.75, 0.55, 0.05), 0.4, 0.3)
    col_mat('black', (0.02, 0.02, 0.02), 0.5, 0.2)
    col_mat('rubber', (0.02, 0.02, 0.02), 0.9)
    col_mat('chrome', (0.9, 0.9, 0.9), 0.1, 1.0)
    col_mat('steel', (0.55, 0.56, 0.58), 0.35, 1.0)
    col_mat('darksteel', (0.12, 0.12, 0.13), 0.45, 0.8)
    col_mat('alu', (0.75, 0.76, 0.78), 0.3, 1.0)
    col_mat('engine', (0.32, 0.33, 0.34), 0.45, 0.8)
    col_mat('copper', (0.7, 0.35, 0.15), 0.35, 1.0)
    col_mat('cardboard', (0.55, 0.42, 0.26), 0.9)
    col_mat('green', (0.12, 0.3, 0.16), 0.5, 0.3)
    col_mat('orange', (0.8, 0.3, 0.04), 0.45, 0.2)
    col_mat('white', (0.85, 0.85, 0.83), 0.5)
    col_mat('leather', (0.08, 0.05, 0.035), 0.55)
    col_mat('fabric', (0.2, 0.2, 0.21), 0.95)
    col_mat('glass', (0.6, 0.7, 0.75), 0.05, 0.0, alpha=0.3)
    col_mat('screen', (0.02, 0.03, 0.04), 0.2, 0.0, emit=(0.06, 0.18, 0.32))
    col_mat('lamp', (1, 1, 1), 0.3, 0.0, emit=(1.0, 0.97, 0.9))
    col_mat('gauge', (0.9, 0.9, 0.85), 0.3)
    col_mat('oilcan', (0.12, 0.25, 0.55), 0.4, 0.3)

    def wood(S):
        n = value_noise(S, 6, rng, 4)
        grain = np.sin((np.arange(S)[None, :] / S) * 60 + n * 14) * 0.5 + 0.5
        return np.stack([0.46 + 0.1 * grain, 0.31 + 0.07 * grain, 0.18 + 0.04 * grain], -1) * (0.85 + 0.25 * n[..., None])
    tex_mat('wood', wood, 0.7)

    def tread(S):
        img = np.full((S, S, 3), 0.03, np.float32)
        for k in range(16):
            y0 = int(k * S / 16)
            img[y0:y0 + 3, :, :] = 0.012
        n = value_noise(S, 32, rng, 2)
        return img * (0.8 + 0.4 * n[..., None])
    tex_mat('tread', tread, 0.9)

    def peg(S):
        img = np.full((S, S, 3), 0.62, np.float32) * np.array([1.0, 0.92, 0.78])
        for y in range(4, S, 16):
            for x in range(4, S, 16):
                img[y:y + 4, x:x + 4] = 0.08
        return img
    tex_mat('pegboard', peg, 0.9)

    def checker(S):
        n = value_noise(S, 8, rng, 3)
        a = ((np.arange(S)[:, None] // (S // 8) + np.arange(S)[None, :] // (S // 8)) % 2).astype(np.float32)
        return np.stack([a] * 3, -1) * 0.75 + 0.08 + n[..., None] * 0.05
    tex_mat('checker', checker, 0.3)


# ------------------------------------------------------------------ builder
class Prop:
    def __init__(self, name):
        self.name = name
        self.parts = {}   # material -> bmesh

    def bm(self, mat):
        if mat not in self.parts:
            self.parts[mat] = bmesh.new()
        return self.parts[mat]

    def box(self, c, size, mat, bevel=0.008, rot=(0, 0, 0)):
        b = bmesh.new()
        bmesh.ops.create_cube(b, size=1.0)
        bmesh.ops.scale(b, vec=Vector(size), verts=b.verts)
        if bevel > 0:
            bmesh.ops.bevel(b, geom=list(b.edges), offset=min(bevel, min(size) * 0.45), segments=2, affect='EDGES', profile=0.5)
        R = Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
        bmesh.ops.transform(b, matrix=Matrix.Translation(Vector(c)) @ R, verts=b.verts)
        self.merge(b, mat)

    def cyl(self, a, b_, r, mat, seg=16, r2=None, cap=True):
        a, b_ = Vector(a), Vector(b_)
        d = b_ - a
        L = d.length
        b = bmesh.new()
        bmesh.ops.create_cone(b, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=L)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.transform(b, matrix=Matrix.Translation((a + b_) / 2) @ q.to_matrix().to_4x4(), verts=b.verts)
        self.merge(b, mat)

    def torus(self, c, R, r, mat, axis='x', seg=32, sides=10):
        b = bmesh.new()
        verts = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring = []
            for j in range(sides):
                t = 2 * math.pi * j / sides
                p = Vector(((R + r * math.cos(t)) * math.cos(a), (R + r * math.cos(t)) * math.sin(a), r * math.sin(t)))
                ring.append(b.verts.new(p))
            verts.append(ring)
        for i in range(seg):
            for j in range(sides):
                b.faces.new((verts[i][j], verts[i][(j + 1) % sides], verts[(i + 1) % seg][(j + 1) % sides], verts[(i + 1) % seg][j]))
        rot = Matrix.Rotation(math.pi / 2, 4, 'Y') if axis == 'x' else Matrix.Rotation(math.pi / 2, 4, 'X') if axis == 'y' else Matrix()
        bmesh.ops.transform(b, matrix=Matrix.Translation(Vector(c)) @ rot, verts=b.verts)
        self.merge(b, mat)

    def sphere(self, c, r, mat, scale=(1, 1, 1)):
        b = bmesh.new()
        bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=10, radius=r)
        bmesh.ops.scale(b, vec=Vector(scale), verts=b.verts)
        bmesh.ops.translate(b, vec=Vector(c), verts=b.verts)
        self.merge(b, mat)

    def merge(self, b, mat):
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        self.bm(mat).from_mesh(me)
        bpy.data.meshes.remove(me)

    def tire(self, c, r, w, axis='x', rim='alu'):
        """Tyre with tread texture + simple rim."""
        self.torus(c, r - w * 0.42, w * 0.5, 'tread', axis, 26, 8)
        ax = Vector((1, 0, 0)) if axis == 'x' else Vector((0, 1, 0)) if axis == 'y' else Vector((0, 0, 1))
        cc = Vector(c)
        self.cyl(cc - ax * w * 0.38, cc + ax * w * 0.38, r - w * 0.55, rim, 20)

    def build(self):
        root = bpy.data.objects.new('g_' + self.name, None)
        bpy.context.scene.collection.objects.link(root)
        objs = [root]
        for mat, b in self.parts.items():
            me = bpy.data.meshes.new('g_' + self.name + '_' + mat)
            b.to_mesh(me)
            b.free()
            # simple box-projection UVs for textured materials
            uvl = me.uv_layers.new(name='UVMap')
            for poly in me.polygons:
                n = poly.normal
                for li in poly.loop_indices:
                    co = me.vertices[me.loops[li].vertex_index].co
                    if abs(n.z) > 0.7:
                        uv = (co.x, co.y)
                    elif abs(n.x) > abs(n.y):
                        uv = (co.y, co.z)
                    else:
                        uv = (co.x, co.z)
                    uvl.data[li].uv = (uv[0] * (2.5 if mat != 'tread' else 1), uv[1] * (2.5 if mat != 'tread' else 1))
            for p in me.polygons:
                p.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(35))
            me.materials.append(M[mat])
            ob = bpy.data.objects.new('g_' + self.name + '_' + mat, me)
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = root
            objs.append(ob)
        return objs


# ------------------------------------------------------------------ props
def lift():
    p = Prop('lift')
    for x in (-1.55, 1.55):
        # C-channel post: back plate + two flanges, base plate, carriage
        p.box((x, 0, 1.85), (0.34, 0.12, 3.7), 'blue', 0.01)
        for dy in (-0.14, 0.14):
            p.box((x + (0.12 if x > 0 else -0.12), dy, 1.85), (0.1, 0.03, 3.7), 'blue', 0.006)
        p.box((x, 0, 0.012), (0.6, 0.5, 0.024), 'darksteel', 0.004)
        for k in range(18):   # safety lock teeth
            p.box((x - (0.06 if x > 0 else -0.06), 0, 0.5 + k * 0.17), (0.02, 0.1, 0.02), 'steel', 0.0)
        p.box((x, -0.04, 0.62), (0.3, 0.26, 0.42), 'darksteel', 0.01)
        # swing arms with rubber pads
        for ang in (-0.5, 0.5):
            a = Vector((x, -0.04, 0.5))
            d = Vector((-math.copysign(1, x) * math.cos(ang), math.sin(ang) * 1.2, 0)).normalized()
            b = a + d * 1.05
            p.box(((a + b) / 2).to_tuple(), (1.05, 0.11, 0.08), 'darksteel', 0.01, (0, 0, math.atan2(d.y, d.x)))
            p.cyl(b.to_tuple(), (b + Vector((0, 0, 0.12))).to_tuple(), 0.06, 'steel', 14)
            p.cyl((b + Vector((0, 0, 0.12))).to_tuple(), (b + Vector((0, 0, 0.15))).to_tuple(), 0.075, 'rubber', 16)
    # overhead beam + hoses + power unit
    p.box((0, 0, 3.75), (3.45, 0.18, 0.16), 'blue', 0.01)
    p.cyl((-1.4, -0.12, 3.6), (1.4, -0.12, 3.6), 0.012, 'black', 6)
    p.box((1.82, -0.05, 1.3), (0.22, 0.24, 0.5), 'darksteel', 0.01)
    p.cyl((1.82, -0.05, 1.55), (1.82, -0.05, 1.85), 0.09, 'black', 16)
    p.box((1.95, -0.05, 1.35), (0.04, 0.12, 0.14), 'red', 0.005)
    return p


def toolchest():
    p = Prop('toolchest')
    W, D = 1.4, 0.6
    p.box((0, 0, 0.55), (W, D, 0.92), 'red', 0.02)
    p.box((0, 0, 1.03), (W + 0.02, D + 0.02, 0.04), 'black', 0.01)
    p.box((0, 0.02, 1.33), (W - 0.1, D - 0.15, 0.56), 'red', 0.02)
    p.box((0, -0.07, 1.62), (W - 0.08, D - 0.1, 0.04), 'red', 0.01)
    rows = [0.18, 0.3, 0.42, 0.54, 0.68, 0.84]
    for z in rows:
        p.box((0, -D / 2 - 0.004, z), (W - 0.08, 0.008, 0.1), 'red', 0.003)
        p.box((0, -D / 2 - 0.02, z + 0.03), (W - 0.3, 0.02, 0.018), 'chrome', 0.005)
    for z in (1.15, 1.27, 1.39):
        p.box((0, -D / 2 + 0.06, z), (W - 0.2, 0.008, 0.09), 'red', 0.003)
        p.box((0, -D / 2 + 0.045, z + 0.025), (0.5, 0.02, 0.016), 'chrome', 0.004)
    for x in (-W / 2 + 0.08, W / 2 - 0.08):
        for y in (-D / 2 + 0.08, D / 2 - 0.08):
            p.cyl((x, y, 0.09), (x, y, 0.03), 0.045, 'rubber', 12)
    p.cyl((W / 2 + 0.06, -0.2, 0.85), (W / 2 + 0.06, 0.2, 0.85), 0.016, 'chrome', 10)
    # a few tools lying on top
    for k in range(4):
        p.box((-0.4 + k * 0.18, -0.12, 1.065), (0.04, 0.24 + k * 0.03, 0.012), 'steel', 0.002, (0, 0, 0.1 * k))
    return p


def bench():
    p = Prop('bench')
    L, D = 3.2, 0.8
    p.box((0, 0, 0.92), (L, D, 0.06), 'wood', 0.008)
    for x in (-L / 2 + 0.06, L / 2 - 0.06):
        for y in (-D / 2 + 0.06, D / 2 - 0.06):
            p.box((x, y, 0.45), (0.06, 0.06, 0.9), 'darksteel', 0.005)
    p.box((0, 0, 0.2), (L - 0.1, D - 0.1, 0.03), 'darksteel', 0.004)
    p.box((L / 2 - 0.5, -0.02, 0.62), (0.8, D - 0.1, 0.5), 'darksteel', 0.01)
    for z in (0.5, 0.74):
        p.box((L / 2 - 0.5, -D / 2 + 0.03, z), (0.32, 0.02, 0.02), 'chrome', 0.004)
    # vise
    p.box((-L / 2 + 0.35, -D / 2 + 0.1, 1.02), (0.2, 0.28, 0.12), 'blue', 0.01)
    p.box((-L / 2 + 0.35, -D / 2 - 0.02, 1.08), (0.24, 0.05, 0.1), 'blue', 0.008)
    p.cyl((-L / 2 + 0.35, -D / 2 - 0.06, 1.05), (-L / 2 + 0.35, -D / 2 - 0.3, 1.05), 0.012, 'steel', 8)
    # bench grinder
    p.box((0.4, 0.1, 1.04), (0.3, 0.16, 0.18), 'green', 0.01)
    for dx in (-0.2, 0.2):
        p.cyl((0.4 + dx - 0.03, 0.1, 1.12), (0.4 + dx + 0.03, 0.1, 1.12), 0.08, 'engine', 18)
    # pegboard with tools on the wall behind
    p.box((0, D / 2 + 0.02, 1.75), (L - 0.1, 0.02, 1.2), 'pegboard', 0.0)
    for k in range(9):   # spanners, increasing size
        x = -L / 2 + 0.35 + k * 0.11
        ln = 0.16 + k * 0.025
        p.box((x, D / 2 - 0.005, 1.95 - ln / 2), (0.022, 0.008, ln), 'chrome', 0.003)
        p.cyl((x, D / 2 - 0.01, 1.95 - ln), (x, D / 2, 1.95 - ln), 0.02, 'chrome', 10)
    for k in range(6):   # screwdrivers
        x = 0.35 + k * 0.08
        p.cyl((x, D / 2 - 0.01, 1.8), (x, D / 2 - 0.01, 1.92), 0.014, ['red', 'yellow', 'blue'][k % 3], 8)
        p.cyl((x, D / 2 - 0.01, 1.65), (x, D / 2 - 0.01, 1.8), 0.004, 'steel', 6)
    p.box((1.05, D / 2 - 0.01, 1.85), (0.04, 0.02, 0.3), 'wood', 0.005)   # hammer
    p.box((1.05, D / 2 - 0.02, 2.0), (0.12, 0.04, 0.04), 'darksteel', 0.006)
    p.box((1.3, D / 2 - 0.01, 1.4), (0.3, 0.02, 0.3), 'darksteel', 0.004)  # saw blade / plate
    p.box((-0.9, D / 2 - 0.02, 1.35), (0.5, 0.06, 0.04), 'darksteel', 0.004)  # shelf with cans
    for k in range(4):
        p.cyl((-1.1 + k * 0.13, D / 2 - 0.04, 1.37), (-1.1 + k * 0.13, D / 2 - 0.04, 1.52), 0.04, 'oilcan' if k % 2 else 'red', 14)
    # task lamp
    p.cyl((L / 2 - 0.2, 0.25, 0.95), (L / 2 - 0.3, 0.1, 1.5), 0.012, 'black', 6)
    p.cyl((L / 2 - 0.3, 0.1, 1.5), (L / 2 - 0.45, -0.1, 1.45), 0.07, 'black', 14, r2=0.03)
    return p


def tirerack():
    p = Prop('tirerack')
    L, H = 2.4, 2.0
    for x in (-L / 2, L / 2):
        for y in (-0.25, 0.25):
            p.box((x, y, H / 2), (0.05, 0.05, H), 'orange', 0.005)
    for z in (0.05, 0.75, 1.45):
        for y in (-0.25, 0.25):
            p.box((0, y, z), (L, 0.05, 0.05), 'orange', 0.005)
    for row, z in enumerate((0.42, 1.12, 1.82)):
        for k in range(6):
            r, w = (0.33, 0.22) if row < 2 else (0.36, 0.26)
            p.tire((-L / 2 + 0.25 + k * 0.38, 0, z - 0.03), r, w, 'x', 'darksteel' if row == 2 else 'alu')
    return p


def shelf():
    p = Prop('shelf')
    L, D, H = 2.4, 0.6, 2.2
    for x in (-L / 2, L / 2):
        for y in (-D / 2, D / 2):
            p.box((x, y, H / 2), (0.04, 0.04, H), 'darksteel', 0.004)
    for z in (0.1, 0.8, 1.5, 2.15):
        p.box((0, 0, z), (L, D, 0.03), 'darksteel', 0.004)
    # stock: boxes, oil bottles, jerry cans
    for k in range(6):
        w = 0.3 + rng.random() * 0.2
        p.box((-L / 2 + 0.3 + k * 0.36, 0, 0.1 + 0.015 + 0.14), (w, 0.38, 0.28), 'cardboard', 0.01, (0, 0, rng.random() * 0.2))
    for k in range(12):
        x = -L / 2 + 0.15 + k * 0.18
        p.box((x, -0.1, 0.8 + 0.015 + 0.13), (0.12, 0.08, 0.26), 'oilcan' if k % 3 else 'yellow', 0.015)
        p.cyl((x, -0.1, 1.07), (x, -0.1, 1.11), 0.02, 'black', 8)
    for k in range(3):
        x = -0.6 + k * 0.5
        p.box((x, 0, 1.5 + 0.015 + 0.24), (0.36, 0.17, 0.48), 'red' if k != 1 else 'green', 0.03)
        p.box((x, 0, 2.0), (0.14, 0.04, 0.05), 'black', 0.01)
    for k in range(4):
        p.box((-L / 2 + 0.4 + k * 0.5, 0.05, 2.15 + 0.13), (0.42, 0.42, 0.24), 'cardboard', 0.01)
    return p


def compressor():
    p = Prop('compressor')
    p.cyl((-0.6, 0, 0.42), (0.6, 0, 0.42), 0.3, 'red', 24)
    p.sphere((-0.6, 0, 0.42), 0.3, 'red', (0.25, 1, 1))
    p.sphere((0.6, 0, 0.42), 0.3, 'red', (0.25, 1, 1))
    for x in (-0.45, 0.45):
        p.box((x, 0, 0.08), (0.08, 0.5, 0.16), 'darksteel', 0.01)
        p.cyl((x, -0.28, 0.06), (x, -0.22, 0.06), 0.06, 'rubber', 12)
    p.box((0.15, 0, 0.82), (0.36, 0.28, 0.24), 'darksteel', 0.01)    # pump
    p.cyl((-0.25, 0, 0.8), (-0.25, 0, 1.0), 0.13, 'black', 18)       # motor
    p.box((-0.25, 0.0, 0.8), (0.3, 0.3, 0.04), 'black', 0.005)
    p.cyl((0.45, -0.18, 0.86), (0.45, -0.22, 0.86), 0.05, 'gauge', 16)
    p.torus((0.45, -0.2, 0.86), 0.05, 0.008, 'chrome', 'y', 20, 6)
    # coiled hose
    for k in range(5):
        p.torus((0.55, 0.0, 0.25 + k * 0.012), 0.18, 0.012, 'yellow', 'z', 24, 6)
    return p


def hoist():
    p = Prop('hoist')
    # A-frame engine crane, yellow
    p.box((0, 0, 0.06), (0.12, 1.4, 0.1), 'yellow', 0.01)
    for x in (-0.4, 0.4):
        p.box((x, -0.35, 0.06), (0.1, 0.9, 0.09), 'yellow', 0.01, (0, 0, math.copysign(0.25, x)))
        p.cyl((x * 1.25, -0.8, 0.06), (x * 1.25, -0.8, 0.0), 0.05, 'rubber', 12)
    p.box((0, 0.6, 0.9), (0.12, 0.12, 1.7), 'yellow', 0.01)
    p.box((0, 0.05, 1.68), (0.11, 1.3, 0.11), 'yellow', 0.01, (0.3, 0, 0))
    p.cyl((0, 0.55, 0.9), (0, 0.2, 1.45), 0.035, 'darksteel', 12)   # ram
    p.cyl((0, -0.55, 1.45), (0, -0.55, 1.15), 0.008, 'chrome', 6)   # chain
    p.box((0, -0.55, 1.1), (0.04, 0.04, 0.08), 'steel', 0.004)
    return p


def engine():
    """Engine block on a stand: a project for the workshop."""
    p = Prop('engine')
    p.box((0, 0, 0.05), (0.6, 0.7, 0.05), 'red', 0.01)
    p.box((0, 0, 0.45), (0.08, 0.08, 0.8), 'red', 0.01)
    p.box((0, 0.2, 0.85), (0.3, 0.08, 0.08), 'red', 0.01)
    for x in (-0.25, 0.25):
        for y in (-0.3, 0.3):
            p.cyl((x, y, 0.05), (x, y, -0.0), 0.04, 'rubber', 10)
    # block
    p.box((0, -0.15, 0.95), (0.42, 0.62, 0.36), 'engine', 0.02)
    for sx in (-1, 1):   # V8 heads + valve covers
        p.box((sx * 0.21, -0.15, 1.17), (0.16, 0.6, 0.12), 'engine', 0.015, (0, sx * 0.55, 0))
        p.box((sx * 0.25, -0.15, 1.25), (0.13, 0.58, 0.05), 'red', 0.015, (0, sx * 0.55, 0))
        for k in range(4):
            p.cyl((sx * 0.31, -0.38 + k * 0.15, 1.1), (sx * 0.4, -0.38 + k * 0.15, 1.02), 0.022, 'steel', 8)
    p.box((0, -0.15, 1.24), (0.16, 0.5, 0.1), 'alu', 0.02)          # intake
    p.cyl((0, -0.15, 1.3), (0, -0.15, 1.42), 0.12, 'black', 20)      # air filter
    p.cyl((0, -0.5, 0.88), (0, -0.56, 0.88), 0.13, 'black', 20)      # crank pulley
    p.cyl((0, -0.5, 1.06), (0, -0.54, 1.06), 0.07, 'alu', 16)
    p.box((0, -0.15, 0.73), (0.38, 0.5, 0.1), 'black', 0.02)        # oil pan
    return p


def jack():
    p = Prop('jack')
    p.box((0, 0, 0.12), (0.34, 0.9, 0.1), 'red', 0.015)
    for x in (-0.15, 0.15):
        p.box((x, 0, 0.16), (0.03, 0.85, 0.16), 'red', 0.01)
    for (x, y) in ((-0.14, -0.4), (0.14, -0.4), (-0.12, 0.38), (0.12, 0.38)):
        p.cyl((x - 0.02, y, 0.06), (x + 0.02, y, 0.06), 0.05, 'steel', 12)
    p.box((0, -0.38, 0.28), (0.1, 0.24, 0.05), 'red', 0.01, (0.5, 0, 0))
    p.cyl((0, -0.48, 0.34), (0, -0.48, 0.37), 0.07, 'rubber', 16)
    p.cyl((0, 0.4, 0.2), (0, 1.25, 0.75), 0.016, 'chrome', 8)
    p.cyl((0, 1.2, 0.72), (0, 1.32, 0.8), 0.022, 'rubber', 8)
    for x in (-0.6, 0.6):   # pair of jack stands
        for k in range(3):
            a = k * 2 * math.pi / 3
            p.cyl((x, -0.1, 0.42), (x + math.cos(a) * 0.15, -0.1 + math.sin(a) * 0.15, 0.0), 0.012, 'red', 6)
        p.cyl((x, -0.1, 0.3), (x, -0.1, 0.5), 0.022, 'steel', 10)
        p.box((x, -0.1, 0.52), (0.08, 0.05, 0.03), 'steel', 0.005)
    return p


def drums():
    p = Prop('drums')
    for k, (x, y, m) in enumerate(((0, 0, 'blue'), (0.65, 0.1, 'green'), (0.32, 0.55, 'red'))):
        p.cyl((x, y, 0.0), (x, y, 0.88), 0.29, m, 24)
        for z in (0.29, 0.59):
            p.torus((x, y, z), 0.29, 0.012, m, 'z', 24, 6)
        p.cyl((x + 0.12, y, 0.88), (x + 0.12, y, 0.9), 0.03, 'darksteel', 10)
    p.cyl((-0.6, 0.1, 0.0), (-0.6, 0.1, 0.6), 0.2, 'darksteel', 18, r2=0.22)   # bin
    p.cyl((-0.85, -0.2, 0.0), (-0.85, -0.2, 0.5), 0.08, 'red', 16)            # extinguisher
    p.sphere((-0.85, -0.2, 0.5), 0.08, 'red', (1, 1, 0.6))
    p.cyl((-0.85, -0.2, 0.55), (-0.85, -0.2, 0.62), 0.02, 'black', 8)
    return p


def lounge():
    """Sofa, coffee table, bar stools and a wall TV for the high-level garage."""
    p = Prop('lounge')
    p.box((0, 0, 0.22), (2.2, 0.9, 0.3), 'leather', 0.06)
    p.box((0, 0.36, 0.55), (2.2, 0.2, 0.6), 'leather', 0.06)
    for x in (-1.05, 1.05):
        p.box((x, 0, 0.42), (0.18, 0.9, 0.4), 'leather', 0.06)
    for k in range(3):
        p.box((-0.72 + k * 0.72, -0.05, 0.42), (0.7, 0.75, 0.12), 'leather', 0.05)
    for x in (-1.0, 1.0):
        p.cyl((x, -0.35, 0.07), (x, -0.35, 0.0), 0.03, 'chrome', 8)
    p.box((0, -1.1, 0.42), (1.2, 0.6, 0.03), 'glass', 0.005)     # coffee table
    for x in (-0.5, 0.5):
        p.box((x, -1.1, 0.2), (0.04, 0.5, 0.4), 'chrome', 0.005)
    p.box((0.2, -1.1, 0.47), (0.25, 0.18, 0.06), 'red', 0.01)     # a model car box
    p.box((0, 1.1, 1.6), (1.6, 0.05, 0.92), 'screen', 0.01)       # TV on the wall
    p.box((0, 1.13, 1.6), (1.66, 0.03, 0.98), 'black', 0.01)
    return p


def bar():
    p = Prop('bar')
    p.box((0, 0, 0.55), (2.4, 0.6, 1.1), 'darksteel', 0.02)
    p.box((0, -0.05, 1.12), (2.5, 0.75, 0.05), 'wood', 0.01)
    for k in range(3):
        x = -0.8 + k * 0.8
        p.cyl((x, -0.75, 0.0), (x, -0.75, 0.75), 0.025, 'chrome', 10)
        p.cyl((x, -0.75, 0.75), (x, -0.75, 0.8), 0.19, 'leather', 20)
        p.torus((x, -0.75, 0.3), 0.15, 0.01, 'chrome', 'z', 20, 6)
        p.cyl((x, -0.75, 0.0), (x, -0.75, 0.02), 0.2, 'chrome', 20)
    p.box((0.8, 0.0, 1.27), (0.3, 0.3, 0.26), 'black', 0.02)      # coffee machine
    p.box((0.8, -0.15, 1.3), (0.2, 0.01, 0.1), 'screen', 0.0)
    return p


def lamp_fixture():
    p = Prop('fixture')
    p.box((0, 0, 0), (1.5, 0.22, 0.08), 'white', 0.01)
    p.box((0, 0, -0.045), (1.44, 0.16, 0.02), 'lamp', 0.0)
    for x in (-0.6, 0.6):
        p.cyl((x, 0, 0.04), (x, 0, 0.7), 0.004, 'darksteel', 4)
    return p


def podium():
    """Showroom turntable plinth."""
    p = Prop('podium')
    p.cyl((0, 0, 0.0), (0, 0, 0.16), 3.0, 'checker', 64)
    p.torus((0, 0, 0.16), 3.0, 0.03, 'chrome', 'z', 64, 8)
    p.cyl((0, 0, -0.01), (0, 0, 0.02), 3.15, 'black', 64)
    return p


def stanchions():
    p = Prop('stanchions')
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 3.6, math.sin(a) * 3.6
        p.cyl((x, y, 0.0), (x, y, 0.02), 0.16, 'chrome', 20)
        p.cyl((x, y, 0.0), (x, y, 0.95), 0.025, 'chrome', 10)
        p.sphere((x, y, 0.97), 0.04, 'chrome')
    return p


def main():
    reset_scene()
    init_mats()
    objs = []
    for fn in (lift, toolchest, bench, tirerack, shelf, compressor, hoist, engine, jack, drums, lounge, bar, lamp_fixture, podium, stanchions):
        p = fn()
        o = p.build()
        tris = 0
        for x in o:
            if x.type == 'MESH':
                x.data.calc_loop_triangles()
                tris += len(x.data.loop_triangles)
        print(f'  {p.name:12s} {tris:6d} tris')
        objs += o
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, 'garage.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=80, export_yup=True)
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


main()
