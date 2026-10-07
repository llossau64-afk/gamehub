"""Person template: one rig of joint empties with rigid body pieces.

Body pieces use material names that are palette slots in the game
(Skin, Top, Sleeve, Pants, Shoes, Hair, ...). Optional pieces are tagged
`acc_<name>` in the object name so the game can toggle them per character.
The game merges everything into a single rigid-skinned mesh per character.
"""
import math
from mathutils import Vector, Matrix
from geo import (empty, mesh, loft, lathe, box, cyl, sphere, torus, sweep, bezier_pts,
                 world_pos)

# Joint world positions (Z up, facing -Y, character left = +X)
J = {
    'Hips': (0, 0, 0.98), 'Spine': (0, 0, 1.08), 'Chest': (0, 0, 1.27),
    'Neck': (0, 0.005, 1.47), 'Head': (0, 0.0, 1.565),
}
HEAD_C = (0, 0.005, 0.125)       # cranium centre, head-local (Blender)
HEAD_R = (0.089, 0.102, 0.104)   # rx (width), ry (depth), rz (height)


def limb(name, x, y0, pts, material, parent, seg=10, round_top=True, round_bot=True):
    """pts: list of (z, r) top->bottom; ends get rounded caps so joints overlap cleanly."""
    rings = []
    z0, r0 = pts[0]
    z1, r1 = pts[-1]
    if round_top:
        for k, f in ((0.35, 0.55), (0.65, 0.85), (0.85, 0.96)):
            rings.append((z0 + r0 * (1 - f) * 0.9, r0 * f, r0 * f * 1.02, x, y0))
    for z, r in pts:
        rings.append((z, r, r * 1.03, x, y0))
    if round_bot:
        for k, f in ((0.85, 0.96), (0.65, 0.85), (0.35, 0.55)):
            rings.append((z1 - r1 * (1 - f) * 0.9, r1 * f, r1 * f * 1.02, x, y0))
    rings.sort(key=lambda r: r[0])
    return loft(name, rings, material, seg=seg, parent=parent)


