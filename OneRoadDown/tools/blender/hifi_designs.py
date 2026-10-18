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
    arch_clear = 0.045

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
        return self.ph['track'] / 2 - self.d['r'] * 0.66 / 2 - 0.03

    def arch(self, ax):
        return self.d['archR'], ax, self.d['wcY']

    def prisms(self):
        return []

    def S(self, tag):
        return self.cage.S(tag)

    # ---- data-driven cuts / details ---------------------------------------------------
    LAMPS, INTAKES, TAILS, GROOVES, VENTS, EXHAUSTS, FINS, MIRROR, WING = (), (), (), (), (), (), None, None, None

    def specs(self):
        pass

    def kind(self, p):
        from car_hifi import KIND
        if p == 'headlamps':
            return 'chrome'
        if p == 'pillars':
            return self.pillar_kind
        if p == 'roof':
            return self.roof_kind
        return KIND.get(p, 'paint')

    def cuts(self, B):
        self.specs()
        bvh = bvh_of(B)
        self.lamp_frames = []
        for L in self.LAMPS:
            self.lamp_frames.append(self.lamp_cut(B, bvh, L['target'], L['dv'], L['poly'], L.get('depth', 0.03), L.get('ref', (1.0, 0, 0)), L.get('part', 'headlamps')))
        for I in self.INTAKES:
            self.intake_cut(B, I['poly'], I['axis'], I['depth'], I['filt'], I.get('part', 'intakes'), I.get('wall', 'blackout'), I.get('mirror', True))
        self.tail_frames = []
        for T in self.TAILS:
            if 'target' in T:
                fr = local_frame(bvh, np.array(T['target'], float) - np.array(T['dv'], float) * 2.0, T['dv'], T.get('ref', (1.0, 0, 0)))
                frs = [(fr, T['poly']), (mirror_frame(fr), mirror_poly(T['poly']))]
            else:
                fr = frame(T.get('axis', 'B'))
                frs = [(fr, T['poly'])] + ([(fr, mirror_poly(T['poly']))] if T.get('mirror', True) else [])
            self.tail_frames.append(frs)
            for (f_, poly) in frs:
                fl_ = T['filt'] if f_[0][0] >= 0 or 'target' not in T else (lambda q, _f=T['filt']: _f(q * np.array([-1.0, 1, 1])))
                if 'target' in T:
                    fl_ = near(f_[0], max(math.hypot(u, v) for u, v in poly) + 0.08)
                f1 = knife(B.bm, poly, f_, fl_)
                fl, wl = recess(B.bm, f1, T.get('depth', 0.012), f_[3])
                B.set(fl, 'lamps', 0); B.set(wl, 'lamps', 0)
        for V in self.VENTS:
            fr = frame(V.get('axis', 'T'))
            f1 = knife(B.bm, V['poly'], fr, V['filt'])
            fl, wl = recess(B.bm, f1, V.get('depth', 0.02), fr[3])
            B.set(fl, V.get('part', 'intakes'), 0); B.set(wl, 'blackout', 0)
            if V.get('mirror'):
                fr2 = frame({'L': 'R'}.get(V.get('axis', 'T'), 'T'))
                f1 = knife(B.bm, V['poly'], fr2, lambda q, _f=V['filt']: _f(q * np.array([-1.0, 1, 1])))
                fl, wl = recess(B.bm, f1, V.get('depth', 0.02), fr2[3])
                B.set(fl, V.get('part', 'intakes'), 0); B.set(wl, 'blackout', 0)
        for Gr in self.GROOVES:
            self.groove(B, Gr['path'], Gr['axis'], Gr['filt'], Gr.get('width', 0.006), Gr.get('depth', 0.004), Gr.get('mirror', True))
        self.extra_cuts(B)

    def extra_cuts(self, B):
        pass

    def details(self, surf):
        objs = []
        LL, LR = Acc(), Acc()
        for L, (fl, fr_) in zip(self.LAMPS, self.lamp_frames):
            for fr, acc, sgn in ((fl, LL, 1), (fr_, LR, -1)):
                m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
                for path, w in L.get('drl', ()):
                    strip(acc, surf, m(path), fr, w, 0.004)
                for (u, v, rx, ry) in L.get('lens', ()):
                    pts = [(u * sgn + math.cos(a) * rx, v + math.sin(a) * ry) for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)]
                    proj_patch(acc, surf, pts, fr, 0.006, fill=False)
        if not LL.empty():
            objs.append(self.emissive('lightL', LL, 'headlight', (0.5, 0.09)))
            objs.append(self.emissive('lightR', LR, 'headlight', (0.5, 0.09)))
        T = Acc()
        for spec, frs in zip(self.TAILS, self.tail_frames):
            for k, (fr, poly) in enumerate(frs):
                sgn = 1 if k == 0 else -1
                m = (lambda path: path) if sgn > 0 else (lambda path: [(-u, v) for u, v in path])
                for path, w in spec.get('strips', ()):
                    strip(T, surf, m(path), fr, w, 0.004)
                if spec.get('fill'):
                    proj_patch(T, surf, offset_poly(poly, -0.006), fr, 0.003)
        if not T.empty():
            objs.append(self.emissive('tail', T, 'taillight', (0.5, 0.19)))
        Vt = Acc()
        for V in self.VENTS:
            fr = frame(V.get('axis', 'T'))
            for path, w in V.get('slats', ()):
                strip(Vt, surf, path, fr, w, 0.012)
                if V.get('mirror'):
                    strip(Vt, surf, path, frame({'L': 'R'}.get(V.get('axis', 'T'), 'T')), w, 0.012)
        if not Vt.empty():
            objs.append(self.obj('vents', Vt, V.get('slat_kind', 'trim') if self.VENTS else 'trim', 50))
        if self.EXHAUSTS:
            objs += self.exhausts(surf)
        if self.FINS:
            objs.append(self.fins())
        if self.WING:
            objs += self.wing(surf)
        if self.MIRROR:
            M = self.MIRROR
            objs += self.mirrors(surf, M['z'], M['y'], M['out'], M.get('kind', 'paint'))
        objs += self.extra_details(surf)
        return objs

    def extra_details(self, surf):
        return []

    def exhausts(self, surf):
        E, Ei = Acc(), Acc()
        for X in self.EXHAUSTS:
            for sgn in ((1, -1) if X['x'] > 0.01 else (1,)):
                c = np.array([sgn * X['x'], X['y'], self.zR])
                p, n = surf.hit(c + np.array([0, 0, -1.0]), (0, 0, 1))
                zz = (p[2] if p is not None else self.zR + 0.05)
                nseg = {'round': 20, 'hex': 6, 'oval': 20, 'trap': 4}[X.get('shape', 'round')]
                rot = math.pi / 6 if nseg == 6 else (math.pi / 4 if nseg == 4 else 0)
                prof = []
                for a in np.linspace(0, 2 * math.pi, nseg, endpoint=False):
                    q = (math.cos(a + rot) * X['rx'], math.sin(a + rot) * X['ry'])
                    prof.append(q)
                if nseg == 4:
                    prof = [(X['rx'], X['ry']), (-X['rx'], X['ry']), (-X['rx'] * 0.9, -X['ry']), (X['rx'] * 0.9, -X['ry'])]
                out = X.get('out', 0.012)
                ring_ob = [(c[0] + x, c[1] + y, zz + 0.08) for x, y in prof]
                ring_o = [(c[0] + x, c[1] + y, zz - out) for x, y in prof]
                ring_i = [(c[0] + x * 0.82, c[1] + y * 0.82, zz - out) for x, y in prof]
                ring_b = [(c[0] + x * 0.82, c[1] + y * 0.82, zz + 0.15) for x, y in prof]
                loft_acc(E, [ring_ob, ring_o, ring_i, ring_b], True)
                o = len(Ei.v)
                Ei.v += ring_b
                Ei.f.append(tuple(o + k for k in range(len(ring_b))))
        return [self.obj('exhaust', E, 'chrome', 50), self.obj('exhaustIn', Ei, 'under', 60)]

    def fins(self):
        F = self.FINS
        A = Acc()
        zR = self.zR
        y0 = self.d['bottom'] + 0.01
        for x in F['xs']:
            pts = [(x - 0.004, y0, F['z1']), (x - 0.004, F['y_top'], zR + F.get('z0', 0.06)), (x - 0.004, y0, zR + F.get('z0', 0.06))]
            pts2 = [(p[0] + 0.008, p[1], p[2]) for p in pts]
            A.add(pts + pts2, [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)])
        return self.obj('diffuser', A, 'trim', 30)

    def wing(self, surf):
        return []

    # ---- shared detail helpers -------------------------------------------------------
    def obj(self, name, acc, kind, angle=40, uv=False, flat=False):
        return acc_mesh(self.cid + '__' + name, acc, self.K.MATS[kind], angle, uv, flat)

    def uv_const(self, ob, uv):
        me = ob.data
        uvl = me.uv_layers.new(name='UVMap')
        for li in range(len(me.loops)):
            uvl.data[li].uv = uv
        return ob

    def mirrors(self, surf, z, y, out=0.11, kind='paint', stalk=0.018, size=(0.17, 0.085, 0.07)):
        """Door mirrors on a stalk: housing (paint/trim), glass, stalk."""
        housing, glass, st = Acc(), Acc(), Acc()
        sx, sy, sz = size
        for sgn in (1, -1):
            p, n = surf.side(z, y, sgn)
            if p is None:
                continue
            base = p - n * 0.01
            c = np.array([sgn * (abs(p[0]) + out), y + 0.045, z - 0.08])
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
        pr.half = min(cab(self.z_ws + dz) for dz in (0.06, -0.12, -0.3, -0.5)) + 0.04
        pr.deck = lambda uu: self.deck_y(pr.uz(uu))
        objs = K.build_interior(pr, self.cid, None)
        return objs


    # ---- detail helpers shared by the mid-engined cars
    def lamp_cut(self, B, bvh, target, dv, poly, depth=0.025, ref=(1.0, 0, 0), part='headlamps'):
        dv = np.array(dv, float) / np.linalg.norm(dv)
        fr = local_frame(bvh, np.array(target, float) - dv * 2.0, dv, ref)
        frm = mirror_frame(fr)
        cut_recess(B, poly, fr, depth, part, 'lamps', along=True)
        cut_recess(B, mirror_poly(poly), frm, depth, part, 'lamps', along=True)
        return fr, frm

    def groove(self, B, path, axis, filt, width=0.006, depth=0.004, mirror=True, closed=False):
        """Panel shut line: a narrow dark groove along a 2D path (frame coords)."""
        skip = ('glass', 'intakes', 'blackout', 'lamps', 'headlamps', 'wells', 'under')
        for ax in ((axis, {'L': 'R', 'R': 'L'}.get(axis, axis)) if mirror else (axis,)):
            fr = frame(ax)
            pts = [np.array(p, float) for p in (path + [path[0]] if closed else path)]
            if ax != axis and ax in ('F', 'B', 'T'):
                pts = [np.array((-p[0], p[1])) for p in pts]
            fl = filt if ax == axis else (lambda q, _f=filt: _f(q * np.array([-1.0, 1, 1])))
            pts = resample(pts, 0.025)
            left, right = [], []
            for k, p in enumerate(pts):
                t = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
                t /= (np.linalg.norm(t) + 1e-9)
                nn = np.array([-t[1], t[0]]) * width / 2
                left.append(tuple(p + nn)); right.append(tuple(p - nn))
            band = [f for f in knife(B.bm, left + list(reversed(right)), fr, fl) if B.part(f) not in skip]
            flr, wl = recess(B.bm, band, depth, None)
            B.set(flr, 'seals', 0); B.set(wl, 'seals', 0)

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


