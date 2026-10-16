"""High-fidelity car bodies for ONE ROAD DOWN (used by cars.py for the ids in hifi_designs.DESIGNS).

Technique
---------
Every body is a *control cage*: a grid of stations (along the car) x tracks (around the
half cross-section, keel -> crown).  Each track is a 3D curve given by a few (z, x, y)
keys interpolated with monotone cubic splines; at the nose and tail all tracks run into
the centre plane, which closes the cage without caps.  Feature lines are cage edges with
crease weights.  The cage is mirrored, subdivided (Catmull-Clark, level 2, applied) and
gets custom split normals from a level-4 limit surface, so reflections flow cleanly.

Panels are classified per face from the cage coordinates (station, track), which follow
the cage loops exactly, so panel/glass borders are smooth curves.  Wheel arches are
boolean cuts with a rolled lip; intakes, lamps and vents are knife-projected outlines that
are cut into the skin and pushed in (recesses with walls); lamp internals, exhausts,
diffuser fins, wings and mirrors are separate small meshes.

All coordinates are game space (x left, y up, z forward, origin = centre of mass).
"""
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

TR = ['K', 'F', 'R', 'S', 'M', 'X', 'H', 'D', 'B', 'P1', 'P2', 'Q', 'C']
TI = {n: i for i, n in enumerate(TR)}
NT = len(TR)


def G(p):
    return Vector((p[0], -p[2], p[1]))


def ug(v):
    return np.array([v[0], v[2], -v[1]])


def lerp(a, b, t):
    return a + (b - a) * t


def sstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ monotone cubic
class Pchip:
    def __init__(self, xs, ys):
        o = np.argsort(xs)
        x = np.array(xs, float)[o]
        y = np.array(ys, float)[o]
        # merge duplicate xs
        keep = np.concatenate([[True], np.diff(x) > 1e-6])
        x, y = x[keep], y[keep]
        self.x, self.y = x, y
        n = len(x)
        if n == 1:
            self.m = np.zeros(1)
            return
        h = np.diff(x)
        dlt = np.diff(y) / h
        m = np.zeros(n)
        m[0], m[-1] = dlt[0], dlt[-1]
        for k in range(1, n - 1):
            if dlt[k - 1] * dlt[k] <= 0:
                m[k] = 0
            else:
                w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
                m[k] = (w1 + w2) / (w1 / dlt[k - 1] + w2 / dlt[k])
        # end slopes (three-point, shape preserving)
        if n > 2:
            for (i0, i1, s) in ((0, 1, 0), (n - 1, n - 2, -1)):
                pass
        self.m = m

    def __call__(self, t):
        x, y, m = self.x, self.y, self.m
        if len(x) == 1:
            return float(y[0])
        if t <= x[0]:
            return float(y[0] + m[0] * (t - x[0])) if False else float(y[0])
        if t >= x[-1]:
            return float(y[-1])
        k = int(np.searchsorted(x, t) - 1)
        h = x[k + 1] - x[k]
        s = (t - x[k]) / h
        h00 = 2 * s ** 3 - 3 * s ** 2 + 1
        h10 = s ** 3 - 2 * s ** 2 + s
        h01 = -2 * s ** 3 + 3 * s ** 2
        h11 = s ** 3 - s ** 2
        return float(h00 * y[k] + h10 * h * m[k] + h01 * y[k + 1] + h11 * h * m[k + 1])


class Track:
    """keys: list of (z, x, y). x(z), y(z) monotone-cubic; the extreme keys are the ends."""

    def __init__(self, keys):
        ks = sorted(keys)
        self.z0, self.z1 = ks[0][0], ks[-1][0]
        self.fx = Pchip([k[0] for k in ks], [k[1] for k in ks])
        self.fy = Pchip([k[0] for k in ks], [k[2] for k in ks])

    def at(self, z):
        z = min(self.z1, max(self.z0, z))
        return (max(0.0, self.fx(z)), self.fy(z), z)


