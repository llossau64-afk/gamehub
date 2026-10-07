export default async ({ ev }) => {
  console.log(await ev(async () => {
    const T = window.__T;
    return JSON.stringify({ n: T.pieces.length, s: T.pieces.slice(0, 12).map((p) => [p.name, p.acc, p.joint, p.slot]) });
  }));
};
