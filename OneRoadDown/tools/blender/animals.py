"""Low-poly animals for ONE ROAD DOWN (deer, cow, sheep, boar, ibex).

    python tools/blender/animals.py assets/models

Each animal is a root empty `<name>` with children `<name>__body` (torso, neck, head,
ears, tail, horns) and four legs `<name>__legFL/FR/RL/RR` whose origins sit at the hip /
shoulder joint, so the game can swing them for a walk / gallop cycle.
Game space: x left, y up, z forward (the head points to +z). G() maps to Blender.
"""
import math
import os
import sys
import numpy as np
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import reset_scene, value_noise, make_image

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)


def G(p):
    return Vector((p[0], -p[2], p[1]))


MATS = {}


def fur_material(name, base, dark, pattern='fur'):
    """Fur texture: fibrous noise, darker back, lighter belly via vertical gradient."""
    S = 256
    rng = np.random.default_rng(abs(hash(name)) % 2 ** 32)
    n = value_noise(S, 16, rng, 4)
    streak = value_noise(S, 64, rng, 2)
    img = np.ones((S, S, 4), np.float32)
    v = np.linspace(0, 1, S)[:, None]          # 0 top (back) .. 1 bottom (belly)
    b = np.array(base)[None, None, :]
    d = np.array(dark)[None, None, :]
    t = np.clip(0.55 * (1 - v) + 0.3 * n[..., None] + 0.15 * streak[..., None], 0, 1)
    col = b * (1 - t) + d * t
    if pattern == 'patches':   # cow: big black/white patches
        p = value_noise(S, 5, rng, 3)
        mask = (p > 0.52)[..., None]
        col = np.where(mask, np.array([0.08, 0.07, 0.07])[None, None, :] * (0.8 + 0.4 * n[..., None]), np.array([0.85, 0.83, 0.78])[None, None, :] * (0.85 + 0.2 * n[..., None]))
    if pattern == 'wool':
        curls = value_noise(S, 40, rng, 3)
        col = b * (0.75 + 0.45 * curls[..., None])
    if pattern == 'spots':      # young deer: faint pale spots on the back
        sp = value_noise(S, 24, rng, 1)
        m = ((sp > 0.72) & (v < 0.45))[..., None]
        col = np.where(m, col * 1.35, col)
    img[..., :3] = np.clip(col, 0, 1)
    image = make_image(name + '_tex', img)
    m = bpy.data.materials.new('an_' + name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value = 0.95
    tx = m.node_tree.nodes.new('ShaderNodeTexImage')
    tx.image = image
    m.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    return m


def plain(name, color, rough=0.6):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new('an_' + name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m


class Mesh:
    def __init__(self):
        self.v, self.f, self.uv, self.mi = [], [], [], []

    def add(self, verts, faces, uvs=None, mi=0):
        o = len(self.v)
        self.v += [tuple(p) for p in verts]
        for k, f in enumerate(faces):
            self.f.append(tuple(i + o for i in f))
            self.uv.append(uvs[k] if uvs else [(0.5, 0.5)] * len(f))
            self.mi.append(mi)

    def build(self, name, mats, origin=(0, 0, 0)):
        me = bpy.data.meshes.new(name)
        me.from_pydata([G(np.array(p) - np.array(origin)) for p in self.v], [], self.f)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        for fi, poly in enumerate(me.polygons):
            for k, li in enumerate(poly.loop_indices):
                uvl.data[li].uv = self.uv[fi][k]
            poly.material_index = self.mi[fi]
            poly.use_smooth = True
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = G(origin)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def loft(mesh, path, radii, sides=10, mi=0, squash=(1.0, 1.0), cap0=True, cap1=True):
    """Tube along a path (points in game space). radii: per point (rx, ry) or scalar."""
    path = [np.array(p, float) for p in path]
    rings = []
    for i, p in enumerate(path):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        t /= np.linalg.norm(t) + 1e-9
        ref = np.array([0, 1.0, 0]) if abs(t[1]) < 0.9 else np.array([1.0, 0, 0])
        side = np.cross(ref, t); side /= np.linalg.norm(side)
        upv = np.cross(t, side)
        r = radii[i] if isinstance(radii[i], (tuple, list)) else (radii[i], radii[i])
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            ring.append(p + side * math.cos(a) * r[0] * squash[0] + upv * math.sin(a) * r[1] * squash[1])
        rings.append(ring)
    verts, faces, uvs = [], [], []
    for ring in rings:
        verts += ring
    for i in range(len(rings) - 1):
        for s in range(sides):
            s2 = (s + 1) % sides
            a, b, c, d = i * sides + s, i * sides + s2, (i + 1) * sides + s2, (i + 1) * sides + s
            faces.append((a, b, c, d))
            # v runs around (top of the body = 0)
            uvs.append([(i / len(rings), s / sides), (i / len(rings), (s + 1) / sides), ((i + 1) / len(rings), (s + 1) / sides), ((i + 1) / len(rings), s / sides)])
    if cap0:
        faces.append(tuple(reversed(range(sides)))); uvs.append([(0.5, 0.5)] * sides)
    if cap1:
        n0 = (len(rings) - 1) * sides
        faces.append(tuple(range(n0, n0 + sides))); uvs.append([(0.5, 0.5)] * sides)
    mesh.add(verts, faces, uvs, mi)


def make_animal(name, P):
    """P: dict of proportions (metres)."""
    fur = fur_material(name, P['base'], P['dark'], P.get('pattern', 'fur'))
    dark = plain('hoof', (0.05, 0.04, 0.035), 0.5)
    horn = plain('horn', P.get('hornCol', (0.55, 0.48, 0.38)), 0.5)
    nose = plain('nose', (0.08, 0.06, 0.06), 0.35)
    L, H, Gth = P['len'], P['height'], P['girth']
    legH = P['legH']
    by = legH + Gth * 0.45                      # body centre height
    body = Mesh()
    # torso: lofted along z with a belly sag
    zs = np.linspace(-L / 2, L / 2, 9)
    path, radii = [], []
    for k, z in enumerate(zs):
        u = k / (len(zs) - 1)
        prof = math.sin(math.pi * (0.08 + 0.84 * u)) ** 0.55
        chest = 1 + 0.12 * math.exp(-((u - 0.72) / 0.18) ** 2)
        path.append((0, by + 0.04 * math.sin(math.pi * u) - 0.03, z))
        radii.append((Gth * 0.42 * prof * chest * P.get('wide', 1), Gth * 0.5 * prof * chest))
    loft(body, path, radii, 12, 0)
    # neck + head
    nk = P['neck']
    na = math.radians(P['neckAng'])
    n0 = np.array([0, by + Gth * 0.2, L / 2 - Gth * 0.15])
    n1 = n0 + np.array([0, math.sin(na) * nk, math.cos(na) * nk])
    loft(body, [n0, (n0 + n1) / 2, n1], [Gth * 0.26, Gth * 0.21, Gth * 0.17], 10, 0)
    hl = P['head']
    ha = math.radians(P.get('headAng', -25))
    h0 = n1 + np.array([0, Gth * 0.02, -Gth * 0.05])
    h1 = h0 + np.array([0, math.sin(ha) * hl, math.cos(ha) * hl])
    loft(body, [h0, h0 + (h1 - h0) * 0.45, h1], [(hl * 0.3, hl * 0.32), (hl * 0.26, hl * 0.28), (hl * 0.15, hl * 0.17)], 10, 0)
    # muzzle tip
    loft(body, [h1 - (h1 - h0) * 0.08, h1 + (h1 - h0) * 0.04], [hl * 0.12, hl * 0.05], 8, 2)
    # eyes
    for sx in (1, -1):
        e = h0 + (h1 - h0) * 0.35 + np.array([sx * hl * 0.24, hl * 0.12, 0])
        loft(body, [e - np.array([0, 0, 0.015]), e + np.array([0, 0, 0.015])], [0.02, 0.02], 6, 2)
    # ears
    for sx in (1, -1):
        e0 = h0 + np.array([sx * hl * 0.22, hl * 0.22, -hl * 0.05])
        e1 = e0 + np.array([sx * P['ear'] * 0.8, P['ear'] * 0.55, -P['ear'] * 0.2])
        loft(body, [e0, (e0 + e1) / 2, e1], [(0.035, 0.012), (P['ear'] * 0.28, 0.012), (0.005, 0.005)], 6, 0)
    # horns / antlers
    if P.get('antlers'):
        for sx in (1, -1):
            a0 = h0 + np.array([sx * hl * 0.12, hl * 0.3, 0])
            a1 = a0 + np.array([sx * 0.12, 0.28, -0.06])
            a2 = a1 + np.array([sx * 0.1, 0.22, 0.08])
            loft(body, [a0, a1, a2], [0.025, 0.02, 0.008], 6, 1)
            for tf in (0.45, 0.8):
                b0 = a0 + (a2 - a0) * tf
                loft(body, [b0, b0 + np.array([sx * 0.04, 0.12, 0.1])], [0.015, 0.005], 5, 1)
    if P.get('horns') == 'curl':
        for sx in (1, -1):
            pts = []
            for k in range(8):
                a = k / 7 * math.pi * 1.4
                pts.append(h0 + np.array([sx * (hl * 0.18 + 0.06 * k / 7), hl * 0.25 + 0.12 * math.sin(a), -0.12 * (1 - math.cos(a))]))
            loft(body, pts, list(np.linspace(0.045, 0.012, 8)), 6, 1)
    if P.get('horns') == 'swept':
        for sx in (1, -1):
            a0 = h0 + np.array([sx * hl * 0.12, hl * 0.3, -hl * 0.05])
            pts = [a0 + np.array([sx * 0.02 * k, 0.09 * k, -0.075 * k * k * 0.25]) for k in range(6)]
            loft(body, pts, list(np.linspace(0.04, 0.008, 6)), 6, 1)
    if P.get('horns') == 'cow':
        for sx in (1, -1):
            a0 = h0 + np.array([sx * hl * 0.25, hl * 0.25, -hl * 0.08])
            loft(body, [a0, a0 + np.array([sx * 0.12, 0.05, 0.02]), a0 + np.array([sx * 0.16, 0.13, 0.05])], [0.03, 0.022, 0.006], 6, 1)
    if P.get('tusks'):
        for sx in (1, -1):
            t0 = h1 - (h1 - h0) * 0.15 + np.array([sx * hl * 0.1, -hl * 0.05, 0])
            loft(body, [t0, t0 + np.array([sx * 0.02, 0.06, 0.02])], [0.012, 0.004], 5, 1)
    # tail
    t0 = np.array([0, by + Gth * 0.25, -L / 2 + 0.02])
    tl = P['tail']
    loft(body, [t0, t0 + np.array([0, -tl * 0.4, -tl * 0.3]), t0 + np.array([0, -tl, -tl * 0.35])], [0.035, 0.03, P.get('tailTuft', 0.02)], 6, 0)
    objs = [body.build(name + '__body', [fur, horn, nose])]
    # legs: origin at the joint
    for (sx, sz, nm) in ((1, 1, 'FL'), (-1, 1, 'FR'), (1, -1, 'RL'), (-1, -1, 'RR')):
        leg = Mesh()
        jx = sx * Gth * 0.2 * P.get('wide', 1)
        jz = sz * (L / 2 - Gth * 0.28)
        jy = by - Gth * 0.05
        top = np.array([jx, jy, jz])
        knee = top + np.array([0, -(jy - legH * 0.5) * 0.55, (0.05 if sz < 0 else -0.02)])
        foot = np.array([jx, 0.06, jz + (0.02 if sz > 0 else -0.02)])
        thick = P['legT']
        loft(leg, [top + np.array([0, Gth * 0.18, 0]), top, knee, foot], [thick * 1.7, thick * 1.3, thick * 0.75, thick * 0.6], 8, 0)
        loft(leg, [foot, foot - np.array([0, 0.07, -0.015])], [thick * 0.68, thick * 0.72], 8, 1)
        objs.append(leg.build(name + '__leg' + nm, [fur, dark], origin=top))
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root
    return [root] + objs


ANIMALS = {
    'deer': dict(len=1.25, height=1.1, girth=0.48, legH=0.78, legT=0.035, neck=0.5, neckAng=58, head=0.3, headAng=-35, ear=0.14,
                 tail=0.12, base=(0.55, 0.36, 0.2), dark=(0.36, 0.22, 0.12), antlers=True, pattern='spots'),
    'cow': dict(len=1.9, height=1.45, girth=0.86, legH=0.72, legT=0.07, neck=0.42, neckAng=18, head=0.5, headAng=-55, ear=0.13,
                tail=0.75, tailTuft=0.05, base=(0.85, 0.83, 0.78), dark=(0.1, 0.09, 0.09), pattern='patches', horns='cow', wide=1.1),
    'sheep': dict(len=1.05, height=0.85, girth=0.66, legH=0.42, legT=0.035, neck=0.24, neckAng=35, head=0.27, headAng=-40, ear=0.1,
                  tail=0.12, base=(0.86, 0.83, 0.74), dark=(0.7, 0.66, 0.58), pattern='wool', wide=1.1),
    'boar': dict(len=1.25, height=0.85, girth=0.62, legH=0.36, legT=0.045, neck=0.18, neckAng=8, head=0.42, headAng=-20, ear=0.09,
                 tail=0.2, base=(0.3, 0.24, 0.19), dark=(0.13, 0.1, 0.08), tusks=True),
    'ibex': dict(len=1.15, height=0.95, girth=0.52, legH=0.6, legT=0.04, neck=0.35, neckAng=50, head=0.28, headAng=-35, ear=0.1,
                 tail=0.1, base=(0.52, 0.45, 0.36), dark=(0.3, 0.25, 0.2), horns='swept', hornCol=(0.35, 0.3, 0.24)),
}


def main():
    reset_scene()
    objs = []
    for name, P in ANIMALS.items():
        o = make_animal(name, P)
        objs += o
        tris = sum(len(x.data.polygons) for x in o if x.type == 'MESH')
        print(f'  {name:8s} {tris} faces')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, 'animals.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=80, export_normals=True, export_yup=True)
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


main()