class FTrack:
    """Track from base curves fx(z), fy(z) with rounded ends: towards each tip the
    track runs into the centre plane (superellipse in plan, y blended to the tip height)."""

    def __init__(self, fx, fy, front, rear, zf0, zr0):
        self.fx, self.fy = fx, fy
        self.tf, self.tr = front, rear      # (z_tip, y_tip, p)
        self.zf0, self.zr0 = zf0, zr0
        self.z0, self.z1 = rear[0], front[0]

    def at(self, z):
        x, y = self.fx(z), self.fy(z)
        for tip, z0 in ((self.tf, self.zf0), (self.tr, self.zr0)):
            zt, yt, p = tip[:3]
            cw = tip[3] if len(tip) > 3 else 0.0
            if (zt - z0) * (z - z0) > 0:
                q = min(1.0, (z - z0) / (zt - z0))
                x *= cw + (1 - cw) * max(0.0, 1 - q ** p) ** (1 / p)
                if yt is not None:
                    y = lerp(y, yt, q * q)
        return (max(0.0, x), y, z)


# ------------------------------------------------------------------ cage
class Cage:
    """tracks: dict name -> keys.  mid: sorted z list of shared stations (with tags).
    nose/tail: fractions for the end stations (towards each track's own tip)."""

    def __init__(self, tracks, mid, nose=(0.45, 0.75, 0.92, 1.0), tail=(0.45, 0.75, 0.92, 1.0), zf0=None, zr0=None):
        self.T = [tracks[n] if hasattr(tracks[n], 'at') else Track(tracks[n]) for n in TR]
        mid = sorted(mid, key=lambda s: s[0])
        self.tags = {}
        zs = [m[0] for m in mid]
        zf0 = zf0 if zf0 is not None else zs[-1]
        zr0 = zr0 if zr0 is not None else zs[0]
        st = []
        for f in reversed(tail):
            st.append(('tail', f))
        for z, tag in mid:
            if tag:
                self.tags[tag] = len(st)
            st.append(('mid', z))
        for f in nose:
            st.append(('nose', f))
        self.st = st
        self.zf0, self.zr0 = zf0, zr0
        self.dz = {}
        self.cap_cols = 6
        self.cap_bulge = {0: 0.0, 1: 0.0}

    def point(self, i, j):
        kind, v = self.st[i]
        tr = self.T[j]
        if kind == 'mid':
            z = v
        elif kind == 'nose':
            z = lerp(self.zf0, tr.z1, v)
        else:
            z = lerp(self.zr0, tr.z0, v)
        z += self.dz.get((i, j), 0.0)
        x, y, z = tr.at(z)
        if j in (0, NT - 1):
            x = 0.0
        return (x, y, z)

    def S(self, tag):
        return self.tags[tag]


