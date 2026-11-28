const NB = require('./load')(['engine/core.js','machines/abyss-reactor/layout.js','engine/physics.js']);
const L = NB.machines['abyss-reactor'].layout;
function run(power, n, gates={}) {
  const res = {}; let warp=0, center=0, through=0; const lx=[];
  const ph = new NB.Physics(L, { seed: 7, onEvent: (t, e) => {
    if (t==='remove') res[e.reason]=(res[e.reason]||0)+1;
    if (t==='warp') warp++; if (t==='stageCenter') center++; if (t==='through') through++;
  }});
  Object.assign(ph.gates, gates);
  let t=0, launched=0;
  while (launched < n || ph.balls.length) {
    if (launched < n && t >= launched*0.6) { ph.launch(power); launched++; }
    ph.step(NB.Physics.STEP); t+=NB.Physics.STEP;
    if (t > n*0.6+60) break;
  }
  return {power, ...res, warp, center, through, left: ph.balls.length};
}
const n = +process.argv[2]||300;
for (const p of (process.argv[3]||'0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,1').split(',').map(Number)) console.log(JSON.stringify(run(p, n, {denchu: process.argv[4]==='open', attacker: process.argv[4]==='open'})));
