"""Shop props for Barber Empire. Each prop is a root empty `P_<Name>` at the origin.
Blender: Z up, the side a person uses faces -Y. Units are metres.
Child names that the game looks up: pivot, glass, bulb, hinge, bell, bladeA, bladeB,
stripes, poster, rotor, hourHand, minuteHand, signface, screen, drawer.
"""
import math
from mathutils import Vector, Matrix
from geo import (empty, mesh, loft, lathe, box, cyl, sphere, torus, sweep, bezier_pts, panel,
                 world_pos)

R = math.radians


def rot(axis, deg, pivot=(0, 0, 0)):
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(R(deg), 4, axis) @ Matrix.Translation(-p)


def multibox(name, boxes, material, parent=None, bevel=0.0):
    """Many boxes in one mesh: boxes = [((sx,sy,sz),(cx,cy,cz))]."""
    verts, faces = [], []
    for (s, c) in boxes:
        sx, sy, sz = s[0] / 2, s[1] / 2, s[2] / 2
        b = len(verts)
        for z in (-sz, sz):
            for (x, y) in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)):
                verts.append((c[0] + x, c[1] + y, c[2] + z))
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            faces.append(tuple(b + i for i in f))
    return mesh(name, verts, faces, material, parent, smooth=False,
                bevel=(bevel, 1) if bevel else None)


def P(name):
    return empty('P_' + name)


# ------------------------------------------------------------------ chairs

def barber_chair(name, classic=False):
    root = P(name)
    metal = 'Chrome' if classic else 'ChromeWorn'
    leather = 'Leather' if classic else 'LeatherOld'
    base_mat = 'Enamel' if classic else 'ChromeWorn'
    lathe(name + '_base', [(0.0, 0.0), (0.29, 0.0), (0.30, 0.012), (0.285, 0.03), (0.20, 0.045),
                           (0.09, 0.06), (0.0, 0.065)], base_mat, seg=32, parent=root)
    if classic:
        torus(name + '_basering', 0.29, 0.008, (0, 0, 0.018), 'Chrome', seg=32, tseg=6, parent=root)
    cyl(name + '_column', 0.052, 0.24, (0, 0, 0.17), metal, seg=18, parent=root)
    cyl(name + '_boot', 0.066, 0.12, (0, 0, 0.12), 'Rubber' if not classic else 'Chrome', seg=18,
        parent=root, bevel=0.01)
    # pump pedal
    sweep(name + '_pedalarm', [(0.05, -0.02, 0.1), (0.15, -0.1, 0.08), (0.22, -0.16, 0.06)], 0.012,
          metal, seg=8, parent=root)
    box(name + '_pedal', (0.09, 0.07, 0.02), (0.24, -0.18, 0.06), 'Rubber', parent=root, bevel=0.006)
    pv = empty('pivot', (0, 0, 0.36), root)
    PIVOT_DROP = 0.08
    # seat
    box(name + '_seatframe', (0.50, 0.50, 0.06), (0, 0, 0.42), metal if classic else 'MetalPainted',
        parent=pv, bevel=0.015)
    box(name + '_seat', (0.54, 0.52, 0.12), (0, -0.01, 0.51), leather, parent=pv, bevel=(0.045), seg=4)
    # backrest (tilted back)
    tilt = rot('X', -12, (0, 0.24, 0.56))
    # backrest + headrest live under their own node so the game can fade them out of the way
    br = empty('backrest', (0, 0.24, 0.56 - 0.36), pv)
    box(name + '_back', (0.50, 0.12, 0.58), (0, 0.27, 0.86), leather, parent=br, bevel=0.045, seg=4,
        xform=tilt)
    box(name + '_backshell', (0.47, 0.04, 0.54), (0, 0.345, 0.85), metal if classic else 'MetalPainted',
        parent=br, bevel=0.015, xform=tilt)
    # headrest on a rod
    sweep(name + '_hrod', [(0, 0.37, 1.10), (0, 0.39, 1.20), (0, 0.38, 1.26)], 0.011, metal, seg=8,
          parent=br)
    box(name + '_head', (0.28, 0.09, 0.13), (0, 0.35, 1.28), leather, parent=br, bevel=0.035, seg=3)
    # armrests
    for s in (-1, 1):
        sweep(name + '_armbar%d' % s, [(s * 0.25, 0.18, 0.47), (s * 0.30, 0.17, 0.58),
                                       (s * 0.31, 0.10, 0.66), (s * 0.31, -0.18, 0.66),
                                       (s * 0.30, -0.24, 0.55), (s * 0.26, -0.24, 0.47)],
              0.014, metal, seg=8, parent=pv)
        box(name + '_armpad%d' % s, (0.095, 0.44, 0.06), (s * 0.31, -0.03, 0.70), leather, parent=pv,
            bevel=0.025, seg=3)
    # footrest
    for s in (-1, 1):
        sweep(name + '_footbar%d' % s, [(s * 0.17, -0.22, 0.46), (s * 0.18, -0.36, 0.30),
                                        (s * 0.18, -0.42, 0.15)], 0.012, metal, seg=8, parent=pv)
    box(name + '_footplate', (0.44, 0.15, 0.02), (0, -0.45, 0.15), metal, parent=pv, bevel=0.006)
    multibox(name + '_footgrip', [((0.40, 0.012, 0.006), (0, -0.50 + i * 0.025, 0.163)) for i in range(5)],
             'Rubber', parent=pv)
    if classic:
        # tufted buttons on the backrest
        for i in range(3):
            for k in range(3):
                x = -0.14 + k * 0.14
                z = 0.70 + i * 0.15
                p = tilt @ Vector((x, 0.208, z))
                sphere(name + '_tuft%d%d' % (i, k), 0.011, tuple(p), leather, scale=(1, 0.5, 1), seg=8,
                       rings=4, parent=br)
        # piping
        for s in (-1, 1):
            sweep(name + '_pipe%d' % s, [tuple(tilt @ Vector((s * 0.25, 0.21, 0.58))),
                                        tuple(tilt @ Vector((s * 0.25, 0.21, 1.15)))], 0.006,
                  'LeatherBlack', seg=6, parent=br)
    else:
        # duct tape over the torn seat + exposed foam on the arm
        box(name + '_tape1', (0.16, 0.055, 0.004), (0.06, -0.06, 0.571), 'Tape', parent=pv, bevel=0,
            xform=rot('Z', 28, (0.06, -0.06, 0.571)))
        box(name + '_tape2', (0.14, 0.05, 0.004), (0.08, -0.05, 0.573), 'Tape', parent=pv, bevel=0,
            xform=rot('Z', -35, (0.08, -0.05, 0.573)))
        box(name + '_foam', (0.05, 0.08, 0.012), (0.31, -0.12, 0.731), 'Foam', parent=pv, bevel=0.004)
        box(name + '_tape3', (0.11, 0.06, 0.004), (-0.10, 0.25, 1.02), 'Tape', parent=br, bevel=0,
            xform=tilt @ rot('Y', 15, (-0.10, 0.25, 1.02)))
    # lower the whole seat assembly: children are relative to the pivot
    pv.location.z -= PIVOT_DROP
    return root