class ArchGuard:
    """Keeps a track above the wheel-arch cut wherever it lies over the tyre (no holes)."""

    def __init__(self, tr, D):
        self.tr, self.D = tr, D
        self.z0, self.z1 = tr.z0, tr.z1

    def at(self, z):
        x, y, z = self.tr.at(z)
        D = self.D
        xin = D.arch_xin() - 0.04
        if x < xin:
            return (x, y, z)
        top = -9.0
        for ax in (D.fa, D.ra):
            R, cz, cy = D.arch(ax)
            dz = abs(z - cz)
            if dz < R + 0.02:
                top = max(top, cy + math.sqrt(max(0.0, (R + 0.02) ** 2 - dz * dz)) + D.arch_clear)
        if top > y - 0.04:
            k = 0.03
            hgt = 0.5 + 0.5 * (top - y) / k if k else 1
            hgt = min(1.0, max(0.0, hgt))
            y = (1 - hgt) * y + hgt * top + k * hgt * (1 - hgt) * 0.5 if top > y - k else y
            y = max(y, top)
        return (x, y, z)


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
            out[n] = ArchGuard(FTrack(fx, fy, (self.zF - nf[0],) + tuple(nf[1:]), (self.zR + nr[0],) + tuple(nr[1:]), self.zf0, self.zr0), self) \
                if n in ('H', 'D', 'B', 'P1', 'P2', 'Q') else FTrack(fx, fy, (self.zF - nf[0],) + tuple(nf[1:]), (self.zR + nr[0],) + tuple(nr[1:]), self.zf0, self.zr0)
        return out


