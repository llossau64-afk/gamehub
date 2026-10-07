"""Small geometry toolkit for the Barber Empire asset script.

Everything is built with bpy.data (no operators), so it runs headless with the
`bpy` wheel. Blender convention: Z up, characters and props face -Y.
"""
import math
import bpy
from mathutils import Vector, Matrix

TAU = math.pi * 2

_materials = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()


def mat(name):
    """Materials only carry a name. The game assigns the real shading by name,
    so the whole art style lives in one place (src/render/materials.js)."""
    if name not in _materials:
        m = bpy.data.materials.new(name)
        h = (hash(name) % 1000) / 1000.0
        m.diffuse_color = (0.3 + 0.5 * h, 0.4, 0.5 - 0.3 * h, 1)
        _materials[name] = m
    return _materials[name]


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.03
    link(ob)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    return ob


def world_pos(ob):
    p = Vector((0, 0, 0))
    o = ob
    while o is not None:
        p = Vector(o.location) + p
        o = o.parent
    return p


def mesh(name, verts, faces, material, parent=None, smooth=True, subsurf=0,
         bevel=None, extras=None):
    """Create a mesh object. `verts` are in world space; when a parent joint is
    given they are moved into that joint's local space (identity rotations)."""
    me = bpy.data.meshes.new(name)
    if parent is not None:
        o = world_pos(parent)
        verts = [(v[0] - o.x, v[1] - o.y, v[2] - o.z) for v in verts]
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(mat(material))
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if parent is not None:
        ob.parent = parent
    if bevel:
        w, seg = bevel if isinstance(bevel, tuple) else (bevel, 2)
        m = ob.modifiers.new("bevel", 'BEVEL')
        m.width = w
        m.segments = seg
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(35)
        m.harden_normals = False
    if subsurf:
        m = ob.modifiers.new("sub", 'SUBSURF')
        m.levels = subsurf
        m.render_levels = subsurf
    if extras:
        for k, v in extras.items():
            ob[k] = v
    return ob


# --------------------------------------------------------------- primitives

def ring_pts(cx, cy, z, rx, ry, seg, power=2.0, phase=0.0, rot=0.0):
    pts = []
    for k in range(seg):
        a = TAU * k / seg + phase
        c, s = math.cos(a), math.sin(a)
        if power != 2.0:
            e = 2.0 / power
            c = math.copysign(abs(c) ** e, c)
            s = math.copysign(abs(s) ** e, s)
        x, y = rx * c, ry * s
        if rot:
            x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + x, cy + y, z))
    return pts


def loft(name, rings, material, seg=16, caps=(True, True), power=2.0, parent=None,
         subsurf=1, smooth=True, bevel=None, phase=0.0, xform=None):
    """rings: list of (z, rx, ry[, cx, cy[, power]]) from bottom to top (or any order)."""
    verts, faces = [], []
    for r in rings:
        z, rx, ry = r[0], r[1], r[2]
        cx = r[3] if len(r) > 3 else 0.0
        cy = r[4] if len(r) > 4 else 0.0
        pw = r[5] if len(r) > 5 else power
        verts += ring_pts(cx, cy, z, max(rx, 1e-5), max(ry, 1e-5), seg, pw, phase)
    n = len(rings)
    for i in range(n - 1):
        for k in range(seg):
            a = i * seg + k
            b = i * seg + (k + 1) % seg
            c = (i + 1) * seg + (k + 1) % seg
            d = (i + 1) * seg + k
            faces.append((a, b, c, d))
    if caps[0]:
        r = rings[0]
        ci = len(verts)
        verts.append((r[3] if len(r) > 3 else 0, r[4] if len(r) > 4 else 0, r[0]))
        for k in range(seg):
            faces.append((ci, (k + 1) % seg, k))
    if caps[1]:
        r = rings[-1]
        ci = len(verts)
        verts.append((r[3] if len(r) > 3 else 0, r[4] if len(r) > 4 else 0, r[0]))
        base = (n - 1) * seg
        for k in range(seg):
            faces.append((ci, base + k, base + (k + 1) % seg))
    if n > 1 and rings[-1][0] < rings[0][0]:
        faces = [tuple(reversed(f)) for f in faces]
    if xform is not None:
        verts = [tuple(xform @ Vector(v)) for v in verts]
    return mesh(name, verts, faces, material, parent, smooth, subsurf, bevel)


