"""Car bodies for ONE ROAD DOWN (fictional designs, no real brands).

    node tools/car-dims.mjs > tools/blender/cars.json
    python tools/blender/cars.py assets/models

Every body is a smooth analytic surface built from cross-sections (same dimensions the
physics uses), with boolean-cut wheel arches. Each face is tagged with the panel it
belongs to, so the export contains separate deformable panels (hood, doors, fenders,
quarters, roof, bumpers, glass ...) plus surface-projected lights, grille, plates,
mirrors and a full interior (dash, gauges, seats, steering wheel) for the cockpit view.

Coordinates: everything is computed in game space (x left, y up, z forward, origin =
centre of mass) and mapped to Blender with G(x, y, z) = (x, -z, y); the glTF exporter
(+Y up) maps it straight back.
"""
import json
import math
import os
import sys
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
from common import reset_scene, export_glb

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)
CARS = json.load(open(os.path.join(os.path.dirname(__file__), 'cars.json')))
ONLY = os.environ.get('CARS', '').split(',') if os.environ.get('CARS') else None

C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def G(p):
    return Vector((p[0], -p[2], p[1]))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ materials
MATS = {}


def mat(name, color, rough=0.5, metal=0.0, alpha=1.0, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new('car_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = 1.0
    MATS[name] = m
    return m


def init_mats():
    mat('paint', (0.6, 0.6, 0.6), 0.35, 0.1)
    mat('bumper', (0.06, 0.06, 0.06), 0.6)
    mat('trim', (0.03, 0.03, 0.03), 0.55)
    mat('chrome', (0.9, 0.9, 0.9), 0.08, 1.0)
    mat('glass', (0.05, 0.07, 0.09), 0.05, 0.0, 0.55)
    mat('headlight', (0.9, 0.9, 0.88), 0.1, 0.2, emit=(1, 0.95, 0.85))
    mat('taillight', (0.4, 0.02, 0.02), 0.2, emit=(1, 0.08, 0.04))
    mat('amber', (0.8, 0.4, 0.05), 0.2)
    mat('grille', (0.08, 0.08, 0.08), 0.6, 0.3)
    mat('plate', (0.9, 0.9, 0.9), 0.6)
    mat('under', (0.03, 0.03, 0.03), 0.95)
    mat('wells', (0.02, 0.02, 0.02), 0.95)
    mat('dash', (0.05, 0.05, 0.055), 0.7)
    mat('cabin', (0.12, 0.115, 0.11), 0.9)
    mat('seat', (0.16, 0.13, 0.11), 0.95)
    mat('gauges', (0.02, 0.02, 0.02), 0.4)
    mat('mirror', (0.7, 0.75, 0.8), 0.02, 1.0)


# part -> material kind
PART_MAT = {
    'hood': 'paint', 'trunk': 'paint', 'roof': 'paint', 'pillars': 'paint', 'fascia': 'paint', 'rearPanel': 'paint',
    'fenderFL': 'paint', 'fenderFR': 'paint', 'doorL': 'paint', 'doorR': 'paint', 'quarterL': 'paint', 'quarterR': 'paint',
    'bedRails': 'paint', 'bumperF': 'bumper', 'bumperR': 'bumper', 'glass': 'glass', 'seals': 'trim', 'under': 'under',
    'wells': 'wells', 'bed': 'trim',
}


# ------------------------------------------------------------------ the body profile
class Profile:
    def __init__(self, c):
        self.c = c
        d, T, md = c['dims'], c['T'], c['model']
        self.d, self.T, self.md = d, T, md
        self.type = md['type']
        self.L, self.W = d['L'], d['W']
        self.zF, self.zR = d['zF'], d['zR']
        self.half = d['half']
        self.cr = T['cr']
        self.bottom, self.roof = d['bottom'], d['roof']
        self.yBelt, self.yNose, self.yTail = d['yBelt'], d['yNose'], d['yTail']
        self.bed = bool(T.get('bed'))
        self.ws, self.roofF, self.roofR, self.back = T['ws'], T['roofF'], T['roofR'], T['back']
        self.tum = T['tumble']
        self.boxy = {'beast': 1.0, 'suv': 0.8, 'pickup': 0.7, 'monster': 0.7, 'baja': 0.6, 'wagon': 0.5, 'hatch': 0.35,
                     'sedan': 0.35, 'muscle': 0.3, 'coupe': 0.2, 'sports': 0.05, 'super': 0.0, 'hyper': 0.0,
                     'wedge': 0.55, 'berlinetta': 0.0, 'longtail': 0.0, 'gt': 0.08, 'rear': 0.0}[self.type]
        self.style = md.get('style', '')
        self.sport = self.type in ('sports', 'super', 'hyper', 'wedge', 'berlinetta', 'longtail', 'gt', 'rear')
        # door lines
        long_door = self.type in ('sedan', 'wagon', 'suv', 'beast')
        self.doorR = (self.back + 0.02) if self.bed else max(self.back + 0.12, self.ws - (0.42 if long_door else 0.3))
        self.fenderStart = self.ws - 0.02
        self.ghBase = self.back
        self.uB = lerp(self.roofR, self.roofF, 0.42)
        self.has_b = (self.roofF - self.roofR) > 0.18
        self.cpillar = self.type in ('sedan', 'coupe', 'muscle', 'sports', 'super', 'hyper', 'wedge', 'berlinetta', 'longtail', 'gt', 'rear') or self.bed

    def uz(self, u):
        return self.zR + u * self.L

    def width(self, z):
        dEnd = min(z - self.zR, self.zF - z)
        w = self.half
        cr = self.cr
        if dEnd < cr:
            w = self.half - cr + math.sqrt(max(0.0, cr * cr - (cr - dEnd) ** 2))
        return w

    def deck(self, u):
        """Belt / deck line (JS topY)."""
        T = self.T
        if u > T['ws']:
            t = (u - T['ws']) / (1 - T['ws'])
            # the wedge runs dead straight from screen to nose
            y = lerp(self.yBelt, self.yNose, t if self.style == 'wedge' else smooth(T['ws'], 1, u) ** 0.85)
        elif u < T['back'] and not self.bed:
            y = lerp(self.yTail, self.yBelt, smooth(0, T['back'] + 1e-4, u) * 0.15)
        else:
            y = self.yBelt
        y -= 0.07 * smooth(0.965, 1, u) + 0.06 * smooth(0.035, 0, u)
        return y

    def sill(self, u):
        return self.bottom + 0.06 * smooth(0.9, 1, u) + 0.05 * smooth(0.1, 0, u)

    def gh(self, u):
        """Greenhouse height fraction 0..1."""
        if u <= self.ghBase or u >= self.ws:
            return 0.0
        if u < self.roofR:
            if self.bed:
                return smooth(self.ghBase, self.ghBase + 0.012, u)
            return smooth(self.ghBase, self.roofR, u) ** 0.75
        if u > self.roofF:
            return 1 - smooth(self.roofF, self.ws, u) ** 1.1
        return 1.0

    def arch_top(self, z):
        """Height the fender must reach over the wheels at z (fender bulge)."""
        d = self.d
        top = -9.0
        R = d['archR'] + 0.04
        for ax in (d['a'], -d['b']):
            dz = abs(z - ax)
            if dz < R:
                h = d['wcY'] + math.sqrt(R * R - dz * dz) + (0.06 if self.sport else 0.03)
            else:
                # long, soft run-out in front of / behind the arch
                h = lerp(d['wcY'] + 0.03, d['wcY'] + R * 0.35 + 0.03, smooth(R * 1.9, R, dz))
            top = max(top, h)
        return top

    def control(self, u):
        """Half cross-section control points from bottom centre to top centre (x >= 0)."""
        z = self.uz(u)
        w = self.width(z)
        bot = self.sill(u)
        yd = self.deck(u)
        yb = yd
        at = self.arch_top(z)
        bulge = max(0.0, at - yd) if self.type != 'monster' else 0.0
        h = max(0.05, yb - bot)
        g = self.gh(u)
        yt = lerp(yb, self.roof, g)
        bx = self.boxy
        crown = 0.025 + 0.02 * (1 - bx) if self.style != 'wedge' else 0.012
        tw = self.tum * w
        hs = h + bulge   # side height incl. fender bulge
        pts = [
            (0.0, bot),
            (0.6 * w, bot),
            (lerp(0.86, 0.93, bx) * w, bot + 0.008),
            (lerp(0.965, 0.985, bx) * w, bot + 0.13 * hs),
            (w, bot + 0.46 * hs),
            (lerp(0.985, 0.998, bx) * w, bot + 0.8 * hs),
            (lerp(0.955, 0.985, bx) * w, bot + 0.94 * hs),
            (lerp(0.9, 0.95, bx) * w, yb + bulge),
            (lerp(lerp(0.88, 0.93, bx) * w, tw, 0.55) - 0.12 * bulge / (bulge + 0.05) * w * 0.15, lerp(yb + 0.006, yt, 0.55) + bulge * 0.35 * (1 - g)),
            (tw, yt - 0.035 * g + 0.004 * (1 - g) + bulge * 0.12 * (1 - g)),
            (lerp(0.55, 0.7, bx) * tw, yt + 0.006 + crown * 0.55 * (1 - g)),
            (0.0, yt + 0.01 + crown * (1 - g)),
        ]
        return pts


SEG = [3, 3, 3, 4, 4, 3, 3, 3, 4, 3, 4]   # samples per control segment (dense: smooth reflections)
K_BELT = sum(SEG[:7])                      # index of the belt-edge control point
K_ROOFEDGE = sum(SEG[:9])                  # index of the roof-edge control point
K_SILL = sum(SEG[:2])


def catmull(pts, seg):
    P = [np.array(p) for p in pts]
    out = []
    for i in range(len(P) - 1):
        p0 = P[max(0, i - 1)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(len(P) - 1, i + 2)]
        for k in range(seg[i]):
            t = k / seg[i]
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(q)
    out.append(P[-1])
    return out


def section_us(pr):
    base = list(np.linspace(0, 1, 72))
    keys = [pr.ws, pr.roofF, pr.roofR, pr.ghBase, pr.doorR, pr.fenderStart, 0.035, 0.965, 0.1, 0.9]
    for k in keys:
        for o in (-0.012, 0.0, 0.012):
            base.append(k + o)
    for k in np.linspace(pr.roofF, pr.ws, 8):
        base.append(k)
    for k in np.linspace(pr.ghBase, pr.roofR, 6):
        base.append(k)
    if pr.has_b:
        base += [pr.uB - 0.012, pr.uB + 0.012]
    us = sorted(set(round(min(1, max(0, u)), 4) for u in base))
    out = [us[0]]
    for u in us[1:]:
        if u - out[-1] > 0.006:
            out.append(u)
    if out[-1] != 1.0:
        out[-1] = 1.0
    return out


def classify(pr, u, k, side, y, sec_g):
    """Part name for a body face at section param u, half-ring index k (0 = bottom centre)."""
    S = 'L' if side > 0 else 'R'
    bumperH = min(0.2, (pr.yNose - pr.bottom) * 0.55)
    if k < K_SILL - 0:
        return 'under'
    if k < K_BELT:
        if u > 0.93 and y < pr.sill(u) + bumperH:
            return 'bumperF'
        if u < 0.07 and y < pr.sill(u) + bumperH:
            return 'bumperR'
        if u > pr.fenderStart:
            return 'fenderF' + S
        if u > pr.doorR:
            return 'door' + S
        return 'quarter' + S
    # above the belt
    if sec_g < 0.02:
        if u >= pr.ws - 0.005:
            return 'hood'
        if pr.bed and u < pr.ghBase:
            return 'bedRails'
        return 'trunk'
    if k >= K_ROOFEDGE:
        if pr.roofR <= u <= pr.roofF:
            return 'roof'
        if k < K_ROOFEDGE + 1:
            return 'pillars'
        return 'glass'
    # side window band
    if k == K_BELT:
        return 'seals'
    if k >= K_ROOFEDGE - 1:
        return 'pillars'
    if u > pr.ws - 0.03:
        return 'pillars'
    if pr.has_b and abs(u - pr.uB) < 0.012:
        return 'pillars'
    if pr.cpillar and u < pr.roofR + (0.02 if pr.bed else 0.035):
        return 'pillars'
    if not pr.cpillar and u < pr.ghBase + 0.02:
        return 'pillars'
    return 'glass'


def build_body(pr, name):
    us = section_us(pr)
    rings = []
    for u in us:
        half = catmull(pr.control(u), SEG)
        n = len(half)
        ring = [(p[0], p[1]) for p in half] + [(-p[0], p[1]) for p in reversed(half[1:-1])]
        rings.append((u, ring, n))
    n_half = rings[0][2]
    nr = len(rings[0][1])

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    verts = []
    along = 0.0
    arclen = []
    for i, (u, ring, _) in enumerate(rings):
        z = pr.uz(u)
        row = [bm.verts.new(G((x, y, z))) for (x, y) in ring]
        verts.append(row)
        acc = [0.0]
        for j in range(1, nr):
            acc.append(acc[-1] + math.hypot(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1]))
        arclen.append(acc)
    parts = []
    face_part = []

    def part_index(p):
        if p not in parts:
            parts.append(p)
        return parts.index(p)

    for i in range(len(rings) - 1):
        u0, u1 = rings[i][0], rings[i + 1][0]
        uc = (u0 + u1) / 2
        g = min(pr.gh(u0), pr.gh(u1))
        for j in range(nr):
            j2 = (j + 1) % nr
            a, b, c2, d = verts[i][j], verts[i][j2], verts[i + 1][j2], verts[i + 1][j]
            f = bm.faces.new((a, d, c2, b))
            # half-ring index & side
            jc = j + 0.5
            if jc < n_half - 1:
                k, side = int(math.floor(jc)), 1
            else:
                k, side = int(math.floor(nr - jc)), -1
            y = (rings[i][1][j][1] + rings[i][1][j2][1]) / 2
            p = classify(pr, uc, k, side, y, g)
            f.material_index = part_index(p)
            zz0, zz1 = pr.uz(u0) * 0.5, pr.uz(u1) * 0.5
            s0, s1 = arclen[i][j] * 0.5, (arclen[i][j2] if j2 else arclen[i][-1] + 0.05) * 0.5
            for loop, uv in zip(f.loops, [(s0, zz0), (s0, zz1), (s1, zz1), (s1, zz0)]):
                loop[uvl].uv = uv
    # rounded nose / tail: shrink the end ring about its centroid in a few steps, then cap
    for end in (0, 1):
        ring_v = verts[-1] if end else verts[0]
        u, ring, _ = rings[-1] if end else rings[0]
        z = pr.uz(u)
        cx = 0.0
        cy = sum(p[1] for p in ring) / len(ring)
        # quarter-circle edge of constant radius, then a flat cap
        Rn = 0.07 if pr.boxy < 0.5 else 0.05
        steps = [(Rn * (1 - math.cos(t)), Rn * math.sin(t)) for t in np.linspace(0, math.pi / 2, 7)[1:]]
        prev = ring_v
        dz = 1 if end else -1
        for si, (shr, off) in enumerate(steps):
            row = []
            for (x, y) in ring:
                dx, dy = x - cx, y - cy
                l = math.hypot(dx, dy) + 1e-6
                k = max(0.2, 1 - shr / l)
                row.append(bm.verts.new(G((cx + dx * k, cy + dy * k, z + dz * off))))
            for j in range(nr):
                j2 = (j + 1) % nr
                quad = (prev[j], prev[j2], row[j2], row[j]) if end else (prev[j], row[j], row[j2], prev[j2])
                f = bm.faces.new(quad)
                y = ring[j][1]
                bumperH = min(0.2, (pr.yNose - pr.bottom) * 0.55)
                if y < pr.sill(u) + bumperH:
                    p = 'bumperF' if end else 'bumperR'
                else:
                    p = ('fascia' if end else 'rearPanel') if y < (pr.deck(u) - 0.01) else ('hood' if end else ('bedRails' if pr.bed else 'trunk'))
                f.material_index = part_index(p)
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uvl].uv = (co.x * 0.5, co.z * 0.5)
            prev = row
        cap = bm.faces.new(list(reversed(prev)) if end else prev)
        cap.material_index = part_index('fascia' if end else 'rearPanel')
        for loop in cap.loops:
            co = loop.vert.co
            loop[uvl].uv = (co.x * 0.5, co.z * 0.5)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in parts:
        m = bpy.data.materials.get('part_' + p) or bpy.data.materials.new('part_' + p)
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    # make sure all faces point outwards
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    return ob


