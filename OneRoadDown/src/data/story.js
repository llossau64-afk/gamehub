// STORY MODE "FROM NOTHING TO LEGEND": chapters, events, characters, dialogue.
// Pure data (no three.js); the flow lives in game/story.js, the cutscenes in
// game/storyScenes.js. All characters, teams and sponsors are fictional.
//
// Save key `story` (see game/story.js storyState()):
//   { chapter, done: { eventId: bestPos }, seen: { sceneId: true }, skippedTutorial,
//     tutorialDone, xp, gifts: { chapterId: carId }, bought: { carId: true } }

// car classes by dealer price (an event caps the class you may enter with)
export const CLASSES = [
  { id: 'STREET', max: 20000, color: '#8b9196' },
  { id: 'SPORT', max: 130000, color: '#8fb26a' },
  { id: 'PRO', max: 300000, color: '#5aa0d8' },
  { id: 'SUPER', max: 900000, color: '#b07ae0' },
  { id: 'HYPER', max: 3000000, color: '#e2a33b' },
  { id: 'LEGEND', max: Infinity, color: '#cf4a32' },
];
export const classOf = (car) => CLASSES.find((c) => car.price <= c.max) || CLASSES[CLASSES.length - 1];
export const classIndex = (id) => Math.max(0, CLASSES.findIndex((c) => c.id === id));

// ------------------------------------------------------------------ characters
export const PEOPLE = {
  mara: { id: 'mara', name: 'MARA', full: 'Mara Okonkwo-Reyes', role: 'MECHANIC · MENTOR', color: '#e2a33b', model: 'mara',
    bio: 'Ran a privateer team until the money ran out. Now she runs a one-bay workshop and a very short temper.' },
  iris: { id: 'iris', name: 'IRIS KADE', full: 'Iris Kade', role: 'HALCYON ENERGY · SPONSOR', color: '#8fb26a', model: 'iris',
    bio: 'Talent scout for a drinks company that would rather be a racing team. Pays on time.' },
  kenji: { id: 'kenji', name: 'KENJI ARAI', short: 'K. ARAI', role: 'RIVAL · JAPAN', cc: 'JP', color: '#c82a26', model: 'kenji',
    trait: 'Hot-headed street king', bio: 'Grew up on mountain passes. Drives sideways, talks fast, never lifts first.' },
  lukas: { id: 'lukas', name: 'LUKAS BRANDT', short: 'L. BRANDT', role: 'RIVAL · GERMANY', cc: 'DE', color: '#9a9da2', model: 'lukas',
    trait: 'Cold engineer', bio: 'Factory junior with a spreadsheet for every corner. Thinks luck is a rounding error.' },
  elise: { id: 'elise', name: 'ÉLISE MOREL', short: 'É. MOREL', role: 'RIVAL · FRANCE', cc: 'FR', color: '#2a5ab8', model: 'elise',
    trait: 'Elegant and ruthless', bio: 'Supercar league champion. Smiles on the podium, takes your line everywhere else.' },
  vanta: { id: 'vanta', name: 'VANTA', short: 'VANTA', role: 'THE LEGEND', cc: '??', color: '#8a4ae0', model: 'vanta',
    trait: 'Nobody has seen the face', bio: 'Undefeated. Appears for the biggest races, wins, and leaves before the podium.' },
};

