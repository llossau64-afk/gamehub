// Barber mode: the camera moves in close, the chair turns, and the tool follows your
// cursor across the scalp. Cutting writes into the customer's hair length map.
import * as THREE from 'three';
import { spawnProp, part } from '../world/props.js';
import { propMaterial } from '../render/materials.js';
import { HEAD_C, REGIONS } from '../hair/hair.js';
import { GUARDS } from '../hair/styles.js';
import { audio } from '../audio/audio.js';
import { clamp, damp, dampAngle, rand, pick, chance, lerp } from '../core/util.js';

export const TOOLS = [
  { id: 'clipper', label: 'Clipper', icon: 'clipper', electric: true },
  { id: 'scissors', label: 'Scissors', icon: 'scissors', electric: false },
  { id: 'trimmer', label: 'Trimmer', icon: 'trimmer', electric: true },
];

const SMALLTALK = [
  'So... how long have you been cutting hair?', 'Nice weather today, huh?', 'Is that chair supposed to squeak?',
  'My cousin used to come here. Years ago.', 'You see the game last night?', 'I like the vibe in here. Kind of.',
  'Do you do beards too?', 'Not too short, okay?',
];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

export class BarberMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.raycaster = new THREE.Raycaster();
    this.tool = 'clipper';
    this.guard = 4;
    this.power = false;
    this.camPitch = 0.32;
    this.camDist = 0.66;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.toolObjs = {};
    this.toolPos = new THREE.Vector3();
    this.toolQuat = new THREE.Quaternion();
    this.snipT = 0;
    this.bladeOpen = 0.4;
    this.motor = null;
    this.load = 0;
    this.statsT = 0;
    this.stats = null;
    this.time = 0;
    this.onEvent = null;   // tutorial hook: (name, data)
    this.allowFinish = true;
    this.lockTools = null;
  }

  makeTools() {
    const fx = this.game.fx;
    for (const o of Object.values(this.toolObjs)) o.parent?.remove(o);
    const cl = spawnProp(fx.clipper === 'pro' ? 'ClipperPro' : 'ClipperCheap', { shadows: false });
    if (fx.clipper === 'basic') cl.traverse((o) => { if (o.isMesh && o.userData.materialName === 'Plastic') o.material = propMaterial('PlasticRed'); });
    if (fx.clipper === 'rusty') cl.traverse((o) => { if (o.isMesh && o.userData.materialName === 'Steel') o.material = propMaterial('ChromeWorn'); });
    const gd = spawnProp('Guard', { shadows: false });
    cl.add(gd);
    this.guardObj = gd;
    const sc = spawnProp('Scissors', { shadows: false });
    if (fx.scissorsPro) sc.traverse((o) => { if (o.isMesh && o.userData.materialName === 'Steel') o.material = propMaterial('Gold'); });
    const tr = spawnProp('Trimmer', { shadows: false });
    this.toolObjs = { clipper: cl, scissors: sc, trimmer: tr };
    for (const o of Object.values(this.toolObjs)) {
      o.visible = false;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.renderOrder = 4; } });
      this.game.scene.add(o);
    }
    this.bladeA = part(sc, 'bladeA');
    this.bladeB = part(sc, 'bladeB');
  }

  enter(customer, opts = {}) {
    this.c = customer;
    this.active = true;
    this.time = 0;
    this.tool = opts.tool || null;
    this.power = false;
    this.guard = 4;
    this.warned = false;
    this.smalltalkT = rand(14, 22);
    this.lastSnip = 0;
    this.camYawOff = 0.42;
    this.camPitch = 0.3;
    this.camDist = 0.7;
    this.makeTools();
    const g = this.game;
    g.ui.hideRequest();
    g.ui.showBarber({
      cutName: customer.cut.name,
      tools: TOOLS,
      onTool: (id) => this.selectTool(id),
      onPower: () => this.togglePower(),
      onGuard: (i) => this.setGuard(i),
      onFinish: () => this.requestFinish(),
    });
    g.ui.showHud(true, { crosshair: false, buttons: false });
    g.ui.prompt(null);
    g.input.setMode('pointer');
    this.headCenter(this.camLook);
    this.stats = customer.hair.regionStats();
    this.refreshUI();
    g.player.arms.R.set({ visible: false, speed: 26 });
    g.player.arms.L.set({ visible: false });
    if (this.tool) this.selectTool(this.tool, true);
  }

  exit() {
    this.active = false;
    if (this.motor) { this.motor.stop(); this.motor = null; }
    this.power = false;
    for (const o of Object.values(this.toolObjs)) { o.parent?.remove(o); }
    this.toolObjs = {};
    const g = this.game;
    g.ui.hideBarber();
    g.player.arms.R.set({ visible: false, speed: 9 });
    if (this.c) this.c.hair.setHighlight(null);
  }

  headCenter(out) {
    return this.c.hair.mesh.localToWorld(out.copy(HEAD_C));
  }

  // ---------------------------------------------------------------- tool controls
  selectTool(id, silent = false) {
    if (this.lockTools && !this.lockTools.includes(id)) { audio.error(); return; }
    if (this.tool === id && !silent) return;
    const prev = this.tool;
    this.tool = id;
    if (this.motor) { this.motor.stop(); this.motor = null; }
    const keepPower = false;
    this.power = keepPower;
    for (const [k, o] of Object.entries(this.toolObjs)) o.visible = k === id;
    this.swapT = 0.35;
    audio.whoosh(0.5);
    if (id === 'scissors') audio.scissorOpen();
    else audio.noiseBurst(0.06, { vol: 0.12, freq: 900, q: 1 });
    this.refreshUI();
    this.onEvent?.('tool', id);
  }

  togglePower() {
    const t = TOOLS.find((x) => x.id === this.tool);
    if (!t || !t.electric) return;
    this.power = !this.power;
    if (this.power) {
      this.motor = audio.motor(this.tool === 'trimmer' ? 'trimmer' : (this.game.fx.clipper === 'pro' ? 'clipperPro' : 'clipperCheap'));
      if (!this.reactedPower) { this.reactedPower = true; this.c.ch.setEmotion('surprised', 0.9); this.c.ch.gesture('flinch'); }
      this.onEvent?.('power', true);
      if (navigator.vibrate && this.game.input.touch) navigator.vibrate(30);
    } else if (this.motor) { this.motor.stop(); this.motor = null; }
    this.refreshUI();
  }

  setGuard(i) {
    this.guard = clamp(i, 0, GUARDS.length - 1);
    audio.noiseBurst(0.03, { vol: 0.15, freq: 2400, q: 3 });
    audio.tick();
    this.refreshUI();
    this.onEvent?.('guard', this.guard);
  }

  requestFinish() {
    if (!this.allowFinish) { audio.error(); return; }
    this.onEvent?.('finish');
    this.game.finishHaircut();
  }

  refreshUI() {
    const t = TOOLS.find((x) => x.id === this.tool);
    this.game.ui.updateBarber({
      tool: this.tool, power: this.power, electric: !!(t && t.electric), guard: this.guard,
      cut: this.c.cut, stats: this.stats, time: this.time, focus: this.focus,
    });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (!this.active) return;
    const g = this.game, input = g.input, c = this.c;
    this.time += dt;

    // keyboard shortcuts
    if (input.pressed('tool1')) this.selectTool('clipper');
    if (input.pressed('tool2')) this.selectTool('scissors');
    if (input.pressed('tool3')) this.selectTool('trimmer');
    if (input.pressed('power')) this.togglePower();
    if (this.tool === 'clipper') {
      if (input.pressed('guardDown')) this.setGuard(this.guard - 1);
      if (input.pressed('guardUp')) this.setGuard(this.guard + 1);
    }
    if (input.pressed('finish')) this.requestFinish();

    // chair rotation + camera orbit
    let turn = 0;
    if (input.held('orbitLeft')) turn -= 1;
    if (input.held('orbitRight')) turn += 1;
    let pitch = 0;
    if (input.held('orbitUp')) pitch += 1;
    if (input.held('orbitDown')) pitch -= 1;
    const p = input.pointer;
    const head = this.headCenter(_v2.set(0, 0, 0)).clone();
    // pick the hair under the cursor
    const ndc = new THREE.Vector2(p.x, p.y + (p.touch ? 0.09 : 0));
    this.raycaster.setFromCamera(ndc, g.camera);
    const hit = c.hair.pick(this.raycaster.ray, 0.02);
    // dragging off the head turns the chair / tilts the view
    if (p.down && !hit && !this.cutting) this.dragging = true;
    if (!p.down) { this.dragging = false; this.cutting = false; }
    if ((this.dragging || p.right) && (p.dragDX || p.dragDY)) {
      g.chairAngleTarget -= p.dragDX * 0.008;
      this.camPitch = clamp(this.camPitch + p.dragDY * 0.004, -0.25, 1.15);
    }
    g.chairAngleTarget += turn * dt * 2.2;
    this.camPitch = clamp(this.camPitch + pitch * dt * 1.2, -0.25, 1.15);
    this.camDist = clamp(this.camDist + input.wheel * 0.05 + input.pinch * 0.05, 0.42, 1.0);
    // camera
    const yaw = this.camYawOff;
    const target = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(yaw) * Math.cos(this.camPitch))
      .multiplyScalar(this.camDist).add(head);
    if (!this.camInit) { this.camPos.copy(g.camera.position); this.camInit = true; }
    this.camPos.lerp(target, 1 - Math.exp(-7 * dt));
    this.camLook.lerp(head, 1 - Math.exp(-9 * dt));
    if (!g.dir.cam.active) {
      g.camera.position.copy(this.camPos);
      g.camera.lookAt(this.camLook);
    }

    // tool placement
    const toolObj = this.toolObjs[this.tool];
    let cutting = false;
    if (toolObj) {
      this.swapT = Math.max(0, (this.swapT || 0) - dt);
      const n = new THREE.Vector3(), z = new THREE.Vector3(), yv = new THREE.Vector3();
      let pos;
      if (hit) {
        const len = c.hair.lengthAt(hit.phi, hit.theta) * 0.06;
        n.copy(hit.normal);
        const towardCrown = head.clone().add(new THREE.Vector3(0, 0.15, 0)).sub(hit.point);
        towardCrown.addScaledVector(n, -towardCrown.dot(n)).normalize();
        const side = new THREE.Vector3().crossVectors(n, towardCrown).normalize();
        const camDir = g.camera.position.clone().sub(hit.point).normalize();
        if (this.tool === 'scissors') {
          z.copy(side).multiplyScalar(Math.sign(side.dot(new THREE.Vector3().crossVectors(camDir, n))) || 1);
          yv.copy(n);
          pos = hit.point.clone().addScaledVector(n, Math.max(0.004, len * 0.55));
        } else {
          const into = this.tool === 'trimmer' ? 0.75 : 0.5;
          z.copy(n).multiplyScalar(-into).addScaledVector(towardCrown, 1 - into * 0.5).normalize();
          yv.copy(camDir).addScaledVector(z, -camDir.dot(z)).normalize();
          const guardLen = this.tool === 'clipper' ? GUARDS[this.guard].len * 0.06 : 0;
          pos = hit.point.clone().addScaledVector(n, 0.004 + guardLen * 0.6 + (p.down ? 0 : 0.012)).addScaledVector(z, -0.07);
        }
      } else {
        const ray = this.raycaster.ray;
        const d = g.camera.position.distanceTo(head) * 0.92;
        pos = ray.origin.clone().addScaledVector(ray.direction, d);
        z.copy(ray.direction).negate().multiplyScalar(-1).normalize();
        z.set(0, 0.3, 0).sub(ray.direction).normalize().negate();
        z.copy(ray.direction).addScaledVector(new THREE.Vector3(0, 1, 0), 0.6).normalize();
        yv.copy(g.camera.position).sub(pos).normalize();
        yv.addScaledVector(z, -yv.dot(z)).normalize();
      }
      const x = new THREE.Vector3().crossVectors(yv, z).normalize();
      yv.crossVectors(z, x);
      const q = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, yv, z));
      if (!this.toolInit || this.swapT > 0.3) { this.toolPos.copy(pos); this.toolQuat.copy(q); this.toolInit = true; }
      this.toolPos.lerp(pos, 1 - Math.exp(-28 * dt));
      this.toolQuat.slerp(q, 1 - Math.exp(-16 * dt));
      toolObj.position.copy(this.toolPos);
      toolObj.quaternion.copy(this.toolQuat);
      const pop = 1 - this.swapT / 0.35;
      toolObj.scale.setScalar(0.6 + 0.4 * Math.min(1, pop * 1.2));
      if (this.power) {
        toolObj.position.x += (Math.random() - 0.5) * 0.0012;
        toolObj.position.y += (Math.random() - 0.5) * 0.0012;
      }
      if (this.tool === 'clipper') this.guardObj.visible = this.guard >= 2;
      // the barber's hand follows the tool
      const grip = toolObj.localToWorld(new THREE.Vector3(0, 0, this.tool === 'scissors' ? 0.07 : 0.06));
      const camInv = g.camera.matrixWorldInverse;
      const gp = grip.clone().applyMatrix4(camInv);
      const fd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.toolQuat).transformDirection(camInv);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.toolQuat).transformDirection(camInv);
      g.player.arms.R.set({ visible: false, pos: gp, fingers: fd.clone().multiplyScalar(0.6).add(up.clone().multiplyScalar(-0.4)), palm: up.clone().negate(), pose: this.tool === 'scissors' ? 'scissors' : 'grip', speed: 30 });

      // ---- cutting
      if (hit && p.down && !this.dragging) {
        cutting = true;
        this.cutting = true;
        const fx = g.fx;
        let removed = 0;
        if (this.tool === 'clipper' && this.power) {
          removed = c.hair.clip(hit.phi, hit.theta, GUARDS[this.guard].len, fx.clipperRate, dt, 0.021);
        } else if (this.tool === 'trimmer' && this.power) {
          removed = c.hair.trim(hit.phi, hit.theta, 3.2, dt, 0.009);
        } else if (this.tool === 'scissors') {
          this.snipT -= dt;
          if (this.snipT <= 0) {
            this.snipT = fx.scissorsPro ? 0.15 : 0.19;
            this.snipAnim = 0.12;
            audio.snip();
            removed = c.hair.snip(hit.phi, hit.theta, fx.scissorsPro ? 0.05 : 0.06, 0.11, fx.scissorsPro ? 0.028 : 0.032);
            this.onEvent?.('snip');
          }
        } else if ((this.tool === 'clipper' || this.tool === 'trimmer') && !this.power && p.justDown) {
          g.ui.tip(g.input.touch ? 'Tap POWER to switch it on' : 'Press SPACE to switch it on', 'Space');
          clearTimeout(this._tipT);
          this._tipT = setTimeout(() => g.ui.tip(null), 1800);
          audio.error();
        }
        if (removed > 0) {
          const amt = removed * (this.tool === 'scissors' ? 260 : 900);
          g.clippings.spawn(hit.point, hit.normal, amt, c.look.hairColor, clamp(c.hair.lengthAt(hit.phi, hit.theta) + removed * 3, 0.05, 0.6));
          this.load = Math.min(1, this.load + removed * 30);
          this.cutDirty = true;
        }
      }
    }
    if (!cutting) this.snipT = Math.min(this.snipT, 0.02);
    this.load = damp(this.load, 0, 6, dt);
    if (this.motor) this.motor.setLoad(this.load);
    // scissors blades
    this.snipAnim = Math.max(0, (this.snipAnim || 0) - dt);
    const open = this.snipAnim > 0 ? (this.snipAnim > 0.06 ? 0.0 : 0.25) : 0.32;
    this.bladeOpen = damp(this.bladeOpen, open, 30, dt);
    if (this.bladeA) { this.bladeA.rotation.y = this.bladeOpen; this.bladeB.rotation.y = -this.bladeOpen; }

    // customer reactions
    this.react(dt, cutting);

    // UI refresh
    this.statsT -= dt;
    if (this.statsT <= 0) {
      this.statsT = 0.12;
      if (this.cutDirty) { this.stats = c.hair.regionStats(); this.cutDirty = false; this.checkTooShort(); this.onEvent?.('stats', this.stats); }
      this.refreshUI();
    }
  }

  react(dt, cutting) {
    const c = this.c;
    const ch = c.ch;
    if (!c.tutorial) {
      this.smalltalkT -= dt;
      if (this.smalltalkT <= 0) {
        this.smalltalkT = rand(18, 30);
        c.say(pick(SMALLTALK), null);
      }
    }
    // eyes follow the tool a little, head stays still while cutting
    ch.lookAt(this.toolPos, cutting ? 0.25 : 0.5);
    ch.headTurnSpeed = 2;
  }

  checkTooShort() {
    const cut = this.c.cut;
    for (const r of ['top', 'front', 'left', 'right', 'back']) {
      const s = this.stats[r];
      if (cut.target[r] > 0.06 && s.mean < cut.target[r] - cut.tol * 1.7 && !this.warned) {
        this.warned = true;
        this.c.ch.gesture('flinch');
        this.c.say(pick(['Whoa, whoa! Careful up there!', 'Uh... is it supposed to be that short?', 'Easy! I need some of that!']), 'wince', 2.5);
        this.onEvent?.('tooShort', r);
      }
    }
  }
}