def cutter_cylinder(name, centre, radius, x0, x1, matname):
    """Cylinder along game x from x0 to x1 (both signs handled by caller)."""
    bm = bmesh.new()
    seg = 40
    ring0, ring1 = [], []
    for s in range(seg):
        a = 2 * math.pi * s / seg
        y = centre[1] + math.sin(a) * radius
        z = centre[2] + math.cos(a) * radius * 1.04
        ring0.append(bm.verts.new(G((x0, y, z))))
        ring1.append(bm.verts.new(G((x1, y, z))))
    for s in range(seg):
        s2 = (s + 1) % seg
        bm.faces.new((ring0[s], ring0[s2], ring1[s2], ring1[s]))
    bm.faces.new(list(reversed(ring0)))
    bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get('part_' + matname) or bpy.data.materials.new('part_' + matname)
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def cutter_box(name, x0, x1, y0, y1, z0, z1, matname):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        gx = x0 if v.co.x < 0 else x1
        gy = y0 if v.co.z < 0 else y1
        gz = z0 if -v.co.y < 0 else z1
        v.co = G((gx, gy, gz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get('part_' + matname) or bpy.data.materials.new('part_' + matname)
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def boolean_diff(ob, cutter):
    mod = ob.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    try:
        mod.material_mode = 'TRANSFER'
    except Exception:
        pass
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


# ------------------------------------------------------------------ small mesh helpers
class Acc:
    """Accumulates loose geometry (game coords) for one output part."""

    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def add(self, verts, faces, uvs=None):
        o = len(self.v)
        self.v += [tuple(p) for p in verts]
        for fi, f in enumerate(faces):
            self.f.append(tuple(i + o for i in f))
            self.uv.append(uvs[fi] if uvs else None)

    def empty(self):
        return not self.f


def acc_object(name, acc, matname, smooth_angle=40):
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(p) for p in acc.v], [], acc.f)
    me.update()
    if any(u is not None for u in acc.uv):
        uvl = me.uv_layers.new(name='UVMap')
        for fi, poly in enumerate(me.polygons):
            uv = acc.uv[fi]
            for k, li in enumerate(poly.loop_indices):
                uvl.data[li].uv = uv[k] if uv else (0, 0)
    me.materials.append(MATS[matname])
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    except Exception:
        pass
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(acc, cx, cy, cz, sx, sy, sz, rot=None):
    pts = []
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1):
                p = np.array([dx * sx / 2, dy * sy / 2, dz * sz / 2])
                if rot is not None:
                    p = rot @ p
                pts.append(p + np.array([cx, cy, cz]))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    acc.add(pts, faces)


