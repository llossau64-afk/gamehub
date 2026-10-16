"""Per-car designs for the high-fidelity body path (see car_hifi.py).

Fictional cars only: no names, badges or emblems -- shapes follow the usual archetypes
(wedge V12, V10 supercar, rear-engined coupe, berlinetta, ...)."""
import math
import numpy as np
import bpy
from car_hifi import (Pchip, FTrack, TI, NT, G, ug, lerp, sstep, frame, knife, recess, offset_poly, inside, Acc,
                      loft_acc, tube, disc, acc_mesh, proj_patch, to2d)


def P(keys):
    """Pchip from (z, value) pairs."""
    return Pchip([k[0] for k in keys], [k[1] for k in keys])


def const(v):
    return lambda z: v


class Design:
    level = 2
    nose_f = (0.3, 0.55, 0.75, 0.9, 1.0)
    tail_f = (0.3, 0.55, 0.75, 0.9, 1.0)
    pillar_kind = 'paint'
    roof_kind = 'paint'

    def __init__(self, c, K):
        self.c, self.K = c, K
        d = self.d = c['dims']
        self.h = d['half']
        self.gnd = d['wcY'] - d['r']
        self.zF, self.zR = d['zF'], d['zR']
        self.fa, self.ra = d['a'], -d['b']
        self.cid = c['id']
        self.ph = c['ph']

    # ---- geometry hooks
    def adjust(self, cage):
        pass

    def arch_xin(self):
        return self.ph['track'] / 2 - self.d['r'] * 0.66 / 2 - 0.09

    def arch(self, ax):
        return self.d['archR'], ax, self.d['wcY']

    def prisms(self):
        return []

    def kind(self, p):
        from car_hifi import KIND
        if p == 'pillars':
            return self.pillar_kind
        if p == 'roof':
            return self.roof_kind
        return KIND.get(p, 'paint')

    def S(self, tag):
        return self.cage.S(tag)

    # ---- shared detail helpers -------------------------------------------------------
    def obj(self, name, acc, kind, angle=40, uv=False, flat=False):
        return acc_mesh(self.cid + '__' + name, acc, self.K.MATS[kind], angle, uv, flat)

    def uv_const(self, ob, uv):
        me = ob.data
        uvl = me.uv_layers.new(name='UVMap')
        for li in range(len(me.loops)):
            uvl.data[li].uv = uv
        return ob

    def mirrors(self, surf, z, y, out=0.13, kind='paint', stalk=0.025, size=(0.2, 0.1, 0.075)):
        """Door mirrors on a stalk: housing (paint/trim), glass, stalk."""
        housing, glass, st = Acc(), Acc(), Acc()
        sx, sy, sz = size
        for sgn in (1, -1):
            p, n = surf.side(z, y, sgn)
            if p is None:
                continue
            base = p - n * 0.01
            c = np.array([sgn * (abs(p[0]) + out), y + 0.06, z - 0.05])
            # teardrop housing: lofted rings, pointed forward
            rings = []
            for k, (t, sc) in enumerate(((0.0, 0.25), (0.25, 0.85), (0.55, 1.0), (0.8, 0.93), (1.0, 0.8))):
                zz = c[2] + sz * 0.6 - t * sz * 1.2
                ring = []
                for j in range(14):
                    a = 2 * math.pi * j / 14
                    ring.append((c[0] + math.cos(a) * sx / 2 * sc, c[1] + math.sin(a) * sy / 2 * sc, zz))
                rings.append(ring)
            loft_acc(housing, rings, True, True, False)
            # glass on the rear face
            zz = c[2] - sz * 0.6 - 0.002
            ring = [(c[0] + math.cos(2 * math.pi * j / 14) * sx / 2 * 0.72, c[1] + math.sin(2 * math.pi * j / 14) * sy / 2 * 0.68, zz) for j in range(14)]
            o = len(glass.v)
            glass.v += ring + [(c[0], c[1], zz)]
            for j in range(14):
                glass.f.append((o + (j + 1) % 14, o + j, o + 14))
            # stalk: swept from the door to the housing
            a0 = base + np.array([0, 0, 0.02])
            a1 = np.array([c[0] - sgn * sx * 0.3, c[1] - 0.02, c[2] + 0.0])
            mid = (a0 + a1) / 2 + np.array([0, 0.03, 0.02])
            tube(st, [a0, mid, a1], [(stalk * math.cos(2 * math.pi * k / 8), stalk * 0.45 * math.sin(2 * math.pi * k / 8)) for k in range(8)], True, True, up=(0, 0, 1))
        return [self.obj('mirrors', housing, kind, 50), self.obj('mirrorGlass', glass, 'mirror'), self.obj('mirrorStalks', st, 'trim', 50)]

    def interior(self, surf):
        """Reuse the shared cockpit (dash, gauges, seats, cabin shell, steering, anchors)."""
        K = self.K
        pr = K.Profile(self.c)
        L = pr.L
        u = lambda z: (z - self.zR) / L
        pr.ws = u(self.z_ws)
        pr.roofF = u(self.z_header)
        pr.roofR = u(self.z_roofR)
        pr.ghBase = u(self.z_bulk)
        pr.yBelt = self.y_dash
        pr.roof = self.y_roof_in
        pr.tum = self.tum_in
        cab = self.cab_half

        def width(z, _c=cab):
            return _c(z) + 0.06
        pr.width = width
        pr.deck = lambda uu: self.deck_y(pr.uz(uu))
        objs = K.build_interior(pr, self.cid, None)
        return objs


