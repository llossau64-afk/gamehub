// Analogue/digital hybrid speedometer drawn on a 2D canvas: RPM arc with redline,
// big km/h readout, gear, turbo/boost meter and warning lamps.

export class Speedo {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.resize();
    this.rpmD = 0;
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.c.getBoundingClientRect();
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw(d) {
    const g = this.g, w = this.w, h = this.h;
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.8, R = Math.min(w * 0.44, h * 0.72);
    const a0 = Math.PI * 0.92, a1 = Math.PI * 2.08;
    this.rpmD += (d.rpm - this.rpmD) * 0.35;
    const frac = Math.min(1.08, this.rpmD / d.redline);
    // backing arc
    g.lineCap = 'butt';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    // ticks
    const maxK = Math.ceil(d.redline / 1000);
    for (let i = 0; i <= maxK * 2; i++) {
      const f = (i * 500) / (maxK * 1000);
      const a = a0 + (a1 - a0) * f;
      const big = i % 2 === 0;
      const r0 = R - (big ? 13 : 8), r1 = R - 4;
      g.strokeStyle = i * 500 >= d.redline * 0.92 ? 'rgba(207,74,50,0.9)' : 'rgba(235,230,218,0.55)';
      g.lineWidth = big ? 2 : 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (big && w > 160) {
        g.fillStyle = 'rgba(235,230,218,0.5)';
        g.font = '600 10px Cond, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(i / 2), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      }
    }
    const redA = a0 + (a1 - a0) * Math.min(1, (d.redline * 0.92) / (maxK * 1000));
    g.lineWidth = 3; g.strokeStyle = 'rgba(207,74,50,0.85)';
    g.beginPath(); g.arc(cx, cy, R + 4, redA, a1); g.stroke();
    // rpm fill
    const fa = a0 + (a1 - a0) * Math.min(1, (this.rpmD) / (maxK * 1000));
    g.lineWidth = 7;
    g.strokeStyle = frac > 0.92 ? '#cf4a32' : '#ebe6da';
    g.beginPath(); g.arc(cx, cy, R, a0, fa); g.stroke();
    // speed
    g.fillStyle = '#ebe6da';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `700 ${Math.round(R * 0.62)}px Cond, sans-serif`;
    g.fillText(String(Math.round(d.speed)), cx, cy - R * 0.12);
    g.font = '600 10px Cond, sans-serif';
    g.fillStyle = 'rgba(235,230,218,0.5)';
    g.fillText(d.units, cx, cy + 4);
    // gear
    g.font = '700 18px Cond, sans-serif';
    g.fillStyle = d.gear === 'R' ? '#e2a33b' : '#ebe6da';
    g.fillText(d.gear, cx + R * 0.72, cy - 2);
    g.font = '600 8.5px Cond, sans-serif'; g.fillStyle = 'rgba(235,230,218,0.45)';
    g.fillText('GEAR', cx + R * 0.72, cy + 9);
    // boost meter (only when a turbo is fitted)
    if (d.boostCap > 0) {
      const bx = cx - R * 0.95, by = cy - 6, bw = 34;
      g.font = '600 8.5px Cond, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(235,230,218,0.45)';
      g.fillText('TURBO', bx, by + 15);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(bx, by, bw, 5);
      g.fillStyle = d.overboost ? '#e2a33b' : 'rgba(235,230,218,0.85)';
      g.fillRect(bx, by, bw * d.boostTank, 5);
      g.fillStyle = 'rgba(226,163,59,0.8)'; g.fillRect(bx, by - 5, bw * d.boost, 2);
    }
    // warning lamps
    const lamps = [['FUEL', d.lowFuel], ['ENGINE', d.engineWarn], ['BRAKES', d.brakeWarn], ['TEMP', d.hot]];
    let lx = cx - 72;
    g.textAlign = 'center'; g.font = '700 8.5px Cond, sans-serif';
    for (const [name, on] of lamps) {
      const blink = on && (Math.floor(performance.now() / 350) % 2 === 0 || on === 'solid');
      g.fillStyle = on ? (blink ? '#cf4a32' : 'rgba(207,74,50,0.35)') : 'rgba(235,230,218,0.12)';
      g.fillText(name, lx, cy + 20);
      lx += 48;
    }
  }
}
