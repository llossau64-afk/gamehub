"""Shared helpers for the ONE ROAD DOWN Blender asset scripts.

Run with the Blender Python module (pip install bpy==5.1.2) or inside Blender:
    python tools/blender/nature.py assets/models
Everything is generated procedurally: geometry, UVs, custom normals and textures.
"""
import math
import random
import numpy as np
import bpy


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for x in list(coll):
            coll.remove(x)


# ------------------------------------------------------------------ noise / textures
def value_noise(size, cells, rng, octaves=4, gain=0.5):
    """Tileable fbm value noise, shape (size, size), range ~0..1."""
    out = np.zeros((size, size), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        grid = rng.random((c, c)).astype(np.float32)
        xs = np.arange(size) * c / size
        i0 = np.floor(xs).astype(int) % c
        i1 = (i0 + 1) % c
        f = xs - np.floor(xs)
        f = f * f * (3 - 2 * f)
        a = grid[np.ix_(i0, i0)]; b = grid[np.ix_(i0, i1)]
        cc = grid[np.ix_(i1, i0)]; d = grid[np.ix_(i1, i1)]
        fx = f[None, :]; fy = f[:, None]
        layer = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy
        out += amp * layer
        norm += amp
        amp *= gain
    return out / norm


def make_image(name, rgba):
    """rgba: float array (h, w, 4) in 0..1, row 0 = top."""
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(np.clip(rgba, 0, 1)).astype(np.float32).ravel())
    img.pack()
    return img


def stroke(canvas, x0, y0, x1, y1, width, color, alpha=1.0):
    """Rasterise a soft line into an RGBA canvas (h, w, 4)."""
    h, w, _ = canvas.shape
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 1.5) + 2
    for t in np.linspace(0, 1, n):
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        r = width * (1 - 0.6 * t)
        xi0, xi1 = int(max(0, x - r - 1)), int(min(w - 1, x + r + 1))
        yi0, yi1 = int(max(0, y - r - 1)), int(min(h - 1, y + r + 1))
        if xi1 < xi0 or yi1 < yi0:
            continue
        yy, xx = np.mgrid[yi0:yi1 + 1, xi0:xi1 + 1]
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        a = np.clip(r + 0.5 - d, 0, 1) * alpha
        sub = canvas[yi0:yi1 + 1, xi0:xi1 + 1]
        for c in range(3):
            sub[..., c] = sub[..., c] * (1 - a) + color[c] * a
        sub[..., 3] = np.maximum(sub[..., 3], a)


def ellipse(canvas, cx, cy, rx, ry, ang, color, alpha=1.0):
    h, w, _ = canvas.shape
    R = max(rx, ry) + 1
    xi0, xi1 = int(max(0, cx - R)), int(min(w - 1, cx + R))
    yi0, yi1 = int(max(0, cy - R)), int(min(h - 1, cy + R))
    if xi1 < xi0 or yi1 < yi0:
        return
    yy, xx = np.mgrid[yi0:yi1 + 1, xi0:xi1 + 1]
    dx, dy = xx - cx, yy - cy
    ca, sa = math.cos(ang), math.sin(ang)
    u = (dx * ca + dy * sa) / rx
    v = (-dx * sa + dy * ca) / ry
    d = np.sqrt(u * u + v * v)
    a = np.clip((1 - d) * max(rx, ry) * 0.7, 0, 1) * alpha
    sub = canvas[yi0:yi1 + 1, xi0:xi1 + 1]
    shade = np.clip(0.75 + 0.35 * v, 0.5, 1.15)
    for c in range(3):
        sub[..., c] = sub[..., c] * (1 - a) + color[c] * shade * a
    sub[..., 3] = np.maximum(sub[..., 3], a)


# ------------------------------------------------------------------ materials
def material(name, image=None, color=(0.8, 0.8, 0.8, 1), rough=0.8, metal=0.0, alpha_clip=False, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Base Color'].default_value = color
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha_clip:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    if alpha_clip:
        try:
            m.blend_method = 'CLIP'
        except Exception:
            pass
        try:
            m.surface_render_method = 'DITHERED'
        except Exception:
            pass
    m.use_backface_culling = not double
    return m


# ------------------------------------------------------------------ mesh building
class MeshBuilder:
    """Collects verts / faces / uvs / per-corner normals, then makes one object."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.uvs = []      # per face: list of (u, v)
        self.mats = []     # per face material index
        self.norms = []    # per face: list of normals or None
        self.materials = []

    def mat_index(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def add_vert(self, p):
        self.verts.append(tuple(p))
        return len(self.verts) - 1

    def add_face(self, idx, uv, mat, normals=None):
        self.faces.append(tuple(idx))
        self.uvs.append(uv)
        self.mats.append(self.mat_index(mat))
        self.norms.append(normals)

    def quad(self, a, b, c, d, uv, mat, normals=None):
        i = [self.add_vert(p) for p in (a, b, c, d)]
        self.add_face(i, uv, mat, normals)

    def build(self, name, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        li = 0
        for fi, poly in enumerate(me.polygons):
            for k, loop in enumerate(poly.loop_indices):
                uvl.data[loop].uv = self.uvs[fi][k]
            poly.material_index = self.mats[fi]
            poly.use_smooth = smooth
        for m in self.materials:
            me.materials.append(m)
        if any(n is not None for n in self.norms):
            normals = []
            me.update()
            for fi, poly in enumerate(me.polygons):
                fn = self.norms[fi]
                for k in range(poly.loop_total):
                    if fn is None:
                        normals.append(tuple(poly.normal))
                    else:
                        normals.append(fn[k])
            me.normals_split_custom_set(normals)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def tube(mb, path, radii, sides, mat, uv_scale=(1.0, 1.0), cap=False, noise=0.0, rng=None):
    """Sweep a ring along a polyline. path: list of 3D points, radii: per point."""
    path = [np.array(p, float) for p in path]
    rings = []
    prev_n = None
    for i, p in enumerate(path):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        t = t / (np.linalg.norm(t) + 1e-9)
        if prev_n is None:
            ref = np.array([0, 0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0, 0])
            n = np.cross(t, ref); n /= np.linalg.norm(n)
        else:
            n = prev_n - t * np.dot(prev_n, t); n /= (np.linalg.norm(n) + 1e-9)
        prev_n = n
        b = np.cross(t, n)
        ring = []
        for s in range(sides + 1):
            a = 2 * math.pi * s / sides
            d = n * math.cos(a) + b * math.sin(a)
            r = radii[i] * (1 + (rng.uniform(-noise, noise) if (rng and noise and s < sides) else 0))
            ring.append((p + d * r, d))
        if noise and rng:
            ring[sides] = (p + (ring[0][0] - p), ring[0][1])
        rings.append(ring)
    length = 0.0
    for i in range(len(rings) - 1):
        seg = np.linalg.norm(path[i + 1] - path[i])
        for s in range(sides):
            a0, n0 = rings[i][s]; a1, n1 = rings[i][s + 1]
            b0, m0 = rings[i + 1][s]; b1, m1 = rings[i + 1][s + 1]
            u0, u1 = s / sides * uv_scale[0], (s + 1) / sides * uv_scale[0]
            v0, v1 = length * uv_scale[1], (length + seg) * uv_scale[1]
            mb.quad(a0, a1, b1, b0, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat,
                    [tuple(n0), tuple(n1), tuple(m1), tuple(m0)])
        length += seg


def export_glb(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_image_format='WEBP', export_image_quality=82, export_normals=True,
        export_lights=False, export_yup=True,
    )