// ------------------------------------------------------------------ chapters
// event: { id, map, opp, target, rivals: [{ who, car, edge }], rule, cash, xp, pre, post, brief }
//   target  finishing position needed (1 = win)
//   rule    optional extra objective: 'rival' (finish ahead of every rival), 'clean' (finish with ≥ 70 % condition)
//   edge    extra tuning for the rival car (0 … 0.3), on top of the usual matching to your car
export const CHAPTERS = [
  {
    id: 'c1', n: 1, title: 'THE BEGINNING', cls: 'STREET', tagline: 'A rusty car, a borrowed garage and a lot to prove.',
    open: 'intro', close: 'c1-close', gift: 'wasp', offers: ['sparrow', 'samurai', 'diplomat'], discount: 0.3,
    rivals: ['kenji'],
    events: [
      { id: 'c1-sakura', map: 'jp-sakura', opp: 3, target: 3, cash: 6000, xp: 120, title: 'CLUB DAY', brief: 'Club race, three locals. Finish on the podium and nobody laughs at the car.' },
      { id: 'c1-schwarzwald', map: 'de-schwarzwald', opp: 4, target: 2, cash: 8000, xp: 150, title: 'FOREST SPRINT', brief: 'Point to point through the firs. Top two, and mind the cows.' },
      { id: 'c1-hakone', map: 'jp-hakone', opp: 5, target: 1, rule: 'rival', rivals: [{ who: 'kenji', car: 'samurai', edge: 0.12 }], cash: 15000, xp: 250, pre: 'rival-kenji', title: 'TOUGE DUEL', brief: 'Kenji owns this pass. Win, and beat him to the bottom.' },
    ],
  },
  {
    id: 'c2', n: 2, title: 'STREET RISING', cls: 'SPORT', tagline: 'A sponsor calls. The streets get faster.',
    open: 'c2-open', close: 'c2-close', gift: 'kestrel', offers: ['falke', 'stallion', 'ronin', 'mistral'], discount: 0.25,
    rivals: ['kenji'],
    events: [
      { id: 'c2-kirin', map: 'jp-kirin', opp: 5, target: 3, cash: 14000, xp: 200, title: 'SPEEDWAY TRYOUT', brief: 'Halcyon is watching from the pit wall. Podium, please.' },
      { id: 'c2-provence', map: 'fr-provence', opp: 5, target: 2, rule: 'clean', cash: 16000, xp: 220, title: 'LAVENDER RUN', brief: 'Sponsor photo shoot at the finish. Bring the car back in one piece: top two, clean.' },
      { id: 'c2-autobahn', map: 'de-autobahn', opp: 6, target: 2, cash: 18000, xp: 240, title: 'NO LIMITS', brief: 'Seven kilometres flat out. Top two.' },
      { id: 'c2-odaiba', map: 'jp-odaiba', opp: 6, target: 1, rule: 'rival', rivals: [{ who: 'kenji', car: 'ronin', edge: 0.15 }], cash: 30000, xp: 400, pre: 'rival-kenji2', title: 'BAY STREETS', brief: 'Kenji\'s home streets at dusk. Win, and leave him in your mirrors.' },
    ],
  },
  {
    id: 'c3', n: 3, title: 'PROFESSIONAL CIRCUIT', cls: 'PRO', tagline: 'Real teams, real money, real engineers.',
    open: 'c3-open', close: 'c3-close', gift: 'kaiju', offers: ['bauhaus', 'rook', 'stiletto'], discount: 0.25,
    rivals: ['lukas'],
    events: [
      { id: 'c3-alpen', map: 'de-alpen', opp: 6, target: 3, cash: 26000, xp: 300, title: 'ALPINE OPENER', brief: 'First pro weekend. Podium finish to keep the licence.' },
      { id: 'c3-iroha', map: 'jp-iroha', opp: 6, target: 2, rule: 'clean', cash: 30000, xp: 330, title: 'FORTY-EIGHT', brief: 'Forty-eight hairpins. Top two and no bodywork bills.' },
      { id: 'c3-bordeaux', map: 'fr-bordeaux', opp: 6, target: 2, cash: 32000, xp: 350, title: 'VINEYARD LOOP', brief: 'Tight and twisty. Top two.' },
      { id: 'c3-hockenring', map: 'de-hockenring', opp: 7, target: 1, rule: 'rival', rivals: [{ who: 'lukas', car: 'bauhaus', edge: 0.18 }], cash: 50000, xp: 550, pre: 'rival-lukas', title: 'GRAND PRIX', brief: 'Lukas has the data. You have the nerve. Win it.' },
    ],
  },
  {
    id: 'c4', n: 4, title: 'SUPERCAR LEAGUE', cls: 'SUPER', tagline: 'Champagne, yachts and nine hundred horsepower.',
    open: 'c4-open', close: 'c4-close', gift: 'apex', offers: ['elfer', 'volt', 'kaiju'], discount: 0.2,
    rivals: ['elise'],
    events: [
      { id: 'c4-riviera', map: 'fr-riviera', opp: 6, target: 3, rivals: [{ who: 'elise', car: 'elfer', edge: 0.1 }], pre: 'rival-elise', cash: 60000, xp: 450, title: 'HARBOUR GALA', brief: 'Élise\'s home race. Just get on the podium and get noticed.' },
      { id: 'c4-eifel', map: 'de-eifel', opp: 7, target: 2, cash: 70000, xp: 500, title: 'THE GREEN HELL', brief: 'Two laps of the forest loop. Top two.' },
      { id: 'c4-mesa', map: 'us-mesa', opp: 7, target: 2, rule: 'clean', cash: 70000, xp: 500, title: 'DESERT OVAL', brief: 'Door to door at three hundred. Top two, clean.' },
      { id: 'c4-galibier', map: 'fr-galibier', opp: 6, target: 1, rule: 'rival', rivals: [{ who: 'elise', car: 'elfer', edge: 0.2 }], cash: 110000, xp: 750, title: 'SUMMIT TO VALLEY', brief: 'League decider. Win and beat Élise down the mountain.' },
    ],
  },
  {
    id: 'c5', n: 5, title: 'HYPERCAR CHAMPIONSHIP', cls: 'HYPER', tagline: 'Everyone you ever beat, in cars that bend the air.',
    open: 'c5-open', close: 'c5-close', gift: 'rivale', offers: ['toro', 'halo', 'vanta'], discount: 0.2,
    rivals: ['lukas', 'elise', 'vanta'],
    events: [
      { id: 'c5-fjord', map: 'no-fjord', opp: 7, target: 2, rivals: [{ who: 'lukas', car: 'toro', edge: 0.15 }], cash: 150000, xp: 700, title: 'RAIN ROAD', brief: 'Wet rock, a waterfall every corner and Lukas in a TORO. Top two.' },
      { id: 'c5-brianza', map: 'it-brianza', opp: 7, target: 2, rivals: [{ who: 'elise', car: 'halo', edge: 0.15 }], cash: 170000, xp: 750, title: 'TEMPLE OF SPEED', brief: 'Slipstream down the straights. Top two.' },
      { id: 'c5-highlands', map: 'uk-highlands', opp: 7, target: 1, rule: 'rival', rivals: [{ who: 'lukas', car: 'toro', edge: 0.2 }, { who: 'elise', car: 'halo', edge: 0.2 }], cash: 240000, xp: 1000, post: 'vanta-reveal', title: 'CHAMPIONSHIP DECIDER', brief: 'Both of them, on gravel. Win the title.' },
    ],
  },
  {
    id: 'c6', n: 6, title: 'ULTIMATE LEGEND', cls: 'LEGEND', tagline: 'One name left on the list.',
    open: 'c6-open', close: 'finale', gift: 'lemans', offers: ['furia', 'zenith', 'lemans'], discount: 0.15,
    rivals: ['vanta'],
    events: [
      { id: 'c6-sarthe', map: 'fr-sarthe', opp: 7, target: 1, rivals: [{ who: 'kenji', car: 'furia', edge: 0.2 }, { who: 'lukas', car: 'rivale', edge: 0.2 }, { who: 'elise', car: 'zenith', edge: 0.2 }], cash: 300000, xp: 1200, title: 'ALL STARS AT DUSK', brief: 'Kenji, Lukas and Élise on one grid. Win, and VANTA has to answer.' },
      { id: 'c6-summit', map: 'ch-summit', opp: 5, target: 1, rule: 'rival', rivals: [{ who: 'vanta', car: 'zenith', edge: 0.3 }], cash: 350000, xp: 1400, pre: 'rival-vanta', title: 'THE GLACIER', brief: 'Ice, hairpins and VANTA. Win.' },
      { id: 'c6-hakone', map: 'jp-hakone', opp: 7, target: 1, rule: 'rival', rivals: [{ who: 'vanta', car: 'lemans', edge: 0.3 }, { who: 'kenji', car: 'furia', edge: 0.25 }, { who: 'elise', car: 'zenith', edge: 0.25 }], cash: 500000, xp: 2000, title: 'WHERE IT STARTED', brief: 'Back on the pass where it began. Beat everyone. Become the legend.' },
    ],
  },
];

