// 使い方: node scene.js <name> "<js to run>" <t1,t2,...秒> [full]
const { chromium } = require('playwright');
(async()=>{
 const [,, name, js, times, full] = process.argv;
 const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}); const p=await b.newPage({viewport:{width:1100,height:1000}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
 await p.goto('http://localhost:8765/index.html?autostart=1'); await p.waitForTimeout(1200);
 await p.evaluate(js);
 let last=0;
 for (const t of times.split(',').map(Number)) {
   await p.waitForTimeout((t-last)*1000); last=t;
   const el = await p.$('#machine'); const box = await el.boundingBox();
   const k = box.width/900;
   const clip = full ? box : {x: box.x+140*k, y: box.y+214*k, width: 620*k, height: 510*k};
   await p.screenshot({path: `${__dirname}/S_${name}_${String(t).padStart(5,'0')}.png`, clip});
   const st = await p.evaluate(()=>({ph: app.game.phase, m: app.game.mode, sc: app.game.lastScenarioName, tl: app.game.timeline.time.toFixed(1)}));
   console.log(t, JSON.stringify(st));
 }
 console.log(errs.slice(0,10).join('\n')); await b.close(); })();
