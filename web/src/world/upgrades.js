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
  { id: 'clipperPro', cat: 'tools', name: 'Pro Clippers', price: 240, level: 4, icon: 'clipper', equip: 'clipper',
    desc: 'Black and gold, quiet motor, perfect fades.', effect: '+90% clipper speed' },
];

export const CATS = [
  { id: 'shop', label: 'Shop' },
  { id: 'decor', label: 'Comfort' },
  { id: 'tools', label: 'Equipment' },
];

export const byId = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// combined effects of everything owned
export function effects(owned) {
  const h = (id) => owned.includes(id);
  const sat = (h('bulb') ? 0.05 : 0) + (h('clean') ? 0.08 : 0) + (h('paint') ? 0.08 : 0) + (h('mirrorLarge') ? 0.08 : 0) + (h('floorWood') ? 0.08 : 0);
  const tips = 1 + (h('decor') ? 0.06 : 0) + (h('products') ? 0.1 : 0) + (h('chairClassic') ? 0.12 : 0);
  const patience = 1 + (h('radio') ? 0.2 : 0) + (h('couch') ? 0.25 : 0) + (h('tv') ? 0.25 : 0);
  const clipper = h('clipperPro') ? 'pro' : h('clipperBasic') ? 'basic' : 'rusty';
  const clipperRate = { rusty: 1.6, basic: 2.3, pro: 3.1 }[clipper];
  const arrival = 1 + (h('pole') ? 0.35 : 0) + (h('decor') ? 0.1 : 0) + (h('paint') ? 0.1 : 0);
  return { sat, tips, patience, clipper, clipperRate, scissorsPro: h('scissorsPro'), arrival };
}

// XP needed to go from level n to n+1
export const xpFor = (lvl) => Math.round(80 + (lvl - 1) * 70 + Math.pow(lvl - 1, 2) * 18);

export const ACHIEVEMENTS = [
  { id: 'firstCut', name: 'First Cut', desc: 'Finish your very first haircut.' },
  { id: 'fiveStar', name: 'Five Stars', desc: 'Get a five-star rating.' },
  { id: 'tenServed', name: 'Regulars', desc: 'Serve 10 customers.' },
  { id: 'fiftyServed', name: 'Busy Chair', desc: 'Serve 50 customers.' },
  { id: 'streak3', name: 'On a Roll', desc: 'Three cuts of 4+ stars in a row.' },
  { id: 'rich', name: 'Cash Drawer', desc: 'Earn $500 in total.' },
  { id: 'lights', name: 'Let There Be Light', desc: 'Replace the flickering bulb.' },
  { id: 'makeover', name: 'Makeover', desc: 'Own 6 shop upgrades.' },
  { id: 'level5', name: 'Local Legend', desc: 'Reach shop level 5.' },
  { id: 'sweep', name: 'Tidy Barber', desc: 'Sweep the floor.' },
];