class MidEngine(Tabled):
    """Shared layout for mid-engined cars: cab-forward greenhouse, front lid, engine cover,
    capped nose and tail with crisp edges."""
    sill_black = True
    front_bumper_y = 0.10
    rear_bumper_y = 0.25
    splitter_y = -0.25
    diffuser_y = -0.16

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
            if t < 1 or p[1] < self.splitter_y:
                return 'under'
            return 'bumperF' if p[1] < self.front_bumper_y else 'fascia'
        if s < 0:
            if t < 1 or p[1] < self.diffuser_y:
                return 'under'
            return 'bumperR' if p[1] < self.rear_bumper_y else 'rearPanel'
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
            'F': [.74, .74, .72, .72, .72, .72, .72, .72, .72, .70],
            'R': [.93, .94, .90, .89, .89, .89, .89, .89, .93, .92],
            'S': [.97, .98, .90, .885, .885, .885, .885, .90, .97, .96],
            'M': [1.0, 1.0, .89, .87, .87, .87, .87, .89, .99, .97],
            'X': [1.0, 1.0, .95, .915, .91, .91, .91, .93, 1.0, .98],
            'H': [.985, .995, .98, .955, .95, .95, .95, .96, .98, .965],
            'D': [.87, .89, .88, .86, .855, .855, .86, .87, .865, .86],
            'B': [.64, .66, .70, .76, .76, .76, .76, .74, .72, .72],
            'P1': [.55, .56, .58, .60, .60, .58, .64, .70, .66, .66],
            'P2': [.48, .49, .53, .55, .55, .53, .59, .66, .60, .60],
            'Q': [.26, .26, .28, .29, .29, .29, .32, .36, .33, .33],
        }
        self.Y = {
            'K': [-.27, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31],
            'F': [-.26, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.31, -.30],
            'R': [-.22, -.29, -.29, -.29, -.29, -.29, -.29, -.29, -.29, -.28],
            'S': [-.10, -.12, -.20, -.21, -.21, -.21, -.21, -.20, -.16, -.17],
            'M': [.05, .04, -.04, -.07, -.07, -.07, -.07, -.05, -.02, -.05],
            'X': [.20, .20, .15, .10, .09, .085, .08, .09, .10, .05],
            'H': [.33, .34, .31, .255, .235, .22, .215, .215, .23, .15],
            'D': [.45, .47, .46, .43, .42, .42, .415, .40, .395, .25],
            'B': [.50, .55, .58, .52, .48, .465, .46, .385, .35, .225],
            'P1': [.52, .575, .62, .675, .705, .70, .57, .39, .34, .205],
            'P2': [.53, .59, .645, .71, .728, .72, .58, .385, .32, .19],
            'Q': [.545, .605, .67, .737, .747, .73, .59, .375, .29, .175],
            'C': [.55, .61, .68, .743, .75, .735, .595, .37, .275, .17],
        }
        self.NOSE = {'K': (.30, -.30, 2.5, .6), 'F': (.19, -.295, 2.5, .6), 'R': (.10, -.285, 2.5, .62), 'S': (.08, -.22, 2.5, .62),
                     'M': (.085, -.08, 2.5, .6), 'X': (.10, .0, 2.5, .58), 'H': (.14, .06, 2.5, .55), 'D': (.17, .095, 2.5, .55),
                     'B': (.185, .105, 2.5, .55), 'P1': (.19, .107, 2.5, .55), 'P2': (.195, .109, 2.5, .55), 'Q': (.20, .11, 2.5, .55),
                     'C': (.205, .112, 2.5, 0)}
        self.TAIL = {'K': (.35, -.22, 3, .7), 'F': (.22, -.20, 3, .7), 'R': (.10, -.15, 3, .72), 'S': (.05, -.06, 3, .78),
                     'M': (.035, .06, 3, .8), 'X': (.03, .20, 3, .8), 'H': (.03, .32, 3, .8), 'D': (.035, .40, 3, .78),
                     'B': (.04, .46, 3, .72), 'P1': (.042, .47, 3, .7), 'P2': (.044, .475, 3, .7), 'Q': (.046, .48, 3, .7),
                     'C': (.048, .48, 3, 0)}
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

    def specs(self):
        zF, zR = self.zF, self.zR
        self.LAMPS = [dict(target=(0.60, 0.15, zF - 0.25), dv=(-0.15, -1, -0.6), depth=0.035,
                           poly=rounded([(-0.22, -0.045), (0.10, -0.03), (0.235, 0.035), (0.22, 0.075), (0.12, 0.04), (-0.18, 0.0)], 0.01),
                           drl=[([(-0.18, -0.02), (0.10, -0.002), (0.21, 0.055)], 0.01), ([(0.0, -0.01), (0.11, 0.035), (0.19, 0.068)], 0.009)],
                           lens=[(-0.11, -0.03, 0.02, 0.017), (-0.03, -0.022, 0.02, 0.017)])]
        fil = lambda q: q[2] > zF - 0.4 and q[1] < 0.12
        self.INTAKES = [dict(poly=rounded([(0.30, -0.24), (0.86, -0.26), (0.88, -0.02), (0.74, 0.06), (0.42, 0.04), (0.26, -0.12)], 0.02), axis='F', depth=0.09, filt=fil),
                        dict(poly=rounded([(-0.2, -0.22), (0.2, -0.22), (0.17, -0.1), (-0.17, -0.1)], 0.015), axis='F', depth=0.07, filt=fil, mirror=False),
                        dict(poly=rounded([(-0.31, 0.20), (-0.68, 0.30), (-0.71, -0.08), (-0.56, -0.13)], 0.02), axis='L', depth=0.13,
                             filt=lambda q: q[0] > 0.5 and -0.85 < q[2] < -0.2),
                        dict(poly=rounded([(-0.86, -0.12), (0.86, -0.12), (0.88, 0.34), (-0.88, 0.34)], 0.03), axis='B', depth=0.05,
                             filt=lambda q: q[2] < zR + 0.3 and -0.2 < q[1] < 0.4, mirror=False)]
        self.TAILS = [dict(poly=rounded([(0.36, 0.415), (0.86, 0.43), (0.88, 0.48), (0.42, 0.47)], 0.01), depth=0.012,
                           filt=lambda q: q[2] < zR + 0.3 and q[1] > 0.36,
                           strips=[([(0.40, 0.452), (0.85, 0.462)], 0.012), ([(0.52, 0.452), (0.62, 0.427), (0.84, 0.437)], 0.008)])]
        self.GROOVES = [dict(path=[(self.z_cowl + 0.0, 0.40), (self.z_cowl + 0.06, 0.1), (self.z_cowl + 0.05, -0.17), (-0.22, -0.17), (-0.28, 0.19), (-0.42, 0.47)],
                             axis='L', filt=lambda q: q[0] > 0.5 and q[1] < 0.49),
                        dict(path=[(-0.52, self.z_cowl + 0.03), (-0.60, 1.75), (-0.42, zF - 0.2), (0.0, zF - 0.13), (0.42, zF - 0.2), (0.60, 1.75), (0.52, self.z_cowl + 0.03)],
                             axis='T', filt=lambda q: q[1] > 0.05 and q[2] > self.z_cowl - 0.05, mirror=False)]
        self.VENTS = [dict(poly=rounded([(-0.42, -1.65), (0.42, -1.65), (0.40, -0.72), (-0.40, -0.72)], 0.03), depth=0.02,
                           filt=lambda q: q[1] > 0.5 and -1.8 < q[2] < -0.6, slats=[([(-0.38, z), (0.38, z)], 0.035) for z in np.linspace(-1.58, -0.8, 7)])]
        self.EXHAUSTS = [dict(x=0.5, y=-0.05, rx=0.055, ry=0.05, shape='round')]
        self.FINS = dict(xs=(-0.36, -0.12, 0.12, 0.36), z1=zR + 0.55, y_top=-0.17)
        self.MIRROR = dict(z=self.z_cowl - 0.12, y=0.47, out=0.12, kind='paint')


