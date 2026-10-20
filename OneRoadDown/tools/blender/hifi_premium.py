"""Premium detail kit for the flagship hi-fi cars: modelled LED lamp units (housing,
projector lenses, DRL strips, indicator, glass cover), segmented tail lamps (tail / brake,
indicator, reverse, cover), front splitter, a full cockpit (dash, separate steering wheel
with paddles, digital screen, bucket seats with bolsters, console, pedals, door cards,
seatbelts) and LOD copies.

Node names this adds (all '<id>__<name>' children of the car root):
  lightL/lightR (headlight: projector lenses), drlL/drlR (headlight: LED strips),
  lampCoverL/lampCoverR (lens: clear cover kind), indicatorF (amber), headlamps (chrome housing floor),
  tail (taillight), indicatorR (amber), reverse (reverse), tailCover (lens), splitter (trim),
  steeringWheel (pivot = column axis, local +z = column), dashScreen (gauges, UV 0..1 quad),
  dash, console, seats, pedals, doorCards, seatbelts, cabin, eye/hoodEye/hoodHinge anchors.
LODs: sibling roots '<id>_lod1' (~50 % tris) and '<id>_lod2' (~15 %, no cockpit), children
'<id>_lodN__<material kind>' (one merged mesh per material kind).
"""
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
from car_hifi import G, ug, lerp, Acc, loft_acc, tube, disc, acc_mesh, proj_patch


