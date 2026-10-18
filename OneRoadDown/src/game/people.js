// Story characters: loads assets/models/people.glb (tools/blender/people.py) once and
// hands out animated clones. Every character shares one rig and one set of clips:
// idle, wave, talk, armscross, cheer, walk, point.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';

let gltf = null, loading = null;

export function loadPeople() {
  if (gltf) return Promise.resolve(gltf);
  if (loading) return loading;
  const base = new URL('../../assets/models/people.glb', import.meta.url).href;
  loading = new GLTFLoader().loadAsync(base).then((g) => {
    gltf = g;
    g.scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false; // the bind-pose bounds do not follow the animation
        const m = o.material;
        if (m) { m.roughness = 0.72; m.metalness = 0; m.envMapIntensity = 0.6; }
      }
    });
    return g;
  }).catch((e) => { console.warn('[people] could not load', e && e.message); loading = null; return null; });
  return loading;
}
export const peopleReady = () => !!gltf;

export class Person {
  // id: mara | kenji | lukas | elise | vanta | iris
  constructor(id, o = {}) {
    this.id = id;
    this.group = new THREE.Group();
    this.group.name = 'person_' + id;
    this.ok = !!gltf;
    this.walk = null;
    if (!gltf) return;
    const root = cloneSkinned(gltf.scene);
    root.traverse((m) => {
      if (m.isSkinnedMesh || m.isMesh) {
        m.visible = m.name === 'person_' + id;
        m.castShadow = o.shadow !== false; m.receiveShadow = false;
      }
    });
    if (o.scale) root.scale.setScalar(o.scale);
    this.root = root;
    this.group.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.cur = null;
    this.play(o.anim || 'idle', 0);
    // a little offset so two characters never breathe in sync
    this.mixer.setTime(Math.random() * 3);
  }

  play(name, fade = 0.35, speed = 1) {
    if (!this.ok) return;
    const a = this.actions[name] || this.actions.idle;
    if (!a || a === this.cur) { if (a) a.timeScale = speed; return; }
    a.reset(); a.enabled = true; a.timeScale = speed; a.setEffectiveWeight(1);
    a.play();
    if (this.cur && fade > 0) this.cur.crossFadeTo(a, fade, false);
    else if (this.cur) this.cur.stop();
    this.cur = a;
  }

  place(x, y, z, yaw = 0) { this.group.position.set(x, y, z); this.group.rotation.y = yaw; return this; }
  face(x, z) { const p = this.group.position; this.group.rotation.y = Math.atan2(x - p.x, z - p.z); return this; }

  // walk in a straight line to (x, z) over `dur` seconds, then go back to `then`
  walkTo(x, y, z, dur, then = 'idle') {
    const p = this.group.position;
    this.walk = { from: p.clone(), to: new THREE.Vector3(x, y, z), t: 0, dur: Math.max(0.1, dur), then };
    this.face(x, z);
    this.play('walk', 0.25, 1.1);
  }

  // head height in world space (camera targets)
  headPos(out = new THREE.Vector3()) { return out.copy(this.group.position).add(new THREE.Vector3(0, 1.62 * (this.root ? this.root.scale.y : 1), 0)); }

  update(dt) {
    if (!this.ok) return;
    if (this.walk) {
      const w = this.walk;
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      this.group.position.lerpVectors(w.from, w.to, k);
      if (k >= 1) { this.walk = null; this.play(w.then, 0.3); }
    }
    this.mixer.update(dt);
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.mixer) this.mixer.stopAllAction();
  }
}