class Tabled(Design):
    """Tracks from a key table: ZK = z keys; X[name] = x fractions of half width, Y[name] = y;
    NOSE / TAIL[name] = (dz from the end, y_tip, roundness)."""
    ZK, X, Y, NOSE, TAIL = (), {}, {}, {}, {}

    def tracks(self):
        h = self.h
        out = {}
        for n in ('K', 'F', 'R', 'S', 'M', 'X', 'H', 'D', 'B', 'P1', 'P2', 'Q', 'C'):
            xs = self.X.get(n, [0.0] * len(self.ZK))
            ys = self.Y[n]
            fx = P([(z, x * h) for z, x in zip(self.ZK, xs)])
            fy = P(list(zip(self.ZK, ys)))
            nf, nr = self.NOSE[n], self.TAIL[n]
            out[n] = FTrack(fx, fy, (self.zF - nf[0],) + tuple(nf[1:]), (self.zR + nr[0],) + tuple(nr[1:]), self.zf0, self.zr0)
        return out


class MidEngine(Tabled):
    """Shared layout for mid-engined cars: cab-forward greenhouse, front lid, engine cover,
    capped nose and tail with crisp edges."""
    sill_black = True
    front_bumper_y = 0.10
    rear_bumper_y = 0.25

    def mid(self):
        return self.MID

    def adjust(self, cage):
        cage.cap_bulge = {1: self.cap_front, 0: self.cap_rear}

    def creases(self, cage):
        ns = len(cage.st)
        t = TI
        cw, wr = self.S('cowl'), self.S('winR')
        cr = [('t', t['R'], 0, ns - 1, 0.7), ('t', t['H'], 0, ns - 1, self.crease_H), ('t', t['B'], 0, ns - 1, 0.6),
              ('t', t['P1'], wr - 3, cw, 0.7), ('t', t['P2'], wr - 3, cw, 0.7), ('t', t['D'], 0, ns - 1, self.crease_D),
              ('r', ns - 1, 1, NT - 1, self.crease_nose), ('r', 0, 1, NT - 1, self.crease_tail)]
        return cr + self.extra_creases(cage)

    def extra_creases(self, cage):
        return []

    def classify(self, s, t, p, n):
        S = self.S
        side = 'L' if p[0] > 0 else 'R'
        ns = len(self.cage.st)
        if s > ns - 1:   # nose cap
            return 'under' if t < 1 else ('bumperF' if p[1] < self.front_bumper_y else 'fascia')
        if s < 0:
            return 'under' if t < 1 else ('bumperR' if p[1] < self.rear_bumper_y else 'rearPanel')
        nose0 = S('nose0') + 1
        tail0 = len(self.tail_f)
        if t < 2:
            return 'under'
        if t < 3 and self.sill_black and tail0 <= s < nose0:
            return 'blackout'
        if t < 8:
            if s >= nose0:
                return 'bumperF' if t < 5 else 'fascia'
            if s < tail0:
                return 'bumperR' if t < 5 else 'rearPanel'
            if s >= S('doorF'):
                return 'fenderF' + side
            if s >= S('doorR') and t >= 3:
                return 'door' + side
            return 'quarter' + side
        if s >= S('cowl'):
            return 'hood'
        if s < S('winR') - 1:
            return 'trunk'
        if t >= 10:
            return 'glass' if s >= S('header') else 'roof'
        if t >= 9:
            return 'pillars'
        return 'glass' if s >= S('winR') else 'pillars'

    # ---- detail helpers shared by the mid-engined cars
    def lamp_cut(self, B, bvh, target, dv, poly, depth=0.025, ref=(1.0, 0, 0)):
        dv = np.array(dv, float) / np.linalg.norm(dv)
        fr = local_frame(bvh, np.array(target, float) - dv * 2.0, dv, ref)
        frm = mirror_frame(fr)
        cut_recess(B, poly, fr, depth, 'lamps', 'lamps', along=True)
        cut_recess(B, mirror_poly(poly), frm, depth, 'lamps', 'lamps', along=True)
        return fr, frm

    def intake_cut(self, B, poly, axis, depth, filt, part='intakes', wall='blackout', mirror=True):
        fr = frame(axis)
        f1 = knife(B.bm, poly, fr, filt)
        fl, wl = recess(B.bm, f1, depth, fr[3])
        B.set(fl, part, 0); B.set(wl, wall, 0)
        if mirror:
            ax2 = {'L': 'R', 'R': 'L'}.get(axis, axis)
            fr2 = frame(ax2)
            poly2 = poly if ax2 != axis else mirror_poly(poly)
            filt2 = (lambda q, _f=filt: _f(q * np.array([-1.0, 1, 1])))
            f2 = knife(B.bm, poly2, fr2, filt2)
            fl, wl = recess(B.bm, f2, depth, fr2[3])
            B.set(fl, part, 0); B.set(wl, wall, 0)

    def emissive(self, name, acc, kind, uv):
        ob = self.obj(name, acc, kind, 60)
        return self.uv_const(ob, uv)


