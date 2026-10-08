// Body dimensions shared by the procedural car builder, the Blender body generator
// (tools/car-dims.mjs) and the asset-based car model. Pure: no three.js.
import { lerp } from '../core/util.js';

export const TYPE = {
  hatch: { belt: 0.5, nose: 0.4, tail: 0.5, ws: 0.71, roofF: 0.56, roofR: 0.1, back: 0.015, tumble: 0.8, cr: 0.3 },
  wagon: { belt: 0.5, nose: 0.4, tail: 0.5, ws: 0.73, roofF: 0.6, roofR: 0.035, back: 0.005, tumble: 0.84, cr: 0.28 },
  sedan: { belt: 0.53, nose: 0.43, tail: 0.54, ws: 0.69, roofF: 0.57, roofR: 0.32, back: 0.21, tumble: 0.8, cr: 0.3 },
  coupe: { belt: 0.53, nose: 0.42, tail: 0.53, ws: 0.65, roofF: 0.52, roofR: 0.31, back: 0.15, tumble: 0.78, cr: 0.3 },
  pickup: { belt: 0.55, nose: 0.5, tail: 0.55, ws: 0.73, roofF: 0.64, roofR: 0.47, back: 0.44, tumble: 0.86, cr: 0.22, bed: 1 },
  suv: { belt: 0.53, nose: 0.47, tail: 0.53, ws: 0.75, roofF: 0.65, roofR: 0.04, back: 0.01, tumble: 0.88, cr: 0.22 },
  muscle: { belt: 0.55, nose: 0.46, tail: 0.56, ws: 0.63, roofF: 0.5, roofR: 0.31, back: 0.15, tumble: 0.78, cr: 0.26 },
  sports: { belt: 0.5, nose: 0.36, tail: 0.53, ws: 0.67, roofF: 0.51, roofR: 0.29, back: 0.1, tumble: 0.72, cr: 0.34 },
  baja: { belt: 0.55, nose: 0.5, tail: 0.5, ws: 0.73, roofF: 0.64, roofR: 0.5, back: 0.47, tumble: 0.84, cr: 0.25, bed: 1 },
  beast: { belt: 0.55, nose: 0.55, tail: 0.55, ws: 0.76, roofF: 0.68, roofR: 0.03, back: 0.01, tumble: 0.92, cr: 0.16 },
  gt: { belt: 0.52, nose: 0.35, tail: 0.55, ws: 0.62, roofF: 0.49, roofR: 0.26, back: 0.07, tumble: 0.74, cr: 0.32 },
  rear: { belt: 0.48, nose: 0.3, tail: 0.47, ws: 0.72, roofF: 0.6, roofR: 0.4, back: 0.03, tumble: 0.74, cr: 0.42 },
  super: { belt: 0.5, nose: 0.33, tail: 0.54, ws: 0.73, roofF: 0.57, roofR: 0.4, back: 0.15, tumble: 0.7, cr: 0.36 },
  hyper: { belt: 0.48, nose: 0.3, tail: 0.5, ws: 0.75, roofF: 0.59, roofR: 0.42, back: 0.18, tumble: 0.66, cr: 0.4 },
  wedge: { belt: 0.6, nose: 0.33, tail: 0.62, ws: 0.74, roofF: 0.52, roofR: 0.4, back: 0.12, tumble: 0.6, cr: 0.26 },
  berlinetta: { belt: 0.6, nose: 0.38, tail: 0.64, ws: 0.67, roofF: 0.53, roofR: 0.36, back: 0.13, tumble: 0.66, cr: 0.38 },
  longtail: { belt: 0.58, nose: 0.36, tail: 0.6, ws: 0.71, roofF: 0.585, roofR: 0.43, back: 0.2, tumble: 0.62, cr: 0.44 },
  monster: { belt: 0.55, nose: 0.5, tail: 0.55, ws: 0.73, roofF: 0.64, roofR: 0.47, back: 0.44, tumble: 0.86, cr: 0.22, bed: 1 },
};

export function carDims(car, ph) {
  const md = car.model;
  const T = TYPE[md.type] || TYPE.hatch;
  const L = md.len, W = md.wid;
  const a = ph.wb * (1 - ph.weightFront), b = ph.wb * ph.weightFront;
  const oh = L - ph.wb;
  const ohF = oh * (car.drive === 'FWD' ? 0.56 : ['super', 'hyper', 'wedge', 'berlinetta', 'longtail'].includes(md.type) ? 0.45 : 0.5);
  const zF = a + ohF, zR = zF - L;
  const yG = -ph.cg;
  const lift = md.lift || 0;
  const r = ph.r;
  const wcY = yG + r;
  let bottom = yG + Math.max(ph.ground, 0.1);
  let roof = yG + md.hgt + (md.type === 'monster' ? lift * 0.6 : lift);
  if (md.type === 'monster') {
    // the body sits on the frame above the giant tyres
    const h0 = roof - bottom;
    bottom = Math.max(bottom, wcY + r * 0.5);
    roof = bottom + h0;
  }
  const H = roof - bottom;
  const archR = r * 1.12 + (lift > 0.3 ? 0.08 : 0);
  const axles = [a, -b];
  const yBelt = bottom + H * T.belt, yNose = bottom + H * T.nose, yTail = bottom + H * T.tail;
  const half = W / 2;
  const cr = T.cr;
  return { L, W, zF, zR, yG, bottom, roof, H, yBelt, yNose, yTail, a, b, half, r, archR, wcY };
}
