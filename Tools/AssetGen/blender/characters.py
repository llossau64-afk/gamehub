"""
Builds the skinned customer / barber character in Blender (run headless with the `bpy` module):

    python Tools/AssetGen/blender/characters.py [--preview out.png]

Writes Assets/BarberSimulator/Art/Source/Characters/character_parts.json. Each part is a triangle mesh in Unity
space (x right, y up, z forward, metres, character root at the origin) with up to four bone weights per vertex.
The bone names match the joint transforms that Editor/CharacterFactory.cs builds and that
ProceduralCharacterAnimator drives, so the procedural animation keeps working on the smooth skinned body.

Modelling is fully procedural: skin-modifier skeletons + subdivision for the body, a deformed sphere for the
head (its cranium matches the hair-shell ellipsoid used by the haircut system), clothing shells offset from the
body, and Blender's automatic (bone heat) weights.
"""
import json
import math
import os
import sys

import bpy  # noqa: I001  (bpy must be imported before bmesh)
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "Assets", "BarberSimulator", "Art", "Source", "Characters", "character_parts.json")
FP_OUT = os.path.join(ROOT, "Assets", "BarberSimulator", "Art", "Source", "Characters", "first_person_arm.json")

# Blender space: character faces -Y, its left side is +X, Z up. Unity (x, y, z) = (-bx, bz, -by).
# Joint positions mirror CharacterFactory (Pelvis 0.98, Spine +0.08, Neck +0.56, Head +0.07 ...).
PELVIS_Z = 0.98
SPINE_Z = 1.06
NECK_Z = 1.62
HEAD_Z = 1.69
SKULL_CENTER = Vector((0.0, 0.004, HEAD_Z + 0.115))
SKULL_RADII = Vector((0.084, 0.098, 0.104))
# Head parts are modelled at the skull size above and then scaled about the head joint. CharacterFactory reads
# the scaled skull (exported as "skull") for the haircut hair shell.
HEAD_SCALE = 1.12
FIRST_PERSON = {}


def arm_points(side):
    """Shoulder, elbow, wrist, fingertip for one side (side = +1 character left, -1 right) in Blender space."""
    s = side
    a = math.radians(5.0)
    shoulder = Vector((0.19 * s, 0.0, 1.52))
    down = Vector((math.sin(a) * s, 0.0, -math.cos(a)))
    elbow = shoulder + down * 0.29
    wrist = elbow + down * 0.27
    tip = elbow + down * 0.39
    return shoulder, elbow, wrist, tip


BONES = [
    # name, head, tail, parent
    ("Pelvis", Vector((0, 0, PELVIS_Z)), Vector((0, 0, SPINE_Z)), None),
    ("Spine", Vector((0, 0, SPINE_Z)), Vector((0, 0, NECK_Z)), "Pelvis"),
    ("Neck", Vector((0, 0, NECK_Z)), Vector((0, 0, HEAD_Z)), "Spine"),
    ("Head", Vector((0, 0, HEAD_Z)), Vector((0, 0, HEAD_Z + 0.22)), "Neck"),
]
for _side, _n in ((1, "L"), (-1, "R")):
    _sh, _el, _wr, _tip = arm_points(_side)
    BONES += [
        ("UpperArm" + _n, _sh, _el, "Spine"),
        ("Forearm" + _n, _el, _tip, "UpperArm" + _n),
        ("Thigh" + _n, Vector((0.09 * _side, 0, PELVIS_Z - 0.06)), Vector((0.09 * _side, 0, PELVIS_Z - 0.50)), "Pelvis"),
        ("Shin" + _n, Vector((0.09 * _side, 0, PELVIS_Z - 0.50)), Vector((0.09 * _side, -0.02, 0.05)), "Thigh" + _n),
    ]
BONE_NAMES = [b[0] for b in BONES]


