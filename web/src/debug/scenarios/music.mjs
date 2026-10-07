export default async ({ step, ev, page }) => {
  await step(0.5);
  const res = [];
  for (const i of [0, 1, 2, 3]) {
    const r = await page.evaluate(async (i) => {
      const { audio } = await import('/src/audio/audio.js');
      audio.unlock();
      await new Promise((r) => setTimeout(r, 200));
      audio.music ||= new (await import('/src/audio/music.js')).Music(audio);
      const an = audio.ctx.createAnalyser(); an.fftSize = 2048;
      audio.bus.music.connect(an);
      audio.music.play(i, { quality: 2, volume: 0.6, startBar: 5 });
      await new Promise((r) => setTimeout(r, 2500));
      const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
      let s = 0; for (const v of d) s += v * v;
      audio.music.stop(0.1);
      return { t: audio.music.track, rms: Math.sqrt(s / d.length), state: audio.ctx.state };
    }, i);
    res.push(r);
  }
  console.log(JSON.stringify(res));
};