class Furia(MidEngine):
    """V12 wedge (Aventador-like): one straight line from the nose over the windscreen,
    faceted flanks, Y lamps, hexagon intakes and exhaust, scissor-door shut lines."""
    crease_H, crease_D, crease_nose, crease_tail = 1.0, 0.9, 0.95, 1.0
    cap_front, cap_rear = 0.13, 0.03
    front_bumper_y = 0.02

    def __init__(self, c, K):
        super().__init__(c, K)
        zF, zR, fa, ra = self.zF, self.zR, self.fa, self.ra
        self.zf0, self.zr0 = zF - 0.6, zR + 0.62
        self.z_cowl, self.z_header, self.z_roofR = 1.12, 0.22, -0.42
        self.z_ws = self.z_cowl - 0.12
        self.z_bulk = -0.5
        W = lambda z: 0.70 - 0.285 * (z - 0.22)     # the wedge line
        self.ZK = [self.zr0, ra, -0.75, -0.42, -0.02, self.z_header, 0.65, self.z_cowl, fa, self.zf0]
        self.X = {
            'F': [.74, .74, .72, .72, .72, .72, .72, .72, .72, .70],
            'R': [.95, .95, .90, .89, .89, .89, .89, .90, .93, .92],
            'S': [.985, .99, .90, .88, .88, .88, .88, .90, .97, .95],
            'M': [1.0, 1.0, .88, .86, .865, .865, .87, .90, .99, .96],
            'X': [1.0, 1.0, .93, .905, .905, .905, .91, .93, 1.0, .975],
            'H': [.99, 1.0, .985, .96, .955, .955, .955, .965, .985, .96],
            'D': [.90, .92, .92, .86, .845, .845, .85, .87, .87, .86],
            'B': [.64, .66, .70, .74, .74, .74, .74, .73, .72, .72],
            'P1': [.55, .56, .58, .58, .58, .56, .62, .69, .65, .65],
            'P2': [.49, .50, .53, .53, .53, .51, .57, .65, .60, .60],
            'Q': [.26, .26, .27, .27, .27, .27, .30, .35, .33, .33],
        }
        cy = [.52, .555, .63, .705, .72, W(self.z_header), W(0.65), W(self.z_cowl) - 0.005, W(fa) - 0.03, W(self.zf0) - 0.03]
        self.Y = {
            'K': [-.26, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.30],
            'F': [-.25, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.29],
            'R': [-.21, -.28, -.28, -.28, -.28, -.28, -.28, -.28, -.28, -.27],
            'S': [-.10, -.12, -.20, -.20, -.20, -.20, -.20, -.19, -.16, -.17],
            'M': [.05, .04, -.05, -.07, -.07, -.07, -.07, -.05, -.03, -.06],
            'X': [.22, .22, .12, .08, .07, .065, .06, .07, .10, .03],
            'H': [.34, .35, .31, .24, .22, .21, .205, .21, .22, .12],
            'D': [.46, .48, .47, .44, .43, .43, .43, .42, .41, .22],
            'B': [.505, .53, .56, .505, .47, .46, .455, .43, .40, .22],
            'P1': [.515, .545, .59, .64, .685, .675, W(0.65) - 0.035, W(self.z_cowl) - 0.01, .385, .21],
            'P2': [.52, .55, .605, .675, .705, .69, W(0.65) - 0.02, W(self.z_cowl) - 0.008, .37, .205],
            'Q': [.52, .553, .625, .70, .718, W(self.z_header) - 0.003, W(0.65) - 0.004, W(self.z_cowl) - 0.006, cy[8], cy[9]],
            'C': cy,
        }
        self.NOSE = {'K': (.36, -.29, 2.5, .5), 'F': (.22, -.29, 2.5, .5), 'R': (.12, -.28, 2.5, .52), 'S': (.12, -.24, 2.5, .52),
                     'M': (.13, -.12, 2.5, .5), 'X': (.15, -.04, 2.5, .48), 'H': (.18, .02, 2.5, .46), 'D': (.21, .06, 2.5, .46),
                     'B': (.225, .07, 2.5, .46), 'P1': (.23, .072, 2.5, .46), 'P2': (.235, .074, 2.5, .46), 'Q': (.24, .076, 2.5, .46),
                     'C': (.245, .078, 2.5, 0)}
        self.TAIL = {'K': (.40, -.20, 3, .7), 'F': (.25, -.18, 3, .7), 'R': (.12, -.13, 3, .74), 'S': (.06, -.04, 3, .8),
                     'M': (.04, .08, 3, .82), 'X': (.03, .22, 3, .82), 'H': (.03, .33, 3, .82), 'D': (.035, .42, 3, .8),
                     'B': (.04, .47, 3, .74), 'P1': (.042, .48, 3, .72), 'P2': (.044, .485, 3, .72), 'Q': (.046, .49, 3, .72),
                     'C': (.048, .49, 3, 0)}
        self.MID = [(self.zr0, None), (-1.5, None), (-1.32, None), (ra, 'ra'), (-0.95, None), (-0.75, None), (-0.58, None),
                    (-0.42, 'winR'), (-0.30, 'doorR'), (-0.02, None), (self.z_header, 'header'), (0.44, None), (0.65, None),
                    (0.88, None), (self.z_cowl, 'cowl'), (self.z_cowl + 0.06, 'doorF'), (1.38, None), (fa, 'fa'), (1.78, None),
                    (self.zf0, 'nose0')]
        self.y_dash = 0.33
        self.y_roof_in = self.d['roof'] - 0.06
        self.tum_in = 0.72
        fB = P([(z, x * self.h) for z, x in zip(self.ZK, self.X['B'])])
        self.cab_half = lambda z: fB(z) - 0.06
        self.deck_y = P(list(zip(self.ZK, self.Y['C'])))

    def extra_creases(self, cage):
        ns = len(cage.st)
        t = TI
        # faceted: every flank line sharp
        return [('t', t['X'], 0, ns - 1, 0.7), ('t', t['S'], 0, ns - 1, 0.8), ('t', t['P1'], 0, ns - 1, 0.6)]

    def specs(self):
        zF, zR, h = self.zF, self.zR, self.h
        # angular lamps on the nose corners with a Y running light
        self.LAMPS = [dict(target=(0.66, 0.1, zF - 0.33), dv=(-0.25, -1, -0.45), depth=0.035,
                           poly=[(-0.21, -0.04), (0.17, -0.03), (0.26, 0.03), (0.23, 0.07), (-0.05, 0.035), (-0.19, 0.0)],
                           drl=[([(-0.17, -0.012), (0.0, -0.005)], 0.008), ([(0.0, -0.005), (0.12, 0.035), (0.2, 0.055)], 0.008),
                                ([(0.0, -0.005), (0.16, -0.012), (0.22, 0.02)], 0.008)],
                           lens=[(0.06, 0.012, 0.022, 0.018), (0.12, 0.014, 0.018, 0.015)])]
        fil = lambda q: q[2] > zF - 0.45 and q[1] < 0.06
        self.INTAKES = [
            # hexagon-cut corner intakes and a wide centre duct
            dict(poly=[(0.34, -0.25), (0.84, -0.25), (0.92, -0.12), (0.86, 0.0), (0.62, 0.01), (0.40, -0.09)], axis='F', depth=0.1, filt=fil),
            dict(poly=[(-0.27, -0.235), (0.27, -0.235), (0.22, -0.13), (-0.22, -0.13)], axis='F', depth=0.08, filt=fil, mirror=False),
            # big flank intake behind the door (hexagonal)
            dict(poly=[(-0.32, 0.2), (-0.50, 0.33), (-0.74, 0.33), (-0.76, -0.04), (-0.62, -0.14), (-0.46, -0.06)], axis='L', depth=0.14,
                 filt=lambda q: q[0] > 0.5 and -0.9 < q[2] < -0.2),
            # rear: full-width black mesh
            dict(poly=[(0.30, -0.08), (0.90, -0.08), (0.93, 0.30), (0.62, 0.33), (0.34, 0.26)], axis='B', depth=0.06,
                 filt=lambda q: q[2] < zR + 0.3 and -0.2 < q[1] < 0.4),
            dict(poly=[(-0.24, -0.13), (0.24, -0.13), (0.20, 0.07), (-0.20, 0.07)], axis='B', depth=0.08,
                 filt=lambda q: q[2] < zR + 0.3 and -0.2 < q[1] < 0.4, mirror=False)]
        self.TAILS = [dict(poly=[(0.40, 0.38), (0.62, 0.395), (0.92, 0.36), (0.96, 0.42), (0.68, 0.46), (0.42, 0.43)], depth=0.012,
                           filt=lambda q: q[2] < zR + 0.3 and q[1] > 0.33,
                           strips=[([(0.44, 0.415), (0.66, 0.43)], 0.012), ([(0.66, 0.43), (0.92, 0.44)], 0.012),
                                   ([(0.66, 0.43), (0.9, 0.385)], 0.012)])]
        # scissor-door shut line: front edge rises steeply, rear edge runs into the intake
        self.GROOVES = [dict(path=[(self.z_cowl - 0.02, 0.43), (self.z_cowl + 0.04, 0.12), (self.z_cowl + 0.02, -0.16), (-0.25, -0.16), (-0.31, 0.19), (-0.40, 0.45)],
                             axis='L', filt=lambda q: q[0] > 0.5 and q[1] < 0.47),
                        dict(path=[(-0.50, self.z_cowl + 0.02), (-0.62, 1.75), (-0.46, zF - 0.26), (0.0, zF - 0.16), (0.46, zF - 0.26), (0.62, 1.75), (0.50, self.z_cowl + 0.02)],
                             axis='T', filt=lambda q: q[1] > 0.0 and q[2] > self.z_cowl - 0.05, mirror=False)]
        # engine cover: hexagon-framed louvre panel + shoulder intakes on the rear fenders
        self.VENTS = [dict(poly=[(-0.40, -1.72), (0.40, -1.72), (0.46, -1.2), (0.36, -0.62), (-0.36, -0.62), (-0.46, -1.2)], depth=0.025,
                           filt=lambda q: q[1] > 0.45 and -1.85 < q[2] < -0.5,
                           slats=[([(-0.42, z), (0.42, z)], 0.03) for z in np.linspace(-1.64, -0.72, 9)] + [([(0.0, -1.7), (0.0, -0.64)], 0.03)])]
        self.EXHAUSTS = [dict(x=0.0, y=-0.04, rx=0.13, ry=0.075, shape='hex', out=0.02)]
        self.FINS = dict(xs=(-0.5, -0.3, -0.1, 0.1, 0.3, 0.5), z1=zR + 0.6, y_top=-0.15)
        self.MIRROR = dict(z=self.z_cowl - 0.14, y=0.44, out=0.10, kind='paint')

    def extra_cuts(self, B):
        # shoulder intakes on top of the rear haunches
        fr = frame('T')
        poly = [(0.66, -0.40), (0.86, -0.46), (0.88, -0.78), (0.70, -0.74)]
        for pp, fl in ((poly, lambda q: q[0] > 0.5 and q[1] > 0.35), (mirror_poly(poly), lambda q: q[0] < -0.5 and q[1] > 0.35)):
            f1 = knife(B.bm, pp, fr, fl)
            flo, wl = recess(B.bm, f1, 0.08, fr[3])
            B.set(flo, 'intakes', 0); B.set(wl, 'blackout', 0)

    def wing(self, surf):
        # fixed flap spoiler on the tail lip
        A = Acc()
        zR = self.zR
        p, n = surf.top(0.0, zR + 0.12)
        y = (p[1] if p is not None else 0.5) + 0.03
        w = self.h * 0.82
        prof = [(0.0, 0.0), (0.16, 0.012), (0.18, 0.03), (0.0, 0.016)]
        rings = [[(x, y + py, zR + 0.06 + pz) for (pz, py) in prof] for x in np.linspace(-w, w, 9)]
        loft_acc(A, rings, True, True, True)
        return [self.obj('wing', A, 'trim', 40)]