def build_cage_mesh(cage, creases, name):
    """creases: list of ('t', track, s0, s1, w) along a track between stations, or
    ('r', station, j0, j1, w) across a ring."""
    ns = len(cage.st)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('cage')
    cl = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    L = [[None] * NT for _ in range(ns)]
    R = [[None] * NT for _ in range(ns)]
    for i in range(ns):
        for j in range(NT):
            p = cage.point(i, j)
            v = bm.verts.new(G(p))
            L[i][j] = v
            if p[0] > 1e-5:
                R[i][j] = bm.verts.new(G((-p[0], p[1], p[2])))
            else:
                R[i][j] = v
    bm.verts.ensure_lookup_table()
    for i in range(ns - 1):
        for j in range(NT - 1):
            for side, V in ((1, L), (-1, R)):
                q = [V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]]
                uv = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
                if side < 0:
                    q.reverse(); uv.reverse()
                # drop collapsed corners (tips)
                qq, uu = [], []
                for v, u in zip(q, uv):
                    if not qq or qq[-1] is not v:
                        qq.append(v); uu.append(u)
                if len(qq) > 1 and qq[0] is qq[-1]:
                    qq.pop(); uu.pop()
                if len(qq) < 3:
                    continue
                try:
                    f = bm.faces.new(qq)
                except ValueError:
                    continue
                f.material_index = 0
                for lp, u in zip(f.loops, uu):
                    lp[uvl].uv = (u[0], u[1] if side > 0 else -u[1])
    # flat-ish end caps where the last ring did not run into the centre plane
    for end, i in ((1, ns - 1), (0, 0)):
        if all(L[i][j] is R[i][j] for j in range(NT)):
            continue
        m = cage.cap_cols
        bulge = cage.cap_bulge[end]
        rows = []
        for j in range(NT):
            a, b = L[i][j], R[i][j]
            if a is b:
                rows.append([a])
                continue
            pa = ug(a.co)
            row = [a]
            for k in range(1, m):
                f = k / m
                x = lerp(pa[0], -pa[0], f)
                zz = pa[2] + (bulge * (1 - (x / pa[0]) ** 2) if pa[0] > 1e-6 else bulge) * (1 if end else -1)
                row.append(bm.verts.new(G((x, pa[1], zz))))
            row.append(b)
            rows.append(row)
        su = ns - 0.5 if end else -0.5
        for j in range(NT - 1):
            r0, r1 = rows[j], rows[j + 1]
            polys = []
            if len(r0) == 1 and len(r1) == 1:
                continue
            if len(r0) == 1:
                for k in range(len(r1) - 1):
                    polys.append(([r0[0], r1[k + 1], r1[k]], [j, j + 1, j + 1]))
            elif len(r1) == 1:
                for k in range(len(r0) - 1):
                    polys.append(([r0[k], r0[k + 1], r1[0]], [j, j, j + 1]))
            else:
                for k in range(len(r0) - 1):
                    polys.append(([r0[k], r0[k + 1], r1[k + 1], r1[k]], [j, j, j + 1, j + 1]))
            for q, tj in polys:
                if not end:
                    q = list(reversed(q)); tj = list(reversed(tj))
                try:
                    f = bm.faces.new(q)
                except ValueError:
                    continue
                for lp, t in zip(f.loops, tj):
                    lp[uvl].uv = (su, t)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    def edge(a, b):
        for e in a.link_edges:
            if e.other_vert(a) is b:
                return e
        return None
    for c in creases:
        if c[0] == 't':
            _, j, s0, s1, w = c
            for i in range(s0, s1):
                for V in (L, R):
                    e = edge(V[i][j], V[i + 1][j])
                    if e:
                        e[cl] = w
        else:
            _, i, j0, j1, w = c
            for j in range(j0, j1):
                for V in (L, R):
                    e = edge(V[i][j], V[i][j + 1])
                    if e:
                        e[cl] = w
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def subdivide(ob, levels, name):
    mod = ob.modifiers.new('sub', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    mod.uv_smooth = 'NONE'
    mod.use_creases = True
    mod.quality = 3
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(mod)
    me.name = name
    o2 = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o2)
    return o2


class NormalRef:
    """Smooth vertex normals of a finely subdivided copy, sampled by closest point."""

    def __init__(self, ob):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.normal_update()
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        self.tris = [(f.verts[0].index, f.verts[1].index, f.verts[2].index) for f in bm.faces]
        self.co = [v.co.copy() for v in bm.verts]
        self.no = [v.normal.copy() for v in bm.verts]
        self.bvh = BVHTree.FromBMesh(bm)
        bm.free()

    def normal(self, co, maxd=0.03):
        loc, nor, idx, dist = self.bvh.find_nearest(co, maxd)
        if loc is None:
            return None
        a, b, c = self.tris[idx]
        n = geometry.barycentric_transform(loc, self.co[a], self.co[b], self.co[c], self.co[a] + self.no[a], self.co[b] + self.no[b], self.co[c] + self.no[c]) - loc
        if n.length < 1e-6:
            return None
        n.normalize()
        return n