class Toro(MidEngine):
    """V10 supercar (Huracan-like): one arc from nose to tail, slim angular lamps with a
    Y running light, a big triangular side intake, black tail with slim Y lamps."""
    crease_H, crease_D, crease_nose, crease_tail = 0.95, 0.35, 0.75, 0.9
    cap_front, cap_rear = 0.07, 0.025

    def __init__(self, c, K):
        super().__init__(c, K)
        zF, zR, fa, ra = self.zF, self.zR, self.fa, self.ra
        self.zf0, self.zr0 = zF - 0.55, zR + 0.55
        self.z_cowl, self.z_header, self.z_roofR = fa - 0.39, fa - 1.27, -0.45
        self.z_ws = self.z_cowl - 0.1
        self.z_bulk = -0.55
        self.ZK = [self.zr0, ra, -0.75, -0.45, -0.05, self.z_header, 0.65, self.z_cowl, fa, self.zf0]
        self.X = {
            'F': [.74, .74, .74, .74, .74, .74, .74, .74, .72, .70],
            'R': [.93, .94, .92, .91, .91, .91, .91, .91, .93, .92],
            'S': [.97, .98, .93, .915, .915, .915, .915, .93, .97, .96],
            'M': [1.0, 1.0, .93, .905, .905, .905, .905, .93, .985, .97],
            'X': [1.0, 1.0, .975, .94, .94, .94, .94, .95, .995, .98],
            'H': [1.0, 1.0, .985, .955, .95, .95, .95, .96, .99, .975],
            'D': [.93, .95, .93, .90, .885, .885, .89, .91, .94, .93],
            'B': [.76, .78, .79, .80, .80, .80, .80, .80, .81, .80],
            'P1': [.66, .66, .67, .70, .70, .68, .72, .76, .74, .73],
            'P2': [.60, .60, .61, .64, .64, .61, .66, .71, .68, .67],
            'Q': [.32, .32, .33, .34, .34, .34, .36, .38, .37, .37],
        }
        self.Y = {
            'K': [-.27, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31],
            'F': [-.26, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.30],
            'R': [-.22, -.29, -.29, -.29, -.29, -.29, -.29, -.29, -.29, -.28],
            'S': [-.10, -.12, -.20, -.21, -.21, -.21, -.21, -.20, -.16, -.17],
            'M': [.05, .04, -.05, -.08, -.08, -.08, -.08, -.06, -.02, -.04],
            'X': [.22, .22, .14, .07, .06, .06, .06, .07, .12, .10],
            'H': [.37, .37, .31, .245, .225, .215, .21, .21, .25, .21],
            'D': [.52, .53, .48, .43, .42, .42, .41, .38, .37, .31],
            'B': [.565, .58, .565, .50, .47, .465, .46, .375, .31, .25],
            'P1': [.575, .60, .615, .66, .70, .70, .57, .385, .30, .245],
            'P2': [.58, .615, .64, .70, .725, .72, .58, .385, .30, .24],
            'Q': [.585, .625, .675, .735, .745, .73, .59, .38, .30, .235],
            'C': [.59, .63, .69, .745, .75, .735, .595, .38, .30, .235],
        }
        self.NOSE = {'K': (.30, -.30, 2.5, .6), 'F': (.19, -.295, 2.5, .6), 'R': (.10, -.285, 2.5, .62), 'S': (.08, -.22, 2.5, .62),
                     'M': (.085, -.06, 2.5, .6), 'X': (.11, .07, 2.5, .58), 'H': (.15, .15, 2.5, .55), 'D': (.18, .205, 2.5, .55),
                     'B': (.20, .225, 2.5, .55), 'P1': (.205, .23, 2.5, .55), 'P2': (.21, .232, 2.5, .55), 'Q': (.215, .234, 2.5, .55),
                     'C': (.22, .235, 2.5, 0)}
        self.TAIL = {'K': (.35, -.22, 3, .7), 'F': (.22, -.20, 3, .7), 'R': (.10, -.15, 3, .72), 'S': (.05, -.06, 3, .78),
                     'M': (.035, .06, 3, .8), 'X': (.03, .20, 3, .8), 'H': (.03, .33, 3, .8), 'D': (.035, .45, 3, .78),
                     'B': (.04, .53, 3, .74), 'P1': (.042, .54, 3, .7), 'P2': (.044, .545, 3, .7), 'Q': (.046, .55, 3, .7),
                     'C': (.048, .55, 3, 0)}
        self.MID = [(self.zr0, None), (-1.45, None), (-1.3, None), (ra, 'ra'), (-0.95, None), (-0.75, None), (-0.6, None),
                    (-0.45, 'winR'), (-0.30, 'doorR'), (-0.05, None), (self.z_header, 'header'), (0.42, None), (0.65, None),
                    (0.88, None), (self.z_cowl, 'cowl'), (self.z_cowl + 0.07, 'doorF'), (1.3, None), (fa, 'fa'), (1.65, None),
                    (self.zf0, 'nose0')]
        self.y_dash = 0.30
        self.y_roof_in = self.d['roof'] - 0.06
        self.tum_in = 0.75
        fB = P([(z, x * self.h) for z, x in zip(self.ZK, self.X['B'])])
        self.cab_half = lambda z: fB(z) - 0.06
        self.deck_y = P(list(zip(self.ZK, self.Y['C'])))

    def cuts(self, B):
        zF, zR, h = self.zF, self.zR, self.h
        bvh = bvh_of(B)
        # slim angular headlamps on the nose corners
        lamp = rounded([(-0.20, 0.012), (-0.16, 0.05), (0.13, 0.03), (0.215, -0.012), (0.20, -0.05), (-0.09, -0.028)], 0.012)
        self.head_fr = self.lamp_cut(B, bvh, (0.60, 0.25, zF - 0.28), (0, -1, -0.4), lamp, 0.03)
        # front intakes: big corner ducts and a centre duct
        corner = rounded([(0.30, -0.24), (0.86, -0.26), (0.88, -0.02), (0.74, 0.06), (0.42, 0.04), (0.26, -0.12)], 0.02)
        self.intake_cut(B, corner, 'F', 0.09, lambda q: q[2] > zF - 0.4 and q[1] < 0.12)
        centre = rounded([(-0.2, -0.22), (0.2, -0.22), (0.17, -0.1), (-0.17, -0.1)], 0.015)
        self.intake_cut(B, centre, 'F', 0.07, lambda q: q[2] > zF - 0.4 and q[1] < 0.12, mirror=False)
        # side intake ahead of the rear wheel, under the shoulder crease
        side = rounded([(-0.31, 0.20), (-0.68, 0.30), (-0.71, -0.08), (-0.56, -0.13)], 0.02)
        self.intake_cut(B, side, 'L', 0.13, lambda q: q[0] > 0.5 and -0.85 < q[2] < -0.2)
        # rear: black grille band and tail lamps
        grille = rounded([(-0.86, -0.12), (0.86, -0.12), (0.88, 0.34), (-0.88, 0.34)], 0.03)
        self.intake_cut(B, grille, 'B', 0.05, lambda q: q[2] < zR + 0.3 and -0.2 < q[1] < 0.4, mirror=False)
        tl = rounded([(0.36, 0.415), (0.86, 0.43), (0.88, 0.48), (0.42, 0.47)], 0.01)
        fr = frame('B')
        self.tail_fr = fr
        for poly in (tl, mirror_poly(tl)):
            f1 = knife(B.bm, poly, fr, lambda q: q[2] < zR + 0.3 and q[1] > 0.36)
            fl, wl = recess(B.bm, f1, 0.012, fr[3])
            B.set(fl, 'lamps', 0); B.set(wl, 'lamps', 0)
        # engine cover vent panel
        vent = rounded([(-0.42, -1.65), (0.42, -1.65), (0.40, -0.72), (-0.40, -0.72)], 0.03)
        self.vent_poly = vent
        f1 = knife(B.bm, vent, frame('T'), lambda q: q[1] > 0.5 and -1.8 < q[2] < -0.6)
        fl, wl = recess(B.bm, f1, 0.02, frame('T')[3])
        B.set(fl, 'intakes', 0); B.set(wl, 'blackout', 0)

    def details(self, surf):
        zF, zR, h = self.zF, self.zR, self.h
        objs = []
        # headlamp internals: Y running light + twin projector lenses
        LL, LR = Acc(), Acc()
        lens = {'lightL': Acc(), 'lightR': Acc()}
        for fr, acc, sgn in ((self.head_fr[0], LL, 1), (self.head_fr[1], LR, -1)):
            m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
            strip(acc, surf, m([(-0.17, 0.035), (0.13, 0.017)]), fr, 0.009, 0.004)
            strip(acc, surf, m([(-0.04, 0.026), (0.06, -0.01), (0.19, -0.03)]), fr, 0.009, 0.004)
            for (u, v) in ((-0.07, -0.004), (0.02, -0.012)):
                pts = [(u * sgn + math.cos(a) * 0.02, v + math.sin(a) * 0.017) for a in np.linspace(0, 2 * math.pi, 14, endpoint=False)]
                proj_patch(acc, surf, pts, fr, 0.006, fill=False)
        objs.append(self.emissive('lightL', LL, 'headlight', (0.5, 0.09)))
        objs.append(self.emissive('lightR', LR, 'headlight', (0.5, 0.09)))
        # tail lamps: Y shaped light bars
        T = Acc()
        fr = self.tail_fr
        for sgn in (1, -1):
            m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
            strip(T, surf, m([(0.40, 0.452), (0.85, 0.462)]), fr, 0.012, 0.004)
            strip(T, surf, m([(0.52, 0.452), (0.62, 0.427), (0.84, 0.437)]), fr, 0.008, 0.004)
        objs.append(self.emissive('tail', T, 'taillight', (0.5, 0.19)))
        # engine cover slats
        V = Acc()
        frT = frame('T')
        for k in range(7):
            z = lerp(-1.58, -0.8, k / 6)
            strip(V, surf, [(-0.38, z), (0.38, z)], frT, 0.035, 0.012)
        objs.append(self.obj('vents', V, 'trim', 50))
        # exhausts: twin round pipes low in the grille
        E, Ei = Acc(), Acc()
        for sgn in (1, -1):
            c = np.array([sgn * 0.5, -0.05, zR + 0.06])
            p, n = surf.hit(c + np.array([0, 0, -1.0]), (0, 0, 1))
            zz = (p[2] if p is not None else zR + 0.05)
            prof = [(math.cos(a) * 0.055, math.sin(a) * 0.05) for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)]
            ring_o = [(c[0] + x, c[1] + y, zz - 0.012) for x, y in prof]
            ring_i = [(c[0] + x * 0.8, c[1] + y * 0.8, zz - 0.012) for x, y in prof]
            ring_b = [(c[0] + x * 0.8, c[1] + y * 0.8, zz + 0.15) for x, y in prof]
            ring_ob = [(c[0] + x, c[1] + y, zz + 0.06) for x, y in prof]
            loft_acc(E, [ring_ob, ring_o, ring_i, ring_b], True)
            o = len(Ei.v)
            Ei.v += ring_b
            Ei.f.append(tuple(o + k for k in range(len(ring_b))))
        objs.append(self.obj('exhaust', E, 'chrome', 60))
        objs.append(self.obj('exhaustIn', Ei, 'under', 60))
        # diffuser fins
        F = Acc()
        for x in (-0.36, -0.12, 0.12, 0.36):
            pts = [(x - 0.004, -0.30, zR + 0.55), (x - 0.004, -0.17, zR + 0.06), (x - 0.004, -0.30, zR + 0.06)]
            pts2 = [(p[0] + 0.008, p[1], p[2]) for p in pts]
            F.add(pts + pts2, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)])
        objs.append(self.obj('diffuser', F, 'trim', 30))
        objs += self.mirrors(surf, self.z_cowl - 0.12, 0.47, 0.12, 'paint')
        return objs