def rotx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def roty(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def sbox(acc, c, size, rot=None, e=0.3, nu=14, nv=9):
    """Superellipsoid 'soft box' (game coords)."""
    sx, sy, sz = size
    verts, faces = [], []
    f = lambda q: math.copysign(abs(q) ** e, q)
    for i in range(nv + 1):
        th = math.pi * i / nv - math.pi / 2
        for j in range(nu):
            ph = 2 * math.pi * j / nu
            p = np.array([f(math.cos(th)) * f(math.cos(ph)) * sx / 2, f(math.sin(th)) * sy / 2, f(math.cos(th)) * f(math.sin(ph)) * sz / 2])
            if rot is not None:
                p = rot @ p
            verts.append(p + np.array(c, float))
    for i in range(nv):
        for j in range(nu):
            a = i * nu + j; b = i * nu + (j + 1) % nu
            faces.append((a, a + nu, b + nu, b))
    acc.add(verts, faces)


def flat_strap(acc, pts, w=0.045, t=0.004, n=(0, 0, 1)):
    tube(acc, pts, [(-w / 2, -t / 2), (w / 2, -t / 2), (w / 2, t / 2), (-w / 2, t / 2)], True, True, up=n)


class Premium:
    """Mixin for Design subclasses."""
    LAMP_UNIT = None     # dict(lenses=[(u, v, r)], drl=[(path, w)], ind=[(path, w)])
    TAIL_UNIT = None     # dict(tail=[(path, w)], ind=[(path, w)], rev=[(path, w)])
    SPLITTER = None      # dict(y, out, x)
    COCKPIT = None       # dict(...) see premium_interior

    # ---------------------------------------------------------------- lamps
    def lamp_details(self, surf):
        if not self.LAMP_UNIT:
            return super().lamp_details(surf)
        U = self.LAMP_UNIT
        objs = []
        for side, (fr, sgn) in (('L', (self.lamp_frames[0][0], 1)), ('R', (self.lamp_frames[0][1], -1))):
            O, e1, e2, dv = fr
            m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
            lens, drl, cover, ind = Acc(), Acc(), Acc(), Acc()
            for (u, v, r) in U['lenses']:
                u *= sgn
                h, nn = surf.hit(O + e1 * u + e2 * v - dv * 4.0, dv, 9.0)
                if h is None:
                    continue
                out = -dv
                # barrel + domed lens
                ring0 = [h + (e1 * math.cos(a) + e2 * math.sin(a)) * r for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
                ring1 = [p + out * 0.016 for p in ring0]
                loft_acc(lens, [ring0, ring1], True)
                disc(lens, h + out * 0.016, out, r * 0.92, 18, 0.0, r * 0.4)
            for path, w in U['drl']:
                from hifi_designs import strip
                strip(drl, surf, m(path), fr, w, 0.006)
            for path, w in U.get('ind', ()):
                from hifi_designs import strip
                strip(ind, surf, m(path), fr, w, 0.005)
            proj_patch(cover, self.pre_surf, self.LAMPS[0]['poly'] if sgn > 0 else [(-u, v) for u, v in reversed(self.LAMPS[0]['poly'])], fr, 0.0015, n=0.02)
            objs.append(self.uv_const(self.obj('light' + side, lens, 'headlight', 50), (0.3, 0.5)))
            objs.append(self.uv_const(self.obj('drl' + side, drl, 'headlight', 60), (0.5, 0.09)))
            objs.append(self.obj('lampCover' + side, cover, 'lens', 60))
            if not ind.empty():
                objs.append(self.obj('indicatorF' + side, ind, 'amber', 60))
        return objs

    def tail_details(self, surf):
        if not self.TAIL_UNIT:
            return super().tail_details(surf)
        from hifi_designs import strip
        U = self.TAIL_UNIT
        T, I, R, C = Acc(), Acc(), Acc(), Acc()
        spec, frs = self.TAILS[0], self.tail_frames[0]
        for k, (fr, poly) in enumerate(frs):
            sgn = 1 if k == 0 else -1
            m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
            for path, w in U['tail']:
                strip(T, surf, m(path), fr, w, 0.004)
            for path, w in U.get('ind', ()):
                strip(I, surf, m(path), fr, w, 0.004)
            for path, w in U.get('rev', ()):
                strip(R, surf, m(path), fr, w, 0.004)
            from car_hifi import offset_poly
            for shrink in (-0.006, -0.015, -0.03):
                if proj_patch(C, self.pre_surf, offset_poly(poly, shrink), fr, 0.0015, n=0.02):
                    break
        objs = [self.uv_const(self.obj('tail', T, 'taillight', 60), (0.5, 0.19))]
        if not I.empty():
            objs.append(self.obj('indicatorR', I, 'amber', 60))
        if not R.empty():
            objs.append(self.obj('reverse', R, 'reverse', 60))
        objs.append(self.obj('tailCover', C, 'lens', 60))
        return objs

    # ---------------------------------------------------------------- splitter
    def splitter(self, surf):
        S = self.SPLITTER
        if not S:
            return []
        A = Acc()
        y = S['y']
        top, bot = [], []
        xs = np.linspace(-S['x'], S['x'], 25)
        for x in xs:
            p, n = surf.hit((x, y, 6.0), (0, 0, -1))
            if p is None:
                continue
            z = p[2] + S['out']
            top.append((x, y + 0.006, z))
            bot.append((x, y - 0.008, z))
        inner_t = [(x, y + 0.006, z - S['out'] - 0.12) for (x, _, z) in top]
        inner_b = [(x, y - 0.008, z - S['out'] - 0.12) for (x, _, z) in top]
        loft_acc(A, [inner_t, top, bot, inner_b], False)
        # end plates
        for row in (0, -1):
            pts = [inner_t[row], top[row], bot[row], inner_b[row]]
            A.add(pts, [(0, 1, 2, 3)] if row else [(3, 2, 1, 0)])
        return [self.obj('splitter', A, 'trim', 40)]

    # ---------------------------------------------------------------- cockpit
    def premium_interior(self, surf):
        C = self.COCKPIT
        cid = self.cid
        objs = []
        xD, fl, zS, zW, yW = C['xD'], C['floor'], C['seatZ'], C['wheelZ'], C['wheelY']
        zDf, zDr, yDt = C['dashFront'], C['dashRear'], C['dashTop']
        cab = self.cab_half
        inner = min(cab(z) for z in np.linspace(zDr, zDf, 6)) - 0.01
        # dashboard: lofted wing across the cabin with a hooded binnacle
        dash = Acc()
        prof = [(zDf, yDt - 0.02), (zDf - 0.18, yDt), (zDr + 0.12, yDt + 0.005), (zDr, yDt - 0.04), (zDr - 0.02, yDt - 0.14),
                (zDr + 0.06, yDt - 0.30), (zDr + 0.12, fl + 0.16), (zDr + 0.22, fl + 0.02)]
        rings = []
        for x in np.linspace(-inner, inner, 13):
            rings.append([(x, y, z) for (z, y) in prof])
        loft_acc(dash, rings, False)
        # binnacle hood over the screen
        hood = []
        for a in np.linspace(0, math.pi, 9):
            hood.append([(xD + math.cos(a) * 0.19, yDt + 0.02 + math.sin(a) * 0.05, zz) for zz in (zDr + 0.16, zDr - 0.03)])
        loft_acc(dash, [[r[0] for r in hood], [r[1] for r in hood]], False)
        # centre stack + vents
        sbox(dash, (0.0, yDt - 0.16, zDr + 0.02), (0.30, 0.2, 0.14), e=0.25)
        for x in (-0.09, 0.09):
            sbox(dash, (x, yDt - 0.06, zDr - 0.045), (0.11, 0.05, 0.03), e=0.2)
        # rear-view mirror on the screen header
        sbox(dash, (0.0, C['mirrorY'], C['mirrorZ']), (0.24, 0.06, 0.03), e=0.3)
        objs.append(self.obj('dash', dash, 'dash', 40))
        # vents' dark faces + start-button cover etc. as trim
        tr = Acc()
        for x in (-0.09, 0.09):
            sbox(tr, (x, yDt - 0.06, zDr - 0.062), (0.095, 0.035, 0.008), e=0.2)
        sbox(tr, (0.0, yDt - 0.2, zDr - 0.06), (0.05, 0.03, 0.02), e=0.3)
        objs.append(self.obj('dashTrim', tr, 'trim', 40))
        # digital instrument screen: UV 0..1 quad facing the driver (live canvas in game)
        sw_, sh_ = 0.30, 0.11
        rot = rotx(-0.2)
        q = [rot @ np.array(p) for p in [(-sw_ / 2, -sh_ / 2, 0), (sw_ / 2, -sh_ / 2, 0), (sw_ / 2, sh_ / 2, 0), (-sw_ / 2, sh_ / 2, 0)]]
        c0 = np.array([xD, yDt - 0.025, zDr + 0.06])
        me = bpy.data.meshes.new(cid + '__dashScreen')
        me.from_pydata([G(p + c0) for p in q], [], [(3, 2, 1, 0)])
        uvl = me.uv_layers.new(name='UVMap')
        for li, uv in zip(me.polygons[0].loop_indices, [(1, 1), (0, 1), (0, 0), (1, 0)]):
            uvl.data[li].uv = uv
        me.materials.append(self.K.MATS['gauges'])
        ob = bpy.data.objects.new(cid + '__dashScreen', me)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
        # steering wheel: own node, pivot on the column axis (game rotates it about local z)
        objs.append(self.steering_wheel(np.array([xD, yW, zW]), C.get('tilt', 0.38)))
        # bucket seats with bolsters and integrated headrests
        seats, belts = Acc(), Acc()
        sy = C['seatY']
        for x in (xD, -xD):
            sbox(seats, (x, sy, zS + 0.02), (0.46, 0.09, 0.48), e=0.35)
            for bs in (1, -1):
                sbox(seats, (x + bs * 0.21, sy + 0.04, zS + 0.02), (0.08, 0.13, 0.46), e=0.4)
            rb = rotx(-0.32)
            back_c = np.array([x, sy + 0.33, zS - 0.25])
            sbox(seats, back_c, (0.44, 0.66, 0.11), rb, e=0.35)
            for bs in (1, -1):
                sbox(seats, back_c + rb @ np.array([bs * 0.2, -0.06, 0.05]), (0.09, 0.48, 0.17), rb, e=0.4)
            sbox(seats, back_c + rb @ np.array([0, 0.36, 0.0]), (0.27, 0.17, 0.10), rb, e=0.35)
            # seatbelt: shoulder strap from the outboard pillar across to the inboard buckle, plus lap belt
            ob_ = 1 if x > 0 else -1
            sh = back_c + rb @ np.array([ob_ * 0.17, 0.27, 0.075])
            mid = np.array([x - ob_ * 0.02, sy + 0.25, zS - 0.10])
            buckle = np.array([x - ob_ * 0.24, sy + 0.07, zS - 0.08])
            anchor = np.array([x + ob_ * 0.25, sy + 0.05, zS - 0.15])
            flat_strap(belts, [sh, mid, buckle], n=(0, 0, 1))
            flat_strap(belts, [anchor, np.array([x, sy + 0.12, zS - 0.06]), buckle], n=(0, 0, 1))
            flat_strap(belts, [sh, sh + np.array([ob_ * 0.1, 0.12, -0.08])], n=(0, 0, 1))
        objs.append(self.obj('seats', seats, 'seat', 50))
        objs.append(self.obj('seatbelts', belts, 'trim', 50))
        # centre console with drive-mode panel
        con = Acc()
        sbox(con, (0.0, fl + 0.13, (zDr + zS) / 2 + 0.05), (0.22, 0.26, (zDr - zS) + 0.1), e=0.25)
        sbox(con, (0.0, fl + 0.27, (zDr + zS) / 2 + 0.1), (0.18, 0.03, 0.30), rotx(0.12), e=0.2)
        objs.append(self.obj('console', con, 'dash', 40))
        # pedals
        ped = Acc()
        pz = C['pedalZ']
        for k, (px, w_) in enumerate(((xD - 0.07, 0.09), (xD + 0.08, 0.05))):
            sbox(ped, (px, fl + 0.12, pz), (w_, 0.13 if k else 0.08, 0.015), rotx(0.45), e=0.2)
            sbox(ped, (px, fl + 0.22, pz + 0.04), (0.012, 0.12, 0.012), rotx(0.3), e=0.5)
        objs.append(self.obj('pedals', ped, 'chrome', 40))
        # door cards: inner door skins with armrest and pull
        dc = Acc()
        z0, z1 = C['bulkZ'] + 0.05, zDr + 0.05
        for sgn in (1, -1):
            rings = []
            for z in np.linspace(z0, z1, 10):
                w = cab(z) + 0.02
                rings.append([(sgn * (w + 0.06), fl, z), (sgn * (w + 0.04), fl + 0.25, z), (sgn * (w - 0.0), C['beltY'] - 0.02, z),
                              (sgn * (w - 0.03), C['beltY'], z)])
            loft_acc(dc, rings, False)
            zm = (z0 + z1) / 2
            sbox(dc, (sgn * (cab(zm) - 0.02), C['beltY'] - 0.18, zm), (0.06, 0.05, 0.45), e=0.3)
            sbox(dc, (sgn * (cab(zm + 0.2) - 0.005), C['beltY'] - 0.08, zm + 0.2), (0.025, 0.03, 0.12), e=0.3)
        objs.append(self.obj('doorCards', dc, 'cabin', 40))
        # cabin shell: floor, bulkhead, headliner
        cs = Acc()
        zb = C['bulkZ']
        wb = cab(zb) + 0.03
        cs.add([(-inner, fl, zDr + 0.25), (inner, fl, zDr + 0.25), (inner, fl, zb), (-inner, fl, zb)], [(0, 3, 2, 1)])
        yb = min(C['roofY'], self.deck_y(zb)) - 0.07
        cs.add([(-wb, fl, zb), (wb, fl, zb), (wb, yb, zb), (-wb, yb, zb)], [(0, 1, 2, 3)])
        hv = []
        for z in np.linspace(zb, C['headerZ'], 7):
            w = cab(z) * 0.8
            yr = min(C['roofY'], self.deck_y(z))
            hv.append([(-w, yr - 0.07, z), (0, yr - 0.045, z), (w, yr - 0.07, z)])
        loft_acc(cs, hv, False)
        objs.append(self.obj('cabin', cs, 'cabin', 40))
        # anchors
        for nm, p in (('eye', C['eye']), ('hoodEye', C['hoodEye']), ('hoodHinge', C['hoodHinge'])):
            e = bpy.data.objects.new(cid + '__' + nm, None)
            e.location = G(p)
            bpy.context.scene.collection.objects.link(e)
            objs.append(e)
        return objs

    def steering_wheel(self, hub, tilt):
        """Flat-bottomed sports wheel with paddles, built about the hub: local +z = column axis
        (towards the dash), the wheel plane is local xy."""
        sw = Acc()
        R = 0.172
        path = []
        for a in np.linspace(0, 2 * math.pi, 40, endpoint=False):
            x, y = math.cos(a) * R, math.sin(a) * R
            y = max(y, -R * 0.78)
            path.append((x, y, 0.0))
        path.append(path[0])
        prof = [(math.cos(a) * 0.017, math.sin(a) * 0.021) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)]
        tube(sw, path, prof, True, False, up=(0, 0, 1))
        for a in (0.0, math.pi, -math.pi / 2):
            p1 = (math.cos(a) * R * 0.93, max(math.sin(a) * R, -R * 0.75) * 0.93, 0.0)
            tube(sw, [(math.cos(a) * 0.045, math.sin(a) * 0.045, 0.012), p1], [(-0.022, -0.006), (0.022, -0.006), (0.022, 0.006), (-0.022, 0.006)], True, True, up=(0, 0, 1))
        disc(sw, (0, 0, -0.012), (0, 0, -1), 0.058, 20, 0.04, 0.008)
        # column
        tube(sw, [(0, 0, 0.03), (0, 0, 0.26)], [(math.cos(a) * 0.032, math.sin(a) * 0.032) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)], True, True, up=(0, 1, 0))
        # shift paddles behind the rim
        for sgn in (1, -1):
            sbox(sw, (sgn * 0.15, 0.03, 0.035), (0.075, 0.11, 0.008), roty(sgn * 0.25), e=0.3)
        me = bpy.data.meshes.new(self.cid + '__steeringWheel')
        me.from_pydata([G(p) for p in sw.v], [], sw.f)
        me.validate()
        me.materials.append(self.K.MATS['dash'])
        for p in me.polygons:
            p.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(45))
        ob = bpy.data.objects.new(self.cid + '__steeringWheel', me)
        bpy.context.scene.collection.objects.link(ob)
        Cm = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
        Rg = Matrix(((1, 0, 0), (0, math.cos(tilt), -math.sin(tilt)), (0, math.sin(tilt), math.cos(tilt))))
        ob.matrix_world = Matrix.Translation(G(hub)) @ (Cm @ Rg @ Cm.inverted()).to_4x4()
        return ob

    # ---------------------------------------------------------------- LODs
    LOD_SKIP2 = ('dash', 'dashTrim', 'dashScreen', 'steeringWheel', 'seats', 'seatbelts', 'console', 'pedals', 'doorCards',
                 'cabin', 'mirrorGlass', 'exhaustIn', 'drlL', 'drlR', 'lampCoverL', 'lampCoverR', 'tailCover', 'diffuser')

    LODS = False

    def make_lods(self, objs):
        if not self.LODS:
            return []
        cid = self.cid
        out = []
        for n, ratio in ((1, 0.5), (2, 0.15)):
            groups = {}
            for o in objs:
                if o.type != 'MESH':
                    continue
                part = o.name.split('__', 1)[1]
                if n == 2 and part in self.LOD_SKIP2:
                    continue
                if part == 'steeringWheel' and n == 1:
                    continue
                kind = o.data.materials[0].name.replace('car_', '')
                groups.setdefault(kind, []).append(o)
            lobjs = []
            for kind, os_ in groups.items():
                bm = bmesh.new()
                for o in os_:
                    tmp = bmesh.new()
                    tmp.from_mesh(o.data)
                    bmesh.ops.transform(tmp, matrix=o.matrix_world, verts=tmp.verts)
                    me_t = bpy.data.meshes.new('t')
                    tmp.to_mesh(me_t)
                    tmp.free()
                    bm.from_mesh(me_t)
                    bpy.data.meshes.remove(me_t)
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
                me = bpy.data.meshes.new(f'{cid}_lod{n}__{kind}')
                bm.to_mesh(me)
                bm.free()
                if me.has_custom_normals:
                    me.normals_split_custom_set([(0, 0, 0)] * len(me.loops))
                ob = bpy.data.objects.new(me.name, me)
                bpy.context.scene.collection.objects.link(ob)
                if len(me.polygons) > 60:
                    mod = ob.modifiers.new('dec', 'DECIMATE')
                    mod.ratio = ratio
                    mod.use_collapse_triangulate = True
                    dg = bpy.context.evaluated_depsgraph_get()
                    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
                    ob.modifiers.remove(mod)
                    ob.data = me2
                    nm = me.name
                    bpy.data.meshes.remove(me)
                    me2.name = nm
                ob.data.materials.clear()
                ob.data.materials.append(self.K.MATS[kind])
                for p in ob.data.polygons:
                    p.use_smooth = True
                ob.data.set_sharp_from_angle(angle=math.radians(40))
                lobjs.append(ob)
            out.append((f'{cid}_lod{n}', lobjs))
        return out