# --------------------------------------------------------------------------------------------- helpers

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def skin_object(name, nodes, edges, subdiv=2):
    """nodes: list of (Vector position, (radius_x, radius_y)). Builds a skin-modifier mesh and applies it."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([p for p, _ in nodes], edges, [])
    obj = link(bpy.data.objects.new(name, mesh))
    obj.modifiers.new("skin", "SKIN")
    for i, (_, r) in enumerate(nodes):
        mesh.skin_vertices[0].data[i].radius = r
    mesh.skin_vertices[0].data[0].use_root = True
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = subdiv
    sub.render_levels = subdiv
    apply_modifiers(obj)
    return obj


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    new_mesh = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    old = obj.data
    obj.data = new_mesh
    bpy.data.meshes.remove(old)


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def chain(nodes, edges, points, start_index=None):
    """Appends a chain of (pos, radius) nodes; connects to start_index if given. Returns the indices."""
    idx = []
    prev = start_index
    for p in points:
        nodes.append(p)
        i = len(nodes) - 1
        if prev is not None:
            edges.append((prev, i))
        prev = i
        idx.append(i)
    return idx


def lerp(a, b, t):
    return a + (b - a) * t


def gauss(d2, sigma):
    return math.exp(-d2 / (2.0 * sigma * sigma))


# --------------------------------------------------------------------------------------------- body

def build_body():
    nodes, edges = [], []
    # Torso column (root first).
    torso = chain(nodes, edges, [
        (Vector((0, 0.0, 0.90)), (0.158, 0.110)),
        (Vector((0, 0.0, 1.00)), (0.165, 0.115)),
        (Vector((0, 0.0, 1.12)), (0.152, 0.106)),
        (Vector((0, -0.006, 1.26)), (0.170, 0.115)),
        (Vector((0, -0.010, 1.40)), (0.188, 0.120)),
        (Vector((0, 0.0, 1.51)), (0.176, 0.105)),
        (Vector((0, 0.004, 1.578)), (0.122, 0.080)),
        (Vector((0, 0.008, 1.625)), (0.072, 0.067)),
        (Vector((0, 0.012, 1.675)), (0.065, 0.062)),
        (Vector((0, 0.020, 1.74)), (0.052, 0.052)),
    ])
    pelvis_i = torso[0]
    chest_i = torso[5]
    for side in (1, -1):
        sh, el, wr, tip = arm_points(side)
        # Shoulder cap -> upper arm -> elbow -> forearm -> wrist -> palm.
        arm = chain(nodes, edges, [
            (Vector((0.15 * side, 0.0, 1.515)), (0.068, 0.062)),
            (sh + Vector((0.01 * side, 0, -0.01)), (0.060, 0.058)),
            (lerp(sh, el, 0.5), (0.052, 0.052)),
            (el, (0.042, 0.043)),
            (lerp(el, wr, 0.45), (0.044, 0.039)),
            (wr, (0.030, 0.023)),
        ], chest_i)
        wrist_i = arm[-1]
        down = (wr - el).normalized()
        out = Vector((side, 0, 0))
        # Palm: thick and narrow (palms face the thighs).
        palm = chain(nodes, edges, [(wr + down * 0.045, (0.016, 0.040))], wrist_i)[0]
        knuckle_z = wr + down * 0.085
        for k, (dy, length) in enumerate(((-0.026, 0.07), (-0.009, 0.078), (0.009, 0.074), (0.026, 0.06))):
            base = knuckle_z + Vector((0, dy, 0))
            chain(nodes, edges, [
                (base, (0.0095, 0.0095)),
                (base + down * length * 0.55 + Vector((-0.004 * side, 0, 0)), (0.0085, 0.0085)),
                (base + down * length + Vector((-0.010 * side, 0, 0)), (0.0075, 0.0075)),
            ], palm)
        thumb_base = wr + down * 0.03 + Vector((-0.012 * side, -0.03, 0))
        chain(nodes, edges, [
            (thumb_base, (0.012, 0.012)),
            (thumb_base + down * 0.03 + Vector((-0.012 * side, -0.018, 0)), (0.0095, 0.0095)),
            (thumb_base + down * 0.055 + Vector((-0.018 * side, -0.022, 0)), (0.008, 0.008)),
        ], palm)

        # Leg: hip -> thigh -> knee -> calf -> ankle -> foot.
        hx = 0.09 * side
        chain(nodes, edges, [
            (Vector((hx, 0.0, 0.86)), (0.090, 0.092)),
            (Vector((hx * 0.98, 0.0, 0.70)), (0.078, 0.082)),
            (Vector((hx * 0.95, -0.005, 0.48)), (0.055, 0.058)),
            (Vector((hx * 0.95, 0.005, 0.33)), (0.058, 0.062)),
            (Vector((hx * 0.95, 0.0, 0.12)), (0.035, 0.036)),
            (Vector((hx * 0.95, 0.005, 0.055)), (0.034, 0.038)),
            (Vector((hx * 0.95, -0.07, 0.035)), (0.040, 0.026)),
            (Vector((hx * 0.95, -0.125, 0.025)), (0.038, 0.020)),
        ], pelvis_i)
    body = skin_object("Body", nodes, edges, 2)
    smooth(body)
    return body


# --------------------------------------------------------------------------------------------- head

def build_head():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=56, radius=1.0)
    c = SKULL_CENTER
    for v in bm.verts:
        u, w, h = v.co.x, v.co.y, v.co.z  # unit sphere: x side, y back(+)/front(-), z up
        x, y, z = u * SKULL_RADII.x * 0.985, w * SKULL_RADII.y * 0.985, h * SKULL_RADII.z * 0.985
        front = max(0.0, -w)
        back = max(0.0, w)
        low = max(0.0, -h)
        # Jaw: narrower towards the chin, the lower back of the skull tucks in towards the neck.
        x *= 1.0 - 0.30 * low ** 1.6
        y *= 1.0 - 0.55 * back * low ** 1.2
        # Lower face comes slightly forward (mouth/jaw), cheeks flatten at the sides of the face.
        y -= 0.010 * front * low ** 0.8
        # Chin extends down a little.
        z -= 0.018 * front * low ** 3
        # Features (all in unit-sphere terms of the front surface).
        fx, fz = u, h
        def bump(cx, cz, sx, sz, amount):
            return amount * front ** 2 * math.exp(-((fx - cx) ** 2) / (2 * sx * sx) - ((fz - cz) ** 2) / (2 * sz * sz))
        push = 0.0
        push += bump(0.0, 0.22, 0.42, 0.07, 0.006)            # brow ridge
        push -= bump(0.37, 0.07, 0.13, 0.08, 0.005)           # eye sockets
        push -= bump(-0.37, 0.07, 0.13, 0.08, 0.005)
        push += bump(0.48, -0.22, 0.12, 0.10, 0.006)          # cheekbones
        push += bump(-0.48, -0.22, 0.12, 0.10, 0.006)
        push += bump(0.0, -0.05, 0.075, 0.14, 0.010)          # nose bridge
        push += bump(0.0, -0.26, 0.11, 0.08, 0.021)           # nose tip
        push += bump(0.13, -0.33, 0.06, 0.04, 0.006)          # nostril wings
        push += bump(-0.13, -0.33, 0.06, 0.04, 0.006)
        push -= bump(0.0, -0.40, 0.05, 0.03, 0.003)           # philtrum groove
        push += bump(0.0, -0.50, 0.24, 0.05, 0.006)           # lips
        push -= bump(0.0, -0.57, 0.24, 0.012, 0.004)          # mouth line
        push -= bump(0.0, -0.68, 0.22, 0.05, 0.004)           # under the lip
        push += bump(0.0, -0.84, 0.18, 0.08, 0.006)           # chin
        y -= push
        v.co = Vector((x, y, z)) + c
    mesh = bpy.data.meshes.new("Head")
    bm.to_mesh(mesh)
    bm.free()
    head = link(bpy.data.objects.new("Head", mesh))
    smooth(head)
    return head


def head_surface_front(fx, fz):
    """Approximate point on the face for unit-sphere front coordinates (used to place eyes, brows, lips)."""
    head = bpy.data.objects["Head"]
    origin = SKULL_CENTER + Vector((fx * SKULL_RADII.x, -0.3, fz * SKULL_RADII.z))
    ok, loc, normal, _ = head.ray_cast(origin, Vector((0, 1, 0)))
    return (loc, normal) if ok else (None, None)


def ellipsoid(name, center, radii, segments=16, rings=12, rotation=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for v in bm.verts:
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if rotation is not None:
            co = rotation @ co
        v.co = co + center
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    smooth(obj)
    return obj


def join(objects, name):
    objects = [o for o in objects if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def build_face_parts():
    parts = {}
    eyes_w, irises, lids, brows, ears = [], [], [], [], []
    for side in (1, -1):
        eye_x = 0.36 * side
        loc, _ = head_surface_front(eye_x, 0.06)
        eye_center = loc + Vector((0, 0.0075, 0))
        eyes_w.append(ellipsoid("EyeW", eye_center, (0.0125, 0.0105, 0.0098), 16, 12))
        irises.append(ellipsoid("Iris", eye_center + Vector((0, -0.0094, 0.0004)), (0.0058, 0.0022, 0.0058), 14, 8))
        # Upper lid crease sits over the top of the eyeball.
        lids.append(ellipsoid("Lid", eye_center + Vector((0, -0.0015, 0.0062)), (0.0142, 0.0102, 0.0052), 14, 8))
        bloc, _ = head_surface_front(0.37 * side, 0.20)
        brows.append(ellipsoid("Brow", bloc + Vector((0, 0.0015, 0)), (0.019, 0.004, 0.0035), 12, 6,
                               rotation=_rot_y(-0.10 * side)))
        # Ears at eye / nose height.
        ear_c = SKULL_CENTER + Vector((0.083 * side, 0.004, -0.012))
        ear = ellipsoid("Ear", ear_c, (0.010, 0.019, 0.030), 14, 10)
        rim = ellipsoid("EarRim", ear_c + Vector((0.004 * side, 0.003, 0.002)), (0.006, 0.016, 0.026), 12, 8)
        ears += [ear, rim]
    lip_loc, _ = head_surface_front(0.0, -0.51)
    lips = [
        ellipsoid("LipU", lip_loc + Vector((0, 0.0045, 0.0035)), (0.019, 0.005, 0.0038), 18, 8),
        ellipsoid("LipL", lip_loc + Vector((0, 0.0045, -0.0038)), (0.017, 0.0055, 0.0042), 18, 8),
    ]
    parts["EyeWhites"] = join(eyes_w, "EyeWhites")
    parts["Irises"] = join(irises, "Irises")
    parts["Lips"] = join(lips, "Lips")
    parts["Brows"] = join(brows, "Brows")
    parts["HeadSkinExtras"] = join(lids + ears, "HeadSkinExtras")
    return parts


def _rot_y(angle):
    from mathutils import Matrix
    return Matrix.Rotation(angle, 3, "Y")


# --------------------------------------------------------------------------------------------- clothing

def shell_from(source, name, keep, offset, extra=None):
    """Copies `source`, keeps faces whose centre passes keep(center), and pushes vertices out along normals."""
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    obj.data.name = name
    link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    deform = bm.verts.layers.deform.active
    names = {g.index: g.name for g in source.vertex_groups}

    def dominant(face):
        if deform is None:
            return None
        totals = {}
        for v in face.verts:
            for gi, w in v[deform].items():
                totals[gi] = totals.get(gi, 0.0) + w
        if not totals:
            return None
        return names.get(max(totals, key=totals.get))

    remove = [f for f in bm.faces if not keep(f.calc_center_median(), dominant(f))]
    bmesh.ops.delete(bm, geom=remove, context="FACES")
    bm.normal_update()
    for v in bm.verts:
        o = offset(v.co) if callable(offset) else offset
        v.co += v.normal * o
        if extra is not None:
            extra(v)
    bm.to_mesh(obj.data)
    bm.free()
    smooth(obj)
    return obj


def arm_param(co, side):
    """0 at the shoulder, 1 at the fingertips (for the given side), None if not on that arm."""
    sh, el, wr, tip = arm_points(side)
    if co.x * side < 0.125:
        return None
    axis = tip - sh
    t = (co - sh).dot(axis) / axis.length_squared
    if t < -0.25 or t > 1.15:
        return None
    closest = sh + axis * max(0.0, min(1.0, t))
    if (co - closest).length > 0.085:
        return None
    return t


def on_arm(co, bone=None):
    if bone is not None:
        if not (bone.startswith("UpperArm") or bone.startswith("Forearm")):
            return None, None
        side = 1 if bone.endswith("L") else -1
        sh, _, _, tip = arm_points(side)
        axis = tip - sh
        return side, (co - sh).dot(axis) / axis.length_squared
    for side in (1, -1):
        t = arm_param(co, side)
        if t is not None:
            return side, t
    return None, None


def build_clothing(body):
    parts = {}

    def torso_region(co, low=0.84, neck=1.588):
        return low < co.z < neck and abs(co.x) < 0.2

    def tee(co, bone):
        side, t = on_arm(co, bone)
        if side is not None:
            return t < 0.28
        return torso_region(co, 0.86)

    def long_sleeve(co, bone, cuff=0.70):
        side, t = on_arm(co, bone)
        if side is not None:
            return t < cuff
        return torso_region(co, 0.84)

    parts["Top_TShirt"] = shell_from(body, "Top_TShirt", tee, 0.007)
    parts["Top_Sweater"] = shell_from(body, "Top_Sweater", long_sleeve, 0.010)
    parts["Top_Hoodie"] = shell_from(body, "Top_Hoodie", lambda c, b: long_sleeve(c, b, 0.71),
                                     lambda co: 0.016 + 0.006 * max(0.0, (1.1 - co.z) * 3))
    parts["Top_Jacket"] = shell_from(body, "Top_Jacket", lambda c, b: long_sleeve(c, b, 0.69) and not (abs(c.x) < 0.045 and c.y < 0 and c.z > 1.1),
                                     lambda co: 0.020 + 0.006 * max(0.0, (1.1 - co.z) * 3))
    parts["Top_JacketShirt"] = shell_from(body, "Top_JacketShirt", lambda c, b: torso_region(c, 1.0) and abs(c.x) < 0.07 and c.y < 0, 0.012)

    # Hood bunched behind the neck and a kangaroo pocket for the hoodie.
    hood = ellipsoid("Hood", Vector((0, 0.07, 1.58)), (0.105, 0.048, 0.05), 20, 12)
    pocket = ellipsoid("Pocket", Vector((0, -0.118, 0.98)), (0.10, 0.018, 0.055), 18, 10)
    parts["Top_Hoodie"] = join([parts["Top_Hoodie"], hood, pocket], "Top_Hoodie")
    # Collars.
    tee_collar = torus("TeeCollar", Vector((0, 0.006, 1.586)), 0.076, 0.009, 0.85)
    parts["Top_TShirt"] = join([parts["Top_TShirt"], tee_collar], "Top_TShirt")
    sweater_collar = torus("SweaterCollar", Vector((0, 0.006, 1.592)), 0.074, 0.013, 0.85)
    parts["Top_Sweater"] = join([parts["Top_Sweater"], sweater_collar], "Top_Sweater")

    def pants(co, bone):
        side, _ = on_arm(co, bone)
        return side is None and 0.105 < co.z < 1.02
    parts["Pants"] = shell_from(body, "Pants", pants, lambda co: 0.009 + (0.005 if co.z < 0.45 else 0.0))
    belt = torus("Belt", Vector((0, 0.0, 1.0)), 0.158, 0.014, 0.72, scale_x=1.0)
    parts["Belt"] = belt
    parts["Buckle"] = ellipsoid("Buckle", Vector((0, -0.118, 1.0)), (0.024, 0.006, 0.017), 12, 6)

    def shoes(co, bone):
        return co.z < 0.13
    parts["Shoes"] = shell_from(body, "Shoes", shoes, lambda co: 0.012 if co.z > 0.02 else 0.006,
                                extra=lambda v: setattr(v.co, "z", max(v.co.z, -0.0)))
    return parts


def torus(name, center, major, minor, depth_scale=1.0, scale_x=1.0):
    bm = bmesh.new()
    seg, ring = 32, 8
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            r = major + minor * math.cos(b)
            co = Vector((math.cos(a) * r * scale_x, math.sin(a) * r * depth_scale, minor * math.sin(b))) + center
            row.append(bm.verts.new(co))
        verts.append(row)
    for i in range(seg):
        for j in range(ring):
            a = verts[i][j]
            b = verts[(i + 1) % seg][j]
            c = verts[(i + 1) % seg][(j + 1) % ring]
            d = verts[i][(j + 1) % ring]
            bm.faces.new((a, b, c, d))
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    smooth(obj)
    return obj


# --------------------------------------------------------------------------------------------- facial hair / accessories

def build_facial_hair(head):
    parts = {}

    def face_shell(name, keep, offset):
        return shell_from(head, name, keep, offset)

    def rel(co):
        d = co - SKULL_CENTER
        return d.x / SKULL_RADII.x, d.y / SKULL_RADII.y, d.z / SKULL_RADII.z

    def smoothstep(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)

    def beard_mask(co, top):
        """Soft 0..1 coverage. Shell vertices with low coverage sink under the skin, so the visible edge is smooth."""
        u, w, h = rel(co)
        au = min(1.0, abs(u))
        # Cheek line: high near the ears (sideburns), dropping to below the mouth corners.
        line = top + (au - 1.0) * 0.42 if w < 0.0 else top
        m = smoothstep(line + 0.05, line - 0.07, h)
        m *= smoothstep(0.36, 0.18, w)
        gap = smoothstep(0.36, 0.26, abs(u)) * smoothstep(-0.70, -0.62, h) * smoothstep(-0.30, -0.38, h) * smoothstep(-0.35, -0.55, w)
        return m * (1.0 - gap)

    def beard(name, top, thickness):
        def offset(co):
            f = beard_mask(co, top)
            t = thickness(co) if callable(thickness) else thickness
            return t * f - 0.003 * (1.0 - f)
        return face_shell(name, lambda c, b: beard_mask(c, top) > 0.0, offset)

    parts["Facial_Stubble"] = beard("Facial_Stubble", -0.12, 0.0013)
    parts["Facial_ShortBeard"] = beard("Facial_ShortBeard", -0.16, 0.0045)
    parts["Facial_FullBeard"] = beard("Facial_FullBeard", -0.10, lambda co: 0.007 + 0.012 * max(0.0, -rel(co)[2] - 0.6))
    mloc, _ = head_surface_front(0.0, -0.42)
    moustache = ellipsoid("Moustache", mloc + Vector((0, 0.002, 0)), (0.027, 0.007, 0.0065), 16, 8)
    parts["Facial_Moustache"] = moustache
    beard_moustache = ellipsoid("BeardMoustache", mloc + Vector((0, 0.002, 0)), (0.028, 0.008, 0.007), 16, 8)
    parts["Facial_FullBeard"] = join([parts["Facial_FullBeard"], beard_moustache], "Facial_FullBeard")
    short_moustache = ellipsoid("ShortMoustache", mloc + Vector((0, 0.003, 0)), (0.025, 0.0055, 0.0055), 16, 8)
    parts["Facial_ShortBeard"] = join([parts["Facial_ShortBeard"], short_moustache], "Facial_ShortBeard")
    return parts


def build_accessories():
    parts = {}
    rings = []
    for side in (1, -1):
        loc, _ = head_surface_front(0.36 * side, 0.06)
        rings.append(torus("GlassRing", Vector((0, 0, 0)), 0.019, 0.0022))
        r = rings[-1]
        for v in r.data.vertices:
            v.co = Vector((v.co.x, v.co.z, v.co.y)) + loc + Vector((0, -0.016, 0))
    bridge = ellipsoid("Bridge", head_surface_front(0.0, 0.08)[0] + Vector((0, -0.017, 0.003)), (0.012, 0.002, 0.002), 8, 6)
    arms = [ellipsoid("GlassArm", SKULL_CENTER + Vector((0.086 * s, -0.04, 0.0)), (0.002, 0.05, 0.002), 8, 6) for s in (1, -1)]
    parts["Glasses"] = join(rings + [bridge] + arms, "Glasses")

    cap_bm = bmesh.new()
    bmesh.ops.create_uvsphere(cap_bm, u_segments=40, v_segments=20, radius=1.0)
    remove = [v for v in cap_bm.verts if v.co.z < -0.05]
    bmesh.ops.delete(cap_bm, geom=remove, context="VERTS")
    for v in cap_bm.verts:
        v.co = Vector((v.co.x * (SKULL_RADII.x + 0.012), v.co.y * (SKULL_RADII.y + 0.012), v.co.z * (SKULL_RADII.z + 0.008))) + SKULL_CENTER + Vector((0, 0, 0.012))
    cap_mesh = bpy.data.meshes.new("Cap")
    cap_bm.to_mesh(cap_mesh)
    cap_bm.free()
    cap = link(bpy.data.objects.new("Cap", cap_mesh))
    smooth(cap)
    brim = ellipsoid("Brim", SKULL_CENTER + Vector((0, -0.12, 0.012)), (0.08, 0.06, 0.004), 20, 6)
    parts["Cap"] = join([cap, brim], "Cap")
    return parts


# --------------------------------------------------------------------------------------------- rig + export

def build_armature():
    arm_data = bpy.data.armatures.new("Rig")
    rig = link(bpy.data.objects.new("Rig", arm_data))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        b = arm_data.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def auto_weight(obj, rig):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def rigid_weight(obj, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


def transfer_weights(target, source):
    """Copies the nearest-surface weights from `source` (clothing follows the body exactly)."""
    mod = target.modifiers.new("wt", "DATA_TRANSFER")
    mod.object = source
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    for name in BONE_NAMES:
        if target.vertex_groups.get(name) is None:
            target.vertex_groups.new(name=name)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.datalayout_transfer(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def fix_joined_weights(target, body):
    """Parts joined onto a clothing shell (hood, pocket, collar, lapels) have no weights yet: copy from the body."""
    unweighted = [v for v in target.data.vertices if not v.groups]
    if not unweighted:
        return
    transfer_weights(target, body)


def head_weights(obj):
    """Head parts: Head bone, blending into the neck below the jaw."""
    head = obj.vertex_groups.new(name="Head")
    neck = obj.vertex_groups.new(name="Neck")
    for v in obj.data.vertices:
        z = v.co.z
        t = min(1.0, max(0.0, (z - (HEAD_Z - 0.03)) / 0.05))
        if t > 0:
            head.add([v.index], t, "REPLACE")
        if t < 1:
            neck.add([v.index], 1 - t, "REPLACE")


def export(objects, path):
    out = {"version": 1, "bones": BONE_NAMES, "parts": [],
           # Hair-shell ellipsoid in Head-joint space (Unity axes).
           "skullCenter": [0.0, round((SKULL_CENTER.z - HEAD_Z) * HEAD_SCALE, 5), round(-SKULL_CENTER.y * HEAD_SCALE, 5)],
           "skullRadii": [round(SKULL_RADII.x * HEAD_SCALE, 5), round(SKULL_RADII.z * HEAD_SCALE, 5), round(SKULL_RADII.y * HEAD_SCALE, 5)]}
    for name, obj in objects.items():
        mesh = obj.data
        mesh.calc_loop_triangles()
        group_names = {g.index: g.name for g in obj.vertex_groups}
        positions, normals, uvs, bone_indices, bone_weights, triangles = [], [], [], [], [], []
        vertex_map = {}
        split = mesh.corner_normals if hasattr(mesh, "corner_normals") else None
        for tri in mesh.loop_triangles:
            idx = []
            for k in range(3):
                loop = tri.loops[k]
                vi = tri.vertices[k]
                n = split[loop].vector if split is not None else mesh.vertices[vi].normal
                key = (vi, round(n.x, 3), round(n.y, 3), round(n.z, 3))
                if key not in vertex_map:
                    vertex_map[key] = len(positions) // 3
                    co = mesh.vertices[vi].co
                    positions += [round(-co.x, 5), round(co.z, 5), round(-co.y, 5)]
                    normals += [round(-n.x, 4), round(n.z, 4), round(-n.y, 4)]
                    # Triplanar-style projection (fabric / skin detail tiling ~2.5 per metre).
                    ax = max(range(3), key=lambda a: abs(n[a]))
                    if ax == 0:
                        u, v2 = co.y, co.z
                    elif ax == 1:
                        u, v2 = co.x, co.z
                    else:
                        u, v2 = co.x, co.y
                    uvs += [round(u * 2.5, 4), round(v2 * 2.5, 4)]
                    ws = []
                    for g in mesh.vertices[vi].groups:
                        gname = group_names.get(g.group)
                        if gname in BONE_NAMES and g.weight > 0.001:
                            ws.append((BONE_NAMES.index(gname), g.weight))
                    ws.sort(key=lambda p: -p[1])
                    ws = ws[:4]
                    total = sum(w for _, w in ws) or 1.0
                    if not ws:
                        ws = [(BONE_NAMES.index("Spine"), 1.0)]
                        total = 1.0
                    ws = ws + [(0, 0.0)] * (4 - len(ws))
                    for bi, w in ws:
                        bone_indices.append(bi)
                        bone_weights.append(round(w / total, 4))
                idx.append(vertex_map[key])
            # Blender -> Unity mirrors one axis, so the winding flips.
            triangles += [idx[0], idx[2], idx[1]]
        out["parts"].append({"name": name, "positions": positions, "normals": normals, "uvs": uvs,
                             "boneIndices": bone_indices, "boneWeights": bone_weights, "triangles": triangles})
        print(f"  {name}: {len(positions) // 3} verts, {len(triangles) // 3} tris")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote", path, os.path.getsize(path) // 1024, "KB")


def build_first_person_arm(body):
    """Right forearm + hand (skin) and a sleeve for the first-person view, re-oriented into arm space:
    the arm points along +Z (Unity), palm down, wrist near the origin. Exported unskinned."""
    from mathutils import Matrix
    side = -1  # character right
    sh, el, wr, tip = arm_points(side)
    hand = shell_from(body, "FP_Hand", lambda c, b: on_arm(c, b)[0] == side and on_arm(c, b)[1] > 0.55, 0.0)
    sleeve = shell_from(body, "FP_Sleeve", lambda c, b: on_arm(c, b)[0] == side and 0.15 < on_arm(c, b)[1] < 0.70, 0.010)
    cuff = torus("FP_Cuff", Vector((0, 0, 0)), 0.042, 0.007)
    axis = (tip - sh).normalized()
    # Cuff ring perpendicular to the forearm at the sleeve end.
    cuff_center = sh + (tip - sh) * 0.695
    rot = axis.to_track_quat("Z", "Y").to_matrix()
    for v in cuff.data.vertices:
        v.co = rot @ v.co + cuff_center
    sleeve = join([sleeve, cuff], "FP_Sleeve")
    # Blender arm space: forearm axis -> +Y (Blender forward = Unity +Z after export mapping (x,z,-y)... see below).
    # Build a basis: arm direction d (down the arm), palm normal n (palm faces the body: +X for the right arm).
    d = axis
    n = Vector((1.0, 0.0, 0.0))
    n = (n - d * n.dot(d)).normalized()
    b = d.cross(n)
    # Target (Blender coords, export maps Unity = (-x, z, -y)): Unity +Z forward = Blender -Y; Unity -Y (palm down) = Blender -Z.
    target_d = Vector((0, -1, 0))
    target_n = Vector((0, 0, -1))
    target_b = target_d.cross(target_n)
    src = Matrix((d, n, b)).transposed()
    dst = Matrix((target_d, target_n, target_b)).transposed()
    rot_fp = dst @ src.inverted()
    for obj in (hand, sleeve):
        for v in obj.data.vertices:
            v.co = rot_fp @ (v.co - wr) + Vector((0, -0.02, 0))
        obj.vertex_groups.clear()
    return {"FP_Hand": hand, "FP_Sleeve": sleeve}


def decimate(obj, ratio):
    """Collapse-decimates a part for WebGL/mobile budgets (smooth shading hides the reduction)."""
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def build_all():
    reset()
    body = build_body()
    head = build_head()
    face = build_face_parts()
    facial = build_facial_hair(head)
    accessories = build_accessories()
    # Scale every head part about the head joint (more natural head-to-body proportion).
    head_parts = [head] + list(face.values()) + list(facial.values()) + list(accessories.values())
    pivot = Vector((0, 0, HEAD_Z))
    for obj in head_parts:
        for v in obj.data.vertices:
            v.co = pivot + (v.co - pivot) * HEAD_SCALE

    rig = build_armature()
    auto_weight(body, rig)
    # Clothing copies the weighted body, so its vertex groups (and the arm/torso split) come for free.
    clothing = build_clothing(body)
    for name in ("Belt", "Buckle"):
        rigid_weight(clothing[name], "Pelvis")
    for name in ("Top_Hoodie", "Top_TShirt", "Top_Sweater", "Top_Jacket"):
        fix_joined_weights(clothing[name], body)
    for obj in head_parts:
        head_weights(obj)
    global FIRST_PERSON
    FIRST_PERSON = build_first_person_arm(body)

    # Skin: the body under the clothes is never visible except neck, arms and hands; keep it whole so short
    # sleeves and open collars always show skin, but drop the legs and feet (always covered).
    bm = bmesh.new()
    bm.from_mesh(body.data)
    hidden = [f for f in bm.faces if f.calc_center_median().z < 0.84 and on_arm(f.calc_center_median())[0] is None]
    bmesh.ops.delete(bm, geom=hidden, context="FACES")
    bm.to_mesh(body.data)
    bm.free()

    # Polygon budget: ~6-7k vertices per fully dressed character.
    for obj, ratio in ((body, 0.45), (head, 0.5)):
        decimate(obj, ratio)
    for name in ("Top_TShirt", "Top_Sweater", "Top_Hoodie", "Top_Jacket", "Pants"):
        decimate(clothing[name], 0.6)
    for name in ("Facial_Stubble", "Facial_ShortBeard", "Facial_FullBeard"):
        decimate(facial[name], 0.5)

    parts = {"BodySkin": body, "HeadSkin": join([head, face["HeadSkinExtras"]], "HeadSkin"),
             "EyeWhites": face["EyeWhites"], "Irises": face["Irises"], "Lips": face["Lips"], "Brows": face["Brows"]}
    parts.update(clothing)
    parts.update(facial)
    parts.update(accessories)
    return parts


def preview(parts, path):
    colors = {
        "BodySkin": (0.78, 0.56, 0.42), "HeadSkin": (0.78, 0.56, 0.42), "EyeWhites": (0.92, 0.9, 0.86),
        "Irises": (0.12, 0.08, 0.05), "Lips": (0.62, 0.36, 0.32), "Brows": (0.1, 0.07, 0.05),
        "Top_TShirt": (0.16, 0.22, 0.32), "Pants": (0.12, 0.14, 0.2), "Belt": (0.1, 0.08, 0.07),
        "Buckle": (0.7, 0.55, 0.3), "Shoes": (0.1, 0.08, 0.07), "Facial_ShortBeard": (0.1, 0.07, 0.05),
    }
    show = set(colors.keys())
    for name, obj in parts.items():
        obj.hide_render = name not in show
        mat = bpy.data.materials.new(name + "_m")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        col = colors.get(name, (0.5, 0.5, 0.5))
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        bsdf.inputs["Roughness"].default_value = 0.6
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.0
    sun_obj = link(bpy.data.objects.new("Sun", sun))
    sun_obj.rotation_euler = (math.radians(50), 0, math.radians(-30))
    cam_data = bpy.data.cameras.new("Cam")
    cam = link(bpy.data.objects.new("Cam", cam_data))
    scene.camera = cam
    views = os.environ.get("PREVIEW_VIEWS", "full").split(",")
    base, ext = os.path.splitext(path)
    for view in views:
        if view == "full":
            cam.location = (1.6, -3.4, 1.15)
            target = Vector((0, 0, 0.95))
            cam_data.lens = 50
        elif view == "face":
            cam.location = (0.18, -0.55, 1.83)
            target = Vector((0, 0, 1.79))
            cam_data.lens = 60
        else:
            cam.location = (0.55, -0.35, 1.84)
            target = Vector((0, 0, 1.8))
            cam_data.lens = 60
        direction = target - Vector(cam.location)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{base}_{view}{ext}"
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__" and "--portraits" not in sys.argv:
    args = sys.argv[1:]
    built = build_all()
    export(built, OUT)
    export(FIRST_PERSON, FP_OUT)
    if "--preview" in args:
        preview(built, args[args.index("--preview") + 1])


# --------------------------------------------------------------------------------------------- dialogue portraits

PORTRAITS = {
    # name: (skin, hair colour, hair top thickness, side thickness, top style, top colour, facial, glasses, age lines)
    "portrait_owner": dict(skin=(0.80, 0.62, 0.50), hair=(0.62, 0.60, 0.57), top="Top_Jacket", top_color=(0.30, 0.23, 0.17),
                           facial="Facial_Moustache", glasses=True, hair_top=0.006, hair_side=0.004, receding=0.32),
    "portrait_player": dict(skin=(0.78, 0.56, 0.42), hair=(0.10, 0.07, 0.05), top="Top_TShirt", top_color=(0.16, 0.22, 0.32),
                            facial="", glasses=False, hair_top=0.016, hair_side=0.008, receding=0.0),
}


def portrait_hair(head, top, side, receding):
    """Simple sculpted hair cap for the portraits (in game the haircut system grows real hair)."""
    def rel(co):
        d = co - SKULL_CENTER * 1.0
        return d.x / (SKULL_RADII.x * HEAD_SCALE), d.y / (SKULL_RADII.y * HEAD_SCALE), (co.z - (HEAD_Z + (SKULL_CENTER.z - HEAD_Z) * HEAD_SCALE)) / (SKULL_RADII.z * HEAD_SCALE)

    def coverage(co):
        u, w, h = rel(co)
        # Hairline: forehead (front) is higher, sides come down to the ears, back to the nape.
        line = -0.05 + 0.45 * max(0.0, -w) + receding * max(0.0, -w) ** 2
        if w > 0:
            line = -0.55 * w - 0.05
        f = max(0.0, min(1.0, (h - line) / 0.12))
        return f * f * (3 - 2 * f)

    def offset(co):
        f = coverage(co)
        u, w, h = rel(co)
        thick = side + (top - side) * max(0.0, h)
        return thick * f - 0.003 * (1 - f)

    return shell_from(head, "PortraitHair", lambda c, b: coverage(c) > 0.0, offset)


def render_portraits(out_dir):
    for name, spec in PORTRAITS.items():
        parts = build_all()
        head = bpy.data.objects["HeadSkin"]
        hair = portrait_hair(head, spec["hair_top"], spec["hair_side"], spec["receding"])
        show = {"BodySkin", "HeadSkin", "EyeWhites", "Irises", "Lips", "Brows", spec["top"], "Pants", "Belt", "Buckle", spec["facial"]}
        if spec["top"] == "Top_Jacket":
            show.add("Top_JacketShirt")
        if spec["glasses"]:
            show.add("Glasses")
        colors = {"BodySkin": spec["skin"], "HeadSkin": spec["skin"], "EyeWhites": (0.9, 0.88, 0.84), "Irises": (0.16, 0.11, 0.07),
                  "Lips": tuple(c * 0.82 for c in spec["skin"]), "Brows": spec["hair"], spec["top"]: spec["top_color"],
                  "Top_JacketShirt": (0.85, 0.82, 0.74), spec["facial"]: spec["hair"], "Glasses": (0.12, 0.1, 0.09)}
        for pname, obj in parts.items():
            obj.hide_render = pname not in show
            apply_color(obj, colors.get(pname, (0.4, 0.4, 0.4)), 0.45 if "Skin" in pname else 0.7)
        apply_color(hair, spec["hair"], 0.55)
        # Hair reads better with a little sheen and a slightly fuzzy edge: bump via noise texture.
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 64
        scene.cycles.device = "CPU"
        scene.render.resolution_x = 256
        scene.render.resolution_y = 256
        scene.render.film_transparent = True
        world = bpy.data.worlds.new("W")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.38, 0.34, 1)
        world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = 0.0
        scene.world = world
        key = link(bpy.data.objects.new("Key", bpy.data.lights.new("Key", "AREA")))
        key.data.energy = 26
        key.data.size = 1.2
        key.data.color = (1.0, 0.9, 0.78)
        key.location = (-0.9, -1.1, 2.3)
        key.rotation_euler = Vector((0, 0, 1.75)).to_track_quat("-Z", "Y").to_euler() if False else (math.radians(55), 0, math.radians(-38))
        rim = link(bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "AREA")))
        rim.data.energy = 18
        rim.data.size = 0.8
        rim.data.color = (0.75, 0.82, 1.0)
        rim.location = (0.8, 0.9, 2.1)
        rim.rotation_euler = (math.radians(-60), 0, math.radians(140))
        cam = link(bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")))
        cam.data.lens = 85
        cam.location = (-0.22, -0.82, 1.86)
        target = Vector((0, 0, 1.80))
        cam.rotation_euler = (target - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam
        scene.render.filepath = os.path.join(out_dir, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("portrait", scene.render.filepath)


def apply_color(obj, color, roughness):
    mat = bpy.data.materials.new(obj.name + "_mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    obj.data.materials.clear()
    obj.data.materials.append(mat)


if __name__ == "__main__" and "--portraits" in sys.argv:
    render_portraits(os.path.join(ROOT, "Assets", "BarberSimulator", "UI", "Sprites"))
