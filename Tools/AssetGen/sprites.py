"""UI sprites: white on transparent RGBA, supersampled."""
from common import *
from scipy.ndimage import binary_erosion, gaussian_filter

SS = 4


def out(alpha, name, white=True):
    a = np.clip(alpha, 0, 1)
    h, w = a.shape
    rgb = np.ones((h, w, 3), np.float32) if white else np.zeros((h, w, 3), np.float32)
    save_rgba(np.dstack([rgb, a]), name, SPR)


def mask_img(size, fn):
    im = Image.new("L", (size[0] * SS, size[1] * SS), 0)
    fn(ImageDraw.Draw(im), SS)
    return im.resize(size, Image.LANCZOS)


def A(im):
    return np.asarray(im, np.float32) / 255


def outline_of(im, stroke):
    """Outline (stroke px at final res) of a filled silhouette drawn at SS scale."""
    m = np.asarray(im) > 127
    r = int(stroke * SS / 2)
    from scipy.ndimage import binary_dilation, distance_transform_edt
    inside = distance_transform_edt(m)
    outside = distance_transform_edt(~m)
    ring = (inside <= r * 2 * 0.5 + 0) & m
    # centered stroke: |signed distance| <= r
    sd = np.where(m, inside, -outside)
    ring = np.abs(sd - 0.0) <= r
    return ring


def to_final(ring, size):
    im = Image.fromarray((ring * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    return A(im)


def main():
    # joystick ring
    S = 256
    def f(d, k):
        d.ellipse([6 * k, 6 * k, (S - 6) * k, (S - 6) * k], fill=int(255 * 0.08))
        d.ellipse([6 * k, 6 * k, (S - 6) * k, (S - 6) * k], outline=255, width=6 * k)
    im = mask_img((S, S), f)
    out(A(im), "joystick_ring.png")
    # knob: soft-edged filled circle
    S = 128
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.hypot(xx - S / 2 + 0.5, yy - S / 2 + 0.5)
    out(smooth(S / 2 - 1, S / 2 * 0.62, r) , "joystick_knob.png")
    # soft dot
    out(np.clip(1 - r / (S / 2), 0, 1) ** 1.6 * 1.0 * (r < S / 2), "circle_soft.png")
    # solid circle
    im = mask_img((S, S), lambda d, k: d.ellipse([2 * k, 2 * k, (S - 2) * k, (S - 2) * k], fill=255))
    out(A(im), "circle_solid.png")
    # rounded rect
    im = mask_img((64, 64), lambda d, k: d.rounded_rectangle([0, 0, 64 * k - 1, 64 * k - 1], radius=12 * k, fill=255))
    out(A(im), "rounded_rect.png")
    # vignette (black, alpha)
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.hypot(xx - S / 2 + 0.5, yy - S / 2 + 0.5) / (S / 2 * np.sqrt(2))
    a = 0.85 * smooth(0.28, 1.0, r) ** 1.3
    save_rgba(np.dstack([np.zeros((S, S, 3), np.float32), a]), "vignette.png", SPR)
    # gradients
    g = np.tile(np.linspace(1, 0, 512, dtype=np.float32)[None, :], (8, 1))
    out(g, "gradient_left.png")
    g = np.tile(np.linspace(0, 1, 512, dtype=np.float32)[:, None], (1, 8))
    out(g, "gradient_bottom.png")
    # icons
    S = 128
    st = 7
    # hand
    def hand(d, k):
        def cap(x0, y0, x1, y1, r):
            d.line([(x0 * k, y0 * k), (x1 * k, y1 * k)], fill=255, width=int(2 * r * k))
            for (x, y) in ((x0, y0), (x1, y1)):
                d.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill=255)
        cap(44, 66, 40, 28, 7.5)   # index
        cap(58, 62, 58, 20, 7.5)   # middle
        cap(72, 64, 76, 26, 7.5)   # ring
        cap(86, 70, 94, 38, 7)     # pinky
        d.rounded_rectangle([38 * k, 56 * k, 94 * k, 108 * k], 22 * k, fill=255)
        cap(40, 84, 20, 60, 8)     # thumb
    im = Image.new("L", (S * SS, S * SS), 0)
    hand(ImageDraw.Draw(im), SS)
    out(to_final(outline_of(im, 6), S), "icon_hand.png")
    # pause
    im = mask_img((S, S), lambda d, k: (d.rounded_rectangle([34 * k, 26 * k, 54 * k, 102 * k], 6 * k, fill=255), d.rounded_rectangle([74 * k, 26 * k, 94 * k, 102 * k], 6 * k, fill=255)))
    out(A(im), "icon_pause.png")
    # gear
    def gear(d, k):
        cx = cy = 64 * k
        n = 8
        for i in range(n):
            a = 2 * math.pi * i / n
            ca, sa = math.cos(a), math.sin(a)
            hw = 9 * k
            r0, r1 = 30 * k, 52 * k
            pts = [(cx + ca * r0 - sa * hw, cy + sa * r0 + ca * hw), (cx + ca * r1 - sa * hw * 0.8, cy + sa * r1 + ca * hw * 0.8),
                   (cx + ca * r1 + sa * hw * 0.8, cy + sa * r1 - ca * hw * 0.8), (cx + ca * r0 + sa * hw, cy + sa * r0 - ca * hw)]
            d.polygon(pts, fill=255)
        d.ellipse([cx - 40 * k, cy - 40 * k, cx + 40 * k, cy + 40 * k], fill=255)
        d.ellipse([cx - 16 * k, cy - 16 * k, cx + 16 * k, cy + 16 * k], fill=0)
    import math
    im = Image.new("L", (S * SS, S * SS), 0)
    gear(ImageDraw.Draw(im), SS)
    out(to_final(outline_of(im, 6), S), "icon_gear.png")
    # check
    def chk(d, k):
        pts = [(26 * k, 68 * k), (52 * k, 94 * k), (102 * k, 36 * k)]
        d.line(pts, fill=255, width=12 * k, joint="curve")
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - 6 * k, p[1] - 6 * k, p[0] + 6 * k, p[1] + 6 * k], fill=255)
    out(A(mask_img((S, S), chk)), "icon_check.png")
    # scissors
    def sc(d, k):
        w = 7 * k
        # blades crossing
        d.line([(46 * k, 78 * k), (98 * k, 14 * k)], fill=255, width=w)
        d.line([(82 * k, 78 * k), (30 * k, 14 * k)], fill=255, width=w)
        # handle rings
        for cx in (42, 86):
            d.ellipse([(cx - 17) * k, 78 * k, (cx + 17) * k, 114 * k], outline=255, width=7 * k)
        d.ellipse([60 * k, 42 * k, 68 * k, 50 * k], fill=0)
    out(A(mask_img((S, S), sc)), "icon_scissors.png")
    # crosshair dot
    S = 32
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.hypot(xx - S / 2 + 0.5, yy - S / 2 + 0.5)
    out(smooth(S / 2, 3.0, r) * 0.0 + np.clip(1.0 - smooth(3.5, S / 2, r), 0, 1) * 0.85 + smooth(4, 2, r) * 0.15, "crosshair_dot.png")


if __name__ == "__main__":
    main()