DESIGNS = {'toro': Toro}


# ---------------------------------------------------------------------------------- cut helpers
from mathutils.bvhtree import BVHTree


def bvh_of(B):
    B.bm.normal_update()
    return BVHTree.FromBMesh(B.bm)


def hit(bvh, o, dv):
    loc, nor, idx, dist = bvh.ray_cast(G(o), G(dv).normalized(), 10.0)
    if loc is None:
        return None, None
    return ug(loc), ug(nor)


def local_frame(bvh, o, dv, ref=(1.0, 0, 0)):
    """Frame on the body surface hit by the ray o + t*dv; dir = into the surface (-normal)."""
    p, n = hit(bvh, o, dv)
    if p is None:
        raise RuntimeError('frame ray missed the body at %s' % (o,))
    dirv = -n / np.linalg.norm(n)
    ref = np.array(ref, float)
    e1 = ref - dirv * (ref @ dirv)
    if np.linalg.norm(e1) < 0.2:
        ref = np.array([0, 0, 1.0])
        e1 = ref - dirv * (ref @ dirv)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(dirv, e1)
    if e2[1] < 0 or (abs(e2[1]) < 0.3 and e2[2] < 0):
        e2 = -e2
    return (p, e1, e2, dirv)


def near(O, r):
    O = np.array(O, float)
    return lambda q: np.linalg.norm(q - O) < r


