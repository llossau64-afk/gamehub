// Every upgrade changes the shop you can see (or the tool in your hand).
export const UPGRADES = [
  // ---- shop
  { id: 'bulb', cat: 'shop', name: 'Better Light Bulb', price: 20, level: 1, icon: 'bulb',
    desc: 'Warm, steady light. No more flicker.', effect: '+5% satisfaction' },
  { id: 'clean', cat: 'shop', name: 'Deep Clean', price: 60, level: 1, icon: 'broom',
    desc: 'Scrub the floor, wash the window, kill the cobwebs.', effect: '+8% satisfaction' },
  { id: 'radio', cat: 'decor', name: 'Old Radio', price: 45, level: 1, icon: 'radio',
    desc: 'A bit of music makes waiting easier.', effect: '+20% patience' },
  { id: 'decor', cat: 'decor', name: 'Plants & Posters', price: 85, level: 2, icon: 'plant',
    desc: 'Fresh posters, real plants, a second warm lamp.', effect: '+6% tips' },
  { id: 'paint', cat: 'shop', name: 'Fresh Paint', price: 140, level: 2, icon: 'paint',
    desc: 'Barbershop green walls and dark wood panels.', effect: '+8% satisfaction' },
  { id: 'couch', cat: 'decor', name: 'Leather Couch', price: 120, level: 2, icon: 'couch',
    desc: 'Customers wait comfortably instead of on cracked plastic.', effect: '+25% patience' },
  { id: 'pole', cat: 'shop', name: 'Barber Pole & Neon', price: 160, level: 3, icon: 'pole',
    desc: 'A spinning pole outside and a neon OPEN sign. People notice.', effect: 'More customers' },
  { id: 'products', cat: 'decor', name: 'Product Shelf', price: 110, level: 3, icon: 'shelf',
    desc: 'Pomades, tonics and oils. Looks professional.', effect: '+10% tips' },
  { id: 'floorWood', cat: 'shop', name: 'Oak Floor', price: 260, level: 4, icon: 'floor',
    desc: 'Warm oak planks over the cracked tiles.', effect: '+8% satisfaction' },
  { id: 'tv', cat: 'decor', name: 'Wall TV', price: 220, level: 4, icon: 'tv',
    desc: 'Sports on mute. Nobody minds waiting.', effect: '+25% patience' },
  // ---- equipment
  { id: 'clipperBasic', cat: 'tools', name: 'Basic Clippers', price: 40, level: 1, icon: 'clipper', equip: 'clipper',
    desc: 'They actually stay sharp. Faster, smoother cuts.', effect: '+40% clipper speed' },
  { id: 'scissorsPro', cat: 'tools', name: 'Pro Scissors', price: 70, level: 2, icon: 'scissors', equip: 'scissors',
    desc: 'Japanese steel. Clean, controlled snips.', effect: 'Finer cuts' },
  { id: 'chairClassic', cat: 'tools', name: 'Classic Barber Chair', price: 180, level: 3, icon: 'chair',
    desc: 'Red leather, chrome, hydraulic pump. Customers tip better in it.', effect: '+12% tips' },
  { id: 'mirrorLarge', cat: 'tools', name: 'Big Mirror & Station', price: 150, level: 3, icon: 'mirror',
    desc: 'A proper mirror and a dark wood station. No more crack.', effect: '+8% satisfaction' },
  { id: 'station2', cat: 'staff', name: 'Second Station', price: 420, level: 5, icon: 'chair',
    desc: 'A second chair, mirror and cart. Room for another barber.', effect: '+1 station' },
  { id: 'hireBarber', cat: 'staff', name: 'Hire a Barber', price: 300, level: 5, icon: 'scissors', req: 'station2',
    desc: 'Marco takes waiting customers on his own. He keeps 35% of what they pay.', effect: 'Serves customers' },
  { id: 'trainBarber', cat: 'staff', name: 'Barber Training', price: 380, level: 6, icon: 'star', req: 'hireBarber',
    desc: 'A weekend course. Marco’s cuts get noticeably cleaner.', effect: 'Better ratings' },
  { id: 'fastHands', cat: 'staff', name: 'Faster Hands', price: 320, level: 6, icon: 'clipper', req: 'hireBarber',
    desc: 'Pro tools for Marco. He finishes a cut in half the time.', effect: '+80% speed' },
  { id: 'extension', cat: 'staff', name: 'Shop Extension', price: 900, level: 7, icon: 'key', req: 'station2',
    desc: 'Knock through to the back room: a third chair, a lounge corner and an archway.', effect: '+1 station · more customers' },
  { id: 'hireBarber2', cat: 'staff', name: 'Hire Luca', price: 520, level: 7, icon: 'users', req: 'extension',
    desc: 'A second barber for the new chair. Works as well as Marco does.', effect: 'Serves customers' },
  { id: 'dyeStation', cat: 'tools', name: 'Colour Bar', price: 260, level: 4, icon: 'spray',
    desc: 'Hair & beard dye with a brush. Customers start asking for colour — and pay for it.', effect: 'Dye service · +$15 per colour' },
  { id: 'sound', cat: 'decor', name: 'Hi-Fi Speakers', price: 190, level: 3, icon: 'sound', req: 'radio',
    desc: 'Proper speakers on the wall. The music hits different.', effect: '+10% tips · better music' },
  { id: 'arcade', cat: 'decor', name: 'Arcade Cabinet', price: 340, level: 5, icon: 'tv',
    desc: 'A blinking arcade machine in the corner. Waiting is fun now.', effect: '+30% patience' },
  { id: 'coffee', cat: 'decor', name: 'Espresso Machine', price: 150, level: 2, icon: 'coffee',
    desc: 'A red espresso machine on the counter. Free coffee for everyone who waits.', effect: '+15% patience · +4% tips' },
  { id: 'neonWall', cat: 'shop', name: 'Neon Scissors', price: 210, level: 3, icon: 'neon',
    desc: 'Pink and blue neon scissors on the wall. Very good for selfies.', effect: '+10% customers · +5% tips' },
  { id: 'vending', cat: 'shop', name: 'Snack Machine', price: 240, level: 4, icon: 'vending',
    desc: 'A snack machine on the pavement out front. People stop, then come in.', effect: '+12% customers' },
  { id: 'washBasin', cat: 'shop', name: 'Hair Wash Basin', price: 280, level: 4, icon: 'sink',
    desc: 'A proper shampoo station. Every cut starts with a wash now.', effect: '+8% satisfaction' },
  { id: 'aquarium', cat: 'decor', name: 'Aquarium', price: 380, level: 5, icon: 'fish',
    desc: 'Four fish who have seen things. Waiting customers stare at them, calmly.', effect: '+25% patience' },
  { id: 'chandelier', cat: 'shop', name: 'Chandelier', price: 650, level: 6, icon: 'chandelier',
    desc: 'Gold and crystal over the chair. You’re a luxury salon now.', effect: '+8% satisfaction · +12% tips' },
  { id: 'clipperPro', cat: 'tools', name: 'Pro Clippers', price: 240, level: 4, icon: 'clipper', equip: 'clipper',
    desc: 'Black and gold, quiet motor, perfect fades.', effect: '+90% clipper speed' },
];