class RearEngine(Tabled):
    """Rear-engined coupe (the classic rear-engined sports car): fender humps carrying round
    lamps, low frunk lid between them, fastback roof running into the engine lid."""
    crease_H, crease_D, crease_nose, crease_tail = 0.4, 0.15, 0.15, 0.55
    cap_front, cap_rear = 0.06, 0.03
    front_bumper_y = 0.12
    rear_bumper_y = 0.16
    splitter_y = -0.27
    diffuser_y = -0.2

    def mid(self):
        return self.MID

    def adjust(self, cage):
        cage.cap_bulge = {1: self.cap_front, 0: self.cap_rear}
        i = cage.S('winR')
        for j, dz in self.WINR_DZ.items():
            cage.dz[(i, TI[j])] = dz

    def creases(self, cage):
        ns = len(cage.st)
        t = TI
        cw, wr, rw = self.S('cowl'), self.S('winR'), self.S('rw0')
        cr = [('t', t['R'], 0, ns - 1, 0.5), ('t', t['B'], rw, cw, 0.7), ('t', t['P1'], rw, cw, 0.6), ('t', t['P2'], rw, cw, 0.5),
              ('t', t['H'], 0, ns - 1, self.crease_H), ('r', cw, t['P1'], NT - 1, 0.5),
              ('r', ns - 1, 1, NT - 1, self.crease_nose), ('r', 0, 1, NT - 1, self.crease_tail)]
        return cr + self.extra_creases(cage)

    def extra_creases(self, cage):
        return []

    def classify(self, s, t, p, n):
        S = self.S
        side = 'L' if p[0] > 0 else 'R'
        ns = len(self.cage.st)
        if s > ns - 1:
            if t < 1 or p[1] < self.splitter_y:
                return 'under'
            return 'bumperF' if p[1] < self.front_bumper_y else 'fascia'
        if s < 0:
            if t < 1 or p[1] < self.diffuser_y:
                return 'under'
            return 'bumperR' if p[1] < self.rear_bumper_y else 'rearPanel'
        nose0 = S('nose0') + 1
        tail0 = len(self.tail_f)
        if t < 2:
            return 'under'
        if t < 8:
            if s >= nose0:
                return 'bumperF' if t < 6 else 'fenderF' + side
            if s < tail0:
                return 'bumperR' if t < 6 else 'quarter' + side
            if s >= S('doorF'):
                return 'fenderF' + side
            if s >= S('doorR') and t >= 3:
                return 'door' + side
            return 'quarter' + side
        if s >= S('cowl'):
            return 'hood' if t >= 9 else 'fenderF' + side
        if t >= 10:
            if s >= S('header'):
                return 'glass'
            if s >= S('roofR'):
                return 'roof'
            if s >= S('rw0'):
                return 'glass'
            return 'trunk'
        if t >= 9:
            return 'pillars' if s >= S('rw0') else 'trunk'
        if S('winR') <= s:
            return 'glass'
        return 'pillars' if s >= S('rw0') else 'quarter' + side