def rounded_box(acc, c, size, r, rot=None, seg=3):
    """Rounded box via a superellipsoid-ish sphere mapping (game coords)."""
    sx, sy, sz = size
    nu, nv = 12, 8
    verts, faces = [], []
    for i in range(nv + 1):
        th = math.pi * i / nv - math.pi / 2
        for j in range(nu):
            ph = 2 * math.pi * j / nu
            cx_, cy_, cz_ = math.cos(th) * math.cos(ph), math.sin(th), math.cos(th) * math.sin(ph)
            e = 0.35
            f = lambda q: math.copysign(abs(q) ** e, q)
            p = np.array([f(cx_) * sx / 2, f(cy_) * sy / 2, f(cz_) * sz / 2])
            if rot is not None:
                p = rot @ p
            verts.append(p + np.array(c))
    for i in range(nv):
        for j in range(nu):
            a = i * nu + j; b = i * nu + (j + 1) % nu
            faces.append((a, b, b + nu, a + nu))
    acc.add(verts, faces)


def rotx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def roty(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rotz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def cylinder(acc, a, b, r, seg=10, cap=True):
    a, b = np.array(a, float), np.array(b, float)
    ax = b - a
    L = np.linalg.norm(ax)
    ax /= L
    ref = np.array([0, 1.0, 0]) if abs(ax[1]) < 0.9 else np.array([1.0, 0, 0])
    n1 = np.cross(ax, ref); n1 /= np.linalg.norm(n1)
    n2 = np.cross(ax, n1)
    verts, faces = [], []
    for s in range(seg):
        t = 2 * math.pi * s / seg
        d = n1 * math.cos(t) + n2 * math.sin(t)
        verts.append(a + d * r)
        verts.append(b + d * r)
    for s in range(seg):
        s2 = (s + 1) % seg
        faces.append((2 * s, 2 * s2, 2 * s2 + 1, 2 * s + 1))
    if cap:
        faces.append(tuple(2 * s for s in reversed(range(seg))))
        faces.append(tuple(2 * s + 1 for s in range(seg)))
    acc.add(verts, faces)


def torus(acc, centre, R, r, rot, seg=28, sides=8, arc=2 * math.pi):
    verts, faces = [], []
    closed = arc >= 2 * math.pi - 1e-6
    n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg
        for j in range(sides):
            b = 2 * math.pi * j / sides
            p = np.array([(R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)])
            verts.append(rot @ p + np.array(centre))
    for i in range(seg):
        i2 = (i + 1) % n if closed else i + 1
        for j in range(sides):
            j2 = (j + 1) % sides
            faces.append((i * sides + j, i * sides + j2, i2 * sides + j2, i2 * sides + j))
    acc.add(verts, faces)


# ------------------------------------------------------------------ surface projection
class Surface:
    def __init__(self, ob):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(ob, dg)

    def hit(self, origin, direction):
        loc, nor, idx, dist = self.bvh.ray_cast(G(origin), G(direction).normalized(), 10.0)
        if loc is None:
            return None, None
        # back to game space
        p = np.array([loc.x, loc.z, -loc.y])
        n = np.array([nor.x, nor.z, -nor.y])
        return p, n


def patch(surf, acc, centre, size, axis, offset, round_=0.4, n=(10, 5), uv=True, rim=None, rim_depth=0.012, skew=0.0, taper=0.0):
    """Project a rounded-rectangle grid onto the body along `axis` (+z front, -z rear,
    +x / -x sides). Returns False if it misses the body."""
    cx, cy = centre
    w, h = size
    nx, ny = n
    grid = []
    for iy in range(ny + 1):
        row = []
        for ix in range(nx + 1):
            s, t = -1 + 2 * ix / nx, -1 + 2 * iy / ny
            ds, dt = s * math.sqrt(max(0, 1 - t * t / 2)), t * math.sqrt(max(0, 1 - s * s / 2))
            s2, t2 = lerp(s, ds, round_), lerp(t, dt, round_)
            s2 = s2 * (1 + taper * t2) + skew * (t2 + 1) * 0.5
            if axis == '+y':
                o = (cx + s2 * w / 2, 3.0, cy + t2 * h / 2)
                dvec = (0, -1, 0)
            elif axis in ('+z', '-z'):
                sg = 1 if axis == '+z' else -1
                o = (cx + s2 * w / 2 * sg, cy + t2 * h / 2, 3.0 * sg)
                dvec = (0, 0, -sg)
            else:
                sg = 1 if axis == '+x' else -1
                o = (3.0 * sg, cy + t2 * h / 2, cx + s2 * w / 2 * -sg)
                dvec = (-sg, 0, 0)
            p, nn = surf.hit(o, dvec)
            if p is None:
                return False
            row.append((p + nn * offset, p, nn, (ix / nx, iy / ny)))
        grid.append(row)
    verts, faces, uvs = [], [], []
    idx = {}
    for iy in range(ny + 1):
        for ix in range(nx + 1):
            idx[(ix, iy)] = len(verts)
            verts.append(grid[iy][ix][0])
    for iy in range(ny):
        for ix in range(nx):
            a, b, c2, d = idx[(ix, iy)], idx[(ix + 1, iy)], idx[(ix + 1, iy + 1)], idx[(ix, iy + 1)]
            faces.append((a, b, c2, d))
            uvs.append([grid[iy][ix][3], grid[iy][ix + 1][3], grid[iy + 1][ix + 1][3], grid[iy + 1][ix][3]] if uv else None)
    # make faces point outwards (along the surface normal)
    fv = [np.array(verts[i]) for i in faces[len(faces) // 2]]
    fn = np.cross(fv[1] - fv[0], fv[2] - fv[0])
    mid = grid[ny // 2][nx // 2][2]
    if np.dot(fn, mid) < 0:
        faces = [tuple(reversed(f)) for f in faces]
        uvs = [list(reversed(u)) if u else None for u in uvs]
    acc.add(verts, faces, uvs)
    if rim is not None:
        # bezel: boundary ring pushed out a little more + side wall down to the body
        border = [(ix, 0) for ix in range(nx)] + [(nx, iy) for iy in range(ny)] + \
                 [(ix, ny) for ix in range(nx, 0, -1)] + [(0, iy) for iy in range(ny, 0, -1)]
        bv, bf = [], []
        for (ix, iy) in border:
            top, base, nn, _ = grid[iy][ix]
            c = np.array(grid[ny // 2][nx // 2][0])
            out = top + (top - c) * 0.06 + nn * 0.002
            bv += [out, base - nn * 0.002, top]
        m = len(border)
        for k in range(m):
            k2 = (k + 1) % m
            bf.append((3 * k, 3 * k2, 3 * k2 + 1, 3 * k + 1))
            bf.append((3 * k + 2, 3 * k2 + 2, 3 * k2, 3 * k))
        rim.add(bv, bf)
    return True


# ------------------------------------------------------------------ one car
def build_car(c):
    pr = Profile(c)
    cid = c['id']
    d = pr.d
    md = pr.md
    objs = []

    body = build_body(pr, cid + '__body')
    # wheel arches (both sides) and pickup bed
    for ax in (d['a'], -d['b']):
        for sgn in (1, -1):
            # only as deep as the tyre (plus steering clearance) so low hoods are not holed
            xin = max(pr.half * 0.42, c['ph']['track'] / 2 - d['r'] * 0.45 - 0.03)
            x0, x1 = (xin, pr.half + 0.4) if sgn > 0 else (-pr.half - 0.4, -xin)
            cut = cutter_cylinder('cut', (0, d['wcY'], ax), d['archR'], x0, x1, 'wells')
            boolean_diff(body, cut)
    if pr.bed:
        zb = pr.uz(pr.back) - 0.04
        wB = pr.width(pr.zR + 0.3) - 0.06
        floorY = pr.bottom + (pr.yBelt - pr.bottom) * 0.35
        cut = cutter_box('cut', -wB, wB, floorY, pr.yBelt + 0.3, pr.zR + 0.06, zb, 'bed')
        boolean_diff(body, cut)

    surf = Surface(body)

    # split the body by part
    me = body.data
    slot_names = [m.name.replace('part_', '') for m in me.materials]
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    by_part = {}
    for f in bm.faces:
        p = slot_names[f.material_index] if f.material_index < len(slot_names) else 'wells'
        by_part.setdefault(p, []).append(f)
    for p, faces in by_part.items():
        acc = Acc()
        vmap = {}
        for f in faces:
            ids = []
            for v in f.verts:
                if v.index not in vmap:
                    vmap[v.index] = len(acc.v)
                    acc.v.append((v.co.x, v.co.z, -v.co.y))
                ids.append(vmap[v.index])
            acc.f.append(tuple(ids))
            acc.uv.append([tuple(l[uvl].uv) for l in f.loops] if uvl else None)
        if p == 'glass':
            # sit the glass a few mm inside the frame
            cen = np.array([0, (pr.yBelt + pr.roof) / 2, (pr.uz(pr.ghBase) + pr.uz(pr.ws)) / 2])
            acc.v = [tuple(np.array(v) + (cen - np.array(v)) / (np.linalg.norm(cen - np.array(v)) + 1e-6) * 0.006) for v in acc.v]
        kind = PART_MAT.get(p, 'paint')
        if kind not in ('paint', 'bumper'):
            acc.uv = [None] * len(acc.f)   # only painted panels use UVs (wear mask)
        if p in ('pillars',) and pr.sport:
            kind = 'trim'
        objs.append(acc_object(cid + '__' + p, acc, kind, 35))
    bm.free()
    bpy.data.objects.remove(body, do_unlink=True)

    # ---------------------------------------------------------------- lights, grille, plates
    lights_L, lights_R, tails, housing, amber, grille, grille_frame = Acc(), Acc(), Acc(), Acc(), Acc(), Acc(), Acc()
    plateF, plateR = Acc(), Acc()
    old = (not md.get('sport')) and pr.type in ('hatch', 'wagon', 'pickup', 'sedan', 'coupe', 'muscle', 'suv')
    bumperH = min(0.2, (pr.yNose - pr.bottom) * 0.55)
    yN = pr.deck(0.995)
    face_h = yN - (pr.sill(1) + bumperH)
    ly = pr.sill(1) + bumperH + face_h * (0.62 if not pr.sport else 0.7)
    lx = pr.half - pr.cr * 0.55 - 0.1
    if old and pr.type in ('hatch', 'pickup', 'suv', 'wagon'):
        lsize, lround = (0.19, 0.19), 1.0
    elif old:
        lsize, lround = (0.34, 0.13), 0.35
    elif pr.sport:
        lsize, lround = (0.38, 0.075), 0.55
    else:
        lsize, lround = (0.34, 0.11), 0.45
    if pr.type == 'beast':
        lsize, lround = (0.2, 0.2), 1.0
    vents = Acc()
    if pr.style:
        tly = style_details(pr, surf, lights_L, lights_R, tails, housing, amber, grille, vents, bumperH)
    for sgn, acc in (() if pr.style else ((1, lights_L), (-1, lights_R))):
        patch(surf, acc, (sgn * lx, ly), lsize, '+z', 0.008, lround, (10, 6), True, housing)
        # indicator below / outside the lamp
        patch(surf, amber, (sgn * (lx + lsize[0] * 0.45), ly - lsize[1] * 0.55 - 0.03), (0.09, 0.04), '+z', 0.006, 0.5, (4, 2), False)
    # grille
    gw = 0 if pr.style else (lx - lsize[0] / 2 - 0.04) * 2 if not pr.sport else pr.W * 0.42
    gy = ly if not pr.sport else pr.sill(1) + bumperH * 0.55
    gh_ = min(face_h * 0.7, 0.24) if not pr.sport else bumperH * 0.6
    if gw > 0.2:
        patch(surf, grille, (0, gy), (gw, gh_), '+z', 0.006, 0.12, (10, 4), True, grille_frame)
    # lower intake in the bumper
    if not pr.style:
      patch(surf, grille, (0, pr.sill(1) + bumperH * 0.38), (pr.W * (0.5 if pr.sport else 0.36), bumperH * 0.32), '+z', 0.006, 0.3, (8, 2), True)
    # tail lights
    if not pr.style:
        tly = pr.deck(0.005) - (pr.deck(0.005) - pr.sill(0) - bumperH) * 0.35
    tsize = (0.3, 0.14) if not pr.sport else (0.42, 0.08)
    if pr.type in ('suv', 'beast', 'wagon'):
        tsize = (0.14, 0.3)
    tlx = pr.half - pr.cr * 0.5 - tsize[0] / 2 - 0.02
    for sgn in (() if pr.style else (1, -1)):
        patch(surf, tails, (sgn * tlx, tly), tsize, '-z', 0.008, 0.35, (8, 5), False, housing)
    # plates
    patch(surf, plateF, (0, pr.sill(1) + bumperH * 0.62), (0.44, 0.11), '+z', 0.012, 0.05, (4, 1), True)
    patch(surf, plateR, (0, max(pr.sill(0) + bumperH + 0.08, tly - 0.12)), (0.44, 0.11), '-z', 0.012, 0.05, (4, 1), True)
    for nm, acc, mk in (('lightL', lights_L, 'headlight'), ('lightR', lights_R, 'headlight'), ('tail', tails, 'taillight'),
                        ('lamps', housing, 'chrome' if md.get('chrome') else 'trim'), ('amber', amber, 'amber'),
                        ('grille', grille, 'grille'), ('grilleFrame', grille_frame, 'chrome' if md.get('chrome') else 'trim'),
                        ('plateF', plateF, 'plate'), ('plateR', plateR, 'plate'), ('vents', vents, 'trim')):
        if not acc.empty():
            objs.append(acc_object(cid + '__' + nm, acc, mk, 50))

    # ---------------------------------------------------------------- mirrors, handles, wipers
    mir, mirg, hand, wip = Acc(), Acc(), Acc(), Acc()
    zM = pr.uz(pr.ws) - 0.1
    wM = pr.width(zM)
    for sgn in (1, -1):
        c0 = (sgn * (wM + 0.09), pr.yBelt + 0.09, zM - 0.04)
        rounded_box(mir, c0, (0.2, 0.12, 0.1), 0.03, roty(sgn * 0.12))
        box(mir, sgn * (wM + 0.025), pr.yBelt + 0.06, zM, 0.08, 0.03, 0.05)
        # mirror glass faces backwards
        g = Acc()
        mirg.add([(c0[0] - 0.08, c0[1] - 0.045, c0[2] - 0.052), (c0[0] + 0.08, c0[1] - 0.045, c0[2] - 0.052),
                  (c0[0] + 0.08, c0[1] + 0.045, c0[2] - 0.052), (c0[0] - 0.08, c0[1] + 0.045, c0[2] - 0.052)],
                 [(0, 3, 2, 1)])
        # door handle on the door skin
        zH = pr.uz(lerp(pr.doorR, pr.fenderStart, 0.22))
        p, n = surf.hit((sgn * 3, pr.yBelt - 0.09, zH), (-sgn, 0, 0))
        if p is not None:
            box(hand, p[0] + sgn * 0.012, p[1], p[2], 0.02, 0.028, 0.15)
    # wipers lying at the windshield base
    zW = pr.uz(pr.ws) + 0.03
    for k, x0 in enumerate((pr.W * 0.28, -pr.W * 0.05)):
        a = np.array([x0, pr.deck(pr.ws + 0.02) + 0.02, zW])
        b = a + np.array([-pr.W * 0.36, 0.06, -0.12])
        cylinder(wip, a, b, 0.008, 5)
    objs.append(acc_object(cid + '__mirrors', mir, 'trim' if not pr.boxy < 0.3 else 'trim'))
    objs.append(acc_object(cid + '__mirrorGlass', mirg, 'mirror'))
    if not hand.empty():
        objs.append(acc_object(cid + '__handles', hand, 'chrome' if md.get('chrome') else 'trim'))
    objs.append(acc_object(cid + '__wipers', wip, 'trim'))

    # ---------------------------------------------------------------- interior
    objs += build_interior(pr, cid, surf)
    return objs


def style_details(pr, surf, LL, LR, tails, housing, amber, grille, vents, bumperH):
    """Signature details for the exotic body styles. Returns the tail-light height."""
    W, half = pr.W, pr.half
    nose_y = pr.deck(0.99)
    bot = pr.sill(1)
    face = nose_y - bot
    tail_top = pr.deck(0.01)
    tbot = pr.sill(0)
    if pr.style == 'wedge':
        # slim slanted headlamps high on the wedge, Y-shaped running light inside
        for sgn, acc in ((1, LL), (-1, LR)):
            cx = sgn * (half - 0.36)
            patch(surf, acc, (cx, bot + face * 0.78), (0.44, 0.075), '+z', 0.008, 0.15, (12, 3), True, housing, skew=sgn * 0.18, taper=-0.25)
            for (dx, dy, w_, h_, sk) in ((0.0, 0.0, 0.16, 0.014, 0.0), (0.09, 0.022, 0.1, 0.012, sgn * 0.5), (0.09, -0.022, 0.1, 0.012, -sgn * 0.5)):
                patch(surf, amber if False else acc, (cx + sgn * dx - sgn * 0.05, bot + face * 0.78 + dy), (w_, h_), '+z', 0.012, 0.0, (3, 1), False, skew=sk)
            # big hexagonal corner intakes
            patch(surf, grille, (sgn * (half - 0.36), bot + bumperH * 0.6), (0.5, bumperH * 0.85), '+z', 0.006, 0.0, (8, 3), True, housing, skew=-sgn * 0.12, taper=0.25)
            # side intake behind the door
            patch(surf, grille, (pr.uz(pr.roofR - 0.03), pr.yBelt - 0.12), (0.62, 0.2), '+x' if sgn > 0 else '-x', 0.006, 0.05, (8, 3), True, housing, skew=0.35, taper=-0.3)
            # Y tail lights
            tx = sgn * (half - 0.32)
            ty = tail_top - (tail_top - tbot) * 0.22
            for (dx, dy, w_, h_, sk) in ((0.0, 0.0, 0.4, 0.03, 0.0), (0.13, 0.05, 0.16, 0.025, sgn * 0.6), (0.13, -0.05, 0.16, 0.025, -sgn * 0.6)):
                patch(surf, tails, (tx - sgn * dx, ty + dy), (w_, h_), '-z', 0.008, 0.0, (6, 1), False, skew=sk)
        # engine cover slats seen from above
        zc0, zc1 = pr.uz(0.05), pr.uz(pr.roofR - 0.02)
        nsl = 7
        for k in range(nsl):
            z = lerp(zc0 + 0.1, zc1 - 0.05, (k + 0.5) / nsl)
            patch(surf, vents, (0, z), (W * 0.5, 0.05), '+y', 0.01, 0.0, (8, 1), False)
        # central hex exhaust + diffuser
        patch(surf, vents, (0, tbot + bumperH * 0.55), (0.34, 0.16), '-z', 0.01, 0.0, (6, 3), False, taper=0.3)
        patch(surf, grille, (0, tbot + bumperH * 0.25), (W * 0.7, bumperH * 0.4), '-z', 0.006, 0.0, (10, 2), True)
        return ty
    if pr.style == 'berlinetta':
        for sgn, acc in ((1, LL), (-1, LR)):
            # long swept lamps reaching back into the fender
            patch(surf, acc, (sgn * (half - 0.38), bot + face * 0.82), (0.46, 0.085), '+z', 0.008, 0.45, (12, 4), True, housing, skew=sgn * 0.22)
            # side scoop in the door's trailing edge
            patch(surf, grille, (pr.uz(pr.roofR + 0.0), pr.yBelt - 0.14), (0.42, 0.17), '+x' if sgn > 0 else '-x', 0.006, 0.6, (8, 3), True, housing, skew=0.15)
            # twin round tail lights per side
            ty = tail_top - (tail_top - tbot) * 0.3
            for k, dx in enumerate((0.0, 0.24)):
                patch(surf, tails, (sgn * (half - 0.27 - dx), ty), (0.15, 0.15), '-z', 0.008, 1.0, (8, 8), False, housing)
        # wide oval grille + splitter, rear diffuser
        patch(surf, grille, (0, bot + bumperH * 0.75), (W * 0.62, bumperH * 0.75), '+z', 0.006, 0.7, (12, 3), True, housing)
        patch(surf, grille, (0, tbot + bumperH * 0.3), (W * 0.62, bumperH * 0.45), '-z', 0.006, 0.2, (10, 2), True)
        return ty
    # longtail: full-width light bar, quad lamps, big low intake
    for sgn, acc in ((1, LL), (-1, LR)):
        for k in range(4):
            patch(surf, acc, (sgn * (half - 0.25 - k * 0.075), bot + face * 0.72 + (k % 2) * 0.02), (0.055, 0.055), '+z', 0.008, 1.0, (6, 6), True, housing)
        patch(surf, grille, (pr.uz(pr.roofR - 0.02), pr.yBelt - 0.1), (0.7, 0.18), '+x' if sgn > 0 else '-x', 0.006, 0.3, (8, 3), True, housing, skew=0.2)
    ty = tail_top - (tail_top - tbot) * 0.18
    patch(surf, tails, (0, ty), (W * 0.86, 0.04), '-z', 0.008, 0.1, (20, 1), False)
    patch(surf, grille, (0, bot + bumperH * 0.7), (W * 0.55, bumperH * 0.9), '+z', 0.006, 0.55, (12, 3), True, housing)
    patch(surf, grille, (0, tbot + bumperH * 0.35), (W * 0.75, bumperH * 0.55), '-z', 0.006, 0.1, (12, 2), True)
    patch(surf, vents, (0, pr.uz(0.1)), (W * 0.4, 0.4), '+y', 0.008, 0.3, (6, 4), False)
    return ty


def build_interior(pr, cid, surf):
    d = pr.d
    objs = []
    W = pr.W
    zWs = pr.uz(pr.ws)
    floorY = pr.bottom + 0.12
    yB = pr.yBelt
    inner = pr.half - 0.07
    # dashboard: a loft across the width of a (z, y) profile
    dash = Acc()
    prof = [(zWs + 0.06, yB - 0.03), (zWs - 0.12, yB + 0.035), (zWs - 0.36, yB + 0.05), (zWs - 0.5, yB + 0.02),
            (zWs - 0.54, yB - 0.08), (zWs - 0.5, yB - 0.22), (zWs - 0.42, yB - 0.32), (zWs - 0.4, floorY + 0.05)]
    xs = np.linspace(-inner, inner, 9)
    verts, faces = [], []
    for x in xs:
        for (z, y) in prof:
            verts.append((x, y, z))
    n = len(prof)
    for i in range(len(xs) - 1):
        for j in range(n - 1):
            a = i * n + j
            faces.append((a, a + 1, a + n + 1, a + n))
    dash.add(verts, faces)
    # driver binnacle (hood over the gauges)
    xD = W * 0.22
    zD = zWs - 0.5
    torus(dash, (xD, yB + 0.075, zD + 0.0), 0.245, 0.03, rotx(-math.pi / 2 + 0.25) @ rotz(0), 14, 6, math.pi)
    box(dash, xD, yB + 0.03, zD + 0.05, 0.5, 0.1, 0.14)
    # centre console + tunnel
    box(dash, 0, floorY + 0.14, zD - 0.25, 0.22, 0.28, 0.9)
    box(dash, 0, yB - 0.12, zD + 0.02, 0.26, 0.2, 0.08)
    # gear lever
    cylinder(dash, (0, floorY + 0.28, zD - 0.3), (0, floorY + 0.45, zD - 0.27), 0.012, 6)
    rounded_box(dash, (0, floorY + 0.47, zD - 0.27), (0.05, 0.05, 0.05), 0.02)
    # floor
    dash.add([(-inner, floorY, zWs - 0.3), (inner, floorY, zWs - 0.3), (inner, floorY, pr.uz(pr.ghBase) + 0.1), (-inner, floorY, pr.uz(pr.ghBase) + 0.1)],
             [(0, 3, 2, 1)])
    # pedals
    for k, px in enumerate((xD - 0.12, xD, xD + 0.1)):
        box(dash, px, floorY + 0.12, zD - 0.05, 0.06 if k else 0.09, 0.09, 0.015, rotx(0.5))
    # rear-view mirror
    rounded_box(dash, (0, pr.roof - 0.13, pr.uz(pr.roofF) + 0.05), (0.24, 0.06, 0.03), 0.01)
    objs.append(acc_object(cid + '__interior', dash, 'dash'))

    # gauge face (UV 0..1 for the instrument texture), facing the driver
    gz = zD - 0.03
    gy = yB + 0.085
    g = Acc()
    rot = rotx(-0.25)
    q = [rot @ np.array(p) for p in [(-0.22, -0.09, 0), (0.22, -0.09, 0), (0.22, 0.09, 0), (-0.22, 0.09, 0)]]
    g.add([tuple(p + np.array([xD, gy, gz])) for p in q], [(0, 1, 2, 3)], [[(1, 0), (0, 0), (0, 1), (1, 1)]])
    # facing -z (towards the driver): flip
    g.f = [tuple(reversed(f)) for f in g.f]
    g.uv = [list(reversed(u)) for u in g.uv]
    objs.append(acc_object(cid + '__gauges', g, 'gauges'))

    # seats
    seats = Acc()
    zS = zD - 0.78
    ss = min(1.0, max(0.72, (pr.roof - floorY) / 1.12))
    seat_y = floorY + 0.2 * ss
    rows = [zS]
    zRear = zS - 0.8
    if pr.type not in ('sports', 'super', 'hyper', 'baja', 'gt', 'rear') and not pr.bed and zRear - 0.35 > pr.uz(pr.roofR) - 0.12:
        rows.append(zRear)
    for ri, z in enumerate(rows):
        for sgn in (1, -1):
            if ri == 1 and sgn < 0:
                continue
            xs_ = [sgn * W * 0.22] if ri == 0 else [0.0]
            for x in xs_:
                sw = 0.48 if ri == 0 else W * 0.8
                rounded_box(seats, (x, seat_y, z), (sw, 0.13, 0.5), 0.04)
                rot = rotx(-0.22)
                rounded_box(seats, (x, seat_y + 0.36 * ss, z - 0.27), (sw * 0.95, 0.62 * ss, 0.13), 0.04, rot)
                if ri == 0:
                    rounded_box(seats, (x, seat_y + 0.76 * ss, z - 0.36), (0.25, 0.17, 0.09), 0.03, rot)
                    for bs in (1, -1):  # side bolsters
                        rounded_box(seats, (x + bs * sw * 0.45, seat_y + 0.33 * ss, z - 0.24), (0.07, 0.5 * ss, 0.14), 0.03, rot)
    objs.append(acc_object(cid + '__seats', seats, 'seat'))

    # cabin shell: door cards, headliner, rear wall so the cockpit view is closed
    cab = Acc()
    z0, z1 = pr.uz(pr.ghBase) + 0.02, zWs - 0.05
    nz = 14
    for sgn in (1, -1):
        verts, faces = [], []
        for i in range(nz + 1):
            z = lerp(z0, z1, i / nz)
            w = pr.width(z) - 0.06
            verts += [(sgn * w, floorY, z), (sgn * w, yB - 0.02, z), (sgn * (w - 0.04), yB + 0.02, z)]
        for i in range(nz):
            for j in range(2):
                a = i * 3 + j
                faces.append((a, a + 3, a + 4, a + 1) if sgn > 0 else (a, a + 1, a + 4, a + 3))
        cab.add(verts, faces)
    # headliner under the roof
    hv, hf = [], []
    zr0, zr1 = pr.uz(pr.roofR) + 0.05, pr.uz(pr.roofF) - 0.02
    for i in range(9):
        z = lerp(zr0, zr1, i / 8)
        w = pr.tum * pr.width(z) - 0.05
        hv += [(-w, pr.roof - 0.06, z), (0, pr.roof - 0.04, z), (w, pr.roof - 0.06, z)]
    for i in range(8):
        for j in range(2):
            a = i * 3 + j
            hf.append((a, a + 1, a + 4, a + 3))
    cab.add(hv, hf)
    # rear bulkhead (behind the seats) for coupes / trucks
    zb = pr.uz(pr.ghBase) + 0.03
    wb = pr.width(zb) - 0.06
    cab.add([(-wb, floorY, zb), (wb, floorY, zb), (wb, yB, zb), (-wb, yB, zb)], [(0, 1, 2, 3)])
    objs.append(acc_object(cid + '__cabin', cab, 'cabin'))

    # steering wheel: its own object, origin at the hub; local +z(game) = column axis towards the driver
    sw = Acc()
    tilt = 0.42 if not pr.boxy > 0.6 else 0.62
    R = 0.18 if not pr.sport else 0.165
    I = np.eye(3)
    torus(sw, (0, 0, 0), R, 0.016, I, 32, 8)
    for a in (math.pi / 2 + 0.0, math.pi * 7 / 6 + 0.3, -math.pi / 6 - 0.3):
        cylinder(sw, (0, 0, 0), (math.cos(a) * R * 0.95, math.sin(a) * R * 0.95, 0.0), 0.012, 6, False)
    cylinder(sw, (0, 0, -0.01), (0, 0, 0.035), 0.05, 12)
    cylinder(sw, (0, 0, 0.02), (0, 0, 0.3), 0.025, 8)
    hub = np.array([xD, yB - 0.03, zD - 0.27])
    me = bpy.data.meshes.new(cid + '__steering')
    # wheel plane faces the driver (-z game); build with column along -z then rotate by tilt about x
    me.from_pydata([C @ Vector(p) for p in sw.v], [], sw.f)
    me.materials.append(MATS['dash'])
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(cid + '__steering', me)
    bpy.context.scene.collection.objects.link(ob)
    Rg = Matrix(((1, 0, 0), (0, math.cos(tilt), -math.sin(tilt)), (0, math.sin(tilt), math.cos(tilt))))
    ob.matrix_world = Matrix.Translation(G(hub)) @ (C @ Rg @ C.inverted()).to_4x4()
    objs.append(ob)

    # anchors
    eyeY = min(pr.roof - 0.1, seat_y + 0.72 * ss)
    for nm, p in (('eye', (xD, eyeY, zS - 0.02)), ('hoodEye', (0, pr.deck(pr.ws + 0.1) + 0.32, pr.uz(lerp(pr.ws, 1, 0.3)))),
                  ('hoodHinge', (0, pr.deck(pr.ws), zWs))):
        e = bpy.data.objects.new(cid + '__' + nm, None)
        e.location = G(p)
        bpy.context.scene.collection.objects.link(e)
        objs.append(e)
    return objs


def main():
    reset_scene()
    init_mats()
    all_objs = []
    for cid, c in CARS.items():
        if ONLY and cid not in ONLY:
            continue
        objs = build_car(c)
        root = bpy.data.objects.new(cid, None)
        bpy.context.scene.collection.objects.link(root)
        tris = 0
        for o in objs:
            o.parent = root
            if o.type == 'MESH':
                o.data.calc_loop_triangles()
                tris += len(o.data.loop_triangles)
        print(f'  {cid:12s} {len(objs):3d} parts {tris:6d} tris')
        all_objs += objs + [root]
    path = os.path.join(OUT, 'cars.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in all_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = all_objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_normals=False, export_lights=False, export_yup=True, export_texcoords=True,
                              export_materials='EXPORT')
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


main()