export const ALL_EVENTS = CHAPTERS.flatMap((c) => c.events.map((e) => ({ ...e, chapter: c })));
export const eventById = (id) => ALL_EVENTS.find((e) => e.id === id) || null;
export const chapterById = (id) => CHAPTERS.find((c) => c.id === id) || null;

// XP → driver level
export const levelOf = (xp) => {
  let lv = 1, need = 300, left = xp || 0;
  while (left >= need) { left -= need; lv++; need = Math.round(need * 1.35); }
  return { lv, frac: left / need, need, into: left };
};

// ------------------------------------------------------------------ cutscene dialogue
// {NAME} is replaced with the driver name. who: key in PEOPLE (or 'you' / 'radio').
export const SCENES = {
  intro: { title: 'PROLOGUE · FROM NOTHING', chapter: 'c1', lines: {
    vo1: ['mara', 'Every legend starts somewhere.'],
    vo2: ['mara', 'Most of them start with nothing at all.'],
    g1: ['mara', 'There you are, {NAME}. Took you long enough.'],
    g2: ['mara', 'Meet your new ride. Don\'t laugh. She\'s older than both of us.'],
    g3: ['mara', 'Rusty outside, honest inside. I rebuilt the engine myself.'],
    g4: ['mara', 'Club race at Sakura Ring this weekend. Show me you can drive.'],
    g5: ['mara', 'Keys are in. Let\'s see what you\'ve got.'],
  } },
  'rival-kenji': { title: 'RIVAL · KENJI ARAI', chapter: 'c1', lines: {
    k1: ['kenji', 'So you\'re the one in the rust bucket.'],
    k2: ['kenji', 'Hakone is mine. Every corner, every night.'],
    m1: ['mara', 'Ignore him. He brakes too late and he knows it.'],
    k3: ['kenji', 'Try to keep up, {NAME}.'],
  } },
  'c1-close': { title: 'CHAPTER 1 · COMPLETE', chapter: 'c1', lines: {
    m1: ['mara', 'You beat Kenji on his own mountain. People noticed.'],
    m2: ['mara', 'A friend owed me a favour. That WASP outside? It\'s yours.'],
    m3: ['mara', 'Street races start next week. Faster cars. Meaner people.'],
  } },
  'c2-open': { title: 'CHAPTER 2 · STREET RISING', chapter: 'c2', lines: {
    i1: ['iris', 'Iris Kade, Halcyon Energy. I watched the Hakone run.'],
    i2: ['iris', 'We sponsor drivers who win. Win, and the parts bill is ours.'],
    m1: ['mara', 'And if we lose?'],
    i3: ['iris', 'Then it was nice meeting you. Good luck, {NAME}.'],
  } },
  'rival-kenji2': { title: 'RIVAL · KENJI ARAI', chapter: 'c2', lines: {
    k1: ['kenji', 'New sponsor, new paint. Same driver.'],
    k2: ['kenji', 'These are my streets. I grew up here.'],
    k3: ['kenji', 'Tonight I don\'t lose. Not to you.'],
  } },
  'c2-close': { title: 'CHAPTER 2 · COMPLETE', chapter: 'c2', lines: {
    k1: ['kenji', 'Tch. Fine. You\'re fast. Don\'t let it go to your head.'],
    i1: ['iris', 'Halcyon is moving you up to the pro circuit.'],
    i2: ['iris', 'The KESTREL is a gift. The pros won\'t be.'],
  } },
  'c3-open': { title: 'CHAPTER 3 · PROFESSIONAL CIRCUIT', chapter: 'c3', lines: {
    m1: ['mara', 'Pro paddock. Proper garages, proper coffee.'],
    m2: ['mara', 'And proper rivals. Watch the German kid.'],
  } },
  'rival-lukas': { title: 'RIVAL · LUKAS BRANDT', chapter: 'c3', lines: {
    l1: ['lukas', 'I have run this race four hundred times in the simulator.'],
    l2: ['lukas', 'You were never in the top ten of any of them.'],
    m1: ['mara', 'Simulators don\'t sweat, {NAME}. You do. Use it.'],
  } },
  'c3-close': { title: 'CHAPTER 3 · COMPLETE', chapter: 'c3', lines: {
    l1: ['lukas', '...I will have to update the model.'],
    m1: ['mara', 'Supercar league called. They want you. Take the KAIJU.'],
  } },
  'c4-open': { title: 'CHAPTER 4 · SUPERCAR LEAGUE', chapter: 'c4', lines: {
    i1: ['iris', 'Welcome to the Riviera. Smile, the cameras love you.'],
    m1: ['mara', 'Cameras don\'t win races. Brakes do.'],
  } },
  'rival-elise': { title: 'RIVAL · ÉLISE MOREL', chapter: 'c4', lines: {
    e1: ['elise', 'Ah, the new one. Kenji talks about you. So does Lukas.'],
    e2: ['elise', 'This is my harbour, chéri. Enjoy the view from second.'],
  } },
  'c4-close': { title: 'CHAPTER 4 · COMPLETE', chapter: 'c4', lines: {
    e1: ['elise', 'Bravo. Nobody has done that to me in three seasons.'],
    e2: ['elise', 'The hypercar grid is next. Be careful who is watching.'],
    m1: ['mara', 'The APEX is yours. Halcyon paid for it. I checked.'],
  } },
  'c5-open': { title: 'CHAPTER 5 · HYPERCAR CHAMPIONSHIP', chapter: 'c5', lines: {
    m1: ['mara', 'Hypercars. A thousand horsepower and a hundred ways to die.'],
    m2: ['mara', 'Lukas and Élise both signed up. They want revenge.'],
  } },
  'vanta-reveal': { title: 'VANTA', chapter: 'c5', lines: {
    r1: ['radio', 'Unknown car on the lap of honour... it\'s VANTA.'],
    v1: ['vanta', 'Champion of the season. Cute.'],
    v2: ['vanta', 'Come to the mountains, {NAME}. Then we\'ll see.'],
  } },
  'c5-close': { title: 'CHAPTER 5 · COMPLETE', chapter: 'c5', lines: {
    i1: ['iris', 'Hypercar champion. Halcyon bought you something Italian.'],
    m1: ['mara', 'There\'s one name left. You know which one.'],
  } },
  'c6-open': { title: 'CHAPTER 6 · ULTIMATE LEGEND', chapter: 'c6', lines: {
    m1: ['mara', 'Every rival you ever had is on this grid.'],
    m2: ['mara', 'Win, and VANTA can\'t hide anymore.'],
  } },
  'rival-vanta': { title: 'RIVAL · VANTA', chapter: 'c6', lines: {
    v1: ['vanta', 'Ice, hairpins, no run-off. My kind of road.'],
    v2: ['vanta', 'Nobody has ever finished ahead of me. Nobody.'],
    m1: ['mara', 'Then be the first, {NAME}.'],
  } },
  finale: { title: 'EPILOGUE · LEGEND', chapter: 'c6', lines: {
    v1: ['vanta', '...So this is what second feels like.'],
    v2: ['vanta', 'Keep the road warm, {NAME}. I\'ll be back.'],
    m1: ['mara', 'From a rusty hatchback to this. I knew it.'],
    m2: ['mara', 'Every legend starts somewhere, {NAME}. Yours started with nothing.'],
  } },
  tutorial: { title: 'TUTORIAL · FIRST DRIVE', chapter: 'c1', lines: {} },
};