export const CATS = [
  { id: 'shop', label: 'Shop' },
  { id: 'decor', label: 'Comfort' },
  { id: 'tools', label: 'Equipment' },
  { id: 'staff', label: 'Staff' },
];

export const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// combined effects of everything owned
export function effects(owned) {
  const h = (id) => owned.includes(id);
  const sat = (h('bulb') ? 0.05 : 0) + (h('clean') ? 0.08 : 0) + (h('paint') ? 0.08 : 0) + (h('mirrorLarge') ? 0.08 : 0) + (h('floorWood') ? 0.08 : 0) + (h('washBasin') ? 0.08 : 0) + (h('chandelier') ? 0.08 : 0);
  const tips = 1 + (h('decor') ? 0.06 : 0) + (h('products') ? 0.1 : 0) + (h('chairClassic') ? 0.12 : 0) + (h('sound') ? 0.1 : 0) + (h('coffee') ? 0.04 : 0) + (h('neonWall') ? 0.05 : 0) + (h('chandelier') ? 0.12 : 0);
  const patience = 1 + (h('radio') ? 0.2 : 0) + (h('couch') ? 0.25 : 0) + (h('tv') ? 0.25 : 0) + (h('arcade') ? 0.3 : 0) + (h('coffee') ? 0.15 : 0) + (h('aquarium') ? 0.25 : 0);
  const clipper = h('clipperPro') ? 'pro' : h('clipperBasic') ? 'basic' : 'rusty';
  const clipperRate = { rusty: 1.6, basic: 2.3, pro: 3.1 }[clipper];
  const arrival = 1 + (h('pole') ? 0.35 : 0) + (h('decor') ? 0.1 : 0) + (h('paint') ? 0.1 : 0) + (h('neonWall') ? 0.1 : 0) + (h('vending') ? 0.12 : 0);
  const staffSkill = h('trainBarber') ? 0.86 : 0.62;
  const staffSpeed = h('fastHands') ? 1.8 : 1;
  return { sat, tips, patience, clipper, clipperRate, scissorsPro: h('scissorsPro'), arrival: arrival + (h('hireBarber') ? 0.25 : 0) + (h('extension') ? 0.2 : 0) + (h('hireBarber2') ? 0.25 : 0), dye: h('dyeStation'), staffSkill, staffSpeed };
}