def build_person():
    root = empty('Person')
    j = {}

    def joint(name, parent, wpos):
        p = world_pos(parent) if parent is not None else Vector((0, 0, 0))
        ob = empty('J_' + name, tuple(Vector(wpos) - p), parent if parent is not None else root)
        j[name] = ob
        return ob

    joint('Hips', root, J['Hips'])
    joint('Spine', j['Hips'], J['Spine'])
    joint('Chest', j['Spine'], J['Chest'])
    joint('Neck', j['Chest'], J['Neck'])
    joint('Head', j['Neck'], J['Head'])
    hz = J['Head'][2]

    # ------------------------------------------------------------ torso
    loft('M_Pelvis', [(0.80, 0.135, 0.095, 0, 0.005), (0.86, 0.160, 0.106), (0.93, 0.166, 0.108),
                      (1.00, 0.160, 0.103), (1.04, 0.152, 0.098)], 'Pants', seg=14,
         parent=j['Hips'], power=2.3)
    box('M_Belt', (0.325, 0.215, 0.035), (0, 0, 1.005), 'Belt', parent=j['Hips'], bevel=0.012)
    box('M_Buckle', (0.045, 0.012, 0.03), (0, -0.108, 1.005), 'Metal', parent=j['Hips'], bevel=0.004)
    loft('M_Abdomen', [(0.98, 0.160, 0.104), (1.06, 0.153, 0.100, 0, -0.004), (1.15, 0.157, 0.104, 0, -0.006),
                       (1.25, 0.170, 0.112, 0, -0.006)], 'Top', seg=14, parent=j['Spine'],
         power=2.3, caps=(True, False))
    loft('M_Chest', [(1.20, 0.166, 0.110, 0, -0.006), (1.29, 0.178, 0.117, 0, -0.010),
                     (1.36, 0.186, 0.113, 0, -0.007), (1.41, 0.190, 0.104, 0, -0.002),
                     (1.443, 0.176, 0.094, 0, 0.002), (1.468, 0.138, 0.082, 0, 0.004),
                     (1.49, 0.094, 0.07, 0, 0.005), (1.505, 0.062, 0.058, 0, 0.006)],
         'Top', seg=16, parent=j['Chest'], power=2.6)
    # neck
    loft('M_Neck', [(1.44, 0.047, 0.050, 0, 0.008), (1.52, 0.044, 0.047, 0, 0.004),
                    (1.60, 0.045, 0.048, 0, 0.004)], 'Skin', seg=14, parent=j['Neck'])

    # tee collar / jacket parts / hoodie
    torus('M_Collar__acc_tee', 0.058, 0.009, (0, 0.004, 1.49), 'Top', seg=22, tseg=6,
          parent=j['Chest'], scale=(1.0, 0.92))
    # jacket: lapels, shirt, tie, buttons, hem
    for side in (-1, 1):
        pts = [(side * 0.04, -0.075, 1.48), (side * 0.045, -0.108, 1.40),
               (side * 0.03, -0.12, 1.32), (side * 0.008, -0.122, 1.27)]
        sweep('M_Lapel%s__acc_jacket' % ('L' if side > 0 else 'R'), pts, [(0.004, 0.016), (0.004, 0.02), (0.004, 0.016), (0.003, 0.008)],
              'Lapel', seg=6, parent=j['Chest'], power=2.0)
    loft('M_ShirtV__acc_jacket', [(1.29, 0.008, 0.006, 0, -0.117), (1.38, 0.026, 0.01, 0, -0.113),
                                  (1.47, 0.042, 0.03, 0, -0.078)], 'Shirt', seg=10,
         parent=j['Chest'], subsurf=1)
    torus('M_ShirtCollar__acc_jacket', 0.055, 0.008, (0, 0.0, 1.49), 'Shirt', seg=20, tseg=6,
          parent=j['Chest'], scale=(1.0, 0.95))
    tie = [(0, -0.096, 1.475), (0.004, -0.112, 1.42), (0.01, -0.124, 1.33), (0.006, -0.126, 1.24),
           (0.004, -0.124, 1.19)]
    sweep('M_Tie__acc_tie', tie, [(0.006, 0.011), (0.004, 0.014), (0.004, 0.018), (0.004, 0.021),
                                  (0.003, 0.004)], 'Tie', seg=6, parent=j['Chest'])
    sphere('M_TieKnot__acc_tie', 0.012, (0, -0.1, 1.47), 'Tie', scale=(1.2, 0.8, 1.0), seg=10, rings=6,
           parent=j['Chest'])
    for i, z in enumerate((1.13, 1.04)):
        sphere('M_Button%d__acc_jacket' % i, 0.007, (0.0, -0.110 if i == 0 else -0.106, z), 'Button',
               scale=(1, 0.5, 1), seg=8, rings=4, parent=j['Spine'])
    loft('M_JacketHem__acc_jacket', [(0.86, 0.172, 0.118, 0, -0.004), (0.94, 0.172, 0.116),
                                     (1.02, 0.166, 0.110)], 'Top', seg=18, parent=j['Hips'],
         caps=(False, False), power=2.3)
    sphere('M_Belly__acc_belly', 0.12, (0, -0.042, 1.09), 'Top', scale=(1.15, 0.5, 0.9), seg=16,
           rings=10, parent=j['Spine'])
    # hoodie hood + strings + pocket
    torus('M_Hood__acc_hoodie', 0.075, 0.03, (0, 0.03, 1.475), 'Top', seg=20, tseg=8,
          parent=j['Chest'], scale=(1.08, 1.0))
    for side in (-1, 1):
        pts = [(side * 0.03, -0.08, 1.47), (side * 0.032, -0.118, 1.40), (side * 0.034, -0.122, 1.33)]
        sweep('M_String%s__acc_hoodie' % side, pts, 0.0035, 'Shirt', seg=5, parent=j['Chest'])
    box('M_Pocket__acc_hoodie', (0.2, 0.02, 0.1), (0, -0.103, 1.06), 'TopDark', parent=j['Spine'],
        bevel=0.008)
    # apron (player / barber)
    loft('M_Apron__acc_apron', [(0.70, 0.17, 0.02, 0, -0.118), (0.95, 0.17, 0.02, 0, -0.118),
                                (1.15, 0.15, 0.02, 0, -0.118), (1.36, 0.10, 0.02, 0, -0.128)],
         'Apron', seg=8, parent=j['Spine'], subsurf=0, power=6)

    # ------------------------------------------------------------ head
    H = j['Head']
    cx, cy, cz = HEAD_C
    rx, ry, rz = HEAD_R
    rings = [(-0.03, 0.046, 0.048, 0, 0.012),
             (-0.004, 0.046, 0.052, 0, -0.010),
             (0.014, 0.056, 0.064, 0, -0.024),
             (0.034, 0.070, 0.080, 0, -0.016),
             (0.060, 0.081, 0.092, 0, -0.008),
             (0.090, 0.087, 0.100, 0, -0.002)]
    for deg in (6, 20, 34, 48, 61, 72, 81, 87):
        a = math.radians(deg)
        rings.append((cz + rz * math.sin(a), rx * math.cos(a), ry * math.cos(a), cx, cy))
    rings = [(hz + r[0], r[1], r[2], r[3], r[4]) for r in rings]
    loft('M_Head', rings, 'Skin', seg=18, parent=H, power=2.0, subsurf=1)
    # nose
    nose = [(hz + 0.122, 0.011, 0.012, 0, -0.090), (hz + 0.104, 0.013, 0.018, 0, -0.103),
            (hz + 0.086, 0.018, 0.022, 0, -0.110), (hz + 0.073, 0.021, 0.019, 0, -0.108),
            (hz + 0.064, 0.017, 0.010, 0, -0.100), (hz + 0.060, 0.008, 0.004, 0, -0.095)]
    loft('M_Nose', nose, 'Skin', seg=12, parent=H, subsurf=1)
    # ears
    for side in (-1, 1):
        sphere('M_Ear%s' % side, 0.03, (side * 0.081, 0.012, hz + 0.098), 'Skin',
               scale=(0.36, 0.62, 1.0), seg=12, rings=8, parent=H, subsurf=1)
    # eyes, lids, brows
    for side, nm in ((1, 'L'), (-1, 'R')):
        ex, ey, ez = side * 0.034, -0.080, hz + 0.112
        eye = empty('J_Eye' + nm, tuple(Vector((ex, ey, ez)) - world_pos(H)), H)
        sphere('M_EyeWhite' + nm, 0.0128, (ex, ey, ez), 'EyeWhite', seg=14, rings=8, parent=eye)
        sphere('M_Iris' + nm, 0.0068, (ex, ey - 0.0105, ez), 'Iris', scale=(1, 0.38, 1), seg=12,
               rings=6, parent=eye)
        sphere('M_Pupil' + nm, 0.0034, (ex, ey - 0.0128, ez), 'Pupil', scale=(1, 0.3, 1), seg=10,
               rings=4, parent=eye)
        lid = empty('J_Lid' + nm, tuple(Vector((ex, ey, ez)) - world_pos(H)), H)
        # upper lid: a dome over the eye; rotating it about X closes the eye
        sphere('M_Lid' + nm, 0.0141, (ex, ey, ez), 'Skin', seg=14, rings=6, parent=lid,
               zcut=(0.0, 1.0), xform=None)
        sphere('M_LowLid' + nm, 0.0139, (ex, ey, ez), 'Skin', seg=14, rings=4, parent=H,
               zcut=(-1.0, -0.55))
        brow = empty('J_Brow' + nm, (ex - world_pos(H).x, -0.094, ez + 0.026 - hz), H)
        bp = [(ex - side * 0.017, -0.092, ez + 0.022), (ex - side * 0.004, -0.097, ez + 0.028),
              (ex + side * 0.010, -0.095, ez + 0.029), (ex + side * 0.021, -0.088, ez + 0.024)]
        sweep('M_Brow' + nm, bp, [(0.0045, 0.0035), (0.005, 0.0045), (0.0045, 0.004), (0.003, 0.0025)],
              'Hair', seg=6, parent=brow)
    # mouth with shape keys (built separately so modifiers never touch it)
    build_mouth(H, hz)
    # moustache
    for side in (-1, 1):
        pts = [(0.0, -0.104, hz + 0.062), (side * 0.016, -0.106, hz + 0.058),
               (side * 0.030, -0.099, hz + 0.048), (side * 0.040, -0.088, hz + 0.036)]
        sweep('M_Moustache%d__acc_moustache' % side, pts,
              [(0.008, 0.007), (0.010, 0.009), (0.008, 0.007), (0.003, 0.003)],
              'Hair', seg=8, parent=H)
    # glasses
    for side in (-1, 1):
        torus('M_GlassRim%d__acc_glasses' % side, 0.018, 0.0018, (side * 0.032, -0.099, hz + 0.112),
              'Frame', seg=20, tseg=5, axis='Y', parent=H, scale=(1.15, 0.9))
        sweep('M_GlassArm%d__acc_glasses' % side,
              [(side * 0.053, -0.097, hz + 0.115), (side * 0.083, -0.06, hz + 0.115),
               (side * 0.086, 0.01, hz + 0.105)], 0.0016, 'Frame', seg=4, parent=H)
    sweep('M_GlassBridge__acc_glasses', [(-0.012, -0.101, hz + 0.115), (0, -0.104, hz + 0.119),
                                         (0.012, -0.101, hz + 0.115)], 0.0016, 'Frame', seg=4, parent=H)

    # ------------------------------------------------------------ arms
    for side, nm in ((1, 'L'), (-1, 'R')):
        sh = joint('Shoulder' + nm, j['Chest'], (side * 0.05, 0.0, 1.44))
        ua = joint('UpperArm' + nm, sh, (side * 0.19, 0.005, 1.425))
        fa = joint('ForeArm' + nm, ua, (side * 0.196, 0.012, 1.15))
        hd = joint('Hand' + nm, fa, (side * 0.196, 0.0, 0.905))
        x = side * 0.19
        limb('M_UpperArm' + nm, x, 0.006, [(1.428, 0.055), (1.40, 0.055), (1.30, 0.051),
                                           (1.20, 0.046), (1.145, 0.043)], 'Top', ua)
        x2 = side * 0.196
        limb('M_ForeArm' + nm, x2, 0.010, [(1.17, 0.043), (1.10, 0.043), (1.00, 0.038),
                                           (0.93, 0.032), (0.905, 0.031)], 'Sleeve', fa,
             round_bot=False)
        loft('M_Wrist' + nm, [(0.935, 0.024, 0.027, x2, 0.0), (0.90, 0.023, 0.028, x2, 0.0),
                              (0.88, 0.021, 0.031, x2, 0.0)], 'Skin', seg=12, parent=hd,
             caps=(False, False))
        # palm faces the body (-side * X); slightly oversized hands read better on screen
        loft('M_Palm' + nm, [(0.905, 0.017, 0.032, x2, -0.002), (0.88, 0.019, 0.044, x2, -0.003),
                             (0.85, 0.018, 0.049, x2, -0.002), (0.822, 0.016, 0.047, x2, -0.001),
                             (0.808, 0.011, 0.040, x2, 0.0)], 'Skin', seg=12, parent=hd,
             power=2.8)
        fingers = [('Index', -0.032, 0.049, 0.036, 0.0098), ('Middle', -0.011, 0.054, 0.039, 0.0101),
                   ('Ring', 0.010, 0.051, 0.036, 0.0095), ('Pinky', 0.029, 0.040, 0.029, 0.0085)]
        for fname, fy, l1, l2, fr in fingers:
            z0 = 0.814 + abs(fy) * 0.12
            fx = x2 - side * 0.002
            f1 = joint(fname + nm + '1', hd, (fx, fy, z0))
            f2 = joint(fname + nm + '2', f1, (fx, fy, z0 - l1))
            limb('M_' + fname + nm + '1', fx, fy, [(z0, fr), (z0 - l1, fr * 0.95)], 'Skin', f1, seg=6)
            limb('M_' + fname + nm + '2', fx, fy, [(z0 - l1, fr * 0.92), (z0 - l1 - l2 + fr * 0.6, fr * 0.78)],
                 'Skin', f2, seg=6)
        # thumb: sits on the front edge, angled toward the palm side
        t0 = (x2 - side * 0.013, -0.033, 0.877)
        t1 = joint('Thumb' + nm + '1', hd, t0)
        tdir = Vector((-side * 0.35, -0.55, -0.76)).normalized()
        pA = Vector(t0)
        pB = pA + tdir * 0.046
        t2 = joint('Thumb' + nm + '2', t1, tuple(pB))
        pC = pB + Vector((-side * 0.25, -0.35, -0.9)).normalized() * 0.034
        sweep('M_Thumb' + nm + '1', [tuple(pA - tdir * 0.008), tuple(pA), tuple(pB + tdir * 0.004)],
              [0.0108, 0.0118, 0.0106], 'Skin', seg=8, parent=t1)
        sweep('M_Thumb' + nm + '2', [tuple(pB - tdir * 0.004), tuple((pB + pC) / 2), tuple(pC)],
              [0.0102, 0.0096, 0.0068], 'Skin', seg=8, parent=t2)

    # ------------------------------------------------------------ legs
    for side, nm in ((1, 'L'), (-1, 'R')):
        th = joint('Thigh' + nm, j['Hips'], (side * 0.094, 0.0, 0.92))
        sn = joint('Shin' + nm, th, (side * 0.094, -0.008, 0.50))
        ft = joint('Foot' + nm, sn, (side * 0.094, 0.0, 0.085))
        x = side * 0.094
        limb('M_Thigh' + nm, x, -0.002, [(0.97, 0.084), (0.90, 0.088), (0.78, 0.083), (0.66, 0.072),
                                          (0.54, 0.062), (0.49, 0.060)], 'Pants', th, round_top=False)
        limb('M_Shin' + nm, x, -0.004, [(0.53, 0.060), (0.45, 0.061), (0.34, 0.058), (0.22, 0.052),
                                         (0.12, 0.053), (0.085, 0.056)], 'Pants', sn, round_bot=False)
        # shoe: built along the loft axis, rotated so the toe points -Y
        shoe = [(-0.075, 0.020, 0.025, 0, 0.055), (-0.068, 0.042, 0.050, 0, 0.060),
                (-0.040, 0.054, 0.062, 0, 0.064), (0.010, 0.056, 0.066, 0, 0.062),
                (0.070, 0.058, 0.052, 0, 0.050), (0.130, 0.055, 0.040, 0, 0.040),
                (0.180, 0.048, 0.032, 0, 0.034), (0.205, 0.032, 0.022, 0, 0.030),
                (0.214, 0.012, 0.010, 0, 0.028)]
        xf = Matrix.Translation(Vector((x, 0.0, 0.0))) @ Matrix.Rotation(math.pi / 2, 4, 'X')
        loft('M_Shoe' + nm, shoe, 'Shoes', seg=12, parent=ft, xform=xf, power=2.4,
             caps=(False, False))
        box('M_Sole' + nm, (0.114, 0.29, 0.024), (x, -0.07, 0.012), 'Sole', parent=ft, bevel=0.01,
            taper=(1.0, 1.0))
    return root


