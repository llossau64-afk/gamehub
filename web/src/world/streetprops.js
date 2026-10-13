// Small things that make the block feel lived in: hydrant, newspaper boxes, mailbox, parking
// meters, street name signs, manholes, drains, puddles, A-frame boards, a bike at a rack,
// and in the alleys a proper fire escape, drainpipes, back doors with lamps, bin bags,
// wall AC units, graffiti and cables overhead. Procedural, shared materials, batched later.
import * as THREE from 'three';
import { rng } from '../render/textures.js';

const M = (color, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

function labelTex(text, bg, fg, w = 256, h = 48) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = fg; x.font = `700 ${Math.round(h * 0.6)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function graffitiTex(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const r = rng(seed);
  x.clearRect(0, 0, 512, 256);
  const cols = ['#e04a6a', '#3fb6d8', '#f2c94c', '#6cd07a', '#9b6cf0'];
  // a chunky bubble tag: overlapping rounded blobs with an outline and a highlight
  x.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const rr = rng(seed);
    for (let i = 0; i < 6; i++) {
      const cx = 60 + i * 75 + rr() * 10, cy = 128 + (rr() - 0.5) * 30, w = 46 + rr() * 16, h = 70 + rr() * 30;
      x.beginPath(); x.ellipse(cx, cy, w, h, (rr() - 0.5) * 0.5, 0, 7);
      if (pass === 0) { x.lineWidth = 16; x.strokeStyle = '#1b1b22'; x.stroke(); }
      else { x.fillStyle = cols[(seed + i) % cols.length]; x.fill(); }
    }
  }
  x.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(50 + i * 75, 90, 14, 6, -0.4, 0, 7); x.fill(); }
  // drips
  x.strokeStyle = cols[seed % cols.length]; x.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const dx = 40 + r() * 440; x.beginPath(); x.moveTo(dx, 170); x.lineTo(dx, 190 + r() * 50); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildStreetProps(shop, g, fz, STREET) {
  const solid = (x, z, hw, hd) => shop.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, outside: true });
  const add = (geo, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.receiveShadow = true; g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
  const red = M('#b52a22', 0.5, 0.2), yellow = M('#d9a930', 0.5, 0.2), steel = M('#8c9196', 0.45, 0.6), dark = M('#2b2d30', 0.6, 0.4);
  const blue = M('#2b4f86', 0.5, 0.3), green = M('#2f6a46', 0.55, 0.2), black = M('#151617', 0.6, 0.1);
  const curbZ = fz + 2.55;

  // fire hydrant
  const hyd = (x) => {
    add(C(0.13, 0.15, 0.5), red, x, 0.25, curbZ);
    add(C(0.16, 0.16, 0.08), red, x, 0.05, curbZ);
    add(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), yellow, x, 0.5, curbZ);
    add(C(0.03, 0.03, 0.06, 6), yellow, x, 0.66, curbZ);
    for (const s of [-1, 1]) add(C(0.055, 0.055, 0.12), red, x + s * 0.17, 0.33, curbZ, 0, 0).rotation.z = Math.PI / 2;
    add(C(0.075, 0.075, 0.1), red, x, 0.33, curbZ + 0.16, 0, Math.PI / 2);
    solid(x, curbZ, 0.2, 0.2);
  };
  hyd(-10.5); hyd(39.5);

  // newspaper boxes
  const paper = (x, mat) => {
    add(B(0.48, 0.75, 0.42), mat, x, 0.58, curbZ);
    add(B(0.38, 0.22, 0.02), M('#cfd6dc', 0.15, 0.1), x, 0.72, curbZ + 0.215);
    for (const s of [-1, 1]) add(B(0.04, 0.22, 0.38), dark, x + s * 0.2, 0.11, curbZ);
    solid(x, curbZ, 0.26, 0.24);
  };
  paper(12.0, blue); paper(12.6, red); paper(-37.6, green);

  // mailbox
  add(B(0.52, 0.72, 0.48), blue, -13.8, 0.66, curbZ);
  add(C(0.26, 0.26, 0.48, 16, 1), blue, -13.8, 1.02, curbZ, 0, 0).rotation.set(Math.PI / 2, 0, 0);
  add(B(0.3, 0.04, 0.02), dark, -13.8, 0.98, curbZ + 0.25);
  for (const s of [-1, 1]) for (const t of [-1, 1]) add(B(0.05, 0.3, 0.05), blue, -13.8 + s * 0.2, 0.15, curbZ + t * 0.18);
  solid(-13.8, curbZ, 0.3, 0.28);

  // parking meters along the kerb
  for (const x of [-19.5, -33.5, 19.5, 33.5]) {
    add(C(0.035, 0.035, 1.1, 8), dark, x, 0.55, fz + 2.75);
    add(B(0.2, 0.32, 0.16), steel, x, 1.25, fz + 2.75);
    add(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, x, 1.41, fz + 2.75);
    add(B(0.12, 0.08, 0.01), M('#d8e6dc', 0.2), x, 1.28, fz + 2.67);
    solid(x, fz + 2.75, 0.1, 0.1);
  }

  // street name signs on the corners of the cross streets
  const names = [['ELM ST', 'MAIN ST'], ['OAK AVE', 'MAIN ST']];
  STREET.alleys.forEach(([a0, a1], i) => {
    for (const x of [a0 - 0.5, a1 + 0.5]) {
      add(C(0.04, 0.04, 3.2, 8), green, x, 1.6, fz + 2.7);
      const crossT = labelTex(names[i][0], '#2f6a46', '#f1ece0'), mainT = labelTex(names[i][1], '#2f6a46', '#f1ece0');
      const s1 = add(B(1.1, 0.2, 0.03), new THREE.MeshStandardMaterial({ map: crossT, roughness: 0.6 }), x, 3.05, fz + 2.7, Math.PI / 2);
      const s2 = add(B(1.1, 0.2, 0.03), new THREE.MeshStandardMaterial({ map: mainT, roughness: 0.6 }), x, 2.82, fz + 2.7);
      s1.userData.keep = s2.userData.keep = true;
      solid(x, fz + 2.7, 0.08, 0.08);
    }
  });

  // manholes, drains, puddles, litter
  const iron = M('#2c2a28', 0.75, 0.5);
  for (const [x, z] of [[-5, 6.2], [14, 8.4], [-26.5, 7.5], [27, 6.8], [36, 8.8]]) {
    add(C(0.38, 0.38, 0.02, 20), iron, x, -0.06, fz + z);
    add(new THREE.TorusGeometry(0.3, 0.012, 4, 20), M('#1c1b1a', 0.8), x, -0.048, fz + z, 0, Math.PI / 2);
  }
  for (const x of [-2.2, 20.5, -18.7, 30.5, -40]) add(B(0.7, 0.12, 0.05), iron, x, -0.01, fz + 3.13);
  const wet = new THREE.MeshStandardMaterial({ color: '#3b3f43', roughness: 0.12, metalness: 0.05 });
  const wetSw = new THREE.MeshStandardMaterial({ color: '#86837c', roughness: 0.15, metalness: 0.05 });
  const r = rng(77);
  for (const [x, z] of [[-7.2, 3.6], [4.5, 5.0], [17.5, 9.8], [-30, 4.0], [11.2, 2.2], [-22.8, 1.6], [38, 12.6]]) {
    const p = add(new THREE.CircleGeometry(1, 20), z < 3 || z > 11 ? wetSw : wet, x, z < 3 || z > 11 ? 0.004 : -0.062, fz + z, 0, -Math.PI / 2);
    p.scale.set(0.5 + r() * 0.7, 0.3 + r() * 0.4, 1);
  }
  const litterM = [M('#e8e2d2', 0.9), M('#c8b48a', 0.9), M('#9c3a30', 0.8)];
  for (let i = 0; i < 26; i++) {
    const x = -44 + r() * 88, z = r() < 0.5 ? fz + 0.3 + r() * 2.5 : fz + 11.2 + r() * 2.5;
    add(B(0.08 + r() * 0.08, 0.004, 0.06 + r() * 0.06), litterM[i % 3], x, 0.004, z, r() * 3);
  }

  // A-frame boards outside the neighbours
  const board = (x, text) => {
    const t = labelTex(text, '#1e1d1b', '#efe6cf', 128, 160);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
    const wood = M('#6e5238', 0.85);
    for (const s of [-1, 1]) {
      const p = add(B(0.56, 0.86, 0.03), wood, x, 0.42, fz + 0.45 + s * 0.13, 0, -s * 0.28);
      const f = add(new THREE.PlaneGeometry(0.46, 0.7), mat, x, 0.43, fz + 0.45 + s * 0.15, s > 0 ? 0 : Math.PI, -s * 0.28);
      f.userData.keep = true;
      void p;
    }
    solid(x, fz + 0.45, 0.32, 0.25);
  };
  board(-6.6, 'TODAY'); board(6.8, 'FRESH');

  // a bike leaning on a rack
  const rx = 15.6, rz = fz + 2.55;
  for (const dx of [-0.5, 0.5]) {
    const hoop = add(new THREE.TorusGeometry(0.32, 0.025, 6, 18, Math.PI), steel, rx + dx, 0.0, rz);
    hoop.rotation.y = Math.PI / 2;
  }
  const bike = new THREE.Group();
  const tyre = new THREE.TorusGeometry(0.31, 0.03, 6, 22);
  for (const dx of [-0.52, 0.52]) { const w = new THREE.Mesh(tyre, black); w.position.set(dx, 0.33, 0); bike.add(w); }
  const tube = (x0, y0, x1, y1) => { const l = Math.hypot(x1 - x0, y1 - y0); const m = new THREE.Mesh(C(0.02, 0.02, l, 6), red); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(x0 - x1, y1 - y0); bike.add(m); };
  tube(-0.52, 0.33, 0, 0.36); tube(0, 0.36, 0.4, 0.75); tube(-0.1, 0.78, 0.4, 0.75); tube(-0.52, 0.33, -0.1, 0.78); tube(0, 0.36, -0.1, 0.78); tube(0.52, 0.33, 0.4, 0.75);
  const seat = new THREE.Mesh(B(0.2, 0.04, 0.09), black); seat.position.set(-0.12, 0.84, 0); bike.add(seat);
  const bar = new THREE.Mesh(C(0.018, 0.018, 0.5, 6), dark); bar.position.set(0.42, 0.84, 0); bar.rotation.x = Math.PI / 2; bike.add(bar);
  bike.position.set(rx, 0, rz + 0.12); bike.rotation.z = -0.05;
  g.add(bike);
  solid(rx, rz, 0.85, 0.3);

  // ------------------------------------------------------------ alleys
  const depth = 11;
  const rail = M('#2a2c2e', 0.6, 0.5);
  STREET.alleys.forEach(([a0, a1], ai) => {
    const w = a1 - a0;
    // fire escape bolted to the left wall: two landings with railings and a stair between
    const fx = a0 + 0.55, z0 = fz - 2.2, len = 3.2;
    for (const y of [3.4, 6.0]) {
      add(B(1.0, 0.05, len), rail, fx, y, z0 - len / 2);
      add(B(0.04, 0.04, len), rail, fx + 0.48, y + 0.92, z0 - len / 2);
      add(B(0.04, 0.04, len), rail, fx + 0.48, y + 0.5, z0 - len / 2);
      for (let k = 0; k <= 8; k++) add(B(0.025, 0.92, 0.025), rail, fx + 0.48, y + 0.46, z0 - k * len / 8);
      for (const zz of [z0, z0 - len]) { add(B(0.04, 0.04, 1.0), rail, fx, y + 0.92, zz).rotation.y = Math.PI / 2; }
    }
    const st = add(B(0.7, 0.05, 3.6), rail, fx + 0.05, 4.7, z0 - len / 2);
    st.rotation.x = Math.atan2(2.6, 3.2) * (ai ? 1 : -1);
    for (let k = 0; k < 9; k++) add(B(0.7, 0.03, 0.18), rail, fx + 0.05, 3.55 + k * 0.29, z0 - (ai ? len - 0.2 - k * 0.33 : 0.2 + k * 0.33));
    // drop ladder
    // (kept above head height so you can walk under it)
    for (const s of [-0.2, 0.2]) add(B(0.03, 1.4, 0.03), rail, fx + s, 2.75, z0 - len + 0.3);
    for (let k = 0; k < 5; k++) add(B(0.4, 0.025, 0.025), rail, fx, 2.15 + k * 0.3, z0 - len + 0.3);
    // drainpipe on the right wall
    add(C(0.06, 0.06, 7.8, 8), M('#5b5e60', 0.6, 0.4), a1 - 0.1, 3.9, fz - 3.4);
    add(B(0.18, 0.12, 0.18), M('#5b5e60', 0.6, 0.4), a1 - 0.1, 0.06, fz - 3.4);
    // back door + wall lamp on the back wall
    const bz = fz - depth + 0.21;
    add(B(1.0, 2.1, 0.06), M('#4a3a2c', 0.8), a0 + w * 0.62, 1.05, bz);
    add(B(1.2, 0.1, 0.4), M('#8d867a', 0.9), a0 + w * 0.62, 0.05, bz + 0.2);
    add(C(0.03, 0.03, 0.12, 6), steel, a0 + w * 0.62 + 0.38, 1.0, bz + 0.06, 0, Math.PI / 2);
    const lamp = add(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0.9 }), a0 + w * 0.62, 2.45, bz + 0.18);
    lamp.userData.keep = true;
    add(B(0.3, 0.06, 0.24), dark, a0 + w * 0.62, 2.57, bz + 0.12);
    // wall AC units
    for (const [y, zz] of [[4.2, fz - 6.8], [7.0, fz - 1.6]]) {
      add(B(0.5, 0.45, 0.7), M('#b9b6ae', 0.6, 0.3), a1 - 0.27, y, zz);
      add(B(0.02, 0.32, 0.5), dark, a1 - 0.53, y, zz);
    }
    // bin bags by the dumpster
    const bag = M('#1a1c1e', 0.35, 0.1);
    for (let k = 0; k < 4; k++) { const b = add(new THREE.IcosahedronGeometry(0.32, 1), bag, a0 + 2.4 + (k % 2) * 0.45, 0.24 + (k > 1 ? 0.28 : 0), fz - depth + 0.7 + (k % 3) * 0.25); b.scale.set(1, 0.75, 0.9); }
    // graffiti on the right wall
    const gm = new THREE.MeshStandardMaterial({ map: graffitiTex(11 + ai * 7), transparent: true, roughness: 0.85, depthWrite: false });
    const gr = add(new THREE.PlaneGeometry(3.2, 1.6), gm, a1 - 0.012, 1.5, fz - 7.6, -Math.PI / 2);
    gr.userData.keep = true;
    // cables strung across the alley
    for (const [y, zz] of [[5.6, fz - 1.0], [6.2, fz - 4.5], [5.9, fz - 8.0]]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(a0 + t * w, y - Math.sin(t * Math.PI) * 0.45, zz)); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 4), black, 0, 0, 0);
    }
  });
}