def wait_chair_old():
    root = P('WaitChairOld')
    # moulded plastic shell
    seat = [(0.0, 0.21, 0.20, 0, 0.0, 3), (0.025, 0.22, 0.21, 0, 0.0, 3), (0.035, 0.21, 0.20, 0, 0.0, 3)]
    loft('wc_seat', seat, 'PlasticOrange', seg=20, parent=root, power=3,
         xform=Matrix.Translation((0, 0, 0.43)), subsurf=1)
    tilt = rot('X', -10, (0, 0.2, 0.45))
    box('wc_back', (0.40, 0.03, 0.34), (0, 0.22, 0.68), 'PlasticOrange', parent=root, bevel=0.012,
        xform=tilt)
    for s in (-1, 1):
        sweep('wc_leg%d' % s, [(s * 0.18, -0.2, 0.0), (s * 0.18, -0.18, 0.42), (s * 0.18, 0.15, 0.43),
                               (s * 0.19, 0.24, 0.56), (s * 0.19, 0.26, 0.7)], 0.011, 'ChromeWorn',
              seg=8, parent=root)
        sweep('wc_legb%d' % s, [(s * 0.18, 0.2, 0.0), (s * 0.18, 0.17, 0.42)], 0.011, 'ChromeWorn', seg=8,
              parent=root)
        sweep('wc_foot%d' % s, [(s * 0.18, -0.21, 0.01), (s * 0.18, 0.21, 0.01)], 0.012, 'ChromeWorn', seg=8,
              parent=root)
    return root


def couch():
    root = P('Couch')
    box('co_base', (1.5, 0.75, 0.28), (0, 0, 0.27), 'LeatherBrown', parent=root, bevel=0.05, seg=3)
    for i, x in enumerate((-0.33, 0.33)):
        box('co_cush%d' % i, (0.64, 0.6, 0.14), (x, -0.05, 0.47), 'LeatherBrown', parent=root, bevel=0.05,
            seg=4)
    box('co_back', (1.5, 0.2, 0.42), (0, 0.29, 0.6), 'LeatherBrown', parent=root, bevel=0.07, seg=4,
        xform=rot('X', -6, (0, 0.29, 0.4)))
    for s in (-1, 1):
        cyl('co_arm%d' % s, 0.11, 0.72, (s * 0.72, 0.0, 0.52), 'LeatherBrown', seg=18, axis='Y',
            parent=root, bevel=0.03)
        box('co_armside%d' % s, (0.2, 0.72, 0.3), (s * 0.72, 0.0, 0.36), 'LeatherBrown', parent=root,
            bevel=0.04, seg=3)
        for y in (-0.3, 0.3):
            lathe('co_foot%d%d' % (s, int(y * 10)), [(0.02, 0.0), (0.03, 0.06), (0.035, 0.13)], 'WoodDark',
                  seg=10, center=(s * 0.68, y, 0.0), parent=root)
    for i in range(5):
        sphere('co_tuft%d' % i, 0.012, (-0.6 + i * 0.3, 0.17, 0.66), 'LeatherBrown', seg=8, rings=4,
               parent=root)
    return root


# ------------------------------------------------------------------ mirrors / station

def mirror(name, w, h, frame_mat, frame_w=0.05, inner=None, bulbs=False):
    root = P(name)
    d = 0.035
    multibox(name + '_frame', [((w + 2 * frame_w, d, frame_w), (0, 0, h / 2 + frame_w / 2)),
                               ((w + 2 * frame_w, d, frame_w), (0, 0, -h / 2 - frame_w / 2)),
                               ((frame_w, d, h), (-w / 2 - frame_w / 2, 0, 0)),
                               ((frame_w, d, h), (w / 2 + frame_w / 2, 0, 0))], frame_mat, parent=root,
             bevel=0.008)
    if inner:
        multibox(name + '_inner', [((w + 0.02, d + 0.006, 0.012), (0, -0.002, h / 2 + 0.004)),
                                   ((w + 0.02, d + 0.006, 0.012), (0, -0.002, -h / 2 - 0.004)),
                                   ((0.012, d + 0.006, h), (-w / 2 - 0.004, -0.002, 0)),
                                   ((0.012, d + 0.006, h), (w / 2 + 0.004, -0.002, 0))], inner, parent=root)
    box(name + '_backing', (w + 0.01, 0.01, h + 0.01), (0, 0.012, 0), 'MetalDark', parent=root, bevel=0)
    panel('glass', w, h, (0, -0.004, 0), 'MirrorGlass', '-Y', parent=root)
    if bulbs:
        n = 6
        for i in range(n):
            z = -h / 2 + 0.08 + i * (h - 0.16) / (n - 1)
            for s in (-1, 1):
                sphere('bulb_%d_%d' % (i, s), 0.022, (s * (w / 2 + frame_w / 2), -0.03, z), 'Bulb', seg=10,
                       rings=6, parent=root)
                cyl('bsock_%d_%d' % (i, s), 0.014, 0.02, (s * (w / 2 + frame_w / 2), -0.012, z), 'Chrome',
                    axis='Y', seg=10, parent=root, bevel=0)
    return root


def station(name, classic=False):
    root = P(name)
    body = 'WoodDark' if classic else 'Laminate'
    top = 'Stone' if classic else 'WoodOld'
    handle = 'Brass' if classic else 'ChromeWorn'
    box(name + '_body', (1.10, 0.44, 0.80), (0, 0, 0.42), body, parent=root, bevel=0.01)
    box(name + '_kick', (1.06, 0.40, 0.05), (0, 0.01, 0.025), 'MetalDark', parent=root, bevel=0.0)
    box(name + '_top', (1.16, 0.50, 0.04), (0, -0.01, 0.84), top, parent=root, bevel=0.012)
    # drawers
    for i, x in enumerate((-0.28, 0.28)):
        dz = 0.69
        crooked = (not classic) and i == 1
        dr = empty('drawer' if crooked else 'drw%d' % i, (x, -0.225, dz), root)
        xf = rot('Z', 4, (0, 0, 0)) if crooked else None
        box(name + '_drw%d' % i, (0.48, 0.02, 0.16), (x, -0.235 - (0.04 if crooked else 0), dz), body,
            parent=dr, bevel=0.006, xform=(Matrix.Translation((x, -0.235, dz)) @ Matrix.Rotation(R(3), 4, 'Z') @
                                           Matrix.Translation((-x, 0.235, -dz))) if crooked else None)
        sweep(name + '_hdl%d' % i, [(x - 0.06, -0.247 - (0.04 if crooked else 0), dz),
                                    (x - 0.05, -0.262 - (0.04 if crooked else 0), dz),
                                    (x + 0.05, -0.262 - (0.04 if crooked else 0), dz),
                                    (x + 0.06, -0.247 - (0.04 if crooked else 0), dz)], 0.006, handle,
              seg=6, parent=dr)
    # doors
    for i, x in enumerate((-0.28, 0.28)):
        box(name + '_door%d' % i, (0.5, 0.02, 0.5), (x, -0.23, 0.34), body, parent=root, bevel=0.008)
        if classic:
            box(name + '_doorpanel%d' % i, (0.38, 0.012, 0.38), (x, -0.242, 0.34), body, parent=root, bevel=0.01)
        cyl(name + '_knob%d' % i, 0.012, 0.025, (x + (0.18 if i == 0 else -0.18), -0.25, 0.48), handle, axis='Y',
            seg=10, parent=root)
    # barbicide jar with combs (signature barbershop detail)
    jx, jy = 0.38, -0.05
    lathe(name + '_jar', [(0.045, 0.0), (0.05, 0.01), (0.05, 0.18), (0.044, 0.19)], 'Glass', seg=20,
          center=(jx, jy, 0.86), parent=root, caps=(True, False))
    lathe(name + '_jarliquid', [(0.044, 0.0), (0.046, 0.01), (0.046, 0.13)], 'Liquid', seg=20,
          center=(jx, jy, 0.865), parent=root)
    lathe(name + '_jarlid', [(0.05, 0.0), (0.052, 0.006), (0.05, 0.02), (0.0, 0.024)], 'Chrome', seg=20,
          center=(jx, jy, 1.05), parent=root)
    for k in range(3):
        box(name + '_jcomb%d' % k, (0.012, 0.004, 0.17), (jx - 0.015 + k * 0.015, jy + (k - 1) * 0.008, 0.95),
            'Comb', parent=root, bevel=0, xform=rot('Y', -8 + k * 8, (jx, jy, 0.9)))
    # bottles
    if classic:
        for k, (bx, mat_, h) in enumerate([(-0.42, 'BottleAmber', 0.17), (-0.34, 'Bottle', 0.2),
                                            (-0.26, 'BottleAmber', 0.15)]):
            lathe(name + '_b%d' % k, [(0.028, 0.0), (0.03, 0.01), (0.03, h * 0.7), (0.012, h * 0.85),
                                      (0.012, h)], mat_, seg=14, center=(bx, 0.08, 0.86), parent=root)
            cyl(name + '_bc%d' % k, 0.013, 0.02, (bx, 0.08, 0.86 + h + 0.01), 'PlasticBlack', seg=10,
                parent=root)
    else:
        # one dusty bottle and a folded towel
        lathe(name + '_b0', [(0.028, 0.0), (0.03, 0.01), (0.03, 0.12), (0.012, 0.15), (0.012, 0.17)],
              'Plastic', seg=14, center=(-0.40, 0.08, 0.86), parent=root)
        box(name + '_towel', (0.22, 0.16, 0.05), (-0.15, 0.06, 0.885), 'Fabric', parent=root, bevel=0.02,
            seg=2)
    return root