def build_mouth(H, hz):
    """Grid mouth over the face front with shape keys for expressions."""
    cols, rows = 11, 4
    w = 0.046
    zc = hz + 0.046

    def face_y(x, z):
        # follow the jaw curvature roughly
        return -0.0985 + (x / 0.05) ** 2 * 0.024 + (z - zc) * 0.12

    def build(upper, lower, width=1.0, cornerz=0.0, opn=0.0):
        vs = []
        for r in range(rows):
            t = r / (rows - 1)
            for c in range(cols):
                s = -1 + 2 * c / (cols - 1)
                x = s * w / 2 * width
                edge = 1 - s * s
                up = upper * edge + cornerz * (s * s) + opn * 0.35 * edge
                lo = -lower * edge + cornerz * (s * s) - opn * edge
                z = zc + up * (1 - t) + lo * t
                vs.append((x, face_y(x, z) - 0.0012 * edge, z))
        return vs

    base = build(0.0016, 0.0016)
    faces = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            a = r * cols + c
            faces.append((a, a + cols, a + 1 + cols, a + 1))
    ob = mesh('M_Mouth__morph', base, faces, 'Mouth', parent=H, smooth=True)
    # vertex colors: teeth strip in the upper row
    me = ob.data
    ob.shape_key_add(name='Basis')
    keys = {
        'Smile': build(0.0024, 0.0045, 1.12, 0.0075, 0.0),
        'Frown': build(0.0016, 0.0012, 0.92, -0.0065, 0.0),
        'Open': build(0.0030, 0.0040, 0.96, 0.0, 0.012),
        'Wide': build(0.0030, 0.0060, 1.22, 0.0035, 0.004),
        'O': build(0.0040, 0.0040, 0.55, 0.0, 0.009),
        'Smirk': [(v[0], v[1], v[2] + (0.006 * max(0, v[0]) / (w / 2))) for v in base],
    }
    o = world_pos(H)
    for name, vs in keys.items():
        k = ob.shape_key_add(name=name)
        for i, v in enumerate(vs):
            k.data[i].co = (v[0] - o.x, v[1] - o.y, v[2] - o.z)
    # teeth: thin band mesh behind the mouth, only visible when open
    tv, tf = [], []
    for c in range(cols):
        s = -1 + 2 * c / (cols - 1)
        x = s * w / 2 * 0.8
        for z in (zc - 0.0005, zc + 0.0055):
            tv.append((x, face_y(x, z) + 0.0045, z))
    for c in range(cols - 1):
        a = c * 2
        tf.append((a, a + 1, a + 3, a + 2))
    mesh('M_Teeth', tv, tf, 'Teeth', parent=H, smooth=True)
    # mouth cavity backing so the open mouth reads dark
    sphere('M_MouthCavity', 0.022, (0, -0.084, zc - 0.004), 'MouthDark', scale=(1.0, 0.45, 0.6),
           seg=12, rings=6, parent=H)
    return ob


def build_fp_arms():
    """Nothing extra: first person arms reuse the forearm/hand subtree of Person."""
    return None
