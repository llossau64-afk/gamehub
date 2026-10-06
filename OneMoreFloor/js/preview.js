// Small standalone 3D viewport used by the shop (skins, weapons), the Register and the
// operator portrait. It owns its own canvas, which is moved into whichever panel needs it.
import * as THREE from '../lib/three.module.min.js';

export class Preview {
  constructor(opts = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xe8e0ff, 0x2a2018, 1.6));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 5, 4); this.scene.add(key);
    this.rim = new THREE.DirectionalLight(opts.rim || 0xf2b24a, 2.2); this.rim.position.set(3, 3, -4); this.scene.add(this.rim);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    // a floor disc so models don't float in a void
    if (opts.floor !== false) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.08, 32), new THREE.MeshLambertMaterial({ color: 0x24252b }));
      disc.position.y = -0.04; this.scene.add(disc); this.disc = disc;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.015, 4, 48), new THREE.MeshBasicMaterial({ color: 0xf2b24a }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring); this.ring = ring;
    }
    this.rotY = 0.5; this.autoSpin = opts.spin ?? 0.5; this.target = new THREE.Vector3(0, 0.6, 0); this.dist = 3.2; this.pitch = 0.18;
    this.model = null; this.mounted = null; this.t = 0;
    // drag to rotate
    let drag = null;
    this.canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: this.rotY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (drag) { this.rotY = drag.r + (e.clientX - drag.x) * 0.012; this.lastDrag = performance.now(); } });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.canvas.addEventListener('pointercancel', () => { drag = null; });
  }

  // frame: { height, dist, y } describe how to frame the model
  setModel(obj, frame = {}) {
    if (this.model) this.holder.remove(this.model);
    this.model = obj;
    if (obj) this.holder.add(obj);
    this.target.set(0, frame.y ?? 0.6, 0);
    this.dist = frame.dist ?? 3.2;
    this.pitch = frame.pitch ?? 0.18;
    if (frame.rot !== undefined) this.rotY = frame.rot;
    if (this.disc) { this.disc.visible = frame.floor !== false; this.ring.visible = frame.floor !== false; }
  }

  silhouette(on) {
    if (!this.model) return;
    this.model.traverse(o => {
      if (!o.isMesh) return;
      if (on) { if (!o.userData.realMat) o.userData.realMat = o.material; o.material = SIL; }
      else if (o.userData.realMat) o.material = o.userData.realMat;
    });
  }

  mount(el) {
    if (this.mounted === el) return;
    el.appendChild(this.canvas);
    this.mounted = el;
    this.resize();
  }
  unmount() { if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas); this.mounted = null; }

  resize() {
    const r = this.canvas.parentNode ? this.canvas.parentNode.getBoundingClientRect() : { width: 200, height: 200 };
    const w = Math.max(32, Math.round(r.width)), h = Math.max(32, Math.round(r.height));
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  render(dt) {
    if (!this.mounted || !this.canvas.isConnected) return;
    this.t += dt;
    this.resize();
    if (!this.lastDrag || performance.now() - this.lastDrag > 1500) this.rotY += dt * this.autoSpin;
    this.holder.rotation.y = this.rotY;
    if (this.onFrame) this.onFrame(dt, this.t);
    const c = this.camera, d = this.dist;
    c.position.set(this.target.x, this.target.y + Math.sin(this.pitch) * d, this.target.z + Math.cos(this.pitch) * d);
    c.lookAt(this.target);
    this.renderer.render(this.scene, c);
  }
}

const SIL = new THREE.MeshBasicMaterial({ color: 0x07070a });
