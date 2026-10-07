// Opening cutscene: buying the shop from its old owner.
import * as THREE from 'three';
import { spawnProp } from '../world/props.js';
import { audio } from '../audio/audio.js';
import { SKIP } from './director.js';
import { EMOTIONS } from '../chars/character.js';
import { SPOTS, ROOM } from '../world/shop.js';
import { clamp, lerp, smooth, easeOut } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// camera-space point -> world
function camPoint(game, x, y, z) { return game.camera.localToWorld(new THREE.Vector3(x, y, z)); }

function blendEmotion(ch, a, b, t) {
  const A = EMOTIONS[a], B = EMOTIONS[b];
  const out = {};
  for (const k of Object.keys(A)) out[k] = lerp(A[k], B[k], t);
  ch.emotionTarget = out;
  ch.emotion = t < 0.5 ? a : b;
  ch.emotionHold = 0;
}

const HOLD_L = { pos: [-0.03, -0.062, 0.0], rot: [0, 0, Math.PI / 2] };
const HOLD_R = { pos: [0.03, -0.062, 0.0], rot: [0, 0, -Math.PI / 2] };

export async function playIntro(game) {
  const { dir, shop, ui, player } = game;
  const wait = (s) => dir.wait(s);
  const o = game.makeOwner();
  game.owner = o;
  const head = () => o.headWorld(new THREE.Vector3());
  const say = async (text, emo, pause = 0.4, hold) => {
    if (emo) o.setEmotion(emo, hold ?? 0);
    const d = game.line(o, 'Mr. Albrecht', text);
    await wait(d + pause);
  };

  // owner dusting the shelf when we arrive
  o.place(V(-2.5, 0, -0.62), -Math.PI / 2);
  const wipe = {
    dur: 1, loop: true, channel: 'armR',
    update(ch) {
      const t = ch.t * 3;
      ch.reach('R', V(-3.02, 1.42 + Math.sin(t * 2) * 0.01, -0.7 + Math.sin(t) * 0.09), { weight: 1, speed: 5, fingers: V(-1, -0.2, 0), palm: V(0, -1, 0), hand: 'open' });
      ch._add('Spine', 0.08, 0, 0);
    },
    end(ch) { ch.release('R', 6); ch.setHand('R', 'relaxed'); },
  };
  o.gesture(wipe);
  o.lookAt(V(-3.1, 1.4, -0.7), 1);

  ui.letterbox(true);
  ui.showHud(false);
  game.ambience?.setOutside(1);
  dir.cam.handheld = 0.8;
  dir.takeCamera(V(-0.2, 1.7, 11.5), V(0.2, 2.9, 2.7));
  ui.fade(false, 1800);
  dir.move(V(1.0, 1.66, 6.6), V(0.4, 2.7, 2.7), 4.2);
  await wait(2.4);
  // sign: one letter keeps dying
  await wait(1.5);
  // walk to the door
  game.walkSteps(2.1);
  await dir.move(V(1.9, 1.64, 3.55), V(1.9, 1.45, 2.6), 2.1);
  shop.openDoor(false, 3.0);
  await wait(0.45);
  game.walkSteps(1.6);
  dir.move(V(1.72, 1.62, 1.8), V(0.5, 1.25, -0.2), 1.7);
  await wait(0.5);
  game.ambience?.setOutside(0.3);
  await wait(1.0);
  // look around: chair, mirror, light
  await dir.move(null, V(-0.9, 0.95, -1.45), 0.85);
  await wait(0.2);
  await dir.move(null, V(-0.75, 1.75, -2.55), 0.7);
  await wait(0.15);
  shop.flicker(true);
  await dir.move(null, V(-0.9, 2.45, -1.25), 0.6);
  await wait(0.4);
  await dir.move(null, V(-2.45, 1.5, -0.6), 0.8);

  // ---- he notices us
  o.endGesture('armR');
  o.lookAt(game.camera, 1);
  o.headTurnSpeed = 10;
  o.setEmotion('surprised');
  audio.gasp();
  o.bounce = 0.03;
  setTimeout(() => { o.bounce = 0; }, 160);
  dir.track(() => head().add(V(0, -0.15, 0)), 3);
  await wait(0.7);
  o.faceTo(game.camera.position);
  await wait(0.3);
  o.setEmotion('happy');
  await wait(0.4);
  o.gesture('straightenSuit');
  audio.cloth(0.8, 0.5);
  await wait(1.3);
  o.headTurnSpeed = 6;
  o.walkTo([V(0.2, 0, 0.2)], 'stroll');
  dir.move(V(1.55, 1.62, 1.55), null, 2.2);
  await dir.until(() => !o.path.length, 5);
  o.faceTo(game.camera.position);
  await wait(0.3);
  await say('So... you’re actually here.', 'happy', 0.6);
  // looking around his shop
  o.setEmotion('awkward');
  o.gesture('lookAround', { dur: 1.7 });
  await wait(1.6);
  o.lookAt(game.camera, 1);
  await say('Beautiful place, huh?', 'awkward', 0.3);
  await wait(0.4);
  shop.flicker(true);
  await wait(0.35);
  o.headTurnSpeed = 2.2;
  o.lookAt(V(-0.9, 2.3, -1.25), 1);
  o.setEmotion('concerned');
  await wait(1.3);
  o.headTurnSpeed = 4;
  o.lookAt(game.camera, 1);
  await wait(0.5);
  await say('...mostly.', 'awkward', 0.8);

  // ---- the chair
  o.headTurnSpeed = 6;
  o.walkTo([V(-0.28, 0, -0.98)], 'walk');
  dir.move(V(1.25, 1.62, 1.0), null, 2.4);
  await dir.until(() => !o.path.length, 5);
  o.faceTo(V(-0.9, 0, -1.45));
  await wait(0.5);
  const pivot = shop.chairPivot();
  const armrest = () => pivot.localToWorld(V(-0.31, 0.38, 0.03));
  o.reach('R', armrest, { speed: 7, fingers: () => V(-0.6, -0.5, -0.5), palm: () => V(0, -1, 0), hand: 'grip' });
  o.lookAt(game.camera, 1);
  await say('Chair still works.', 'proud', 0.1);
  o.lookAt(armrest, 0.6);
  game.setChairAngle(-0.75, 7);
  audio.squeak(0.8);
  o._add && o.gesture({ dur: 0.9, channel: 'body', update(ch, u) { ch._add('Spine', 0.12 * Math.sin(u * Math.PI), 0, 0); } });
  await wait(0.9);
  o.setEmotion('neutral');
  await wait(0.5);
  o.release('R');
  game.setChairAngle(0, 3);
  audio.squeak(0.6);
  await wait(0.7);
  o.lookAt(game.camera, 1);
  await say('Usually.', 'awkward', 0.6);

  // ---- the mirror
  const mirrorPt = V(-0.9, 1.65, -2.55);
  o.gesture('presentL', { target: mirrorPt });
  await say('Mirror’s fine.', 'proud', 0.0);
  dir.move(null, V(-0.66, 1.92, -2.55), 0.6);
  await wait(0.9);
  // he hurries to stand in front of the crack
  o.setEmotion('awkward');
  o.walkTo([V(-0.3, 0, -1.92)], 'speedwalk');
  dir.track(() => head().add(V(0, -0.1, 0)), 4);
  await dir.until(() => !o.path.length, 4);
  o.faceTo(game.camera.position);
  o.lookAt(game.camera, 1);
  o.extra.Spine = [0, 0, 0.08];
  o.extra.Head = [-0.05, 0, -0.1];
  await wait(0.5);
  o.gesture('wave', { dur: 1.0 });
  await wait(1.0);
  o.extra = {};

  // ---- the money
  o.walkTo([V(0.42, 0, -0.05)], 'walk');
  dir.track(() => head().add(V(0, -0.12, 0)), 3);
  dir.move(V(0.98, 1.62, 0.82), null, 2.0);
  await dir.until(() => !o.path.length, 5);
  await wait(0.2);
  o.faceTo(game.camera.position);
  o.lookAt(game.camera, 1);
  o.setEmotion('neutral');
  o.posture.hunch = 0.3;
  await wait(0.6);
  // our hand with the envelope
  const env = spawnProp('Envelope', { shadows: false });
  const R = player.arms.R;
  R.hold(env, { pos: [0.03, -0.06, 0.0], rot: [0, 0, -Math.PI / 2] });
  R.set({ visible: true, pos: V(0.16, -0.34, -0.42), fingers: V(-0.1, 0.25, -1), palm: V(-0.5, 0.7, 0), pose: 'hold', speed: 6 });
  audio.paperFlick();
  dir.track(null);
  dir.move(null, V(0.45, 1.25, -0.02), 1.0);
  await wait(1.0);
  R.set({ pos: V(0.08, -0.24, -0.58) });
  // he holds out his hand, calmly
  const handOff = () => camPoint(game, 0.06, -0.27, -0.66);
  o.reach('L', handOff, { speed: 4, fingers: () => game.camera.position.clone().sub(o.root.position).setY(0).normalize(), palm: () => V(0, 1, 0), hand: 'cup' });
  o.lookAt(env, 0.6);
  await wait(1.0);
  // transfer
  R.drop();
  o.hold('L', env, HOLD_L);
  o.setHand('L', 'hold');
  audio.paperFlick();
  R.set({ visible: false, pos: V(0.16, -0.5, -0.3) });
  await wait(0.3);
  o.reach('L', V(0.06, 1.17, 0.3), { local: true, speed: 4, fingers: V(-0.2, 0.1, 1), palm: V(0, 1, 0), hand: 'hold' });
  dir.move(null, V(0.4, 1.35, -0.02), 0.9);
  await wait(0.7);
  o.lookAt(env, 1);
  o.headTurnSpeed = 5;
  await wait(0.8);
  // eyes widen... he hides it
  o.setEmotion('surprised');
  audio.gasp();
  await wait(0.55);
  o.setEmotion('neutral');
  await wait(0.35);
  o.lookAt(game.camera, 1);
  audio.throatClear();
  o.gesture('chinUp', { dur: 0.9 });
  await wait(0.7);
  await say('Right.', 'neutral', 0.25);
  o.gesture('nod');
  await say('Pleasure doing business.', 'neutral', 0.3);

  // ---- counting
  const stack = spawnProp('CashStack', { shadows: false });
  o.drop('L', game.scene);
  env.visible = false;
  o.hold('L', stack, { pos: [-0.032, -0.07, 0.0], rot: [0, 0, Math.PI / 2] });
  o.lookAt(stack, 1);
  o.reach('R', () => o.bones.HandL.localToWorld(V(0.02, -0.06, 0.02)).add(V(0, 0.03, 0)), { speed: 6, fingers: () => V(0, -0.4, 1).applyQuaternion(o.root.quaternion), palm: () => V(0, -1, 0), hand: 'count' });
  dir.move(V(0.92, 1.58, 0.72), V(0.42, 1.3, -0.05), 1.6);
  await wait(0.6);
  const steps = [['neutral', 'happy', 0.25], ['neutral', 'happy', 0.55], ['happy', 'excited', 0.3], ['happy', 'excited', 0.85], ['excited', 'ecstatic', 0.6], ['excited', 'ecstatic', 1]];
  for (let i = 0; i < steps.length; i++) {
    flickNote(game, stack, o);
    audio.paperFlick();
    const [a, b, t] = steps[i];
    blendEmotion(o, a, b, t);
    if (i === 4) { o.say('heh'); }
    await wait(i < 2 ? 0.55 : 0.42);
  }
  await wait(0.6);
  // the deal is done
  o.release('R');
  o.lookAt(game.camera, 1);
  o.setEmotion('ecstatic');
  o.gesture('laugh');
  o.say('heh heh!');
  await wait(1.2);
  o.setEmotion('happy');
  await wait(0.4);

  // ---- the key
  o.lookAt(V(0, 0.9, 0).applyMatrix4(o.root.matrixWorld), 1);
  const pocket = () => o.localPoint(-0.17, 0.98, 0.08).add(V(Math.sin(o.t * 30) * 0.012, Math.cos(o.t * 23) * 0.01, 0));
  const rummage = async (sec) => {
    o.reach('R', pocket, { speed: 6, hand: 'pinch', fingers: () => V(0, -1, 0.3).applyQuaternion(o.root.quaternion), palm: () => V(1, 0, 0).applyQuaternion(o.root.quaternion) });
    audio.cloth(0.6, sec);
    await wait(sec);
  };
  const showItem = async (obj, emo, look = 1.0) => {
    o.hold('R', obj, { pos: [0.01, -0.105, 0.012], rot: [Math.PI / 2, 0, 0] });
    o.reach('R', V(-0.1, 1.42, 0.3), { local: true, speed: 5, fingers: V(0.2, 0.6, 0.6), palm: V(0.6, 0, 0.6), hand: 'pinch' });
    o.lookAt(obj, 1);
    o.setEmotion(emo);
    await wait(look);
  };
  o.setEmotion('neutral');
  await rummage(0.9);
  const receipt = spawnProp('Receipt', { shadows: false });
  audio.paperCrumple();
  await showItem(receipt, 'confused', 0.9);
  // tossed over his shoulder
  o.reach('R', V(-0.24, 1.62, -0.05), { local: true, speed: 14, hand: 'open' });
  await wait(0.22);
  o.drop('R', game.scene);
  game.throwItem(receipt, V(0.6, 1.2, -1.2).applyQuaternion(o.root.quaternion), V(6, 3, 4));
  audio.whoosh(0.4);
  await wait(0.25);
  await rummage(0.7);
  const coin = spawnProp('Coin', { shadows: false });
  audio.coin();
  await showItem(coin, 'confused', 0.8);
  o.say('hm.');
  await wait(0.4);
  await rummage(0.6);
  o.drop('R', game.scene);
  coin.parent?.remove(coin);
  await rummage(0.6);
  const key = spawnProp('Key', { shadows: false });
  audio.keys();
  await showItem(key, 'neutral', 0.6);
  // a moment of nostalgia
  o.headTurnSpeed = 2.5;
  blendEmotion(o, 'neutral', 'nostalgic', 1);
  dir.move(V(0.9, 1.6, 0.66), V(0.38, 1.45, 0.05), 2.0);
  await wait(0.8);
  o.gesture('sigh');
  await wait(1.4);
  o.lookAt(game.camera, 1);
  blendEmotion(o, 'nostalgic', 'happy', 0.55);
  await wait(0.8);
  // hands it over
  const giveAt = () => camPoint(game, 0.04, -0.2, -0.55);
  o.reach('R', giveAt, { speed: 3.5, fingers: () => game.camera.position.clone().sub(o.root.position).setY(-0.6).normalize(), palm: () => V(0, -1, 0), hand: 'pinch' });
  R.set({ visible: true, pos: V(0.1, -0.42, -0.4), fingers: V(-0.2, 0.15, -1), palm: V(0, 1, 0), pose: 'cup', speed: 5 });
  await wait(0.4);
  R.set({ pos: V(0.05, -0.27, -0.56) });
  dir.fov(56);
  dir.move(null, head().lerp(giveAt(), 0.6), 1.4);
  await wait(1.4);
  o.drop('R', game.scene);
  R.hold(key, { pos: [0.025, -0.075, 0.01], rot: [0, 0, -Math.PI / 2] });
  R.set({ pose: 'grip' });
  audio.keySmall();
  await wait(0.4);
  o.release('R', 3);
  o.lookAt(game.camera, 1);
  await say('She’s yours.', null, 1.4);
  dir.fov(68);
  R.set({ pos: V(0.14, -0.45, -0.35) });
  dir.move(null, head().add(V(0, -0.12, 0)), 1.2);
  await wait(0.5);
  R.set({ visible: false });

  // ---- and then he remembers the money
  o.headTurnSpeed = 14;
  o.lookAt(stack, 1);
  o.setEmotion('excited');
  await wait(0.8);
  o.lookAt(game.camera, 1);
  await wait(0.45);
  o.lookAt(stack, 1);
  await wait(0.4);
  o.lookAt(V(1.9, 1.5, 2.6), 1);
  await wait(0.55);
  o.lookAt(game.camera, 1);
  o.setEmotion('greedy');
  await wait(0.5);
  await say('Well...', 'greedy', 0.6);
  await say('Good luck.', 'happy', 0.1);
  // clutch the money
  o.reach('L', V(0.02, 1.25, 0.17), { local: true, speed: 8, fingers: V(-1, 0, 0.2), palm: V(0, 0, -1), hand: 'hold' });
  o.lookAt(null);
  o.walkTo([V(1.0, 0, 0.75), V(1.9, 0, 1.85), V(1.9, 0, 3.15), V(0.0, 0, 3.55), V(-9, 0, 3.9)], 'walk');
  dir.track(() => head().add(V(0, -0.05, 0)), 3.5);
  await wait(0.9);
  o.gait = 'speedwalk';
  o.setEmotion('excited');
  await wait(0.7);
  o.gait = 'run';
  o.setEmotion('ecstatic');
  await dir.until(() => o.root.position.z > 1.35, 4);
  shop.openDoor(true, 2.2);
  game.player.shake = 0.6;
  await dir.until(() => o.root.position.z > 3.0, 4);
  dir.track(() => head().add(V(0, -0.2, 0)), 2.5);
  await dir.until(() => o.root.position.x < -1.2, 5);
  await wait(0.5);
  dir.track(null);
  dir.move(null, V(1.9, 1.45, 2.6), 0.9);
  await wait(0.9);
  // ...and pokes his head back in
  o.stop();
  o.place(V(1.9, 0, 3.35), Math.PI);
  o.gait = 'walk';
  o.setEmotion('happy');
  shop.openDoor(false, 4.6);
  o.walkTo([V(1.9, 0, 2.92)], 'walk');
  o.lookAt(game.camera, 1);
  dir.track(() => head().add(V(0, -0.08, 0)), 4);
  await wait(0.9);
  o.extra.Spine = [0.32, 0, 0];
  o.extra.Chest = [0.1, 0, 0];
  o.extra.Head = [-0.25, 0, 0.12];
  await wait(0.3);
  await say('Oh— customers usually like hair.', 'happy', 0.5);
  await say('Try not to remove all of it.', 'proud', 0.2);
  o.extra = {};
  o.walkTo([V(1.9, 0, 3.6), V(-9, 0, 4.0)], 'run');
  await wait(1.3);
  o.setVisible(false);
  // alone
  dir.track(null);
  dir.move(null, V(0.5, 1.5, -0.6), 2.2);
  await wait(1.2);
  shop.flicker(false);
  await wait(1.0);
  dir.cam.handheld = 0.6;
}

function flickNote(game, stack, o) {
  const pivot = new THREE.Group();
  const note = spawnProp('Note', { shadows: false });
  note.position.set(0.0775, 0, 0);
  pivot.add(note);
  pivot.position.set(-0.0775, 0.024, 0);
  stack.add(pivot);
  const t0 = performance.now();
  const dur = 260;
  const step = () => {
    const k = clamp((performance.now() - t0) / dur, 0, 1);
    pivot.rotation.z = -Math.PI * easeOut(k);
    pivot.position.y = 0.024 + Math.sin(k * Math.PI) * 0.01;
    if (k < 1) requestAnimationFrame(step);
    else stack.remove(pivot);
  };
  step();
}

// state right after the intro, also used when it is skipped
export function introEndState(game) {
  if (game.owner) { game.owner.dispose(); game.owner = null; }
  game.shop.closeDoor();
  game.player.arms.R.drop(); game.player.arms.L.drop();
  game.player.hideArms();
  game.ui.subtitle(null);
  game.setChairAngle(0, 3);
  game.dir.cam.handheld = 0.6;
}
