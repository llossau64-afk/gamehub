// Barber mode: the camera moves in close, the chair turns, and the tool follows your
// cursor across the scalp. Cutting writes into the customer's hair length map.
import * as THREE from 'three';
import { spawnProp, part } from '../world/props.js';
import { propMaterial } from '../render/materials.js';
import { HEAD_C, REGIONS, REGION_ID, EDGE_REGIONS } from '../hair/hair.js';
import { BEARD_ID } from '../hair/beard.js';
import { GUARDS, stats as cutStats } from '../hair/styles.js';
import { audio } from '../audio/audio.js';
import { inventory, applySkin } from './items.js';
import { clamp, damp, dampAngle, rand, pick, chance, lerp, smooth } from '../core/util.js';

export const TOOLS = [
  { id: 'clipper', label: 'Clipper', icon: 'clipper', electric: true },
  { id: 'scissors', label: 'Scissors', icon: 'scissors', electric: false },
  { id: 'trimmer', label: 'Trimmer', icon: 'trimmer', electric: true },
  { id: 'comb', label: 'Comb', icon: 'comb', electric: false },
  { id: 'spray', label: 'Spray', icon: 'spray', electric: false },
  { id: 'dye', label: 'Colour', icon: 'paint', electric: false },
];

const SMALLTALK = [
  'So... how long have you been cutting hair?', 'Nice weather today, huh?', 'Is that chair supposed to squeak?',
  'My cousin used to come here. Years ago.', 'You see the game last night?', 'I like the vibe in here. Kind of.',
  'Do you do beards too?', 'Not too short, okay?',
];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

// camera yaw around the head, relative to the customer's back (the chair never turns)
const VIEW_YAW = { back: 0, right: Math.PI / 2, front: Math.PI, left: -Math.PI / 2 };
const PITCH_MIN = -0.3, PITCH_MAX = 1.2;

