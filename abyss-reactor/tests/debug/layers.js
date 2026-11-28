const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1200,height:900}});
 await p.goto('http://localhost:8765/index.html?autostart=1'); await p.waitForTimeout(1500);
 for (const k of ['boardLayer','frameLayer','cabinetLayer']) { const d=await p.evaluate((k)=>app.mr[k].toDataURL(), k); fs.writeFileSync(__dirname+'/L_'+k+'.png', Buffer.from(d.split(',')[1],'base64')); }
 const d=await p.evaluate(()=>app.lcd.canvas.toDataURL()); fs.writeFileSync(__dirname+'/L_lcd.png', Buffer.from(d.split(',')[1],'base64'));
 await b.close(); })();