def lathe(name, profile, material, seg=24, center=(0, 0, 0), parent=None, subsurf=0,
          caps=(True, True), smooth=True, bevel=None, xform=None):
    """profile: list of (radius, z). Revolved around Z at `center`."""
    cx, cy, cz = center
    rings = [(cz + z, r, r, cx, cy) for (r, z) in profile]
    return loft(name, rings, material, seg, caps, 2.0, parent, subsurf, smooth, bevel,
                xform=xform)


def box(name, size, center, material, parent=None, bevel=0.01, seg=2, smooth=True,
        xform=None, taper=None):
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    cx, cy, cz = center
    tx, ty = (taper or (1.0, 1.0))
    v = []
    for z in (-sz, sz):
        f = 1.0 if z < 0 else 1.0
        kx = tx if z > 0 else 1.0
        ky = ty if z > 0 else 1.0
        for (x, y) in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)):
            v.append((cx + x * kx * f, cy + y * ky, cz + z))
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if xform is not None:
        v = [tuple(xform @ Vector(p)) for p in v]
    return mesh(name, v, faces, material, parent, smooth,
                bevel=(bevel, seg) if bevel else None)


def cyl(name, r, h, center, material, seg=20, axis='Z', parent=None, bevel=0.004,
        r2=None, smooth=True, subsurf=0):
    rings = [(-h / 2, r, r), (h / 2, r2 if r2 is not None else r, r2 if r2 is not None else r)]
    xf = Matrix.Translation(Vector(center))
    if axis == 'X':
        xf = xf @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif axis == 'Y':
        xf = xf @ Matrix.Rotation(math.pi / 2, 4, 'X')
    return loft(name, rings, material, seg, (True, True), 2.0, parent, subsurf, smooth,
                (bevel, 2) if bevel else None, xform=xf)


def sphere(name, r, center, material, scale=(1, 1, 1), seg=16, rings=10, parent=None,
           subsurf=0, smooth=True, zcut=None, xform=None):
    """UV sphere. zcut=(lo, hi) in [-1,1] keeps a band of latitudes (open)."""
    verts, faces = [], []
    lo, hi = (-1.0, 1.0) if zcut is None else zcut
    ring_list = []
    for i in range(rings + 1):
        t = i / rings
        zz = lo + (hi - lo) * t
        ring_list.append(zz)
    for zz in ring_list:
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        for k in range(seg):
            a = TAU * k / seg
            verts.append((center[0] + math.cos(a) * rr * r * scale[0],
                          center[1] + math.sin(a) * rr * r * scale[1],
                          center[2] + zz * r * scale[2]))
    for i in range(rings):
        for k in range(seg):
            a = i * seg + k
            b = i * seg + (k + 1) % seg
            c = (i + 1) * seg + (k + 1) % seg
            d = (i + 1) * seg + k
            faces.append((a, b, c, d))
    if zcut is None:
        # close poles with fans
        bi = len(verts)
        verts.append((center[0], center[1], center[2] - r * scale[2]))
        ti = len(verts)
        verts.append((center[0], center[1], center[2] + r * scale[2]))
        top = rings * seg
        for k in range(seg):
            faces.append((bi, (k + 1) % seg, k))
            faces.append((ti, top + k, top + (k + 1) % seg))
    if xform is not None:
        verts = [tuple(xform @ Vector(p)) for p in verts]
    return mesh(name, verts, faces, material, parent, smooth, subsurf)


def torus(name, R, r, center, material, seg=24, tseg=10, axis='Z', parent=None,
          arc=TAU, scale=(1, 1), xform=None):
    verts, faces = [], []
    closed = abs(arc - TAU) < 1e-6
    n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg
        for j in range(tseg):
            b = TAU * j / tseg
            rr = R + r * math.cos(b)
            verts.append((rr * math.cos(a) * scale[0], rr * math.sin(a) * scale[1], r * math.sin(b)))
    for i in range(seg):
        i2 = (i + 1) % n if closed else i + 1
        for j in range(tseg):
            j2 = (j + 1) % tseg
            faces.append((i * tseg + j, i2 * tseg + j, i2 * tseg + j2, i * tseg + j2))
    xf = Matrix.Translation(Vector(center))
    if axis == 'X':
        xf = xf @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    elif axis == 'Y':
        xf = xf @ Matrix.Rotation(math.pi / 2, 4, 'X')
    if xform is not None:
        xf = xform @ xf
    verts = [tuple(xf @ Vector(p)) for p in verts]
    return mesh(name, verts, faces, material, parent, True)