class Bauhaus(RearEngine):
    """Rear-engined sports coupe (911 Carrera-like): round lamps on the fender humps, sloping
    fastback, wide rear haunches, full-width tail light bar, louvred engine lid."""

    def __init__(self, c, K):
        super().__init__(c, K)
        zF, zR, fa, ra = self.zF, self.zR, self.fa, self.ra
        self.zf0, self.zr0 = zF - 0.55, zR + 0.5
        self.z_cowl, self.z_header, self.z_roofR, self.z_rw0 = 0.78, -0.02, -0.38, -1.05
        self.z_ws = self.z_cowl
        self.z_bulk = -0.75
        self.WINR_DZ = {'B': -0.10, 'P1': 0.14}
        self.ZK = [self.zr0, -1.3, ra, -0.62, -0.25, self.z_header, 0.38, self.z_cowl, fa, self.zf0]
        self.X = {
            'F': [.74, .76, .76, .74, .72, .72, .72, .72, .72, .70],
            'R': [.93, .95, .95, .90, .88, .88, .88, .88, .91, .90],
            'S': [.97, .99, .99, .93, .905, .905, .905, .905, .94, .93],
            'M': [.99, 1.0, 1.0, .955, .93, .93, .93, .935, .96, .95],
            'X': [.98, 1.0, 1.0, .965, .94, .94, .94, .945, .965, .95],
            'H': [.95, .975, .98, .935, .915, .915, .915, .925, .945, .93],
            'D': [.84, .87, .87, .85, .86, .86, .86, .87, .875, .86],
            'B': [.60, .63, .64, .74, .80, .80, .80, .76, .74, .74],
            'P1': [.50, .53, .55, .62, .66, .66, .69, .70, .62, .62],
            'P2': [.44, .47, .50, .57, .61, .61, .64, .66, .52, .52],
            'Q': [.24, .25, .27, .31, .33, .33, .35, .36, .30, .30],
        }
        self.Y = {
            'K': [-.29, -.33, -.33, -.33, -.33, -.33, -.33, -.33, -.33, -.32],
            'F': [-.28, -.33, -.33, -.33, -.33, -.33, -.33, -.33, -.33, -.31],
            'R': [-.25, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.30, -.28],
            'S': [-.15, -.16, -.16, -.21, -.22, -.22, -.22, -.22, -.17, -.18],
            'M': [.00, .0, .0, -.06, -.08, -.08, -.08, -.08, -.04, -.06],
            'X': [.16, .17, .17, .10, .07, .07, .07, .08, .10, .06],
            'H': [.32, .35, .36, .30, .26, .25, .25, .26, .28, .19],
            'D': [.44, .51, .54, .51, .48, .48, .475, .46, .44, .30],
            'B': [.47, .58, .64, .555, .525, .515, .51, .47, .43, .27],
            'P1': [.475, .59, .67, .78, .815, .80, .63, .47, .395, .245],
            'P2': [.48, .60, .685, .80, .835, .825, .645, .465, .375, .235],
            'Q': [.485, .61, .70, .82, .856, .845, .655, .455, .36, .225],
            'C': [.49, .615, .705, .825, .86, .85, .66, .45, .355, .22],
        }
        self.NOSE = {'K': (.30, -.31, 2.2, .45), 'F': (.16, -.30, 2.2, .45), 'R': (.07, -.26, 2.2, .45), 'S': (.05, -.18, 2.2, .45),
                     'M': (.05, -.07, 2.2, .45), 'X': (.07, .03, 2.2, .45), 'H': (.11, .11, 2.2, .45), 'D': (.16, .19, 2.2, .45),
                     'B': (.19, .205, 2.2, .45), 'P1': (.20, .21, 2.2, .45), 'P2': (.205, .212, 2.2, .45), 'Q': (.21, .214, 2.2, .45),
                     'C': (.215, .215, 2.2, 0)}
        self.TAIL = {'K': (.34, -.25, 2.4, .6), 'F': (.22, -.24, 2.4, .6), 'R': (.10, -.20, 2.4, .62), 'S': (.05, -.11, 2.4, .66),
                     'M': (.03, .02, 2.4, .68), 'X': (.03, .15, 2.4, .68), 'H': (.035, .28, 2.4, .66), 'D': (.045, .37, 2.4, .62),
                     'B': (.06, .41, 2.4, .56), 'P1': (.065, .415, 2.4, .54), 'P2': (.07, .418, 2.4, .54), 'Q': (.075, .42, 2.4, .54),
                     'C': (.08, .42, 2.4, 0)}
        self.MID = [(self.zr0, None), (-1.3, None), (self.z_rw0, 'rw0'), (ra, 'ra'), (-0.82, None), (-0.68, 'winR'), (-0.52, 'doorR'),
                    (self.z_roofR, 'roofR'), (-0.2, None), (self.z_header, 'header'), (0.2, None), (0.4, None), (0.6, None),
                    (self.z_cowl, 'cowl'), (0.92, 'doorF'), (1.15, None), (fa, 'fa'), (1.75, None), (self.zf0, 'nose0')]
        self.y_dash = 0.40
        self.y_roof_in = self.d['roof'] - 0.05
        self.tum_in = 0.8
        fB = P([(z, x * self.h) for z, x in zip(self.ZK, self.X['B'])])
        self.cab_half = lambda z: fB(z) - 0.06
        self.deck_y = P(list(zip(self.ZK, self.Y['C'])))

    def specs(self):
        zF, zR, h = self.zF, self.zR, self.h
        ring = [(math.cos(a) * 0.105, math.sin(a) * 0.095) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)]
        led = [(math.cos(a) * 0.075, math.sin(a) * 0.068) for a in np.linspace(0, 2 * math.pi, 25)]
        self.LAMPS = [dict(target=(0.60, 0.30, zF - 0.32), dv=(-0.12, -0.55, -1), depth=0.03, poly=ring,
                           drl=[(led, 0.008)] + [([(math.cos(a) * 0.035, math.sin(a) * 0.032), (math.cos(a) * 0.06, math.sin(a) * 0.055)], 0.009)
                                                 for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)],
                           lens=[(0.0, 0.0, 0.03, 0.028)])]
        fil = lambda q: q[2] > zF - 0.35 and q[1] < 0.15
        self.INTAKES = [dict(poly=rounded([(-0.36, -0.25), (0.36, -0.25), (0.33, -0.13), (-0.33, -0.13)], 0.03), axis='F', depth=0.07, filt=fil, mirror=False),
                        dict(poly=rounded([(0.46, -0.25), (0.74, -0.25), (0.72, -0.09), (0.50, -0.10)], 0.03), axis='F', depth=0.07, filt=fil)]
        self.TAILS = [dict(poly=[(-0.86, 0.33), (0.86, 0.33), (0.87, 0.375), (-0.87, 0.375)], depth=0.01, mirror=False,
                           filt=lambda q: q[2] < zR + 0.35 and q[1] > 0.25,
                           strips=[([(-0.84, 0.352), (0.84, 0.352)], 0.016)]),
                      dict(poly=rounded([(0.58, 0.28), (0.86, 0.28), (0.88, 0.33), (0.60, 0.33)], 0.008), depth=0.008,
                           filt=lambda q: q[2] < zR + 0.35 and q[1] > 0.22, strips=[([(0.62, 0.30), (0.85, 0.30)], 0.01)])]
        self.GROOVES = [dict(path=[(0.88, 0.47), (0.92, 0.15), (0.90, -0.18), (-0.45, -0.18), (-0.50, 0.15), (-0.58, 0.50)],
                             axis='L', filt=lambda q: q[0] > 0.5 and q[1] < 0.52),
                        dict(path=[(-0.48, self.z_cowl + 0.02), (-0.50, 1.6), (-0.42, zF - 0.24), (0.0, zF - 0.19), (0.42, zF - 0.24), (0.50, 1.6), (0.48, self.z_cowl + 0.02)],
                             axis='T', filt=lambda q: q[1] > 0.1 and q[2] > self.z_cowl - 0.05, mirror=False),
                        dict(path=[(-0.50, self.z_rw0 + 0.01), (-0.52, -1.6), (-0.40, zR + 0.13), (0.40, zR + 0.13), (0.52, -1.6), (0.50, self.z_rw0 + 0.01)],
                             axis='T', filt=lambda q: q[1] > 0.3 and q[2] < self.z_rw0 + 0.05, mirror=False)]
        self.VENTS = [dict(poly=rounded([(-0.36, -1.48), (0.36, -1.48), (0.38, self.z_rw0 - 0.05), (-0.38, self.z_rw0 - 0.05)], 0.03), depth=0.015,
                           filt=lambda q: q[1] > 0.4 and -1.6 < q[2] < self.z_rw0,
                           slats=[([(x, -1.46), (x, self.z_rw0 - 0.07)], 0.018) for x in np.linspace(-0.33, 0.33, 15)])]
        self.EXHAUSTS = [dict(x=0.52, y=-0.21, rx=0.06, ry=0.04, shape='oval')]
        self.MIRROR = dict(z=self.z_cowl - 0.12, y=0.52, out=0.1, kind='paint')
        self.WING = dict(kind='duck')

    def wing(self, surf):
        # small deployable ducktail lip at the end of the engine lid
        A = Acc()
        zR = self.zR
        w = self.h * 0.6
        rings = []
        for x in np.linspace(-w, w, 11):
            p, n = surf.top(x, zR + 0.16)
            y = (p[1] if p is not None else 0.42)
            rings.append([(x, y - 0.01, zR + 0.22), (x, y + 0.035, zR + 0.12), (x, y + 0.03, zR + 0.09), (x, y - 0.02, zR + 0.12)])
        loft_acc(A, rings, True, True, True)
        return [self.obj('wing', A, 'paint', 40, uv=True)]


DESIGNS = {'toro': Toro, 'furia': Furia, 'bauhaus': Bauhaus}


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
