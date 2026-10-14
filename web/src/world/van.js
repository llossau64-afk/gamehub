// Holgs & Bonnie's blue van: a boxy panel van you can actually sit in. Local frame: the van
// drives along +x, the sliding door is on the -z side (the kerb side on our street).
// Walls are thin boxes so the inside reads properly when the camera rides along.
import * as THREE from 'three';

export const VAN = {
  L: 5.4, W: 2.0, floor: 0.55, roof: 2.3,
  door: { x0: -0.35, x1: 1.05 },             // the opening on the -z side
  seats: { driver: [1.45, 0.45], passenger: [1.45, -0.45], bench: [-1.55, -0.35] },
  inside: [0.35, -0.3],                      // just inside the door
};

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#2f62c8'; x.fillRect(0, 0, 1024, 256);
  // a racing stripe and stars
  x.fillStyle = '#f4f1e6'; x.fillRect(0, 196, 1024, 18);
  x.fillStyle = '#f2c230'; x.fillRect(0, 216, 1024, 10);
  x.textAlign = 'center';
  x.font = 'italic 900 112px Impact, "Arial Black", sans-serif';
  x.lineWidth = 14; x.strokeStyle = '#13285a'; x.strokeText('HOLGS & BONNIE', 512, 118);
  x.fillStyle = '#ffffff'; x.fillText('HOLGS & BONNIE', 512, 118);
  x.font = 'italic 800 52px Impact, "Arial Black", sans-serif';
  x.fillStyle = '#f2c230'; x.fillText('★ FREE RIDES ★', 512, 178);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeVan() {
  const g = new THREE.Group();
  const { L, W, floor, roof } = VAN;
  const paint = new THREE.MeshStandardMaterial({ color: '#2f62c8', roughness: 0.38, metalness: 0.35 });
  const inner = new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#16202b', roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.25, metalness: 0.9 });
  const seatM = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const T = 0.06, H = roof - floor;
  const cabX = 1.3;                     // the cab starts here (windows from here forward)
  // chassis, floor, roof
  box(L - 0.2, 0.22, W - 0.1, black, 0, 0.42, 0);
  box(L - 0.9, 0.06, W - 0.1, inner, -0.35, floor, 0);
  const roofM = box(L - 0.9, T, W, paint, -0.35, roof, 0);
  roofM.material = paint;
  // rear wall + doors
  box(T, H + 0.25, W, paint, -L / 2 + T / 2, floor + H / 2 - 0.1, 0);
  // +z side: one long wall below the window line, panel above in the cargo part
  box(cabX + L / 2, H + 0.25, T, paint, (cabX - L / 2) / 2, floor + H / 2 - 0.1, W / 2 - T / 2);
  // -z side: wall pieces around the door opening
  const d = VAN.door;
  box(d.x0 + L / 2, H + 0.25, T, paint, (d.x0 - L / 2) / 2, floor + H / 2 - 0.1, -W / 2 + T / 2);
  box(cabX - d.x1, H + 0.25, T, paint, (d.x1 + cabX) / 2, floor + H / 2 - 0.1, -W / 2 + T / 2);
  box(d.x1 - d.x0, 0.2, T, paint, (d.x0 + d.x1) / 2, floor + 0.0, -W / 2 + T / 2);          // sill
  box(d.x1 - d.x0, 0.2, T, paint, (d.x0 + d.x1) / 2, roof - 0.1, -W / 2 + T / 2);           // header
  // the cab: lower body, side windows, windscreen, nose
  for (const s of [1, -1]) {
    box(L / 2 - cabX - 0.45, 0.75, T, paint, (cabX + L / 2 - 0.45) / 2, floor + 0.3, s * (W / 2 - T / 2));
    const win = box(L / 2 - cabX - 0.5, 0.75, 0.02, glass, (cabX + L / 2 - 0.5) / 2, floor + 1.15, s * (W / 2 - 0.02));
    win.renderOrder = 2;
    box(0.08, 0.8, T, paint, cabX + 0.04, floor + 1.15, s * (W / 2 - T / 2));
  }
  const nose = box(0.75, 0.85, W, paint, L / 2 - 0.37, 0.75, 0);
  void nose;
  const ws = box(0.04, 0.95, W - 0.12, glass, L / 2 - 0.74, floor + 1.18, 0);
  ws.rotation.z = 0.32; ws.renderOrder = 2;
  box(0.5, T, W, paint, L / 2 - 0.95, roof - 0.04, 0);
  // bumpers, lights, grille
  box(0.14, 0.22, W + 0.06, chrome, L / 2 + 0.02, 0.45, 0);
  box(0.14, 0.22, W + 0.06, chrome, -L / 2 - 0.02, 0.45, 0);
  const lightM = new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: new THREE.Color('#fff2cc'), emissiveIntensity: 0.9 });
  const tailM = new THREE.MeshStandardMaterial({ color: '#c0261e', emissive: new THREE.Color('#c0261e'), emissiveIntensity: 0.6 });
  for (const s of [1, -1]) {
    box(0.04, 0.2, 0.34, lightM, L / 2 + 0.01, 0.92, s * 0.68);
    box(0.04, 0.32, 0.16, tailM, -L / 2 - 0.01, 1.1, s * 0.86);
  }
  box(0.04, 0.3, 0.9, black, L / 2 + 0.01, 0.85, 0);
  // wheels
  g.userData.wheels = [];
  const tyre = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
  for (const [wx, wz] of [[-1.75, 0.92], [1.75, 0.92], [-1.75, -0.92], [1.75, -0.92]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 18), tyre); t.rotation.x = Math.PI / 2; w.add(t);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.27, 10), chrome); hub.rotation.x = Math.PI / 2; w.add(hub);
    w.position.set(wx, 0.4, wz); g.add(w); g.userData.wheels.push(w);
  }
  // the sliding door (slides back along the outside)
  const door = new THREE.Group();
  const dp = new THREE.Mesh(new THREE.BoxGeometry(d.x1 - d.x0 + 0.04, H - 0.18, T), paint);
  dp.position.set((d.x1 - d.x0) / 2, floor + (H - 0.18) / 2 + 0.08, 0); door.add(dp);
  const dwin = new THREE.Mesh(new THREE.BoxGeometry(d.x1 - d.x0 - 0.3, 0.55, 0.02), glass);
  dwin.position.set((d.x1 - d.x0) / 2, floor + 1.25, -0.03); door.add(dwin);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05), chrome);
  handle.position.set(d.x1 - d.x0 - 0.15, floor + 0.95, -0.05); door.add(handle);
  door.position.set(d.x0, 0, -W / 2 + T / 2 - 0.02);
  g.add(door);
  g.userData.door = door;
  g.userData.doorX = d.x0;
  // signs on both sides (+ one on the door)
  const sign = signTexture();
  const sm = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.875), sm); s1.position.set(-0.85, floor + 1.0, W / 2 + 0.002); g.add(s1);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), sm); s2.rotation.y = Math.PI; s2.position.set(-1.5, floor + 1.05, -W / 2 - 0.002); g.add(s2);
  const s3 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), sm); s3.rotation.y = Math.PI; s3.position.set((d.x1 - d.x0) / 2, floor + 0.62, -T / 2 - 0.004); door.add(s3);
  const s4 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), sm); s4.rotation.y = -Math.PI / 2; s4.position.set(-L / 2 - 0.004, floor + 1.25, 0); g.add(s4);
  // inside: two front seats, a bench in the back, a dangling air freshener
  for (const s of [1, -1]) {
    box(0.55, 0.12, 0.5, seatM, 1.45, floor + 0.42, s * 0.45);
    const back = box(0.1, 0.7, 0.5, seatM, 1.15, floor + 0.82, s * 0.45); back.rotation.z = -0.12;
  }
  box(0.5, 0.12, W - 0.3, seatM, -1.6, floor + 0.42, 0);
  box(0.1, 0.65, W - 0.3, seatM, -1.88, floor + 0.78, 0);
  box(0.04, 0.4, W - 0.3, inner, -1.6, floor + 0.18, 0);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20), black); wheel.position.set(1.78, floor + 0.95, 0.45); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.5; g.add(wheel);
  const tree = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: 0.6 }));
  tree.position.set(1.95, floor + 1.4, 0); g.add(tree); g.userData.tree = tree;
  // a dim light inside, only on while somebody's in the back
  const lamp = new THREE.PointLight('#ffd9a0', 0, 3.6, 2); lamp.position.set(0.4, roof - 0.65, 0.3); g.add(lamp);
  g.userData.lamp = lamp;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = o !== ws; } });
  return g;
}