# ------------------------------------------------------------------ booleans
def cutter_from_bm(bm, name, matname):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    m = bpy.data.materials.get('part_' + matname) or bpy.data.materials.new('part_' + matname)
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def arch_cutter(centre, R, x0, x1, matname='wells', squash=1.0, seg=56):
    bm = bmesh.new()
    r0, r1 = [], []
    for s in range(seg):
        a = 2 * math.pi * s / seg
        y = centre[1] + math.sin(a) * R * squash
        z = centre[2] + math.cos(a) * R
        r0.append(bm.verts.new(G((x0, y, z))))
        r1.append(bm.verts.new(G((x1, y, z))))
    for s in range(seg):
        s2 = (s + 1) % seg
        bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))
    bm.faces.new(list(reversed(r0)))
    bm.faces.new(r1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cutter_from_bm(bm, 'cut', matname)


def prism_cutter(poly, frame, d0, d1, matname):
    """poly: 2D outline in the projection frame; extruded between depths d0..d1 along -dir."""
    O, e1, e2, dv = frame
    bm = bmesh.new()
    A, B = [], []
    for (u, v) in poly:
        p = O + e1 * u + e2 * v
        A.append(bm.verts.new(G(p - dv * d0)))
        B.append(bm.verts.new(G(p - dv * d1)))
    n = len(poly)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((A[k], A[k2], B[k2], B[k]))
    bm.faces.new(A)
    bm.faces.new(list(reversed(B)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cutter_from_bm(bm, 'cut', matname)


def boolean(ob, cutter, op='DIFFERENCE'):
    mod = ob.modifiers.new('cut', 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    mod.solver = 'EXACT'
    try:
        mod.material_mode = 'TRANSFER'
    except Exception:
        pass
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


# ------------------------------------------------------------------ projection frames + knife
def frame(axis, origin=(0, 0, 0)):
    """Projection frame (O, e1, e2, dir): 2D coords (u, v) = (dot(p-O, e1), dot(p-O, e2));
    `dir` points from the viewer into the body.
      'L' / 'R': side views, u = z (forward), v = y
      'F' / 'B': front / rear, u = x (left), v = y
      'T': top, u = x, v = z
    or an explicit (dir, up) pair."""
    O = np.array(origin, float)
    if axis == 'L':
        return (O, np.array([0, 0, 1.0]), np.array([0, 1.0, 0]), np.array([-1.0, 0, 0]))
    if axis == 'R':
        return (O, np.array([0, 0, 1.0]), np.array([0, 1.0, 0]), np.array([1.0, 0, 0]))
    if axis == 'F':
        return (O, np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, -1.0]))
    if axis == 'B':
        return (O, np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    if axis == 'T':
        return (O, np.array([1.0, 0, 0]), np.array([0, 0, 1.0]), np.array([0, -1.0, 0]))
    dv, up = axis
    dv = np.array(dv, float); dv /= np.linalg.norm(dv)
    up = np.array(up, float)
    e1 = np.cross(up, dv); e1 /= np.linalg.norm(e1)
    e2 = np.cross(dv, e1)
    return (O, -e1, e2, dv) if False else (O, e1, e2, dv)


def to2d(fr, p):
    O, e1, e2, dv = fr
    q = np.asarray(p) - O
    return (float(q @ e1), float(q @ e2))


def inside(poly, pt):
    x, y = pt
    c = False
    n = len(poly)
    for k in range(n):
        x1, y1 = poly[k]
        x2, y2 = poly[(k + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                c = not c
    return c


def offset_poly(poly, d):
    """Offset a closed 2D polygon by d (positive = outwards for CCW)."""
    P = np.array(poly, float)
    n = len(P)
    area = 0.5 * sum(P[k][0] * P[(k + 1) % n][1] - P[(k + 1) % n][0] * P[k][1] for k in range(n))
    s = 1 if area > 0 else -1
    out = []
    for k in range(n):
        a, b, c = P[k - 1], P[k], P[(k + 1) % n]
        t1 = (b - a) / (np.linalg.norm(b - a) + 1e-9)
        t2 = (c - b) / (np.linalg.norm(c - b) + 1e-9)
        n1 = np.array([t1[1], -t1[0]]) * s
        n2 = np.array([t2[1], -t2[0]]) * s
        m = n1 + n2
        m /= (np.linalg.norm(m) + 1e-9)
        cosh = max(0.35, m @ n1)
        out.append(tuple(b + m * d / cosh))
    return out


def face_ok(f, fr, filt):
    n = ug(f.normal)
    if -(n @ fr[3]) < 0.08:
        return False
    if filt and not filt(ug(f.calc_center_median())):
        return False
    return True


def knife(bm, poly, fr, filt=None, sel=None):
    """Cut the outline `poly` (projected along fr) into the faces facing the viewer.
    Returns the set of faces inside the outline."""
    n = len(poly)
    O, e1, e2, dv = fr
    P2 = np.array(poly, float)
    glo, ghi = P2.min(0) - 0.08, P2.max(0) + 0.08

    def box(f):
        uv = [to2d(fr, ug(v.co)) for v in f.verts]
        us = [q[0] for q in uv]; vs = [q[1] for q in uv]
        return min(us), max(us), min(vs), max(vs)

    cand = {}
    for f in bm.faces:
        if not face_ok(f, fr, filt):
            continue
        b = box(f)
        if b[1] < glo[0] or b[0] > ghi[0] or b[3] < glo[1] or b[2] > ghi[1]:
            continue
        cand[f] = b
    for k in range(n):
        a = P2[k]; b = P2[(k + 1) % n]
        lo = np.minimum(a, b) - 0.03
        hi = np.maximum(a, b) + 0.03
        pa = O + e1 * a[0] + e2 * a[1]
        pb = O + e1 * b[0] + e2 * b[1]
        no = np.cross(pb - pa, dv)
        ln = np.linalg.norm(no)
        if ln < 1e-9:
            continue
        no /= ln
        faces = [f for f, bb in cand.items() if f.is_valid and not (bb[1] < lo[0] or bb[0] > hi[0] or bb[3] < lo[1] or bb[2] > hi[1])]
        if not faces:
            continue
        verts = list({v for f in faces for v in f.verts})
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bisect_plane(bm, geom=faces + edges + verts, dist=1e-5, plane_co=G(pa), plane_no=G(no), clear_inner=False, clear_outer=False)
        for f in {f for v in verts if v.is_valid for f in v.link_faces}:
            if f not in cand or not f.is_valid:
                if face_ok(f, fr, filt):
                    cand[f] = box(f)
            else:
                cand[f] = box(f)
        cand = {f: bb for f, bb in cand.items() if f.is_valid}
    res = set()
    for f in cand:
        if f.is_valid and inside(poly, to2d(fr, ug(f.calc_center_median()))):
            res.add(f)
    return res


def recess(bm, faces, depth, dirv=None):
    """Push a face region in by `depth` (along -normal, or along game-space dirv); side
    walls are created.  Returns (floor faces, wall faces)."""
    faces = [f for f in faces if f.is_valid]
    if not faces:
        return [], []
    nrm = {}
    for f in faces:
        for v in f.verts:
            nrm.setdefault(v.index, Vector())
            nrm[v.index] += f.normal
    bm.verts.index_update()
    old_idx = {v: v.index for f in faces for v in f.verts}
    ret = bmesh.ops.extrude_face_region(bm, geom=faces, use_keep_orig=False)
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    nv = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
    mv = set(nv)
    dv = G(dirv).normalized() if dirv is not None else None
    for v in nv:
        if dv is not None:
            v.co += dv * depth
        else:
            n = Vector()
            for f in v.link_faces:
                if all(w in mv for w in f.verts):
                    n += f.normal
            if n.length < 1e-9:
                n = v.normal
            v.co -= n.normalized() * depth
    linked = {f for v in nv for f in v.link_faces}
    floor = [f for f in linked if all(w in mv for w in f.verts)]
    walls = [f for f in linked if f not in floor]
    return floor, walls


# ------------------------------------------------------------------ simple accumulators
class Acc:
    def __init__(self):
        self.v, self.f, self.n = [], [], []

    def add(self, verts, faces):
        o = len(self.v)
        self.v += [tuple(map(float, p)) for p in verts]
        self.f += [tuple(i + o for i in f) for f in faces]

    def empty(self):
        return not self.f


def loft_acc(acc, rings, closed=True, cap0=False, cap1=False):
    """rings: list of point lists (game coords) with equal counts."""
    n = len(rings[0])
    o = len(acc.v)
    for r in rings:
        acc.v += [tuple(map(float, p)) for p in r]
    m = n if closed else n - 1
    for i in range(len(rings) - 1):
        for j in range(m):
            j2 = (j + 1) % n
            acc.f.append((o + i * n + j, o + i * n + j2, o + (i + 1) * n + j2, o + (i + 1) * n + j))
    if cap0:
        acc.f.append(tuple(o + j for j in reversed(range(n))))
    if cap1:
        acc.f.append(tuple(o + (len(rings) - 1) * n + j for j in range(n)))


def tube(acc, path, prof, closed_prof=True, cap=True, up=(0, 1, 0)):
    """Sweep a 2D profile (list of (px, py)) along a 3D path."""
    path = [np.array(p, float) for p in path]
    rings = []
    upv = np.array(up, float)
    for k, p in enumerate(path):
        t = path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]
        t /= (np.linalg.norm(t) + 1e-9)
        nx = np.cross(upv, t)
        if np.linalg.norm(nx) < 1e-6:
            nx = np.cross(np.array([1.0, 0, 0]), t)
        nx /= np.linalg.norm(nx)
        ny = np.cross(t, nx)
        rings.append([p + nx * a + ny * b for (a, b) in prof])
    loft_acc(acc, rings, closed_prof, cap, cap)


def disc(acc, c, nrm, r, seg=20, depth=0.0, r2=None):
    """A flat (or slightly domed) disc / short cylinder facing nrm."""
    c = np.array(c, float); nrm = np.array(nrm, float); nrm /= np.linalg.norm(nrm)
    ref = np.array([0, 1.0, 0]) if abs(nrm[1]) < 0.9 else np.array([1.0, 0, 0])
    a = np.cross(nrm, ref); a /= np.linalg.norm(a)
    b = np.cross(nrm, a)
    ring = [c + (a * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)]
    if depth:
        back = [p - nrm * depth for p in ring]
        loft_acc(acc, [back, ring], True)
    o = len(acc.v)
    acc.v += [tuple(p) for p in ring] + [tuple(c + nrm * (r * 0.15 if r2 is None else r2))]
    for k in range(seg):
        acc.f.append((o + k, o + (k + 1) % seg, o + seg))


def acc_mesh(name, acc, matobj, smooth_angle=40, uv=False, flat=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(p) for p in acc.v], [], acc.f)
    me.validate()
    me.update()
    if uv:
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = ug(me.vertices[me.loops[li].vertex_index].co)
                uvl.data[li].uv = (co[2] * 0.5, (co[1] + abs(co[0])) * 0.5)
    me.materials.append(matobj)
    for p in me.polygons:
        p.use_smooth = not flat
    try:
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
    except Exception:
        pass
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------ surface helper for details
class Surf:
    def __init__(self, ob):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(ob, dg)

    def hit(self, origin, direction, dist=10.0):
        loc, nor, idx, d = self.bvh.ray_cast(G(origin), G(direction).normalized(), dist)
        if loc is None:
            return None, None
        return ug(loc), ug(nor)

    def side(self, z, y, sgn=1):
        return self.hit((sgn * 3.0, y, z), (-sgn, 0, 0))

    def top(self, x, z):
        return self.hit((x, 4.0, z), (0, -1, 0))

    def front(self, x, y, sgn=1):
        return self.hit((x, y, sgn * 5.0), (0, 0, -sgn))


def proj_patch(acc, surf, poly, fr, off, n=None, fill=True):
    """Fill a 2D outline (frame coords) with a triangulated patch projected onto the body,
    lifted `off` along the surface normal."""
    O, e1, e2, dv = fr
    pts = list(poly)
    nb = len(pts)
    # interior points on a grid for curvature
    us = [p[0] for p in pts]; vs = [p[1] for p in pts]
    step = n or max(0.02, min(max(us) - min(us), max(vs) - min(vs)) / 4)
    inner = []
    if fill:
        for u in np.arange(min(us) + step / 2, max(us), step):
            for v in np.arange(min(vs) + step / 2, max(vs), step):
                if inside(pts, (u, v)):
                    # keep away from the border
                    if min(math.hypot(u - a, v - b) for a, b in pts) > step * 0.4:
                        inner.append((u, v))
    allp = pts + inner
    edges = [(k, (k + 1) % nb) for k in range(nb)]
    try:
        res = geometry.delaunay_2d_cdt([Vector(p) for p in allp], edges, [], 2, 1e-6)
    except Exception:
        return False
    vco, _, fcs = res[0], res[1], res[2]
    verts = []
    for p in vco:
        q = O + e1 * p[0] + e2 * p[1] - dv * 4.0
        h, nn = surf.hit(q, dv, 9.0)
        if h is None:
            return False
        verts.append(h + nn * off)
    faces = []
    for f in fcs:
        c = sum((Vector(vco[i]) for i in f), Vector((0, 0))) / len(f)
        if not inside(pts, (c[0], c[1])):
            continue
        a, b, cc = [np.array(verts[i]) for i in f[:3]]
        nrm = np.cross(b - a, cc - a)
        faces.append(tuple(f) if nrm @ (-dv) > 0 else tuple(reversed(f)))
    acc.add(verts, faces)
    return True


# ------------------------------------------------------------------ pipeline
SKIN = 1


class Body:
    """bmesh work stage: faces carry a part index and a skin flag."""

    def __init__(self, ob, parts):
        self.ob = ob
        self.bm = bmesh.new()
        self.bm.from_mesh(ob.data)
        self.parts = list(parts)
        self.pl = self.bm.faces.layers.int.new('part')
        self.sk = self.bm.faces.layers.int.new('skin')
        self.uv = self.bm.loops.layers.uv.get('cage')
        slot = [m.name.replace('part_', '') for m in ob.data.materials]
        for f in self.bm.faces:
            nm = slot[f.material_index] if f.material_index < len(slot) else 'body'
            f[self.pl] = self.pid(nm)
            f[self.sk] = 1 if nm == 'body' else 0

    def pid(self, name):
        if name not in self.parts:
            self.parts.append(name)
        return self.parts.index(name)

    def part(self, f):
        return self.parts[f[self.pl]]

    def set(self, faces, name, skin=None):
        i = self.pid(name)
        for f in faces:
            f[self.pl] = i
            if skin is not None:
                f[self.sk] = skin

    def st(self, f):
        """cage (station, track) of a face centre; track >= 0 on both sides."""
        if self.uv is None:
            return (-1, -1)
        u = sum((l[self.uv].uv for l in f.loops), Vector((0, 0))) / len(f.loops)
        return (u[0], abs(u[1]))

    def faces_of(self, *names):
        ids = {self.parts.index(n) for n in names if n in self.parts}
        return [f for f in self.bm.faces if f[self.pl] in ids]

    def finish(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        return me


def split_parts(me, parts, skin_parts, nref, cid, mats_for):
    """Write custom normals (skin faces from the limit surface) and split into one object per part."""
    for p in parts:
        me.materials.append(bpy.data.materials.get('part_' + p) or bpy.data.materials.new('part_' + p))
    pl = me.attributes['part'].data
    sk = me.attributes['skin'].data
    for i, poly in enumerate(me.polygons):
        poly.material_index = pl[i].value
        poly.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(32))
    # mark part borders sharp
    sharp = me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
    ef = {}
    for poly in me.polygons:
        for ek in poly.edge_keys:
            ef.setdefault(ek, set()).add(poly.material_index)
    ekey = {tuple(sorted(e.vertices)): e.index for e in me.edges}
    for ek, s in ef.items():
        if len(s) > 1:
            sharp.data[ekey[tuple(sorted(ek))]].value = True
    # skin loops: limit-surface normals
    nl = [(0.0, 0.0, 0.0)] * len(me.loops)
    for i, poly in enumerate(me.polygons):
        if sk[i].value != SKIN or parts[pl[i].value] not in skin_parts:
            continue
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            n = nref.normal(co)
            if n is not None and n.dot(poly.normal) > 0.3:
                nl[li] = tuple(n)
    me.normals_split_custom_set(nl)
    # uv for painted panels (wear mask)
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = ug(me.vertices[me.loops[li].vertex_index].co)
            uvl.data[li].uv = (co[2] * 0.5, (co[1] + abs(co[0])) * 0.5)
    for a in ('part', 'skin'):
        me.attributes.remove(me.attributes[a])
    if 'cage' in me.uv_layers:
        me.uv_layers.remove(me.uv_layers['cage'])
    ob = bpy.data.objects.new(cid + '__split', me)
    bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    out = []
    for o in list(bpy.context.selected_objects):
        used = {p.material_index for p in o.data.polygons}
        if not used:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        mi = used.pop()
        pname = o.data.materials[mi].name.replace('part_', '')
        kind_mat = mats_for(pname)
        o.data.materials.clear()
        o.data.materials.append(kind_mat)
        for p in o.data.polygons:
            p.material_index = 0
        o.name = cid + '__' + pname
        o.data.name = o.name
        if kind_mat.name not in ('car_paint', 'car_bumper'):
            o.data.uv_layers.remove(o.data.uv_layers['UVMap'])
        o.select_set(False)
        out.append(o)
    return out


KIND = {
    'hood': 'paint', 'trunk': 'paint', 'roof': 'paint', 'pillars': 'paint', 'fascia': 'paint', 'rearPanel': 'paint',
    'fenderFL': 'paint', 'fenderFR': 'paint', 'doorL': 'paint', 'doorR': 'paint', 'quarterL': 'paint', 'quarterR': 'paint',
    'bumperF': 'bumper', 'bumperR': 'bumper', 'glass': 'glass', 'seals': 'trim', 'under': 'under', 'wells': 'wells',
    'intakes': 'grille', 'lamps': 'trim', 'blackout': 'trim', 'vents': 'trim', 'splitter': 'trim', 'diffuser': 'trim',
}
SKIN_PARTS = {'hood', 'trunk', 'roof', 'pillars', 'fascia', 'rearPanel', 'fenderFL', 'fenderFR', 'doorL', 'doorR',
              'quarterL', 'quarterR', 'bumperF', 'bumperR', 'glass', 'seals', 'blackout', 'under'}


def build_hifi(c, K, Dcls):
    cid = c['id']
    D = Dcls(c, K)
    cage = Cage(D.tracks(), D.mid(), D.nose_f, D.tail_f, D.zf0, D.zr0)
    D.cage = cage
    D.adjust(cage)
    ob0 = build_cage_mesh(cage, D.creases(cage), cid + '_cage')
    body = subdivide(ob0, D.level, cid + '_body')
    ref = subdivide(ob0, 4, cid + '_ref')
    nref = NormalRef(ref)
    bpy.data.objects.remove(ref, do_unlink=True)
    if not getattr(D, 'keep_cage', False):
        bpy.data.objects.remove(ob0, do_unlink=True)
    body.data.materials.append(bpy.data.materials.get('part_body') or bpy.data.materials.new('part_body'))
    for p in body.data.polygons:
        p.material_index = 0
    # wheel arches
    d = D.d
    for ax in (d['a'], -d['b']):
        for sgn in (1, -1):
            xin = D.arch_xin()
            x0, x1 = (xin, D.h + 0.5) if sgn > 0 else (-D.h - 0.5, -xin)
            R, cz, cy = D.arch(ax)
            boolean(body, arch_cutter((0, cy, cz), R, x0, x1, 'wells'))
    for (poly, fr, d0, d1, nm) in D.prisms():
        boolean(body, prism_cutter(poly, fr, d0, d1, nm))
    B = Body(body, ['body', 'wells'])
    for f in B.bm.faces:
        if B.part(f) != 'body':
            continue
        s, t = B.st(f)
        p = ug(f.calc_center_median())
        B.set([f], D.classify(s, t, p, ug(f.normal)))
    B.bm.normal_update()
    D.cuts(B)
    B.bm.normal_update()
    me = B.finish(cid + '_final')
    bpy.data.objects.remove(body, do_unlink=True)
    parts = B.parts
    D.parts_used = parts

    def mats_for(p):
        kind = D.kind(p)
        return K.MATS[kind]
    objs = split_parts(me, parts, SKIN_PARTS, nref, cid, mats_for)
    surf_ob = None
    # a joined copy for ray casting the details
    bmj = bmesh.new()
    for o in objs:
        bmj.from_mesh(o.data)
    mej = bpy.data.meshes.new('surf')
    bmj.to_mesh(mej)
    bmj.free()
    surf_ob = bpy.data.objects.new('surf', mej)
    bpy.context.scene.collection.objects.link(surf_ob)
    surf = Surf(surf_ob)
    D.surf = surf
    objs += D.details(surf)
    objs += D.interior(surf)
    bpy.data.objects.remove(surf_ob, do_unlink=True)
    return objs