const _inv = new THREE.Matrix4(), _R1 = new THREE.Vector3(), _R2 = new THREE.Vector3(), _C2 = new THREE.Vector3(), _sc = new THREE.Vector3();

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
    const cb = spawnProp('Comb', { shadows: false });
    const sp = spawnProp('Spray', { shadows: false });
    // dye brush: wooden handle, bristles soaked in the requested colour
    const db = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.12, 10), propMaterial('WoodDark'));
    handle.rotation.x = Math.PI / 2; handle.position.z = 0.06; db.add(handle);
    this.dyeBristleMat = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.03), this.dyeBristleMat);
    head.position.z = -0.01; db.add(head);
    this.toolObjs = { clipper: cl, scissors: sc, trimmer: tr, comb: cb, spray: sp, dye: db };
    const eq = inventory(this.game.save).equip;
    for (const t of ['clipper', 'scissors', 'spray']) if (eq[t]) applySkin(this.toolObjs[t], t, eq[t]);
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
    this.combed = new Set();
    this.smalltalkT = rand(14, 22);
    this.lastSnip = 0;
    // camera: orbits the head in "rotate" mode (left panel / right mouse / A D W S); the chair stays put
    const beardOnly = customer.cut.beard && !('top' in customer.cut.target);
    this.orbYaw = this.orbYawT = beardOnly ? Math.PI - 0.35 : 0.35;
    this.orbPitch = this.orbPitchT = 0.3;
    this.camDist = 0.7;
    this.mode = 'cut';
    this.close = false;
    this.makeTools();
    if (customer.dyeReq) {
      this.dyeBristleMat.color.set(customer.dyeReq.color);
      customer.hair.setDyeColor(customer.dyeReq.color);
      customer.beard?.setDyeColor(customer.dyeReq.color);
    }
    const g = this.game;
    g.ui.hideRequest();
    g.ui.showBarber({
      cutName: customer.cut.name,
      regions: Object.keys(customer.cut.target),
      style: !!customer.cut.style,
      dye: customer.dyeReq || null,
      tools: TOOLS.filter((t) => t.id !== 'dye' || customer.dyeReq),
      onTool: (id) => this.selectTool(id),
      onPower: () => this.togglePower(),
      onGuard: (i) => this.setGuard(i),
      onFinish: () => this.requestFinish(),
      onMode: (m) => this.setMode(m),
      refImg: customer.refImg,
      onRef: () => this.game.ui.showReference(customer.cut, customer.refImg),
      onClose: () => this.toggleClose(),
    });
    this.game.setChairAngle(0, 3);
    this.game.ui.setBarberMode?.(this.mode, this.close);
    g.ui.showHud(true, { crosshair: false, buttons: false });
    g.ui.prompt(null);
    g.input.setMode('pointer');
    this.headCenter(this.camLook);
    this.stats = cutStats(customer);
    this.refreshUI();
    this.fadeRay ||= new THREE.Raycaster();
    this.prepareChairFade();
    this.bow = 0; this.fadeA = 1;
    g.player.arms.R.set({ visible: false, speed: 26 });
    g.player.arms.L.set({ visible: false });
    if (this.tool) this.selectTool(this.tool, true);
    if (!opts.tutorial) this.introduceMechanics(customer);
  }

  // new mechanics get one short tip the first time they show up
  introduceMechanics(c) {
    const g = this.game;
    const seen = (g.save.hints ||= []);
    const tips = [];
    if (!seen.includes('combSpray')) tips.push(['combSpray', g.input.touch ? 'New tools: comb for a groomed finish, spray for cleaner scissor cuts' : 'New tools: comb (4) for a groomed finish, spray (5) for cleaner scissor cuts']);
    if (c.cut.fade && !seen.includes('fade')) tips.push(['fade', 'Fade: short guard at the bottom, then longer guards higher up']);
    if (c.cut.beard && !seen.includes('beard')) tips.push(['beard', 'Beard: rotate the view to the front, trimmer for the neckline']);
    if (c.cut.style && !seen.includes('style')) tips.push(['style', c.cut.style === 'part' ? 'Side part: cut first, then comb the top until it lies flat. Spray helps.' : c.cut.style === 'center' ? 'Curtains: cut first, then comb the top away from the middle. Spray helps.' : 'Slick back: cut first, then comb the top back until it lies flat. Spray helps.']);
    if (c.cut.curly && !seen.includes('curly')) tips.push(['curly', 'Curly hair: scissors on top, clippers for the fade']);
    if (c.vip && !seen.includes('vip')) tips.push(['vip', 'VIP: four stars or more, or your reputation takes a hit']);
    let t = 600;
    for (const [id, text] of tips) {
      seen.push(id);
      setTimeout(() => { if (this.active) g.ui.tip(text); }, t);
      t += 4200;
      setTimeout(() => { if (this.active) g.ui.tip(null); }, t - 400);
    }
    if (tips.length) g.persist();
  }

  exit() {
    this.active = false;
    if (this.motor) { this.motor.stop(); this.motor = null; }
    this.power = false;
    for (const o of Object.values(this.toolObjs)) { o.parent?.remove(o); }
    this.toolObjs = {};
    const g = this.game;
    g.ui.hideBarber();
    g.ui.tip(null);
    g.player.arms.R.set({ visible: false, speed: 9 });
    this.resetChairFade();
    this.mode = 'cut'; this.close = false;
    const cv = document.querySelector('canvas'); if (cv) cv.style.cursor = '';
    if (this.c) this.focusRegion(null);
  }

  // glow on a region of whichever surface owns it
  focusRegion(r) {
    this.focus = r;
    this.c.hair.setHighlight(r && REGION_ID[r] ? r : null);
    if (this.c.beard) this.c.beard.setHighlight(r && BEARD_ID[r] ? r : null);
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
      styled: this.c.cut.style ? this.c.hair.styledShare() : null,
      dyed: this.c.dyeReq ? this.dyeCoverage() : null,
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
    if (input.pressed('tool4')) this.selectTool('comb');
    if (input.pressed('tool5')) this.selectTool('spray');
    if (input.pressed('tool6') && this.c.dyeReq) this.selectTool('dye');
    if (input.pressed('power')) this.togglePower();
    if (this.tool === 'clipper') {
      if (input.pressed('guardDown')) this.setGuard(this.guard - 1);
      if (input.pressed('guardUp')) this.setGuard(this.guard + 1);
    }
    if (input.pressed('finish')) this.requestFinish();

    if (input.pressed('rotateMode')) this.setMode(this.mode === 'rotate' ? 'cut' : 'rotate');
    if (input.pressed('closeView')) this.toggleClose();
    const p = input.pointer;
    const head = this.headCenter(_v2.set(0, 0, 0)).clone();
    // pick the hair under the cursor
    const ndc = new THREE.Vector2(p.x, p.y + (p.touch ? 0.09 : 0));
    this.raycaster.setFromCamera(ndc, g.camera);
    let hit = c.hair.pick(this.raycaster.ray, 0.02);
    if (hit) { hit.sys = c.hair; hit.distance = hit.point.distanceTo(g.camera.position); }
    const bh = c.beard ? c.beard.pick(this.raycaster) : null;
    if (bh && (!hit || bh.distance < hit.distance + 0.004)) hit = bh;
    // camera orbit: right mouse always, left mouse in rotate mode, keys any time
    const orbiting = (p.right || (this.mode === 'rotate' && p.down));
    this.dragging = orbiting;
    if (orbiting && (p.dragDX || p.dragDY)) {
      this.orbYawT -= p.dragDX * 0.0075;
      this.orbPitchT = clamp(this.orbPitchT + p.dragDY * 0.005, PITCH_MIN, PITCH_MAX);
    }
    let ky = 0, kp = 0;
    if (input.held('orbitLeft')) ky += 1;
    if (input.held('orbitRight')) ky -= 1;
    if (input.held('orbitUp')) kp += 1;
    if (input.held('orbitDown')) kp -= 1;
    this.orbYawT += ky * dt * 2.0;
    this.orbPitchT = clamp(this.orbPitchT + kp * dt * 1.3, PITCH_MIN, PITCH_MAX);
    if (!p.down) this.cutting = false;
    // critically damped follow: no snapping, no lag that feels floaty
    this.orbYaw = damp(this.orbYaw, this.orbYawT, 12, dt);
    this.orbPitch = damp(this.orbPitch, this.orbPitchT, 12, dt);
    this.camDist = damp(this.camDist, this.close ? 0.3 : 0.7, 7, dt);
    const back = c.ch.root.rotation.y + Math.PI;          // direction of the customer's back
    const yaw = back + this.orbYaw;
    // behind the customer: he bows his head a little, the backrest gets out of the way
    this.updateBow(dt, head);
    const pitchE = this.orbPitch + this.bow * 0.22;
    const dirC = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitchE), Math.sin(pitchE), Math.cos(yaw) * Math.cos(pitchE));
    const target = dirC.clone().multiplyScalar(this.camDist).add(head);
    // close-up looks at the skin surface facing the camera (hairline, sideburns, nape)
    const look = head.clone();
    this.closeK = damp(this.closeK || 0, this.close ? 1 : 0, 7, dt);
    if (this.closeK > 0.001) look.addScaledVector(dirC, 0.07 * this.closeK).add(new THREE.Vector3(0, 0.012 * this.closeK, 0));
    if (!this.camInit) { this.camPos.copy(g.camera.position); this.camInit = true; }
    this.camPos.lerp(target, 1 - Math.exp(-14 * dt));
    this.camLook.lerp(look, 1 - Math.exp(-14 * dt));
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
        const len = hit.sys.lengthAt(hit.phi, hit.theta) * 0.06;
        n.copy(hit.normal);
        const towardCrown = head.clone().add(new THREE.Vector3(0, 0.15, 0)).sub(hit.point);
        towardCrown.addScaledVector(n, -towardCrown.dot(n)).normalize();
        const side = new THREE.Vector3().crossVectors(n, towardCrown).normalize();
        const camDir = g.camera.position.clone().sub(hit.point).normalize();
        if (this.tool === 'scissors') {
          z.copy(side).multiplyScalar(Math.sign(side.dot(new THREE.Vector3().crossVectors(camDir, n))) || 1);
          yv.copy(n);
          pos = hit.point.clone().addScaledVector(n, Math.max(0.004, len * 0.55));
        } else if (this.tool === 'dye') {
          // bristles down onto the hair, handle pointing away from the head
          z.copy(n).multiplyScalar(-0.6).addScaledVector(towardCrown, 0.8).normalize();
          yv.copy(n);
          pos = hit.point.clone().addScaledVector(n, 0.01 + len * 0.4);
        } else if (this.tool === 'comb') {
          // teeth (-y) into the hair, spine along the stroke
          yv.copy(n);
          z.copy(side);
          pos = hit.point.clone().addScaledVector(n, 0.012 + len * 0.35);
        } else if (this.tool === 'spray') {
          // nozzle (+z) aimed at the hair from a hand's width away
          z.copy(n).negate();
          yv.set(0, 1, 0).addScaledVector(z, -z.y).normalize();
          pos = hit.point.clone().addScaledVector(n, 0.12).addScaledVector(side, 0.05).addScaledVector(yv, -0.19);
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
      // never through the head: push the whole tool out of the skull (and jaw) if any part pokes in
      const push = this.depenetrate(toolObj);
      if (push) this.toolPos.add(push);
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
      if (hit && p.down && !this.dragging && this.mode === 'cut') {
        cutting = true;
        this.cutting = true;
        const fx = g.fx;
        let removed = 0;
        const sys = hit.sys, beard = sys !== c.hair;
        if (this.tool === 'clipper' && this.power) {
          removed = sys.clip(hit.phi, hit.theta, GUARDS[this.guard].len, fx.clipperRate, dt, beard ? undefined : 0.021);
        } else if (this.tool === 'trimmer' && this.power) {
          removed = sys.trim(hit.phi, hit.theta, 3.2, dt, beard ? undefined : 0.009);
        } else if (this.tool === 'scissors') {
          this.snipT -= dt;
          if (this.snipT <= 0) {
            this.snipT = fx.scissorsPro ? 0.15 : 0.19;
            this.snipAnim = 0.12;
            audio.snip();
            removed = beard ? sys.snip(hit.phi, hit.theta, fx.scissorsPro ? 0.035 : 0.045, 0.05) : sys.snip(hit.phi, hit.theta, fx.scissorsPro ? 0.05 : 0.06, 0.11, fx.scissorsPro ? 0.028 : 0.032);
            this.onEvent?.('snip');
          }
        } else if (this.tool === 'comb') {
          const mv = Math.hypot(p.dragDX, p.dragDY);
          if (mv > 0.5 || p.touch) {
            sys.comb(hit.phi, hit.theta, beard ? undefined : 0.03);
            if (!beard && this.c.cut.style) this.cutDirty = true;
            this.markCombed(sys, hit);
            this.combSnd = (this.combSnd || 0) - dt;
            if (this.combSnd <= 0) { this.combSnd = 0.12; audio.noiseBurst(0.05, { vol: 0.05, freq: rand(2500, 3800), q: 2 }); }
          }
        } else if (this.tool === 'dye' && c.dyeReq) {
          const mv = Math.hypot(p.dragDX, p.dragDY);
          if (mv > 0.3 || p.touch) {
            sys.paintDye(hit.phi, hit.theta, dt, beard ? 0.02 : 0.032);
            this.dyeT = (this.dyeT || 0) - dt;
            if (this.dyeT <= 0) { this.dyeT = 0.14; audio.noiseBurst(0.08, { vol: 0.04, freq: 1200, q: 1.4 }); }
            this.cutDirty = true;
          }
        } else if (this.tool === 'spray') {
          this.sprayT = (this.sprayT || 0) - dt;
          if (this.sprayT <= 0 || p.justDown) {
            this.sprayT = 0.35;
            sys.spray(hit.phi, hit.theta, 0.05);
            audio.noiseBurst(0.22, { vol: 0.14, type: 'highpass', freq: 3200, attack: 0.01 });
            const nozzle = toolObj.localToWorld(new THREE.Vector3(0, 0.205, 0.05));
            g.mist?.burst(nozzle, hit.point);
            this.sprayAnim = 0.15;
            this.onEvent?.('spray');
          }
        } else if ((this.tool === 'clipper' || this.tool === 'trimmer') && !this.power && p.justDown) {
          g.ui.tip(g.input.touch ? 'Tap POWER to switch it on' : 'Press SPACE to switch it on', 'Space');
          clearTimeout(this._tipT);
          this._tipT = setTimeout(() => g.ui.tip(null), 1800);
          audio.error();
        }
        if (removed > 0) {
          const amt = removed * (this.tool === 'scissors' ? 260 : 900);
          g.clippings.spawn(hit.point, hit.normal, amt, c.look.hairColor, clamp(hit.sys.lengthAt(hit.phi, hit.theta) + removed * 3, 0.05, 0.6));
          this.load = Math.min(1, this.load + removed * 30);
          this.cutDirty = true;
        }
      }
    }
    if (!cutting) this.snipT = Math.min(this.snipT, 0.02);
    this.load = damp(this.load, 0, 6, dt);
    if (this.motor) this.motor.setLoad(this.load);
    this.sprayAnim = Math.max(0, (this.sprayAnim || 0) - dt);
    const spO = this.toolObjs.spray;
    if (spO) spO.scale.y = spO.scale.x * (1 - this.sprayAnim * 0.25);
    // scissors blades
    this.snipAnim = Math.max(0, (this.snipAnim || 0) - dt);
    const open = this.snipAnim > 0 ? (this.snipAnim > 0.06 ? 0.0 : 0.25) : 0.32;
    this.bladeOpen = damp(this.bladeOpen, open, 30, dt);
    if (this.bladeA) { this.bladeA.rotation.y = this.bladeOpen; this.bladeB.rotation.y = -this.bladeOpen; }

    // customer reactions
    this.react(dt, cutting);
    this.updateChairFade(dt, head);

    // UI refresh
    this.statsT -= dt;
    if (this.statsT <= 0) {
      this.statsT = 0.12;
      if (this.cutDirty) { this.stats = cutStats(c); this.cutDirty = false; this.checkTooShort(); this.onEvent?.('stats', this.stats); }
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
    // eyes follow the tool a little, head stays still while cutting; head down while the nape is worked on
    if (this.bow > 0.3) ch.lookAt(ch.root.localToWorld(new THREE.Vector3(0, 0.2, 1.2)), 0.3);
    else ch.lookAt(this.toolPos, cutting ? 0.25 : 0.5);
    ch.headTurnSpeed = 2;
    const b = smooth(this.bow);
    ch.extra.Neck = [0.34 * b, 0, 0];
    ch.extra.Head = [0.3 * b, 0, 0];
    ch.extra.Chest = [0.08 * b, 0, 0];
  }

  // sample points over the tool's bounds; returns the world offset that gets them all outside
  depenetrate(obj) {
    const c = this.c;
    if (!c) return null;
    if (!obj.userData.samples) {
      const saved = [obj.position.clone(), obj.quaternion.clone(), obj.scale.clone()];
      obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.setScalar(1);
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      [obj.position, obj.quaternion, obj.scale].forEach((v, i) => v.copy(saved[i]));
      const pts = [];
      const sh = 0.88;
      const ctr = b.getCenter(new THREE.Vector3()), hs = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * sh);
      for (const ix of [-1, 0, 1]) for (const iy of [-1, 0, 1]) for (const iz of [-1, -0.5, 0, 0.5, 1]) pts.push(new THREE.Vector3(ctr.x + ix * hs.x, ctr.y + iy * hs.y, ctr.z + iz * hs.z));
      obj.userData.samples = pts;
    }
    obj.updateMatrixWorld(true);
    const hairMesh = c.hair.mesh;
    hairMesh.updateMatrixWorld(true);
    const inv = _inv.copy(hairMesh.matrixWorld).invert();
    // skull ellipsoid (lets the blades sink ~3 mm into the hair) and a jaw/chin ellipsoid below it
    const vols = [[HEAD_C, _R1.set(0.089, 0.104, 0.102).multiplyScalar(0.97)], [_C2.set(0, 0.035, 0.03), _R2.set(0.06, 0.06, 0.075)]];
    const best = new THREE.Vector3();
    let bestLen = 0;
    const lp = new THREE.Vector3(), d = new THREE.Vector3();
    for (const s of obj.userData.samples) {
      lp.copy(s).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
      for (const [C, R] of vols) {
        d.subVectors(lp, C);
        const k = Math.sqrt((d.x / R.x) ** 2 + (d.y / R.y) ** 2 + (d.z / R.z) ** 2);
        if (k >= 1 || k < 1e-4) continue;
        const out = d.clone().multiplyScalar(1 / k - 1);    // to the surface along the centre ray
        if (out.length() > bestLen) { bestLen = out.length(); best.copy(out); }
      }
    }
    if (bestLen < 1e-4) return null;
    best.transformDirection(hairMesh.matrixWorld).multiplyScalar(bestLen * hairMesh.getWorldScale(_sc).x);
    obj.position.add(best);
    return best;
  }

  dyeCoverage() {
    const c = this.c;
    const h = c.hair.dyeShare();
    if (c.beard && c.cut.beard) return (h + c.beard.dyeShare()) / 2;
    return h;
  }

  // ---------------------------------------------------------------- views
  setMode(m) {
    this.mode = m;
    audio.click();
    this.game.ui.setBarberMode?.(this.mode, this.close);
    this.onEvent?.('mode', m);
  }

  toggleClose() {
    this.close = !this.close;
    audio.click();
    this.game.ui.setBarberMode?.(this.mode, this.close);
    this.onEvent?.('close', this.close);
  }

  // jump the view to a side of the head (tutorial and tests)
  setView(side) {
    let t = VIEW_YAW[side] ?? 0;
    const k = Math.round((this.orbYawT - t) / (Math.PI * 2));
    this.orbYawT = t + k * Math.PI * 2;
    this.onEvent?.('view', side);
  }

  setLevel(l) { this.orbPitchT = [-0.12, 0.3, 0.95][clamp(l, 0, 2)]; }

  // how far the camera is behind the customer (0 front/side .. 1 straight behind)
  updateBow(dt, head) {
    const ch = this.c.ch;
    const f = new THREE.Vector3(Math.sin(ch.root.rotation.y), 0, Math.cos(ch.root.rotation.y));
    const toCam = this.game.camera.position.clone().sub(head).setY(0).normalize();
    const behind = clamp((-f.dot(toCam) - 0.35) / 0.5, 0, 1);
    const want = this.c.tutorial && this.focus && this.focus !== 'back' ? behind * 0.6 : behind;
    this.bow = damp(this.bow || 0, want, 3.5, dt);
  }

  // the backrest and headrest fade (dithered) whenever they stand between the camera and the head
  prepareChairFade() {
    const br = this.game.shop.chairPivot().getObjectByName('backrest');
    this.backrest = br || null;
    if (!br || br.userData.fadeReady) return;
    br.traverse((o) => {
      if (!o.isMesh) return;
      const m0 = o.material, m = m0.clone();
      m.onBeforeCompile = m0.onBeforeCompile;
      m.customProgramCacheKey = m0.customProgramCacheKey;
      m.alphaHash = true;
      m.opacity = 0.999;
      o.material = m;
      o.userData.fadeMat = true;
    });
    br.userData.fadeReady = true;
  }

  updateChairFade(dt, head) {
    const br = this.backrest;
    if (!br) return;
    const cam = this.game.camera.position;
    let block = 0;
    const pts = [head, head.clone().add(new THREE.Vector3(0, -0.09, 0)), this.toolPos];
    for (const p of pts) {
      const d = p.clone().sub(cam);
      const len = d.length();
      this.fadeRay.set(cam, d.divideScalar(len));
      this.fadeRay.far = len - 0.02;
      if (this.fadeRay.intersectObject(br, true).length) block++;
    }
    const ch = this.c.ch;
    const f = new THREE.Vector3(Math.sin(ch.root.rotation.y), 0, Math.cos(ch.root.rotation.y));
    const toCam = cam.clone().sub(head).setY(0).normalize();
    const behind = -f.dot(toCam) > -0.55;   // anything but a front view
    const target = block || behind ? 0.08 : 1;
    this.fadeA = damp(this.fadeA ?? 1, target, 10, dt);
    const a = Math.min(0.999, this.fadeA);
    br.visible = a > 0.1;
    br.traverse((o) => { if (o.userData.fadeMat) { o.material.opacity = a; o.castShadow = a > 0.9; } });
  }

  resetChairFade() {
    const br = this.backrest;
    if (br) { br.visible = true; br.traverse((o) => { if (o.userData.fadeMat) { o.material.opacity = 0.999; o.castShadow = true; } }); }
    if (this.c) { const ch = this.c.ch; delete ch.extra.Neck; delete ch.extra.Head; delete ch.extra.Chest; }
    this.bow = 0; this.fadeA = 1;
  }

  // grooming: share of hair touched by the comb (small bonus in the rating)
  markCombed(sys, hit) {
    this.combed ||= new Set();
    const key = (sys === this.c.hair ? 'h' : 'b') + Math.round(hit.phi * 8) + ':' + Math.round(hit.theta * (sys === this.c.hair ? 8 : 120));
    this.combed.add(key);
  }

  get groom() { return Math.min(1, (this.combed?.size || 0) / 70); }

  checkTooShort() {
    const cut = this.c.cut;
    for (const r of Object.keys(cut.target)) {
      if (EDGE_REGIONS.has(r)) continue;
      const s = this.stats[r];
      if (s && cut.target[r] > 0.06 && s.mean < cut.target[r] - cut.tol * 1.7 && !this.warned) {
        this.warned = true;
        this.c.ch.gesture('flinch');
        this.game.exclaim.show(this.c.ch, 2.2, 'sweat');
        this.c.say(pick(['Whoa, whoa! Careful up there!', 'Uh... is it supposed to be that short?', 'Easy! I need some of that!']), 'wince', 2.5);
        this.onEvent?.('tooShort', r);
        const g = this.game;
        if (!this.c.tutorial) { g.save.stats.oops = (g.save.stats.oops || 0) + 1; g.checkAchievements(); }
      }
    }
  }
}
