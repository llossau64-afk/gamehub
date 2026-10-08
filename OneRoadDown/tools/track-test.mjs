import { Track, STEP } from '../src/world/track.js';
import { MOUNTAINS } from '../src/data/mountains.js';
for (const m of MOUNTAINS) {
  const t0 = performance.now();
  const t = new Track(m);
  const t1 = performance.now();
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for (let i=0;i<t.N;i++){minx=Math.min(minx,t.px[i]);maxx=Math.max(maxx,t.px[i]);minz=Math.min(minz,t.pz[i]);maxz=Math.max(maxz,t.pz[i]);}
  // self proximity check
  let close=0;
  for (let i=0;i<t.N;i+=5) for (let j=i+200;j<t.N;j+=5){const dx=t.px[i]-t.px[j],dz=t.pz[i]-t.pz[j]; if(dx*dx+dz*dz<40*40) close++;}
  // query accuracy on road
  let maxErr=0; const q0=performance.now(); let nq=0;
  for (let i=10;i<t.N-10;i+=7){const x=t.px[i]+t.rx[i]*1.5, z=t.pz[i]+t.rz[i]*1.5; const q=t.query(x,z); nq++; const e=Math.abs(q.h-(t.py[i]-0.018)); if(e>maxErr && !t.potholes.length) maxErr=e; if (Math.abs(q.s - i*STEP)>0.5 && e>0.5) {} }
  const q1=performance.now();
  console.log(m.id,'gen ms',(t1-t0).toFixed(0),'N',t.N,'bounds',minx|0,maxx|0,minz|0,maxz|0,'close',close,'alt',t.py[0]|0,'->',t.py[t.N-1]|0);
  console.log(' tunnels',t.tunnels.length,'bridges',t.bridges.length,'jumps',t.jumps.length,'shortcuts',t.shortcuts.length, t.shortcuts.filter(c=>c.kind==='drop').length,'pickups',t.pickups.length,'obst',t.obstacles.length,'potholes',t.potholes.length,'decals',t.decals.length,'signs',t.signs.length,'props',t.props.length,'hairpinSamples',t.isHairpin.reduce((a,b)=>a+b,0));
  console.log(' query us',((q1-q0)/nq*1000).toFixed(1));
  const types={}; for(const p of t.pickups) types[p.type]=(types[p.type]||0)+1; console.log(' pickups',types);
}