def _frames(points):
    pts = [Vector(p) for p in points]
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        t = (b - a)
        tans.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    # parallel transport
    up = Vector((0, 0, 1))
    if abs(tans[0].dot(up)) > 0.9:
        up = Vector((0, 1, 0))
    nrm = tans[0].cross(up).normalized()
    frames = []
    for i in range(n):
        t = tans[i]
        nrm = (nrm - t * nrm.dot(t))
        if nrm.length < 1e-6:
            nrm = t.orthogonal()
        nrm.normalize()
        bi = t.cross(nrm).normalized()
        frames.append((pts[i], t, nrm, bi))
    return frames


def sweep(name, points, radii, material, seg=10, parent=None, caps=True, subsurf=0,
          smooth=True, power=2.0, twist=0.0):
    """Sweep an elliptical section along a polyline. radii: float, (a,b) or list per point."""
    fr = _frames(points)
    n = len(fr)
    verts, faces = [], []
    for i, (p, t, nn, bb) in enumerate(fr):
        r = radii[i] if isinstance(radii, list) else radii
        ra, rb = (r, r) if not isinstance(r, tuple) else r
        tw = twist * i / max(1, n - 1)
        for k in range(seg):
            a = TAU * k / seg + tw
            c, s = math.cos(a), math.sin(a)
            if power != 2.0:
                e = 2.0 / power
                c = math.copysign(abs(c) ** e, c)
                s = math.copysign(abs(s) ** e, s)
            v = p + nn * (c * ra) + bb * (s * rb)
            verts.append(tuple(v))
    for i in range(n - 1):
        for k in range(seg):
            a = i * seg + k
            b = i * seg + (k + 1) % seg
            c = (i + 1) * seg + (k + 1) % seg
            d = (i + 1) * seg + k
            faces.append((a, b, c, d))
    if caps:
        ci = len(verts)
        verts.append(tuple(fr[0][0]))
        for k in range(seg):
            faces.append((ci, (k + 1) % seg, k))
        ci = len(verts)
        verts.append(tuple(fr[-1][0]))
        base = (n - 1) * seg
        for k in range(seg):
            faces.append((ci, base + k, base + (k + 1) % seg))
    return mesh(name, verts, faces, material, parent, smooth, subsurf)


def bezier_pts(p0, p1, p2, p3, n=12):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(tuple(Vector(p0) * u ** 3 + Vector(p1) * 3 * u * u * t +
                         Vector(p2) * 3 * u * t * t + Vector(p3) * t ** 3))
    return out


def panel(name, w, h, center, material, normal='-Y', parent=None, smooth=False, curve=0.0, segx=1):
    """Flat quad (optionally curved) facing `normal`."""
    cx, cy, cz = center
    verts, faces = [], []
    for i in range(segx + 1):
        u = -0.5 + i / segx
        bulge = curve * (1 - (2 * u) ** 2)
        for z in (-h / 2, h / 2):
            if normal == '-Y':
                verts.append((cx + u * w, cy - bulge, cz + z))
            elif normal == '+Y':
                verts.append((cx - u * w, cy + bulge, cz + z))
            elif normal == '+Z':
                verts.append((cx + u * w, cy + z, cz + bulge))
            elif normal == '+X':
                verts.append((cx + bulge, cy + u * w, cz + z))
            elif normal == '-X':
                verts.append((cx - bulge, cy - u * w, cz + z))
    for i in range(segx):
        a = i * 2
        faces.append((a, a + 2, a + 3, a + 1))
    return mesh(name, verts, faces, material, parent, smooth)


def join_root(name, children, loc=(0, 0, 0)):
    root = empty(name, loc)
    for c in children:
        if c.parent is None:
            c.parent = root
    return root


def export(path, roots):
    for o in bpy.context.scene.objects:
        o.select_set(False)

    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    for r in roots:
        sel(r)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_morph=True,
        export_morph_normal=False,
        export_texcoords=False,
        export_normals=True,
        export_materials='EXPORT',
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
    )
