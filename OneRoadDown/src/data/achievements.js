// Achievement definitions. `check(save, run)` is evaluated after each run and on
// purchases; `run` may be null outside of runs.

export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'FIRST RUN', desc: 'Travel 1 km in a single run.', reward: 250, check: (s, r) => r && r.distance >= 1000 },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Travel 5 km in a single run.', reward: 1500, check: (s, r) => r && r.distance >= 5000 },
  { id: 'snowline', name: 'ABOVE THE CLOUDS', desc: 'Reach the Snow Line (6 km).', reward: 3000, check: (s, r) => r && r.mountain === 'm1' && r.distance >= 6000 },
  { id: 'deep', name: 'DEEP DESCENT', desc: 'Travel 10 km in a single run.', reward: 8000, check: (s, r) => r && r.distance >= 10000 },
  { id: 'cliffs', name: 'EDGE OF THE WORLD', desc: 'Reach The Cliffs (15 km).', reward: 20000, check: (s, r) => r && r.mountain === 'm1' && r.distance >= 15000 },
  { id: 'lower', name: 'ALMOST THERE', desc: 'Reach The Lower Pass (20 km).', reward: 40000, check: (s, r) => r && r.mountain === 'm1' && r.distance >= 20000 },
  { id: 'conquered', name: 'MOUNTAIN CONQUERED', desc: 'Reach the bottom of Hollow Peak.', reward: 100000, check: (s) => s.completed.includes('m1') },
  { id: 'canyon', name: 'CANYON RUNNER', desc: 'Reach the floor of The Canyon.', reward: 250000, check: (s) => s.completed.includes('m2') },
  { id: 'mechanic', name: 'MECHANIC', desc: 'Buy 10 upgrades.', reward: 500, check: (s) => s.stats.upgrades >= 10 },
  { id: 'master_mech', name: 'MASTER MECHANIC', desc: 'Buy 100 upgrades.', reward: 15000, check: (s) => s.stats.upgrades >= 100 },
  { id: 'speed_demon', name: 'SPEED DEMON', desc: 'Reach 200 km/h.', reward: 5000, check: (s) => s.stats.topSpeed >= 200 },
  { id: 'broken', name: 'BROKEN BUT MOVING', desc: 'Drive 500 m with critical engine damage.', reward: 2000, check: (s, r) => r && r.criticalDistance >= 500 },
  { id: 'fumes', name: 'RUNNING ON FUMES', desc: 'Grab a fuel can with less than 1 litre left.', reward: 1500, check: (s, r) => r && r.fumes },
  { id: 'flyer', name: 'HIGH FLYER', desc: 'Stay airborne for 2 seconds.', reward: 2500, check: (s, r) => r && r.maxAir >= 2 },
  { id: 'sideways', name: 'SIDEWAYS', desc: 'Hold a drift for 4 seconds.', reward: 2000, check: (s, r) => r && r.maxDrift >= 4 },
  { id: 'shortcuts', name: 'LOCAL KNOWLEDGE', desc: 'Take 10 shortcuts.', reward: 4000, check: (s) => s.stats.shortcuts >= 10 },
  { id: 'rollover', name: 'SHINY SIDE UP', desc: 'Roll the car and keep driving.', reward: 1500, check: (s, r) => r && r.recoveredRoll },
  { id: 'collector', name: 'COLLECTOR', desc: 'Own 10 vehicles.', reward: 50000, check: (s) => s.owned.length >= 10 },
  { id: 'facility', name: 'RACING FACILITY', desc: 'Upgrade the garage to level 5.', reward: 50000, check: (s) => s.garageLevel >= 5 },
  { id: 'millionaire', name: 'MILLIONAIRE', desc: 'Earn $1,000,000 in total.', reward: 25000, check: (s) => s.totalEarned >= 1000000 },
];
