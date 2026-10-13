// Barber mode: the camera moves in close, the chair turns, and the tool follows your
// cursor across the scalp. Cutting writes into the customer's hair length map.
import * as THREE from 'three';
import { spawnProp, part } from '../world/props.js';
import { propMaterial } from '../render/materials.js';
import { HEAD_C, REGIONS, REGION_ID, EDGE_REGIONS, hairline } from '../hair/hair.js';
import { BEARD_ID } from '../hair/beard.js';
import { GUARDS, guardIndex, fadeTarget, stats as cutStats } from '../hair/styles.js';
import { HairSystem } from '../hair/hair.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/save.js';
import { inventory, applySkin } from './items.js';
import { clamp, damp, dampAngle, rand, pick, chance, lerp, smooth } from '../core/util.js';

// cutting tools, then styling tools (keys 1-9, 0 for colour)
export const TOOLS = [
  { id: 'clipper', label: 'Clipper', icon: 'clipper', electric: true, group: 'cut', key: '1' },
  { id: 'scissors', label: 'Scissors', icon: 'scissors', electric: false, group: 'cut', key: '2' },
  { id: 'trimmer', label: 'Trimmer', icon: 'trimmer', electric: true, group: 'cut', key: '3' },
  { id: 'comb', label: 'Comb', icon: 'comb', electric: false, group: 'style', key: '4' },
  { id: 'spray', label: 'Spray', icon: 'spray', electric: false, group: 'style', key: '5' },
  { id: 'brush', label: 'Brush', icon: 'brush', electric: false, group: 'style', key: '6' },
  { id: 'dryer', label: 'Dryer', icon: 'dryer', electric: false, group: 'style', key: '7' },
  { id: 'pomade', label: 'Wax', icon: 'wax', electric: false, group: 'style', key: '8' },
  { id: 'powder', label: 'Powder', icon: 'powder', electric: false, group: 'style', key: '9' },
  { id: 'dye', label: 'Colour', icon: 'paint', electric: false, group: 'cut', key: '0' },
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
    this.guard = guardIndex('3');
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
    this.toolObjs = { clipper: cl, scissors: sc, trimmer: tr, comb: cb, spray: sp, dye: db, ...styleTools() };
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
    this.leaving = false;
    this.tool = opts.tool || null;
    this.power = false;
    this.guard = guardIndex('3');
    this.warned = false;
    this.combed = new Set();
    this.smalltalkT = rand(14, 22);
    // every so often the customer has to scratch: hand in the way until it stops (or a slap)
    this.itchT = rand(16, 30);
    this.itching = 0;
    this.slapJolt = 0;
    this.slapCD = 0;
    customer.slaps ||= 0;
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
      style: !!(customer.cut.style || customer.cut.styling),
      styleLabel: customer.cut.styling?.label,
      dye: customer.dyeReq || null,
      tools: TOOLS.filter((t) => t.id !== 'dye' || customer.dyeReq),
      onTool: (id) => this.selectTool(id),
      onPower: () => this.togglePower(),
      onGuard: (i) => this.setGuard(i),
      onFinish: () => this.requestFinish(),
      onMode: (m) => this.setMode(m),
      clipSpeed: this.game.settings.clipSpeed ?? 0.45,
      onSpeed: (v) => this.setSpeed(v),
      refImg: customer.refImg,
      onRef: () => this.game.ui.showReference(customer.cut, customer.refImg),
      onClose: () => this.toggleClose(),
      onSlap: () => this.slap(),
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
    // beginners get guide lines on a fade: where to switch to the next guard
    const fadesDone = g.save.stats?.fadeCuts || 0;
    if (customer.cut.fade && !opts.tutorial && (fadesDone < 4 || g.settings.fadeGuides)) {
      const f = customer.cut.fade;
      customer.hair.setGuides((phi, theta, region) => {
        if (region < 3 || region > 5) return null;
        const t = fadeTarget(f, hairline(phi), theta, phi);
        let gi = 0;
        for (let i = 0; i < GUARDS.length; i++) if (GUARDS[i].len <= t + 0.004) gi = i;
        return gi;
      });
      this.guidesOn = true;
    } else this.guidesOn = false;
  }

  // new mechanics get one short tip the first time they show up
  introduceMechanics(c) {
    const g = this.game;
    const seen = (g.save.hints ||= []);
    const tips = [];
    if (!seen.includes('combSpray')) tips.push(['combSpray', g.input.touch ? 'New tools: comb for a groomed finish, spray for cleaner scissor cuts' : 'New tools: comb (4) for a groomed finish, spray (5) for cleaner scissor cuts']);
    if (c.cut.fade && !seen.includes('fade')) tips.push(['fade', 'Fade: short guard at the bottom, then longer guards higher up']);
    if (c.cut.beard && !seen.includes('beard')) tips.push(['beard', 'Beard: rotate the view to the front, trimmer for the neckline']);
    if (c.cut.fade && this.guidesOn && !seen.includes('fadeGuide')) tips.push(['fadeGuide', 'The cyan lines show where to switch guards: shortest guard below the lowest line, one guard longer above each line']);
    if (c.cut.fade?.burst && !seen.includes('burst')) tips.push(['burst', 'Burst fade: the fade arcs around the ear — leave the back and the temples longer']);
    if (c.cut.fade?.drop && !seen.includes('drop')) tips.push(['drop', 'Drop fade: the fade line dips down behind the ear towards the neck']);
    if (c.cut.styling && !seen.includes('styling')) tips.push(['styling', g.input.touch ? 'Styling: after cutting, brush or blow-dry in the direction shown on the card, then wax or powder' : 'Styling: after cutting, brush (6) or blow-dry (7) in the direction on the card, then wax (8) or powder (9)']);
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

  updateItch(dt) {
    const c = this.c, g = this.game;
    this.slapCD = Math.max(0, this.slapCD - dt);
    this.slapJolt = Math.max(0, this.slapJolt - dt * 1.6);
    if (c.tutorial || this.leaving) return;
    if (this.itching > 0) {
      this.itching -= dt;
      // the fingers wreck whatever is under them
      c.hair.mess(-0.65, 0.55, dt);
      if (this.itching <= 0) { this.itching = 0; g.ui.setSlap?.(false); this.itchT = rand(28, 48); }
      return;
    }
    this.itchT -= dt;
    if (this.itchT <= 0) {
      this.itching = rand(3.5, 5.5);
      c.ch.gesture('scratchHead', { dur: this.itching });
      c.say(pick(['Sorry, it itches like crazy.', 'Hold on... itchy.', 'Ugh, these little hairs!', 'One second, one second.', 'Mmh, right there...']), null);
      g.ui.setSlap?.(true);
      const seen = (g.save.hints ||= []);
      if (!seen.includes('itch')) { seen.push('itch'); g.ui.tip(g.input.touch ? 'He’s scratching his head — wait, or tap SLAP to stop him' : 'He’s scratching his head — wait, or slap him with G'); setTimeout(() => this.active && g.ui.tip(null), 4200); g.persist(); }
    }
  }

  // an open hand across the cheek: stops the scratching, three of them and he's gone
  slap() {
    const c = this.c, g = this.game, ch = c.ch;
    if (!this.active || this.slapCD > 0 || this.leaving) return;
    this.slapCD = 0.9;
    const L = g.player.arms.L;
    // aim at the cheek facing the camera (camera space), swing in from the left
    const cheek = () => ch.headWorld(new THREE.Vector3()).add(new THREE.Vector3(0, -0.04, 0)).applyMatrix4(g.camera.matrixWorldInverse);
    const c0 = cheek();
    L.set({ visible: true, pos: c0.clone().add(new THREE.Vector3(-0.32, 0.06, 0.12)), fingers: new THREE.Vector3(0.3, 1, -0.2), palm: new THREE.Vector3(1, 0, -0.3), pose: 'open', speed: 40 });
    setTimeout(() => {
      if (!this.active) return;
      L.set({ pos: cheek().add(new THREE.Vector3(-0.02, 0, 0.09)), speed: 60 });
    }, 110);
    setTimeout(() => {
      if (!this.active) return;
      audio.slap();
      this.slapJolt = 1;
      ch.flush('#e0412f', 0.6, 3);
      g.shake?.(0.15);
      const wasItching = this.itching > 0;
      if (wasItching) { this.itching = 0; ch.endGesture('armR'); g.ui.setSlap?.(false); this.itchT = rand(30, 50); }
      c.slaps = (c.slaps || 0) + 1;
      g.save.stats.slaps = (g.save.stats.slaps || 0) + 1;
      const n = c.slaps;
      if (n >= 3) { this.leaving = true; g.slapOut(c); return; }
      ch.setEmotion(n === 1 ? 'surprised' : 'furious', 2.5);
      g.exclaim.show(ch, 1.6, n === 1 ? '!' : 'anger');
      setTimeout(() => {
        if (!this.active) return;
        const line = n === 1 ? (wasItching ? pick(['OW! Okay, okay, I’ll stop!', 'Hey! It ITCHED!', 'Did you just... slap me?!']) : pick(['OW! What was that for?!', 'Excuse me?!']))
          : pick(['Do that ONE more time and I’m out of here!', 'That’s two. TWO!', 'Last warning, scissor man!']);
        c.say(line, n === 1 ? 'surprised' : 'furious');
      }, 350);
    }, 210);
    setTimeout(() => { if (this.active) L.set({ pos: cheek().add(new THREE.Vector3(-0.3, -0.25, 0.15)), speed: 12 }); }, 420);
    setTimeout(() => { if (this.active) L.set({ visible: false }); }, 800);
  }

  // live styling meter (throttled: the full scan is not free)
  styleLive() {
    const now = performance.now();
    if (!this._styleT || now - this._styleT > 250) {
      this._styleT = now;
      const h = this.c.hair;
      this._styleV = clamp(h.styledShare() * 0.3 + h.styleScore(this.c.cut.styling) * 0.7, 0, 1);
    }
    return this._styleV;
  }

  exit() {
    this.active = false;
    if (this.motor) { this.motor.stop(); this.motor = null; }
    if (this.dryerSnd) { this.dryerSnd.stop(); this.dryerSnd = null; }
    this.c?.hair.setGuides(null);
    this.itching = 0;
    this.game.ui.setSlap?.(false);
    this.game.player.arms.L.set({ visible: false });
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
    if (this.dryerSnd) { this.dryerSnd.stop(); this.dryerSnd = null; }
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
      styled: this.c.cut.styling ? this.styleLive() : this.c.cut.style ? this.c.hair.styledShare() : null,
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
    if (input.pressed('tool6')) this.selectTool('brush');
    if (input.pressed('tool7')) this.selectTool('dryer');
    if (input.pressed('tool8')) this.selectTool('pomade');
    if (input.pressed('tool9')) this.selectTool('powder');
    if (input.pressed('tool0') && this.c.dyeReq) this.selectTool('dye');
    if (input.pressed('power')) this.togglePower();
    if (this.tool === 'clipper') {
      if (input.pressed('guardDown')) this.setGuard(this.guard - 1);
      if (input.pressed('guardUp')) this.setGuard(this.guard + 1);
    }
    if (input.pressed('finish')) this.requestFinish();
    if (input.pressed('slap')) this.slap();
    this.updateItch(dt);

    if (input.pressed('rotateMode')) this.setMode(this.mode === 'rotate' ? 'cut' : 'rotate');
    if (input.pressed('closeView')) this.toggleClose();
    const p = input.pointer;
    const head = this.headCenter(_v2.set(0, 0, 0)).clone();
    // pick the hair under the cursor
    const ndc = new THREE.Vector2(p.x, p.y + (p.touch ? 0.09 : 0));
    this.raycaster.setFromCamera(ndc, g.camera);
    let hit = c.hair.pick(this.raycaster.ray, 0.02);
    if (hit) { hit.sys = c.hair; hit.distance = hit.point.distanceTo(g.camera.position); }
    // the stroke on the scalp since last frame, in east/down components (for combing & drying)
    this.stroke = [0, 0];
    if (hit && this.lastHit && p.down) {
      let dphi = hit.phi - this.lastHit.phi;
      if (dphi > Math.PI) dphi -= Math.PI * 2; if (dphi < -Math.PI) dphi += Math.PI * 2;
      const e = dphi * Math.sin(hit.theta), sd = hit.theta - this.lastHit.theta;
      const l = Math.hypot(e, sd);
      if (l > 0.004 && l < 0.5) { this.strokeSm ||= [0, 0]; this.strokeSm[0] = this.strokeSm[0] * 0.5 + e / l * 0.5; this.strokeSm[1] = this.strokeSm[1] * 0.5 + sd / l * 0.5; this.stroke = this.strokeSm; }
    }
    this.lastHit = hit && hit.sys === c.hair ? { phi: hit.phi, theta: hit.theta } : null;
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
        // a smoothed surface normal: the tool rides over the head instead of snapping between texels
        this.nSm ||= hit.normal.clone();
        this.nSm.lerp(hit.normal, 1 - Math.exp(-10 * dt)).normalize();
        n.copy(this.nSm);
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
        } else if (this.tool === 'comb' || this.tool === 'brush') {
          // teeth / bristles (-y) into the hair, handle along the stroke
          yv.copy(n);
          z.copy(side);
          pos = hit.point.clone().addScaledVector(n, (this.tool === 'brush' ? 0.02 : 0.012) + len * 0.35);
        } else if (this.tool === 'dryer') {
          // nozzle (+z) toward the hair from 15 cm, tilted with the stroke
          z.copy(n).negate();
          yv.set(0, 1, 0).addScaledVector(z, -z.y).normalize();
          pos = hit.point.clone().addScaledVector(n, 0.15);
        } else if (this.tool === 'pomade' || this.tool === 'powder') {
          // fingertips with product: the tin/bottle rides just above the hair
          z.copy(n).multiplyScalar(-0.4).addScaledVector(towardCrown, 0.9).normalize();
          yv.copy(n);
          pos = hit.point.clone().addScaledVector(n, 0.03 + len * 0.4);
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
      // resolve the head collision on the TARGET pose, then glide there (no push/pull fight)
      toolObj.position.copy(pos);
      toolObj.quaternion.copy(q);
      const push = this.depenetrate(toolObj);
      if (push) pos.add(push);
      if (!this.toolInit || this.swapT > 0.3) { this.toolPos.copy(pos); this.toolQuat.copy(q); this.toolInit = true; }
      this.toolPos.lerp(pos, 1 - Math.exp(-18 * dt));
      this.toolQuat.slerp(q, 1 - Math.exp(-10 * dt));
      toolObj.position.copy(this.toolPos);
      toolObj.quaternion.copy(this.toolQuat);
      const pop = 1 - this.swapT / 0.35;
      toolObj.scale.setScalar(0.6 + 0.4 * Math.min(1, pop * 1.2));
      if (this.power) {
        // a fine motor hum, not a shake
        const tt = performance.now() * 0.001;
        toolObj.position.addScaledVector(n, Math.sin(tt * 190) * 0.00025);
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
      if (hit && p.down && this.itching > 0 && p.justDown) { audio.error?.(); g.ui.tip(g.input.touch ? 'His hand is in the way! Wait, or SLAP him' : 'His hand is in the way! Wait, or slap him (G)'); setTimeout(() => g.ui.tip(null), 1800); }
      if (hit && p.down && !this.dragging && this.mode === 'cut' && !(this.itching > 0)) {
        cutting = true;
        this.cutting = true;
        const fx = g.fx;
        let removed = 0;
        const sys = hit.sys, beard = sys !== c.hair;
        if (this.tool === 'clipper' && this.power) {
          removed = sys.clip(hit.phi, hit.theta, GUARDS[this.guard].len, fx.clipperRate * this.speedK(), dt, beard ? undefined : 0.021);
        } else if (this.tool === 'trimmer' && this.power) {
          removed = sys.trim(hit.phi, hit.theta, 3.2 * this.speedK(), dt, beard ? undefined : 0.009);
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
            if (beard) sys.comb(hit.phi, hit.theta); else sys.comb(hit.phi, hit.theta, 0.03, this.stroke[0], this.stroke[1]);
            if (!beard && this.c.cut.style) this.cutDirty = true;
            this.markCombed(sys, hit);
            this.combSnd = (this.combSnd || 0) - dt;
            if (this.combSnd <= 0) { this.combSnd = 0.12; audio.noiseBurst(0.05, { vol: 0.05, freq: rand(2500, 3800), q: 2 }); }
          }
        } else if (this.tool === 'brush' && !beard) {
          const mv = Math.hypot(p.dragDX, p.dragDY);
          if (mv > 0.5 || p.touch) {
            sys.brushStroke(hit.phi, hit.theta, this.stroke[0], this.stroke[1], 0.045);
            this.cutDirty = true;
            this.brushSnd = (this.brushSnd || 0) - dt;
            if (this.brushSnd <= 0) { this.brushSnd = 0.16; audio.noiseBurst(0.09, { vol: 0.06, freq: rand(1600, 2400), q: 0.8 }); }
          }
        } else if (this.tool === 'dryer' && !beard) {
          // air goes with the stroke; holding still blows away from you
          let [de, ds] = this.stroke;
          if (!de && !ds) { const away = hit.point.clone().sub(g.camera.position).normalize(); [de, ds] = HairSystem.tangentOf(hit.phi, hit.theta, [away.x, away.y, away.z].map((v, i) => v)); }
          sys.blowDry(hit.phi, hit.theta, de, ds, dt, 0.05);
          this.cutDirty = true;
          this.dryerOn = 0.15;
        } else if ((this.tool === 'pomade' || this.tool === 'powder') && !beard) {
          sys.applyProduct(this.tool, hit.phi, hit.theta, dt, 0.04);
          this.cutDirty = true;
          this.prodSnd = (this.prodSnd || 0) - dt;
          if (this.prodSnd <= 0) { this.prodSnd = 0.22; audio.noiseBurst(0.12, { vol: this.tool === 'powder' ? 0.05 : 0.035, freq: this.tool === 'powder' ? 5200 : 700, q: 0.7 }); }
          if (this.tool === 'powder' && Math.random() < dt * 8) g.mist?.burst(toolObj.position.clone(), hit.point);
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
    // the dryer roars while it blows
    this.dryerOn = Math.max(0, (this.dryerOn || 0) - dt);
    if (this.tool === 'dryer' && p.down && !this.dragging && this.mode === 'cut') {
      if (!this.dryerSnd) { this.dryerSnd = audio.dryer?.(); if (!this.reactedDryer) { this.reactedDryer = true; c.ch.setEmotion('surprised', 0.7); } }
    } else if (this.dryerSnd) { this.dryerSnd.stop(); this.dryerSnd = null; }
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
    // a slap snaps the head round, then it wobbles back
    const j = this.slapJolt * Math.cos((1 - this.slapJolt) * 9);
    ch.extra.Neck = [0.34 * b, -0.35 * j, 0.1 * j];
    ch.extra.Head = [0.3 * b, -0.45 * j, 0.25 * j];
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

  // clipper/trimmer speed from the settings (0.2 .. 1), remembered between sessions
  speedK() { return 0.3 + (this.game.settings.clipSpeed ?? 0.45) * 1.4; }

  setSpeed(v) {
    this.game.settings.clipSpeed = clamp(v, 0, 1);
    store.saveSettings();
    this.game.ui.setClipSpeed?.(this.game.settings.clipSpeed);
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


// styling tools, built from simple parts with real proportions
function styleTools() {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  // paddle brush: oval head with rubber cushion and bristle rows, handle along +z
  const brush = new THREE.Group();
  const body = M('#1d1b1a', { roughness: 0.35 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 24), body); head.scale.set(1, 1, 1.35); brush.add(head);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 24), M('#7a2a26', { roughness: 0.8 })); pad.scale.set(1, 1, 1.35); pad.position.y = -0.007; brush.add(pad);
  const bristle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0012, 0.0008, 0.012, 4), M('#2a2420'), 60);
  const mm = new THREE.Matrix4(); let bi = 0;
  for (let i = -3; i <= 3; i++) for (let j = -4; j <= 4; j++) { if (bi >= 60 || (i * i) / 12 + (j * j) / 20 > 1) continue; mm.makeTranslation(i * 0.008, -0.014, j * 0.008); bristle.setMatrixAt(bi++, mm); }
  bristle.count = bi; brush.add(bristle);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.11, 12), body); handle.rotation.x = Math.PI / 2; handle.position.z = 0.1; brush.add(handle);
  // hair dryer: body, nozzle (+z), handle down
  const dryer = new THREE.Group();
  const dm = M('#1b1b1d', { roughness: 0.3 }), chrome = M('#c9ccd0', { metalness: 0.9, roughness: 0.2 });
  const db = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.16, 20), dm); db.rotation.x = Math.PI / 2; dryer.add(db);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 20), M('#3a3a3c', { roughness: 0.8 })); back.rotation.x = Math.PI / 2; back.position.z = -0.085; dryer.add(back);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.05, 20), dm); noz.rotation.x = Math.PI / 2; noz.position.z = 0.1; dryer.add(noz);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), chrome); tip.position.z = 0.125; dryer.add(tip);
  const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.12, 14), dm); hd.position.set(0, -0.07, -0.02); hd.rotation.x = -0.25; dryer.add(hd);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.006), M('#c8302b')); sw.position.set(0, -0.05, 0.0); dryer.add(sw);
  // wax tin: flat round tin, lid off, product visible
  const pomade = new THREE.Group();
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 24), M('#c9922e', { metalness: 0.7, roughness: 0.3 })); pomade.add(tin);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.004, 24), M('#e9dcc0', { roughness: 0.25 })); wax.position.y = 0.008; pomade.add(wax);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.01, 24, 1, true), M('#24344d')); pomade.add(label);
  // texture powder: a small matte bottle with a sifter cap
  const powder = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.07, 16), M('#e8e2d6', { roughness: 0.9 })); powder.add(bottle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.016, 16), M('#1b1b1d')); cap.position.y = 0.043; powder.add(cap);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0202, 0.0202, 0.022, 16, 1, true), M('#7a2a26')); band.position.y = -0.005; powder.add(band);
  powder.rotation.x = Math.PI / 2;
  const pw = new THREE.Group(); pw.add(powder);
  return { brush, dryer, pomade, powder: pw };
}
