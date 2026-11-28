const { chromium } = require('playwright');
(async()=>{
 const [,, w=1600, h=1000, out='app', wait=3000, extra=''] = process.argv;
 const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}); const p=await b.newPage({viewport:{width:+w,height:+h}});
 const errs=[]; p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); }); p.on('pageerror',e=>errs.push('PAGEERROR '+e.message+'\n'+e.stack));
 await p.goto('http://localhost:8765/index.html?autostart=1'+extra);
 await p.waitForTimeout(+wait);
 await p.screenshot({path:__dirname+'/'+out+'.png'});
 const info = await p.evaluate(()=>({fps:window.__fps, phase: app.game.phase, mode: app.game.mode, balls: app.game.balls, spins: app.game.stats.spins, holds: app.game.holds1.length}));
 console.log(JSON.stringify(info)); console.log(errs.filter(e=>!/404/.test(e)).slice(0,20).join('\n'));
 await b.close(); })();