def cut_recess(B, poly, fr, depth, floor_part, wall_part, radius=None, along=True):
    rad = radius or (max(math.hypot(u, v) for u, v in poly) + 0.08)
    inside_f = knife(B.bm, poly, fr, near(fr[0], rad))
    floor, walls = recess(B.bm, inside_f, depth, fr[3] if along else None)
    B.set(floor, floor_part, 0)
    B.set(walls, wall_part, 0)
    return floor


def cut_tag(B, poly, fr, part, radius=None, skin=None):
    rad = radius or (max(math.hypot(u, v) for u, v in poly) + 0.08)
    inside_f = knife(B.bm, poly, fr, near(fr[0], rad))
    B.set(inside_f, part, skin)
    return inside_f


def mirror_poly(poly):
    return [(-u, v) for (u, v) in reversed(poly)]


def mirror_frame(fr):
    O, e1, e2, dv = fr
    M = np.array([-1.0, 1, 1])
    return (O * M, e1 * M, e2 * M, dv * M)


def rounded(poly, r=0.01, n=3):
    """Round the corners of a polygon (simple corner cutting)."""
    P = [np.array(p, float) for p in poly]
    out = []
    m = len(P)
    for k in range(m):
        a, b, c = P[k - 1], P[k], P[(k + 1) % m]
        da = a - b; dc = c - b
        la, lc = np.linalg.norm(da), np.linalg.norm(dc)
        rr = min(r, la * 0.45, lc * 0.45)
        p0 = b + da / la * rr
        p1 = b + dc / lc * rr
        for t in np.linspace(0, 1, n):
            out.append(tuple((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1))
    return out


def resample(path, step=0.015):
    pts = [np.array(p, float) for p in path]
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    return out


def strip(acc, surf, path2d, fr, width, off, w1=None, prof=None):
    """Band along a 2D polyline (frame coords) projected onto the body, lifted `off`.
    prof: optional cross profile [(across -1..1, height)] for raised slats."""
    O, e1, e2, dv = fr
    pts = resample(path2d)
    prof = prof or [(-1, 0.0), (1, 0.0)]
    rings = []
    for k, p in enumerate(pts):
        t = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
        t /= (np.linalg.norm(t) + 1e-9)
        nrm = np.array([-t[1], t[0]])
        w = lerp(width, w1 if w1 is not None else width, k / max(1, len(pts) - 1))
        ring = []
        for (a, hgt) in prof:
            q = p + nrm * a * w / 2
            o = O + e1 * q[0] + e2 * q[1] - dv * 4.0
            h, nn = surf.hit(o, dv, 9.0)
            if h is None:
                return False
            ring.append(h + nn * (off + hgt))
        rings.append(ring)
    o0 = len(acc.v)
    loft_acc(acc, rings, closed=False)
    # orient towards the viewer
    f = acc.f[o0 and -1]
    a, b, c = (np.array(acc.v[i]) for i in acc.f[-1][:3])
    if np.cross(b - a, c - a) @ (-dv) < 0:
        n_new = (len(rings) - 1) * (len(prof) - 1)
        for k in range(len(acc.f) - n_new, len(acc.f)):
            acc.f[k] = tuple(reversed(acc.f[k]))
    return True
