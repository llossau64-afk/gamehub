export default async ({ step, ev }) => {
  console.log(await ev(() => {
    const T = window.__T, hw = T.joints[T.jointIndex.get('Head')].world;
    const c = window.__game.customers.spawn(); const m = c.ch.mouth;
    m.geometry.computeBoundingBox();
    return JSON.stringify({ center: T.mouth.center.toArray(), hw: hw.toArray(), local: T.mouth.center.clone().sub(hw).toArray(), bb: [m.geometry.boundingBox.min.toArray(), m.geometry.boundingBox.max.toArray()], parent: m.parent?.name, pos: m.position.toArray() });
  }));
};