// XP needed to go from level n to n+1
export const xpFor = (lvl) => Math.round(80 + (lvl - 1) * 70 + Math.pow(lvl - 1, 2) * 18);

// Achievements: each one reads its progress from the save, so the panel can show bars.
// tier: bronze / silver / gold. reward is claimed from the achievements panel.
const st = (k) => (s) => s.stats[k] || 0;
const owns = (id) => (s) => (s.owned.includes(id) ? 1 : 0);
export const ACH_CATS = [
  { id: 'craft', label: 'Craft' },
  { id: 'business', label: 'Business' },
  { id: 'shop', label: 'Shop' },
  { id: 'secret', label: 'Secret' },
];
export const ACHIEVEMENTS = [
  // ---- craft
  { id: 'firstCut', cat: 'craft', tier: 'bronze', icon: 'scissors', name: 'First Cut', desc: 'Finish your very first haircut.', goal: 1, progress: st('served'), reward: { money: 10, xp: 20 } },
  { id: 'fiveStar', cat: 'craft', tier: 'bronze', icon: 'star', name: 'Five Stars', desc: 'Get a five-star rating.', goal: 1, progress: st('fiveStars'), reward: { money: 20, xp: 30 } },
  { id: 'streak3', cat: 'craft', tier: 'bronze', icon: 'fire', name: 'On a Roll', desc: 'Three cuts of 4+ stars in a row.', goal: 3, progress: st('bestStreak'), reward: { money: 25, xp: 40 } },
  { id: 'perfect10', cat: 'craft', tier: 'silver', icon: 'star', name: 'Perfectionist', desc: 'Earn ten five-star ratings.', goal: 10, progress: st('fiveStars'), reward: { money: 80, xp: 120 } },
  { id: 'fadeMaster', cat: 'craft', tier: 'silver', icon: 'clipper', name: 'Fade Master', desc: 'A five-star fade.', goal: 1, progress: st('fades5'), reward: { money: 60, xp: 80 } },
  { id: 'beardBoss', cat: 'craft', tier: 'silver', icon: 'beard', name: 'Beard Boss', desc: 'A five-star beard cut.', goal: 1, progress: st('beards5'), reward: { money: 50, xp: 70 } },
  { id: 'styleIcon', cat: 'craft', tier: 'silver', icon: 'comb', name: 'Style Icon', desc: 'Five stars on a Side Part or a Slick Back.', goal: 1, progress: st('styled5'), reward: { money: 70, xp: 90 } },
  { id: 'speedDemon', cat: 'craft', tier: 'silver', icon: 'clock', name: 'Speed Demon', desc: 'Four stars or more in under 70% of the usual time.', goal: 1, progress: st('fast'), reward: { money: 60, xp: 80 } },
  { id: 'streak10', cat: 'craft', tier: 'gold', icon: 'fire', name: 'Unstoppable', desc: 'Ten cuts of 4+ stars in a row.', goal: 10, progress: st('bestStreak'), reward: { money: 150, xp: 250 } },
  { id: 'fadeLegend', cat: 'craft', tier: 'gold', icon: 'clipper', name: 'Fade Legend', desc: 'Ten five-star fades.', goal: 10, progress: st('fades5'), reward: { money: 200, xp: 300 } },
  { id: 'repertoire', cat: 'craft', tier: 'gold', icon: 'scissors', name: 'Full Repertoire', desc: 'Do every haircut on the list at least once.', goal: 19, progress: (s) => Object.keys(s.stats.cuts || {}).length, reward: { money: 250, xp: 300 } },
  { id: 'perfect50', cat: 'craft', tier: 'gold', icon: 'crown', name: 'Master Barber', desc: 'Earn fifty five-star ratings.', goal: 50, progress: st('fiveStars'), reward: { money: 300, xp: 400 } },
  // ---- business
  { id: 'tenServed', cat: 'business', tier: 'bronze', icon: 'users', name: 'Regulars', desc: 'Serve 10 customers.', goal: 10, progress: st('served'), reward: { money: 30, xp: 50 } },
  { id: 'rich', cat: 'business', tier: 'bronze', icon: 'cash', name: 'Cash Drawer', desc: 'Earn $500 in total.', goal: 500, progress: st('earned'), reward: { money: 25, xp: 40 }, money: true },
  { id: 'fiftyServed', cat: 'business', tier: 'silver', icon: 'users', name: 'Busy Chair', desc: 'Serve 50 customers.', goal: 50, progress: st('served'), reward: { money: 100, xp: 150 } },
  { id: 'tipKing', cat: 'business', tier: 'silver', icon: 'coin', name: 'Tip Jar', desc: 'Collect $250 in tips.', goal: 250, progress: st('tips'), reward: { money: 60, xp: 80 }, money: true },
  { id: 'vip', cat: 'business', tier: 'silver', icon: 'star', name: 'Celebrity Barber', desc: 'Give a VIP a 4-star cut or better.', goal: 1, progress: (s) => (s.stats.vips || []).length, reward: { money: 80, xp: 100 } },
  { id: 'wealthy', cat: 'business', tier: 'silver', icon: 'cash', name: 'Small Fortune', desc: 'Earn $5,000 in total.', goal: 5000, progress: st('earned'), reward: { money: 150, xp: 200 }, money: true },
  { id: 'hundredServed', cat: 'business', tier: 'gold', icon: 'users', name: 'Local Institution', desc: 'Serve 100 customers.', goal: 100, progress: st('served'), reward: { money: 250, xp: 350 } },
  { id: 'vipAll', cat: 'business', tier: 'gold', icon: 'crown', name: 'Walk of Fame', desc: 'Make all six VIPs happy.', goal: 6, progress: (s) => (s.stats.vips || []).length, reward: { money: 300, xp: 400 } },
  { id: 'tycoon', cat: 'business', tier: 'gold', icon: 'cash', name: 'Barber Tycoon', desc: 'Earn $25,000 in total.', goal: 25000, progress: st('earned'), reward: { money: 500, xp: 600 }, money: true },
  // ---- shop
  { id: 'lights', cat: 'shop', tier: 'bronze', icon: 'bulb', name: 'Let There Be Light', desc: 'Replace the flickering bulb.', goal: 1, progress: owns('bulb'), reward: { money: 10, xp: 15 } },
  { id: 'sweep', cat: 'shop', tier: 'bronze', icon: 'broom', name: 'Tidy Barber', desc: 'Sweep the floor.', goal: 1, progress: st('sweeps'), reward: { money: 10, xp: 15 } },
  { id: 'makeover', cat: 'shop', tier: 'silver', icon: 'paint', name: 'Makeover', desc: 'Own 6 shop or comfort upgrades.', goal: 6, progress: (s) => s.owned.filter((x) => byId[x] && ['shop', 'decor'].includes(byId[x].cat)).length, reward: { money: 60, xp: 80 } },
  { id: 'level5', cat: 'shop', tier: 'silver', icon: 'star', name: 'Local Legend', desc: 'Reach shop level 5.', goal: 5, progress: (s) => s.level, reward: { money: 60, xp: 80 } },
  { id: 'hire', cat: 'shop', tier: 'silver', icon: 'users', name: 'Boss', desc: 'Hire your first barber.', goal: 1, progress: owns('hireBarber'), reward: { money: 80, xp: 100 } },
  { id: 'day10', cat: 'shop', tier: 'silver', icon: 'calendar', name: 'Ten Days In', desc: 'Keep the shop open for ten days.', goal: 10, progress: (s) => s.day, reward: { money: 70, xp: 90 } },
  { id: 'level10', cat: 'shop', tier: 'gold', icon: 'crown', name: 'Famous', desc: 'Reach shop level 10.', goal: 10, progress: (s) => s.level, reward: { money: 250, xp: 300 } },
  { id: 'day30', cat: 'shop', tier: 'gold', icon: 'calendar', name: 'Old Hand', desc: 'Keep the shop open for thirty days.', goal: 30, progress: (s) => s.day, reward: { money: 250, xp: 300 } },
  { id: 'fullHouse', cat: 'shop', tier: 'gold', icon: 'key', name: 'Dream Shop', desc: 'Own every upgrade.', goal: UPGRADES.length, progress: (s) => s.owned.length, reward: { money: 500, xp: 500 } },
  // ---- secret: no hint until they happen
  { id: 'oops', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Oops.', desc: 'Leave a bald patch where nobody asked for one.', goal: 1, progress: st('oops'), reward: { money: 5, xp: 10 }, secret: true },
  { id: 'toughCrowd', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Tough Crowd', desc: 'A customer gave up waiting and walked out.', goal: 1, progress: st('lost'), reward: { money: 5, xp: 10 }, secret: true },
  { id: 'collateral', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Collateral Damage', desc: 'An angry customer kicked your trash bin over.', goal: 1, progress: st('binsKicked'), reward: { money: 5, xp: 10 }, secret: true },
  { id: 'careerChoice', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Career Choice', desc: 'Turned down a glamorous job at Fresh Mart.', goal: 1, progress: st('jobsRefused'), reward: { money: 10, xp: 10 }, secret: true },
  { id: 'roadkill', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Look Both Ways', desc: 'Got run over by a car.', goal: 1, progress: st('carHits'), reward: { money: 10, xp: 10 }, secret: true },
  { id: 'streetJustice', cat: 'secret', tier: 'silver', icon: 'fist', name: 'Street Justice', desc: 'Chased an angry customer down the street and hit them again.', goal: 1, progress: st('streetHits'), reward: { money: 15, xp: 20 }, secret: true },
  { id: 'bouncer', cat: 'secret', tier: 'silver', icon: 'fist', name: 'Bouncer', desc: 'Physically threw a furious customer out of your shop.', goal: 1, progress: st('bounced'), reward: { money: 20, xp: 25 }, secret: true },
  { id: 'bootcamp', cat: 'secret', tier: 'bronze', icon: 'mask', name: 'Boot Camp', desc: 'Kicked an angry customer in the behind.', goal: 1, progress: st('kicks'), reward: { money: 5, xp: 10 }, secret: true },
  { id: 'knockout', cat: 'secret', tier: 'bronze', icon: 'fist', name: 'Knuckle Sandwich', desc: 'Punched a customer who threw money at you.', goal: 1, progress: st('punches'), reward: { money: 5, xp: 10 }, secret: true },
  { id: 'tidyFreak', cat: 'secret', tier: 'silver', icon: 'broom', name: 'Spotless', desc: 'Sweep the floor 25 times.', goal: 25, progress: st('sweeps'), reward: { money: 40, xp: 60 }, secret: true },
];
ACHIEVEMENTS.find((a) => a.id === 'repertoire').goal = 0;   // set from the haircut list (styles.js) at startup

export const EVENTS = [
  { id: 'rush', name: 'Friday Rush', desc: 'Customers keep coming. Stay fast.' },
  { id: 'doubleTips', name: 'Double Tips', desc: 'Everybody tips twice as much today.' },
  { id: 'vipDay', name: 'VIP Day', desc: 'Word got out. Celebrities might drop by.' },
  { id: 'fadeChallenge', name: 'Fade Challenge', desc: '+$25 for every fade with 4 stars or more.' },
];