def cart():
    root = P('Cart')
    for z in (0.18, 0.62):
        box('ct_tray%d' % int(z * 100), (0.44, 0.34, 0.02), (0, 0, z), 'MetalPainted', parent=root,
            bevel=0.004)
        multibox('ct_lip%d' % int(z * 100), [((0.44, 0.01, 0.04), (0, -0.17, z + 0.02)),
                                            ((0.44, 0.01, 0.04), (0, 0.17, z + 0.02)),
                                            ((0.01, 0.34, 0.04), (-0.22, 0, z + 0.02)),
                                            ((0.01, 0.34, 0.04), (0.22, 0, z + 0.02))], 'MetalPainted',
                 parent=root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('ct_leg%d%d' % (sx, sy), 0.01, 0.62, (sx * 0.2, sy * 0.15, 0.36), 'ChromeWorn', seg=8,
                parent=root, bevel=0)
            sphere('ct_wheel%d%d' % (sx, sy), 0.025, (sx * 0.2, sy * 0.15, 0.025), 'Rubber', seg=10, rings=6,
                   parent=root)
    return root


# ------------------------------------------------------------------ tools (tip toward -Y)

def clipper(name, pro=False):
    root = P(name)
    body_m = 'PlasticBlack' if pro else 'Plastic'
    blade_m = 'Gold' if pro else 'Steel'
    rings = [(0.0, 0.016, 0.013), (0.012, 0.022, 0.017), (0.05, 0.025, 0.019), (0.10, 0.026, 0.019),
             (0.135, 0.025, 0.017), (0.15, 0.023, 0.012)]
    xf = Matrix.Translation((0, 0.08, 0)) @ Matrix.Rotation(R(90), 4, 'X')
    loft(name + '_body', rings, body_m, seg=18, parent=root, xform=xf, power=2.4)
    if pro:
        for i in range(4):
            torus(name + '_grip%d' % i, 0.0262, 0.003, (0, 0.04 - i * 0.014, 0), 'Rubber', seg=20, tseg=5,
                  axis='Y', parent=root, scale=(1.0, 0.75))
        sweep(name + '_lever', [(0.026, -0.03, 0.0), (0.035, -0.05, 0.0), (0.03, -0.06, 0.0)], 0.004,
              'Gold', seg=6, parent=root)
    box(name + '_switch', (0.014, 0.022, 0.006), (0, -0.01, 0.019), 'PlasticBlack' if not pro else 'Gold',
        parent=root, bevel=0.002)
    # blade set
    box(name + '_bladebase', (0.050, 0.014, 0.028), (0, -0.074, 0.0), blade_m, parent=root, bevel=0.003)
    teeth = [((0.0022, 0.012, 0.016), (-0.022 + i * 0.0034, -0.087, 0.004)) for i in range(14)]
    multibox(name + '_teeth', teeth, blade_m, parent=root)
    teeth2 = [((0.0018, 0.008, 0.01), (-0.021 + i * 0.0034, -0.086, -0.008)) for i in range(13)]
    multibox(name + '_teeth2', teeth2, 'Steel', parent=root)
    # cord
    pts = bezier_pts((0, 0.08, 0), (0, 0.12, 0), (0.02, 0.17, -0.06), (0.03, 0.2, -0.18), 10)
    sweep(name + '_cord', pts, 0.004, 'Cord', seg=6, parent=root)
    return root


def guard():
    root = P('Guard')
    teeth = [((0.0026, 0.02, 0.003), (-0.021 + i * 0.0042, -0.09, -0.008 - abs(i - 5) * 0.0)) for i in range(11)]
    multibox('gd_teeth', teeth, 'PlasticBlack', parent=root)
    box('gd_spine', (0.05, 0.03, 0.004), (0, -0.075, -0.012), 'PlasticBlack', parent=root, bevel=0.001)
    return root


def scissors(name='Scissors'):
    root = P(name)
    cyl('sc_screw', 0.005, 0.012, (0, 0, 0), 'Brass', seg=10, parent=root, bevel=0.001)
    for s, nm in ((1, 'bladeA'), (-1, 'bladeB')):
        b = empty(nm, (0, 0, 0), root)
        z = 0.002 * s
        pts = [(s * 0.002, 0.012, z), (s * 0.004, -0.01, z), (s * 0.004, -0.05, z), (s * 0.002, -0.085, z),
               (0.0, -0.1, z)]
        sweep(nm + '_blade', pts, [(0.0025, 0.009), (0.0022, 0.009), (0.0018, 0.007), (0.0014, 0.004),
                                   (0.0006, 0.001)], 'Steel', seg=6, parent=b, power=3)
        sweep(nm + '_shank', [(s * 0.002, 0.012, z), (s * 0.012, 0.035, z), (s * 0.02, 0.05, z)], 0.003,
              'Steel', seg=6, parent=b)
        torus(nm + '_ring', 0.013, 0.0032, (s * 0.026, 0.062, z), 'Steel', seg=18, tseg=6, parent=b,
              scale=(1.0, 0.8))
        if s < 0:
            sweep(nm + '_tang', [(s * 0.035, 0.07, z), (s * 0.045, 0.085, z), (s * 0.04, 0.095, z)], 0.0025,
                  'Steel', seg=6, parent=b)
    return root


def trimmer():
    root = P('Trimmer')
    rings = [(0.0, 0.012, 0.011), (0.02, 0.016, 0.015), (0.09, 0.017, 0.016), (0.12, 0.015, 0.012),
             (0.13, 0.012, 0.008)]
    loft('tr_body', rings, 'PlasticBlack', seg=16, parent=root,
         xform=Matrix.Translation((0, 0.07, 0)) @ Matrix.Rotation(R(90), 4, 'X'))
    box('tr_head', (0.034, 0.008, 0.012), (0, -0.064, 0.0), 'Steel', parent=root, bevel=0.002)
    multibox('tr_teeth', [((0.0015, 0.006, 0.01), (-0.016 + i * 0.0023, -0.07, 0.0)) for i in range(15)],
             'Steel', parent=root)
    box('tr_btn', (0.01, 0.016, 0.005), (0, 0.0, 0.016), 'Gold', parent=root, bevel=0.002)
    return root


def comb():
    root = P('Comb')
    box('cb_spine', (0.17, 0.004, 0.02), (0, 0, 0.012), 'Comb', parent=root, bevel=0.002)
    teeth = [((0.0022, 0.0035, 0.024 if i < 12 else 0.022), (-0.08 + i * 0.0058, 0, -0.01)) for i in range(28)]
    multibox('cb_teeth', teeth, 'Comb', parent=root)
    return root


def spray():
    root = P('Spray')
    lathe('sp_body', [(0.0, 0.0), (0.03, 0.0), (0.033, 0.01), (0.033, 0.12), (0.026, 0.15), (0.014, 0.17),
                      (0.014, 0.18)], 'Bottle', seg=18, parent=root)
    lathe('sp_water', [(0.0, 0.0), (0.03, 0.004), (0.03, 0.09)], 'Liquid', seg=18, center=(0, 0, 0.006),
          parent=root)
    box('sp_head', (0.03, 0.06, 0.035), (0, -0.01, 0.2), 'PlasticBlack', parent=root, bevel=0.008)
    box('sp_trigger', (0.014, 0.012, 0.05), (0, -0.032, 0.17), 'PlasticBlack', parent=root, bevel=0.004,
        xform=rot('X', -15, (0, -0.03, 0.19)))
    cyl('sp_nozzle', 0.006, 0.015, (0, -0.045, 0.205), 'PlasticRed', axis='Y', seg=8, parent=root, bevel=0)
    return root


# ------------------------------------------------------------------ cape

def cape_draped():
    """Barber cape as worn: neck at origin, drapes down and forward over the knees."""
    root = P('Cape')
    rings = []
    n = 9
    seg = 28
    verts, faces = [], []
    for i in range(n):
        t = i / (n - 1)
        z = -t * 0.62
        rx = 0.075 + t * 0.37 + t * t * 0.1
        ry = 0.07 + t * 0.30
        fold = 0.07 * t * t
        for k in range(seg):
            a = 2 * math.pi * k / seg
            fr = 1 + fold * math.sin(a * 7 + t * 2.0) + 0.03 * t * math.sin(a * 13)
            x = math.cos(a) * rx * fr
            y = math.sin(a) * ry * fr
            # pull the front (−Y) forward over the lap
            if y < 0:
                y *= 1 + 1.2 * t * t
                z += 0
            zz = z + (0.10 * t * t if y < 0 else 0.0) - 0.04 * t * t * math.cos(a * 2)
            verts.append((x, y - 0.02 * t, zz))
    for i in range(n - 1):
        for k in range(seg):
            a = i * seg + k
            b = i * seg + (k + 1) % seg
            c = (i + 1) * seg + (k + 1) % seg
            d = (i + 1) * seg + k
            faces.append((a, d, c, b))
    mesh('cape_cloth', verts, faces, 'Cape', parent=root, subsurf=1)
    torus('cape_collar', 0.072, 0.009, (0, 0, -0.005), 'CapeStripe', seg=24, tseg=6, parent=root,
          scale=(1.0, 0.95))
    return root


def cape_folded():
    root = P('CapeFolded')
    rings = [(-0.45, 0.10, 0.03), (-0.30, 0.12, 0.035), (-0.1, 0.11, 0.04), (0.0, 0.05, 0.03)]
    loft('cf_cloth', rings, 'Cape', seg=14, parent=root, subsurf=1)
    sweep('cf_hook', [(0, 0.04, 0.02), (0, -0.01, 0.02), (0, -0.03, 0.05)], 0.006, 'Hook', seg=6, parent=root)
    box('cf_plate', (0.04, 0.01, 0.07), (0, 0.045, 0.02), 'Hook', parent=root, bevel=0.003)
    return root


# ------------------------------------------------------------------ furniture

def wall_shelf():
    root = P('Shelf')
    for z in (0.0, 0.42):
        box('sh_plank%d' % int(z * 100), (1.2, 0.24, 0.03), (0, -0.12, z), 'WoodOld', parent=root, bevel=0.006)
        for x in (-0.45, 0.45):
            sweep('sh_br%d%d' % (int(z * 100), int(x * 100)), [(x, -0.005, z - 0.015), (x, -0.005, z - 0.17),
                                                              (x, -0.16, z - 0.015)], 0.007, 'MetalDark',
                  seg=6, parent=root)
    return root


def products(name, full=False):
    root = P(name)
    items = []
    if full:
        mats = ['BottleAmber', 'Bottle', 'Ceramic', 'BottleAmber', 'LabelBlue', 'Bottle', 'Ceramic', 'BottleAmber']
        for i, m in enumerate(mats):
            x = -0.5 + i * 0.14
            if m == 'Ceramic':
                lathe(name + '_jar%d' % i, [(0.0, 0.0), (0.04, 0.0), (0.042, 0.06), (0.0, 0.065)], m, seg=16,
                      center=(x, -0.11, 0.0), parent=root)
                cyl(name + '_jl%d' % i, 0.043, 0.02, (x, -0.11, 0.07), 'LabelGold', seg=16, parent=root)
            else:
                h = 0.16 + (i % 3) * 0.03
                lathe(name + '_b%d' % i, [(0.0, 0.0), (0.03, 0.0), (0.032, 0.01), (0.032, h * 0.72),
                                          (0.013, h * 0.86), (0.012, h)],
                      m if m != 'LabelBlue' else 'Bottle', seg=14, center=(x, -0.11, 0.0), parent=root)
                cyl(name + '_lab%d' % i, 0.0325, h * 0.32, (x, -0.11, h * 0.35),
                    ['LabelCream', 'LabelRed', 'LabelBlue'][i % 3], seg=14, parent=root, bevel=0)
                cyl(name + '_cap%d' % i, 0.014, 0.02, (x, -0.11, h + 0.01), 'PlasticBlack', seg=10, parent=root)
    else:
        lathe(name + '_b0', [(0.0, 0.0), (0.03, 0.0), (0.032, 0.01), (0.032, 0.12), (0.013, 0.15), (0.012, 0.17)],
              'Plastic', seg=14, center=(-0.3, -0.1, 0.0), parent=root)
        cyl(name + '_tin', 0.04, 0.05, (0.25, -0.12, 0.025), 'MetalPainted', seg=16, parent=root)
        box(name + '_box', (0.12, 0.08, 0.06), (0.4, -0.1, 0.03), 'Paper', parent=root, bevel=0.003,
            xform=rot('Z', 12, (0.4, -0.1, 0.03)))
    return root


def counter():
    root = P('Counter')
    box('cn_body', (1.3, 0.55, 0.98), (0, 0, 0.49), 'WoodOld', parent=root, bevel=0.012)
    box('cn_top', (1.38, 0.62, 0.04), (0, 0.0, 1.0), 'WoodDark', parent=root, bevel=0.01)
    for i in range(3):
        box('cn_panel%d' % i, (0.34, 0.015, 0.6), (-0.42 + i * 0.42, -0.28, 0.5), 'WoodOld', parent=root,
            bevel=0.01)
    box('cn_kick', (1.28, 0.5, 0.06), (0, 0.02, 0.03), 'MetalDark', parent=root, bevel=0)
    return root


def register():
    root = P('Register')
    box('rg_base', (0.36, 0.34, 0.1), (0, 0, 0.05), 'MetalDark', parent=root, bevel=0.012)
    box('rg_drawer', (0.34, 0.03, 0.07), (0, -0.17, 0.045), 'Brass', parent=root, bevel=0.006)
    box('rg_body', (0.32, 0.22, 0.14), (0, 0.04, 0.16), 'MetalDark', parent=root, bevel=0.02,
        xform=rot('X', -18, (0, 0.04, 0.1)))
    keys = []
    for r in range(3):
        for c in range(5):
            keys.append(((0.03, 0.03, 0.012), (-0.08 + c * 0.04, -0.03 + r * 0.045, 0.24 + r * 0.012)))
    multibox('rg_keys', keys, 'Ceramic', parent=root, bevel=0.002)
    box('rg_display', (0.2, 0.06, 0.07), (0, 0.13, 0.29), 'Brass', parent=root, bevel=0.01)
    panel('rg_window', 0.16, 0.035, (0, 0.099, 0.295), 'ScreenDark', '-Y', parent=root)
    cyl('rg_crank', 0.008, 0.08, (0.2, 0.05, 0.14), 'Chrome', axis='X', seg=8, parent=root)
    return root


def catalog():
    root = P('Catalog')
    box('ca_cover', (0.26, 0.34, 0.035), (0, 0, 0.0175), 'Leather', parent=root, bevel=0.006)
    box('ca_pages', (0.245, 0.33, 0.026), (0.006, 0, 0.018), 'Paper', parent=root, bevel=0.002)
    box('ca_tag', (0.08, 0.02, 0.003), (0.0, -0.12, 0.037), 'LabelGold', parent=root, bevel=0)
    return root


def lamp_old():
    root = P('LampOld')
    lathe('lo_rose', [(0.0, 0.0), (0.06, 0.0), (0.055, -0.02), (0.02, -0.03), (0.0, -0.03)], 'Plastic', seg=16,
          parent=root)
    pts = [(0, 0, -0.03), (0.004, 0.002, -0.3), (0.0, 0.0, -0.55)]
    sweep('lo_cord', pts, 0.004, 'Cord', seg=6, parent=root)
    lathe('lo_socket', [(0.0, -0.55), (0.016, -0.55), (0.018, -0.6), (0.016, -0.62), (0.0, -0.62)],
          'PlasticBlack', seg=12, parent=root)
    b = lathe('bulb', [(0.0, -0.62), (0.012, -0.62), (0.014, -0.635), (0.03, -0.66), (0.032, -0.69),
                       (0.022, -0.715), (0.0, -0.722)], 'Bulb', seg=16, parent=root, subsurf=1)
    return root


def lamp_pendant():
    root = P('LampPendant')
    lathe('lp_rose', [(0.0, 0.0), (0.06, 0.0), (0.058, -0.02), (0.0, -0.025)], 'Brass', seg=20, parent=root)
    sweep('lp_cord', [(0, 0, -0.02), (0, 0, -0.5)], 0.0045, 'CordFabric', seg=6, parent=root)
    lathe('lp_socket', [(0.0, -0.5), (0.02, -0.5), (0.022, -0.56), (0.0, -0.56)], 'Brass', seg=14, parent=root)
    prof = [(0.03, -0.53), (0.06, -0.56), (0.13, -0.62), (0.19, -0.70), (0.20, -0.71)]
    lathe('lp_shade', prof, 'PaintGreen', seg=32, parent=root, caps=(False, False))
    inner = [(r - 0.004, z - 0.003) for (r, z) in reversed(prof)]
    lathe('lp_shadein', inner, 'Enamel', seg=32, parent=root, caps=(False, False))
    torus('lp_rim', 0.20, 0.005, (0, 0, -0.71), 'Brass', seg=32, tseg=6, parent=root)
    lathe('bulb', [(0.0, -0.56), (0.014, -0.56), (0.03, -0.59), (0.033, -0.62), (0.02, -0.65), (0.0, -0.655)],
          'Bulb', seg=16, parent=root, subsurf=1)
    return root


def door():
    """Front door in the XZ plane, -Y is the street side. Hinge on the left (x=-0.475)."""
    root = P('Door')
    W, H = 0.95, 2.15
    multibox('dr_frame', [((W + 0.16, 0.16, 0.08), (0, 0, H + 0.04)),
                          ((0.08, 0.16, H), (-W / 2 - 0.04, 0, H / 2)),
                          ((0.08, 0.16, H), (W / 2 + 0.04, 0, H / 2))], 'PaintGreen', parent=root, bevel=0.01)
    hinge = empty('hinge', (-W / 2, 0, 0), root)
    lw = W - 0.01
    x0 = -W / 2 + 0.005
    xc = x0 + lw / 2
    st = 0.09
    multibox('dr_leaf', [((lw, 0.05, st), (xc, 0, H - st / 2 - 0.005)),
                         ((lw, 0.05, 0.9), (xc, 0, 0.45)),
                         ((st, 0.05, H - 0.9), (x0 + st / 2, 0, 0.9 + (H - 0.9) / 2)),
                         ((st, 0.05, H - 0.9), (x0 + lw - st / 2, 0, 0.9 + (H - 0.9) / 2)),
                         ((lw, 0.05, 0.05), (xc, 0, 0.92))], 'PaintGreen', parent=hinge, bevel=0.008)
    box('dr_panel', (lw - 0.2, 0.06, 0.55), (xc, 0, 0.45), 'PaintGreen', parent=hinge, bevel=0.015)
    panel('dr_glass', lw - 2 * st, H - 0.9 - st - 0.05, (xc, 0.0, 0.92 + 0.025 + (H - 0.9 - st - 0.05) / 2),
          'Glass', '-Y', parent=hinge)
    box('dr_kick', (lw - 0.06, 0.056, 0.18), (xc, 0, 0.1), 'Brass', parent=hinge, bevel=0.004)
    for s in (-1, 1):
        sweep('dr_handle%d' % s, [(x0 + lw - 0.1, s * 0.03, 1.0), (x0 + lw - 0.1, s * 0.07, 1.0),
                                  (x0 + lw - 0.1, s * 0.07, 1.22), (x0 + lw - 0.1, s * 0.03, 1.22)], 0.011,
              'Brass', seg=8, parent=hinge)
    # hanging OPEN/CLOSED sign on the inside of the glass
    box('dr_sign', (0.26, 0.012, 0.13), (xc, 0.05, 1.55), 'PaperSign', parent=hinge, bevel=0.004)
    sweep('dr_signcord', [(xc - 0.1, 0.05, 1.615), (xc, 0.05, 1.70), (xc + 0.1, 0.05, 1.615)], 0.002, 'Cord',
          seg=4, parent=hinge)
    # bell bracket over the door, inside (+Y)
    sweep('dr_bracket', [(W / 2 - 0.15, 0.08, H + 0.02), (W / 2 - 0.15, 0.2, H + 0.02),
                         (W / 2 - 0.15, 0.2, H - 0.02)], 0.006, 'Brass', seg=6, parent=root)
    bell = empty('bell', (W / 2 - 0.15, 0.2, H - 0.025), root)
    lathe('bell_body', [(0.0, -0.0), (0.012, -0.004), (0.022, -0.03), (0.035, -0.06), (0.038, -0.066),
                        (0.0, -0.066)], 'Brass', seg=18, center=(W / 2 - 0.15, 0.2, H - 0.025), parent=bell)
    sphere('bell_clapper', 0.008, (W / 2 - 0.15, 0.2, H - 0.025 - 0.07), 'Brass', seg=8, rings=4, parent=bell)
    return root


def window_frame(w=2.9, h=2.0):
    root = P('WindowFrame')
    t = 0.09
    boxes = [((w + 2 * t, 0.14, t), (0, 0, h + t / 2)), ((w + 2 * t, 0.2, t), (0, -0.02, -t / 2)),
             ((t, 0.14, h), (-w / 2 - t / 2, 0, h / 2)), ((t, 0.14, h), (w / 2 + t / 2, 0, h / 2)),
             ((0.05, 0.1, h), (-w / 6, 0, h / 2)), ((0.05, 0.1, h), (w / 6, 0, h / 2)),
             ((w, 0.1, 0.05), (0, 0, h * 0.78))]
    multibox('wf_frame', boxes, 'PaintGreen', parent=root, bevel=0.008)
    box('wf_sill', (w + 0.3, 0.3, 0.05), (0, 0.06, -0.09), 'WoodOld', parent=root, bevel=0.01)
    return root


def barber_pole():
    root = P('BarberPole')
    box('bp_plate', (0.12, 0.03, 0.5), (0, 0.06, 0.0), 'Brass', parent=root, bevel=0.01)
    for z in (-0.18, 0.18):
        sweep('bp_arm%d' % int(z * 100), [(0, 0.05, z), (0, -0.05, z)], 0.012, 'Brass', seg=8, parent=root)
    cx, cy = 0, -0.09
    lathe('bp_top', [(0.0, 0.33), (0.075, 0.33), (0.078, 0.35), (0.06, 0.40), (0.02, 0.43), (0.0, 0.44)],
          'Chrome', seg=24, center=(cx, cy, 0), parent=root)
    lathe('bp_bot', [(0.0, -0.40), (0.02, -0.40), (0.06, -0.37), (0.078, -0.34), (0.075, -0.32), (0.0, -0.32)],
          'Chrome', seg=24, center=(cx, cy, 0), parent=root)
    cyl('stripes', 0.055, 0.64, (cx, cy, 0.005), 'PoleWhite', seg=24, parent=root, bevel=0)
    cyl('bp_glass', 0.066, 0.66, (cx, cy, 0.005), 'Glass', seg=24, parent=root, bevel=0)
    sphere('bulb', 0.03, (cx, cy, 0.42), 'BulbOff', seg=12, rings=6, parent=root)
    return root


def radio():
    root = P('Radio')
    box('ra_body', (0.32, 0.16, 0.2), (0, 0, 0.1), 'WoodDark', parent=root, bevel=0.035, seg=3)
    panel('ra_grille', 0.15, 0.13, (-0.06, -0.081, 0.1), 'Fabric', '-Y', parent=root)
    cyl('ra_dialring', 0.04, 0.01, (0.08, -0.08, 0.11), 'Brass', axis='Y', seg=20, parent=root)
    panel('ra_dial', 0.06, 0.06, (0.08, -0.086, 0.11), 'LabelCream', '-Y', parent=root)
    for x in (0.05, 0.11):
        cyl('ra_knob%d' % int(x * 100), 0.012, 0.018, (x, -0.085, 0.04), 'PlasticBlack', axis='Y', seg=12,
            parent=root)
    sweep('ra_ant', [(0.12, 0.05, 0.2), (0.16, 0.06, 0.45)], 0.003, 'Chrome', seg=5, parent=root)
    return root


def plant_snake():
    root = P('PlantSnake')
    lathe('ps_pot', [(0.0, 0.0), (0.09, 0.0), (0.11, 0.02), (0.13, 0.22), (0.14, 0.24), (0.14, 0.26),
                     (0.125, 0.26), (0.12, 0.24), (0.0, 0.24)], 'Terracotta', seg=24, parent=root)
    cyl('ps_soil', 0.12, 0.01, (0, 0, 0.235), 'Soil', seg=20, parent=root, bevel=0)
    import random
    rnd = random.Random(7)
    for i in range(9):
        a = rnd.random() * math.tau
        r0 = 0.02 + rnd.random() * 0.06
        h = 0.35 + rnd.random() * 0.35
        lean = 0.05 + rnd.random() * 0.1
        x0, y0 = math.cos(a) * r0, math.sin(a) * r0
        pts = [(x0, y0, 0.23), (x0 + math.cos(a) * lean * 0.3, y0 + math.sin(a) * lean * 0.3, 0.23 + h * 0.4),
               (x0 + math.cos(a) * lean, y0 + math.sin(a) * lean, 0.23 + h)]
        w = 0.022 + rnd.random() * 0.012
        sweep('ps_leaf%d' % i, pts, [(0.004, w), (0.004, w * 1.1), (0.001, 0.002)],
              'LeafDark' if i % 2 else 'Leaf', seg=6, parent=root, twist=rnd.random() * 1.5)
    return root


def plant_fern():
    root = P('PlantFern')
    lathe('pf_pot', [(0.0, 0.0), (0.07, 0.0), (0.1, 0.16), (0.105, 0.18), (0.0, 0.17)], 'Ceramic', seg=24,
          parent=root)
    import random
    rnd = random.Random(3)
    for i in range(14):
        a = i / 14 * math.tau + rnd.random() * 0.3
        L = 0.25 + rnd.random() * 0.15
        pts = bezier_pts((0, 0, 0.17), (math.cos(a) * 0.05, math.sin(a) * 0.05, 0.35),
                         (math.cos(a) * L * 0.8, math.sin(a) * L * 0.8, 0.38), (math.cos(a) * L, math.sin(a) * L, 0.2), 6)
        radii = [(0.002, 0.004 + 0.022 * math.sin(math.pi * k / 6)) for k in range(7)]
        sweep('pf_leaf%d' % i, pts, radii, 'Leaf' if i % 3 else 'LeafDark', seg=4, parent=root)
    return root


def poster(name, w=0.42, h=0.56):
    root = P(name)
    multibox(name + '_frame', [((w + 0.04, 0.02, 0.02), (0, 0, h / 2 + 0.01)),
                               ((w + 0.04, 0.02, 0.02), (0, 0, -h / 2 - 0.01)),
                               ((0.02, 0.02, h), (-w / 2 - 0.01, 0, 0)),
                               ((0.02, 0.02, h), (w / 2 + 0.01, 0, 0))], 'WoodDark', parent=root, bevel=0.003)
    panel('poster', w, h, (0, -0.004, 0), 'Paper', '-Y', parent=root)
    return root


def wall_clock():
    root = P('Clock')
    torus('ck_rim', 0.15, 0.018, (0, 0, 0), 'WoodDark', seg=32, tseg=8, axis='Y', parent=root)
    cyl('ck_face', 0.15, 0.01, (0, 0.005, 0), 'Enamel', axis='Y', seg=32, parent=root, bevel=0)
    marks = []
    for i in range(12):
        a = i / 12 * math.tau
        marks.append(((0.008, 0.004, 0.022 if i % 3 == 0 else 0.012),
                      (math.sin(a) * 0.125, -0.002, math.cos(a) * 0.125)))
    ob = multibox('ck_marks', marks, 'MetalDark', parent=root)
    hh = empty('hourHand', (0, -0.008, 0), root)
    box('ck_hh', (0.01, 0.003, 0.075), (0, -0.008, 0.03), 'MetalDark', parent=hh, bevel=0)
    mh = empty('minuteHand', (0, -0.011, 0), root)
    box('ck_mh', (0.006, 0.003, 0.11), (0, -0.011, 0.045), 'MetalDark', parent=mh, bevel=0)
    cyl('ck_pin', 0.006, 0.01, (0, -0.012, 0), 'Brass', axis='Y', seg=10, parent=root, bevel=0)
    return root


def trash_bin():
    root = P('Trash')
    lathe('tb_body', [(0.0, 0.0), (0.13, 0.0), (0.15, 0.4), (0.155, 0.41), (0.145, 0.41), (0.135, 0.02),
                      (0.0, 0.02)], 'MetalPainted', seg=24, parent=root)
    sphere('tb_paper', 0.06, (0.03, 0.0, 0.38), 'Paper', scale=(1, 0.8, 0.7), seg=8, rings=5, parent=root)
    return root


def broom():
    root = P('Broom')
    cyl('br_stick', 0.012, 1.25, (0, 0, 0.78), 'WoodLight', seg=10, parent=root, bevel=0)
    box('br_head', (0.3, 0.05, 0.05), (0, 0, 0.14), 'WoodOld', parent=root, bevel=0.01)
    box('br_bristle', (0.29, 0.045, 0.1), (0, 0, 0.065), 'CordFabric', parent=root, bevel=0.005,
        taper=(1.0, 0.8))
    return root


def ceiling_fan():
    root = P('Fan')
    cyl('fn_rod', 0.012, 0.35, (0, 0, -0.175), 'Brass', seg=10, parent=root, bevel=0)
    lathe('fn_motor', [(0.0, -0.32), (0.07, -0.33), (0.09, -0.38), (0.07, -0.43), (0.0, -0.44)], 'Brass', seg=20,
          parent=root)
    rotor = empty('rotor', (0, 0, -0.4), root)
    for i in range(4):
        a = i * 90
        xf = rot('Z', a)
        box('fn_blade%d' % i, (0.5, 0.11, 0.008), (0.33, 0, -0.4), 'WoodDark', parent=rotor, bevel=0.003,
            xform=xf @ rot('X', 8, (0.33, 0, -0.4)))
        box('fn_iron%d' % i, (0.12, 0.03, 0.008), (0.1, 0, -0.405), 'Brass', parent=rotor, bevel=0.002, xform=xf)
    return root


# ------------------------------------------------------------------ small items

def envelope():
    root = P('Envelope')
    box('ev_body', (0.2, 0.11, 0.014), (0, 0, 0.007), 'Envelope', parent=root, bevel=0.003)
    mesh('ev_flap', [(-0.1, 0.055, 0.0145), (0.1, 0.055, 0.0145), (0.0, -0.005, 0.0145)], [(0, 2, 1)], 'Envelope',
         parent=root, smooth=False)
    return root


def cash_stack():
    root = P('CashStack')
    box('cs_notes', (0.155, 0.067, 0.022), (0, 0, 0.011), 'Cash', parent=root, bevel=0.002)
    box('cs_band', (0.03, 0.069, 0.024), (0, 0, 0.011), 'CashBand', parent=root, bevel=0.001)
    return root


def note():
    root = P('Note')
    verts = []
    faces = []
    nx = 6
    for i in range(nx + 1):
        x = -0.0775 + 0.155 * i / nx
        bend = 0.004 * math.sin(math.pi * i / nx)
        verts.append((x, -0.033, bend))
        verts.append((x, 0.033, bend))
    for i in range(nx):
        a = i * 2
        faces.append((a, a + 2, a + 3, a + 1))
    mesh('nt_paper', verts, faces, 'CashNote', parent=root)
    return root


def coin():
    root = P('Coin')
    cyl('cn_coin', 0.012, 0.0025, (0, 0, 0.00125), 'Brass', seg=16, parent=root, bevel=0.0008)
    return root


def receipt():
    root = P('Receipt')
    verts, faces = [], []
    ny = 8
    for i in range(ny + 1):
        y = -0.07 + 0.14 * i / ny
        curl = 0.012 * (i / ny) ** 2
        verts.append((-0.03, y, curl))
        verts.append((0.03, y, curl))
    for i in range(ny):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    mesh('rc_paper', verts, faces, 'Paper', parent=root)
    return root


def key():
    """The old shop key: a worn brass skeleton key on a rusty ring with a paper tag."""
    root = P('Key')
    # trefoil bow: three loops around a small ring, one loop slightly squashed from years in a pocket
    for i, (ang, sc) in enumerate(((90, 1.0), (210, 0.92), (330, 1.0))):
        a = math.radians(ang)
        torus('ky_loop%d' % i, 0.0085 * sc, 0.0026, (math.cos(a) * 0.0105, 0.042 + math.sin(a) * 0.0105, 0),
              'BrassWorn', seg=14, tseg=6, axis='Z', parent=root)
    torus('ky_hub', 0.0062, 0.0024, (0, 0.042, 0), 'BrassWorn', seg=14, tseg=6, axis='Z', parent=root)
    # collar rings and a slightly bent shaft
    cyl('ky_collar1', 0.0052, 0.004, (0, 0.027, 0), 'BrassWorn', axis='Y', seg=12, parent=root, bevel=0.0008)
    cyl('ky_collar2', 0.0046, 0.003, (0, 0.021, 0), 'BrassWorn', axis='Y', seg=12, parent=root, bevel=0.0006)
    sweep('ky_shaft', [(0, 0.022, 0), (0.0004, 0.0, 0.0002), (0.0011, -0.025, 0.0007), (0.0016, -0.046, 0.0012)],
          [0.0034, 0.0033, 0.0032, 0.0031], 'BrassWorn', seg=10, parent=root)
    sphere('ky_tip', 0.0034, (0.0016, -0.047, 0.0012), 'BrassWorn', seg=10, rings=6, parent=root)
    # the bit: stepped wards, one corner chipped off
    multibox('ky_bit', [((0.0032, 0.016, 0.006), (0.0014, -0.038, -0.006)),
                        ((0.0032, 0.004, 0.005), (0.0014, -0.031, -0.0115)),
                        ((0.0032, 0.004, 0.0035), (0.0014, -0.0405, -0.011)),
                        ((0.0032, 0.0035, 0.0055), (0.0014, -0.044, -0.0115))], 'BrassWorn', parent=root, bevel=0.0005)
    # split ring, tarnished
    torus('ky_ring', 0.0155, 0.0015, (0, 0.066, 0), 'IronRust', seg=20, tseg=5, axis='X', parent=root)
    # paper tag on a bit of twine
    sweep('ky_twine', [(0, 0.08, 0.0), (0.004, 0.09, 0.002), (0.006, 0.1, 0.001)], 0.0007, 'Twine', seg=4, parent=root)
    box('ky_tag', (0.026, 0.042, 0.0015), (0.008, 0.122, 0.0), 'PaperOld', parent=root, bevel=0.0006,
        xform=rot('Z', -12, (0.006, 0.1, 0)))
    torus('ky_eyelet', 0.0028, 0.0008, (0.0056, 0.1, 0.0), 'BrassWorn', seg=10, tseg=4, axis='Z', parent=root)
    return root


def phone():
    root = P('Phone')
    box('ph_body', (0.072, 0.15, 0.009), (0, 0, 0.0045), 'PlasticBlack', parent=root, bevel=0.004, seg=2)
    panel('screen', 0.064, 0.138, (0, 0, 0.0092), 'Screen', '+Z', parent=root)
    return root


# ------------------------------------------------------------------ exterior

def awning(w=3.4, d=0.9):
    root = P('Awning')
    n = 12
    sw = w / n
    for i in range(n):
        x = -w / 2 + sw * (i + 0.5)
        m = 'Awning' if i % 2 == 0 else 'AwningStripe'
        sag = 0.02 * math.sin(math.pi * (i + 0.5) / n)
        verts = [(x - sw / 2, 0, 0), (x + sw / 2, 0, 0), (x + sw / 2, -d, -0.42 - sag), (x - sw / 2, -d, -0.42 - sag)]
        mesh('aw_s%d' % i, verts, [(0, 1, 2, 3)], m, parent=root, smooth=False)
        # scalloped valance
        vz = -0.42 - sag
        vv = [(x - sw / 2, -d, vz), (x + sw / 2, -d, vz), (x + sw / 2, -d, vz - 0.14), (x, -d, vz - 0.2),
              (x - sw / 2, -d, vz - 0.14)]
        mesh('aw_v%d' % i, vv, [(0, 4, 3, 2, 1)], m, parent=root, smooth=False)
    sweep('aw_bar', [(-w / 2, -d, -0.42), (w / 2, -d, -0.42)], 0.012, 'MetalDark', seg=6, parent=root)
    for s in (-1, 1):
        sweep('aw_arm%d' % s, [(s * w / 2, 0.0, -0.75), (s * w / 2, -d, -0.43)], 0.01, 'MetalDark', seg=6, parent=root)
    return root


def sign_board(w=3.0, h=0.56):
    root = P('SignBoard')
    box('sb_box', (w + 0.1, 0.16, h + 0.1), (0, 0.0, 0), 'MetalDark', parent=root, bevel=0.02)
    panel('signface', w, h, (0, -0.081, 0), 'Paper', '-Y', parent=root)
    for s in (-1, 1):
        lathe('sb_lamp%d' % s, [(0.0, 0.0), (0.05, 0.0), (0.06, -0.06), (0.0, -0.06)], 'MetalDark', seg=14,
              center=(s * 1.0, -0.32, h / 2 + 0.16), parent=root)
        sweep('sb_lamparm%d' % s, [(s * 1.0, 0.0, h / 2 + 0.05), (s * 1.0, -0.1, h / 2 + 0.22),
                                   (s * 1.0, -0.32, h / 2 + 0.2)], 0.008, 'MetalDark', seg=6, parent=root)
    return root


def street_lamp():
    root = P('StreetLamp')
    lathe('sl_base', [(0.0, 0.0), (0.14, 0.0), (0.12, 0.25), (0.06, 0.35), (0.0, 0.35)], 'MetalDark', seg=16,
          parent=root)
    cyl('sl_pole', 0.05, 3.2, (0, 0, 1.9), 'MetalDark', seg=14, parent=root, r2=0.035, bevel=0)
    lathe('sl_head', [(0.0, 3.45), (0.03, 3.45), (0.16, 3.6), (0.18, 3.62), (0.12, 3.75), (0.0, 3.8)], 'MetalDark',
          seg=16, parent=root)
    lathe('bulb', [(0.0, 3.5), (0.09, 3.52), (0.12, 3.6), (0.0, 3.62)], 'Bulb', seg=16, parent=root)
    return root


def bench():
    root = P('Bench')
    for i in range(4):
        box('bn_slat%d' % i, (1.5, 0.08, 0.03), (0, -0.15 + i * 0.1, 0.45), 'WoodLight', parent=root, bevel=0.006)
    for i in range(3):
        box('bn_back%d' % i, (1.5, 0.03, 0.08), (0, 0.22, 0.6 + i * 0.12), 'WoodLight', parent=root, bevel=0.006,
            xform=rot('X', -12, (0, 0.2, 0.45)))
    for s in (-1, 1):
        sweep('bn_side%d' % s, [(s * 0.68, -0.2, 0.0), (s * 0.68, -0.18, 0.43), (s * 0.68, 0.2, 0.43),
                                (s * 0.68, 0.26, 0.95)], 0.02, 'MetalDark', seg=8, parent=root)
        sweep('bn_sideb%d' % s, [(s * 0.68, 0.2, 0.0), (s * 0.68, 0.18, 0.43)], 0.02, 'MetalDark', seg=8, parent=root)
    return root


def planter():
    root = P('Planter')
    box('pl_box', (0.9, 0.4, 0.45), (0, 0, 0.225), 'Concrete', parent=root, bevel=0.02)
    import random
    rnd = random.Random(11)
    for i in range(6):
        sphere('pl_bush%d' % i, 0.14 + rnd.random() * 0.06, (-0.3 + i * 0.12, (rnd.random() - 0.5) * 0.1,
                                                            0.5 + rnd.random() * 0.06),
               'LeafDark' if i % 2 else 'Leaf', seg=10, rings=7, parent=root, subsurf=0)
    return root


def tv():
    root = P('TV')
    box('tv_body', (0.9, 0.05, 0.52), (0, 0, 0), 'PlasticBlack', parent=root, bevel=0.01)
    panel('screen', 0.86, 0.48, (0, -0.026, 0), 'Screen', '-Y', parent=root)
    box('tv_mount', (0.2, 0.06, 0.2), (0, 0.05, 0), 'MetalDark', parent=root, bevel=0.01)
    return root


def neon_open():
    """Neon OPEN sign drawn as tubes in the XZ plane, facing -Y."""
    root = P('NeonOpen')
    s = 0.11
    letters = {
        'O': [[(0, 0), (0.6, 0), (0.8, 0.2), (0.8, 0.8), (0.6, 1), (0.2, 1), (0, 0.8), (0, 0.2), (0.2, 0), (0.6, 0)]],
        'P': [[(0, 0), (0, 1), (0.6, 1), (0.8, 0.85), (0.8, 0.6), (0.6, 0.48), (0, 0.48)]],
        'E': [[(0.8, 1), (0, 1), (0, 0), (0.8, 0)], [(0, 0.5), (0.6, 0.5)]],
        'N': [[(0, 0), (0, 1), (0.8, 0), (0.8, 1)]],
    }
    x = -2.0 * s
    for ch in 'OPEN':
        for k, stroke in enumerate(letters[ch]):
            pts = [(x + px * s, -0.03, (py - 0.5) * s * 1.4) for (px, py) in stroke]
            sweep('neon_%s%d' % (ch, k), pts, 0.006, 'Neon', seg=6, parent=root)
        x += s * 1.05
    box('neon_back', (0.55, 0.012, 0.24), (0, 0.0, 0), 'Glass', parent=root, bevel=0.004)
    return root


def build_all():
    roots = [
        barber_chair('ChairOld', False), barber_chair('ChairClassic', True),
        wait_chair_old(), couch(),
        mirror('MirrorOld', 0.58, 0.78, 'WoodOld', 0.045),
        mirror('MirrorLarge', 0.86, 1.12, 'WoodDark', 0.07, inner='Brass'),
        mirror('MirrorLED', 0.86, 1.12, 'PlasticBlack', 0.06, bulbs=True),
        station('StationOld', False), station('StationClassic', True), cart(),
        clipper('ClipperCheap', False), clipper('ClipperPro', True), guard(), scissors(), trimmer(), comb(),
        spray(), cape_draped(), cape_folded(),
        wall_shelf(), products('ProductsFew', False), products('ProductsFull', True), counter(), register(),
        catalog(), lamp_old(), lamp_pendant(), door(), window_frame(), barber_pole(), radio(),
        plant_snake(), plant_fern(), poster('Poster'), wall_clock(), trash_bin(), broom(), ceiling_fan(),
        envelope(), cash_stack(), note(), coin(), receipt(), key(), phone(),
        awning(), sign_board(), street_lamp(), bench(), planter(), tv(), neon_open(),
    ]
    return roots
