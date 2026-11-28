const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:900,height:1100}});
 for (const a of process.argv.slice(2)) { await p.goto('file://'+__dirname+'/physics.html?'+a); await p.waitForFunction(()=>document.title==='done',null,{timeout:120000}); await p.screenshot({path:__dirname+'/out_'+a.replace(/[^a-z0-9.]/gi,'_')+'.png'}); }
 await b.close(); })();
