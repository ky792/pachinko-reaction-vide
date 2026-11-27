/* ==========================================================
 * 演出シーケンス（突入・昇格・終了など、操作を止めて見せる演出）
 * 新しい演出は MK.Seq.xxx = async () => {...} を追加するだけで呼び出せます。
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, E = U.ease, FX = MK.FX, A = MK.Art;
  const W = 960, H = 540;
  const wait = (ms) => MK.wait(ms);
  const lamps = (m) => MK.Cabinet && MK.Cabinet.setLamp(m);

  function overlay(dur, draw, layer = 'top') { return FX.add({ dur, layer, draw }); }

  // 警告帯
  function warningBands(text, color = '#ff2a2a', dur = 2.4) {
    return overlay(dur, (ctx, p, age) => {
      const a = Math.min(1, age * 4) * (1 - U.seg(p, 0.85, 1));
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(120,0,0,${0.35 + 0.25 * Math.sin(age * 16)})`;
      ctx.fillRect(0, 0, W, H);
      [90, H - 90].forEach((y, k) => {
        ctx.save();
        ctx.fillStyle = '#000'; ctx.fillRect(0, y - 28, W, 56);
        ctx.beginPath(); ctx.rect(0, y - 28, W, 56); ctx.clip();
        ctx.fillStyle = color;
        const off = (age * 200 * (k ? -1 : 1)) % 80;
        for (let x = -160; x < W + 160; x += 80) { ctx.beginPath(); ctx.moveTo(x + off, y - 28); ctx.lineTo(x + off + 40, y - 28); ctx.lineTo(x + off + 10, y + 28); ctx.lineTo(x + off - 30, y + 28); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - 170, y - 22, 340, 44); ctx.restore();
        A.label(ctx, text, W / 2, y + 1, 28, '#ffdddd', 'center', '"Dela Gothic One", sans-serif');
      });
    });
  }

  const Seq = {
    // ---- 魔王7：フリーズ ----
    async freeze() {
      MK.Audio.stopBgm();
      MK.Audio.play('freeze');
      MK.Reels.setAllLight(0.05);
      lamps('off');
      const o = overlay(3.4, (ctx, p, age) => {
        ctx.fillStyle = '#000'; ctx.globalAlpha = Math.min(1, age * 3); ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = U.seg(age, 0.8, 1.8);
        A.glowEye(ctx, W / 2 - 60, 250, 10 + Math.sin(age * 10) * 2, '#ff1020');
        A.glowEye(ctx, W / 2 + 60, 250, 10 + Math.sin(age * 10) * 2, '#ff1020');
        ctx.globalAlpha = U.seg(age, 2.0, 2.6);
        FX.fancyText(ctx, 'フハハハハハ…', W / 2, 360, 46, { palette: 'blood' });
      });
      FX.shake(4, 0.5);
      await MK.Reels.reverse(3.2);
      MK.Reels.setAllLight(1);
      FX.flash('#ffffff', 1, 2);
      FX.shake(24);
    },

    // ---- CZ 突入 ----
    async czEntry(opt = {}) {
      MK.Audio.stopBgm();
      lamps('cz');
      MK.Audio.play('alarm');
      FX.flash('#ff0000', 0.6, 2);
      warningBands('勇者 接近警報', '#ff2a2a', 2.2);
      FX.shake(10, 2);
      await wait(1900);
      MK.LCD.setScene('cz');
      FX.flash('#ffffff', 1, 2.5);
      await wait(500);
      FX.slam('勇者襲来!!', { size: 120, palette: 'blood', glow: 'rgba(255,30,30,0.8)', sub: MK.CFG.CZ.games + 'G以内に勇者を撃退せよ！', dur: 2.0 });
      FX.P.burst(W / 2, H / 2, 60, 'rgba(255,90,40,0.9)', 700, 40);
      await wait(2000);
    },
    async czWin() {
      const sc = MK.LCD.scenes.cz;
      MK.Audio.stopBgm();
      const hero = sc.hero;
      FX.flash('#000', 0.8, 1.5);
      await wait(300);
      MK.LCD.helpers.hitFx(hero.x, hero.y - 60, true);
      MK.LCD.helpers.setAnim(hero, 'down');
      sc.party.forEach((p) => { p.tx = 1200; p.speed = 400; });
      FX.shake(26);
      await wait(600);
      FX.slam('勇者撃退!!', { size: 130, palette: 'gold', glow: 'rgba(255,200,40,0.9)', dur: 2.0 });
      FX.P.burst(W / 2, H / 2, 80, 'rgba(255,220,100,0.9)', 800, 40);
      MK.Audio.play('win');
      await wait(2100);
    },
    async czLose() {
      const sc = MK.LCD.scenes.cz;
      MK.Audio.stopBgm();
      FX.cutin({ text: '勇者「魔王城、制圧！」', size: 50, palette: 'ice', color: '#103a8a', drawChar: (c, x, y, a) => { c.save(); c.translate(x, y - 30); c.scale(3.2, 3.2); MK.Art.Heroes.hero(c, { breath: 0, walk: 0, swing: -1, lunge: 0, hurt: 0 }, a); c.restore(); }, dur: 1.6 });
      await wait(1600);
      FX.flash('#ffffff', 1, 2);
      sc.actors.filter((a) => a.kind === 'monster').forEach((m, i) => setTimeout(() => { MK.LCD.helpers.hitFx(m.x, m.y - 40, false); MK.LCD.helpers.setAnim(m, 'down'); }, i * 120));
      await wait(900);
      MK.Audio.play('lose');
      FX.cutin({ text: 'ぐぬぬ…修繕費が…！', size: 52, palette: 'blood', drawChar: (c, x, y, a) => A.maou(c, x, y, 0.95, a, 'shock'), dur: 1.8 });
      await wait(1800);
    },
    async maouRescue() {
      MK.Audio.stopBgm();
      FX.flash('#000', 1, 0.8);
      MK.Audio.play('thunder');
      const o = overlay(2.6, (ctx, p, age) => {
        if (age % 0.3 < 0.12) FX.lightning(ctx, U.rand(100, 860), 0, U.rand(300, 700), H, '#ff6a8a', 5, Math.floor(age * 10));
      });
      await wait(600);
      FX.cutin({ text: '我が城で好き勝手はさせん!!', size: 50, palette: 'blood', drawChar: (c, x, y, a) => A.maou(c, x, y, 1.0, a, 'angry'), dur: 1.8 });
      await wait(1800);
      FX.add({ dur: 1.2, layer: 'front', draw(ctx, p, age) { ctx.globalAlpha = 1 - U.seg(p, 0.7, 1); FX.magicCircle(ctx, 760, 420, 120 + p * 200, age * 6, 'rgba(255,40,80,1)', { tilt: 0.4 }); } });
      await wait(600);
      MK.Audio.play('explode');
      FX.flash('#ff2040', 1, 2); FX.shake(30);
      await wait(400);
      FX.slam('魔王降臨!!', { size: 120, palette: 'blood', glow: 'rgba(255,30,60,0.9)', dur: 1.6 });
      await wait(1600);
    },

    // ---- AT 突入：報奨金が金庫に落ちる → 窓が下から点灯 → RUSHロゴ ----
    async atEntry(opt = {}) {
      MK.Audio.stopBgm();
      lamps('off');
      MK.Reels.setAllLight(0.15);
      const C = MK.Castle, S = MK.S;
      const reward = opt.reward || 0;
      const lv = S.castleLv;
      const geo = C.fitGeo(lv, { x: W / 2, bottom: 500, h: 420, maxS: 1.2 });
      const built = lv + 1;
      const vault0 = Math.max(0, S.gold - reward);
      const st = { lit: 0, vault: vault0, flash: {} };
      const vr = C.roomRect(0);
      const vx = geo.x + (vr.x0 + 120) * geo.s, vy = geo.y + (vr.y1 - 20) * geo.s;
      overlay(4.4, (ctx, p, age) => {
        const a = Math.min(1, age * 4) * (1 - U.seg(age, 4.0, 4.4));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#030106'; ctx.fillRect(0, 0, W, H);
        A.background(ctx, W, H, 'normal', age);
        ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - U.seg(st.lit, 0, built))})`; ctx.fillRect(0, 0, W, H);
        C.section(ctx, geo, lv, age, { lit: st.lit, vault: st.vault, flash: st.flash, floors: geo.floors });
        if (reward && age > 0.3 && age < 2.2) {
          ctx.globalAlpha = a * U.seg(age, 0.3, 0.6) * (1 - U.seg(age, 1.9, 2.2));
          FX.fancyText(ctx, '報奨金 +' + reward + '枚', W / 2, 96, 54, { palette: 'gold', glow: 'rgba(255,200,60,0.7)' });
        }
      }, 'top');
      // 報奨金が金庫へ
      MK.Audio.play('win');
      const rain = setInterval(() => {
        for (let i = 0; i < 3; i++) FX.emit({ kind: 'coin', layer: 'top', x: vx + U.rand(-60, 60), y: -20, vx: U.rand(-20, 20), vy: U.rand(500, 700), ay: 900, life: (vy + 20) / 700, size: U.rand(10, 15), blend: 'source-over', seed: Math.random() * 9 });
        st.vault = Math.min(S.gold, st.vault + Math.max(1, reward / 20));
        MK.Audio.play('coin');
      }, 70);
      await wait(1500);
      clearInterval(rain);
      st.vault = S.gold;
      FX.P.burst(vx, vy, 30, 'rgba(255,210,90,0.9)', 260);
      // 窓が下から順に点灯
      for (let i = 0; i < built; i++) {
        const t0 = U.now();
        const id = setInterval(() => { st.lit = Math.min(i + 1, i + (U.now() - t0) / 0.25); }, 16);
        st.flash[i] = 1;
        MK.Audio.play('levelup');
        const r = C.roomRect(i);
        FX.P.burst(geo.x, geo.y + ((r.y0 + r.y1) / 2) * geo.s, 16, 'rgba(255,200,120,0.9)', 220);
        await wait(380);
        clearInterval(id); st.lit = i + 1;
        st.flash[i] = 0.3;
      }
      await wait(400);
      // 爆発 → ロゴ
      MK.Audio.play('explode');
      FX.flash('#ffffff', 1.2, 1.5);
      FX.shake(30, 3);
      FX.P.burst(W / 2, H / 2, 120, 'rgba(255,210,90,0.9)', 1100, 50);
      lamps('at');
      MK.Reels.setAllLight(1);
      MK.LCD.setScene('at');
      MK.Audio.play('fanfare', 'at');
      const coinRain = setInterval(() => {
        for (let i = 0; i < 3; i++) FX.emit({ kind: 'coin', x: U.rand(0, W), y: -20, vx: U.rand(-40, 40), vy: U.rand(200, 400), ay: 300, life: 2, size: U.rand(10, 16), blend: 'source-over', seed: Math.random() * 9 });
      }, 50);
      overlay(3.2, (ctx, p, age) => {
        const k = E.outBack(U.seg(age, 0, 0.35));
        const out = U.seg(age, 2.8, 3.2);
        ctx.globalAlpha = 1 - out;
        FX.rays(ctx, W / 2, H / 2, 700, age * 0.6, 'rgba(255,200,80,0.3)', 20, 0.06);
        for (let i = 0; i < 4; i++) FX.P.fire(U.rand(200, 760), H / 2 + 60, 1, 2.2);
        ctx.translate(W / 2, H / 2); ctx.scale(k * (1 + out * 0.5), k * (1 + out * 0.5));
        FX.fancyText(ctx, '魔王経営', 0, -40, 120, { palette: 'gold', glow: 'rgba(255,80,20,0.9)', shine: U.seg(age, 0.4, 1.4) });
        FX.fancyText(ctx, 'RUSH', 0, 70, 110, { palette: 'blood', glow: 'rgba(255,40,40,0.8)', shine: U.seg(age, 0.6, 1.6), font: '"Cinzel", "Dela Gothic One", serif', weight: '900' });
        ctx.globalAlpha = (1 - out) * U.seg(age, 0.8, 1.2);
        A.label(ctx, '1SET ' + MK.CFG.AT.setGames + 'G ＋ 継続ジャッジ', 0, 150, 24, '#ffe7c0', 'center');
      });
      FX.shake(16);
      await wait(3200);
      clearInterval(coinRain);
    },

    // ---- 継続ジャッジ ----
    async judgeStart(variant = 'at') {
      MK.Audio.stopBgm();
      MK.Audio.play('alarm');
      warningBands(variant === 'upper' ? '王国軍 出撃' : '勇者パーティー 襲来', variant === 'upper' ? '#ff9a1a' : '#ff2a2a', 2.0);
      await wait(1800);
      MK.LCD.setScene('judge', { variant });
      FX.flash('#ffffff', 1, 2.5);
      FX.slam(variant === 'upper' ? '王国軍との決戦' : '継続ジャッジ', { size: 92, palette: 'blood', glow: 'rgba(255,40,40,0.8)', sub: '3G後の自動戦闘で勝てば継続！', dur: 1.8 });
      await wait(1800);
    },
    async judgeWin(variant = 'at') {
      await MK.LCD.scenes.judge.finish(true);
      MK.Audio.play('win');
      FX.slam(variant === 'upper' ? '王国軍 撃破!!' : '撃退成功!!', { size: 120, palette: 'gold', glow: 'rgba(255,200,40,0.9)', sub: '次のSETへ継続', dur: 2.0 });
      FX.P.burst(W / 2, H / 2, 80, 'rgba(255,220,100,0.9)', 800, 40);
      await wait(2100);
    },
    async atEnd(info) {
      await MK.LCD.scenes.judge.finish(false);
      MK.Audio.play('lose');
      FX.slam('敗北…', { size: 110, palette: 'silver', dur: 1.6, shake: 4 });
      await wait(1700);
      lamps('normal');
      // リザルト
      const S = MK.S;
      overlay(4.0, (ctx, p, age) => {
        const k = E.outCubic(U.seg(age, 0, 0.4));
        ctx.globalAlpha = 1 - U.seg(age, 3.6, 4.0);
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2, H / 2); ctx.scale(k, k);
        A.panel(ctx, -280, -170, 560, 340, { color: '#ffd34a' });
        FX.fancyText(ctx, '魔王経営RUSH 終了', 0, -120, 46, { palette: 'gold' });
        const rows = [['獲得枚数', U.fmt(info.totalWin) + ' 枚'], ['継続SET', info.sets + ' SET'], ['勇者撃退', info.wins + ' 回'], ['魔王城', 'Lv' + S.castleLv + ' ' + MK.CFG.CASTLE.names[S.castleLv]]];
        rows.forEach(([k2, v], i) => {
          ctx.globalAlpha = U.seg(age, 0.4 + i * 0.25, 0.7 + i * 0.25) * (1 - U.seg(age, 3.6, 4.0));
          A.label(ctx, k2, -220, -50 + i * 52, 22, '#c9a65a');
          A.num(ctx, v, 220, -50 + i * 52, 32, i === 0 ? 'gold' : 'silver', 'right');
        });
      });
      await wait(4000);
    },

    // ---- 上位AT 昇格：城門を内側から → 門が開き魔物が行進 → 地図 → 虹ロゴ ----
    async upperEntry() {
      MK.Audio.stopBgm();
      lamps('off');
      MK.Audio.play('thunder');
      FX.flash('#000', 1, 0.6);
      const S = MK.S;
      const troops = S.monsters.slice(0, 8);
      const st = { open: 0, march: 0 };
      const GX = W / 2, GY = 400, GW = 300, GH = 280; // 門の開口部
      overlay(5.0, (ctx, p, age) => {
        const fade = Math.min(1, age * 3) * (1 - U.seg(age, 4.5, 5.0));
        ctx.globalAlpha = fade;
        // 門の向こう（外の世界）
        const sky = ctx.createLinearGradient(0, GY - GH, 0, GY);
        sky.addColorStop(0, '#ff9a3a'); sky.addColorStop(0.6, '#ffd27a'); sky.addColorStop(1, '#fff2c0');
        ctx.fillStyle = sky; ctx.fillRect(GX - GW / 2, GY - GH, GW, GH);
        ctx.fillStyle = '#5a2a1a';
        [[-110, 60], [-40, 90], [40, 70], [100, 50]].forEach(([dx, h]) => { ctx.fillRect(GX + dx - 12, GY - 30 - h, 24, h); ctx.beginPath(); ctx.moveTo(GX + dx - 16, GY - 30 - h); ctx.lineTo(GX + dx, GY - 50 - h); ctx.lineTo(GX + dx + 16, GY - 30 - h); ctx.fill(); });
        ctx.fillStyle = '#3a1a10'; ctx.fillRect(GX - GW / 2, GY - 30, GW, 30);
        // 光
        if (st.open > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * st.open;
          FX.rays(ctx, GX, GY - GH / 2, 700, age * 0.3, 'rgba(255,220,150,0.35)', 16, 0.07);
          ctx.drawImage(FX.glow('rgba(255,210,120,0.8)', 128), GX - 380, GY - 420, 760, 640);
          ctx.restore(); ctx.globalAlpha = fade;
        }
        // 内側の石壁（門のまわり）
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H);
        ctx.moveTo(GX - GW / 2, GY); ctx.lineTo(GX - GW / 2, GY - GH + 60); ctx.quadraticCurveTo(GX, GY - GH - 50, GX + GW / 2, GY - GH + 60); ctx.lineTo(GX + GW / 2, GY); ctx.closePath();
        ctx.fillStyle = A.lg(ctx, 0, 0, W, 0, ['#0c0a14', '#2c2a3e', '#3a3650', '#2c2a3e', '#0c0a14']);
        ctx.fill('evenodd');
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        for (let yy = 0; yy < GY; yy += 24) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(GX - GW / 2 - 4, yy); ctx.moveTo(GX + GW / 2 + 4, yy); ctx.lineTo(W, yy); ctx.stroke(); }
        // 扉（内側から押し開ける）
        const o = E.inOutCubic(st.open);
        [-1, 1].forEach((d) => {
          const hinge = GX + d * GW / 2;
          const w = GW / 2 * Math.cos(o * Math.PI / 2 * 0.95);
          const grow = 1 + o * 0.35; // 手前に開く
          ctx.beginPath();
          ctx.moveTo(hinge, GY); ctx.lineTo(hinge, GY - GH + 50);
          ctx.lineTo(hinge - d * w, GY - GH + 50 - o * 30); ctx.lineTo(hinge - d * w, GY + o * 20 * grow); ctx.closePath();
          ctx.fillStyle = A.lg(ctx, hinge - d * w, 0, hinge, 0, d < 0 ? ['#6a4220', '#3a2210'] : ['#3a2210', '#6a4220']);
          ctx.fill(); ctx.strokeStyle = '#0a0606'; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 6;
          [0.25, 0.7].forEach((k) => { const yy = GY - GH * k; ctx.beginPath(); ctx.moveTo(hinge, yy); ctx.lineTo(hinge - d * w, yy - o * 12); ctx.stroke(); });
        });
        // かんぬき
        if (st.open < 0.05) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(GX - GW / 2 - 10, GY - 140, GW + 20, 16); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(GX - GW / 2 - 10, GY - 140, GW + 20, 16); }
        // 地面と松明
        ctx.fillStyle = A.lg(ctx, 0, GY, 0, H, ['#1a1420', '#06040a']); ctx.fillRect(0, GY, W, H - GY);
        // 行進：手前から門の光の中へ
        troops.forEach((m, i) => {
          const delay = i * 0.1;
          const k = U.clamp((st.march - delay) / 0.9, 0, 1);
          if (st.march <= delay && st.march > 0) { /* 待機 */ }
          const side = i % 2 ? 1 : -1;
          const sx = GX + side * (180 + (i >> 1) * 70), sy = H + 10;
          const x = U.lerp(sx, GX + side * 30, E.inQuad(k)), y = U.lerp(sy, GY - 10, E.inQuad(k));
          const sc = U.lerp(1.3, 0.35, E.inQuad(k));
          ctx.save(); ctx.globalAlpha = fade * (1 - U.seg(k, 0.85, 1));
          A.monster(ctx, { type: m.type, x, y, s: sc * (m.type === 'dragon' ? 0.7 : 1), face: -side, anim: 'walk', at: age * 1.5 + i, lv: m.lv }, age);
          ctx.restore();
        });
      }, 'top');
      FX.shake(4, 0.4);
      await wait(900);
      // かんぬきが外れ、門が開く
      MK.Audio.play('hit'); FX.shake(12);
      await wait(300);
      MK.Audio.play('build');
      const t0 = U.now();
      const op = setInterval(() => { st.open = Math.min(1, (U.now() - t0) / 1.1); }, 16);
      await wait(800);
      MK.Audio.play('fanfare', 'upper');
      const t1 = U.now();
      const mr = setInterval(() => { st.march = (U.now() - t1) / 1.6 * 1.6; }, 16);
      await wait(2400);
      clearInterval(op); clearInterval(mr);
      // カメラが引いて地図へ
      FX.flash('#fff2c0', 1, 1.6);
      lamps('upper');
      MK.LCD.setScene('upper', { intro: true });
      await wait(1500);
      MK.Audio.play('explode');
      FX.shake(24, 2);
      FX.P.burst(W / 2, H / 2, 120, 'rgba(255,150,60,0.9)', 1100, 50);
      const fire = setInterval(() => { for (let i = 0; i < 3; i++) FX.P.fire(U.rand(0, W), H, 1, 2.4); }, 50);
      overlay(3.2, (ctx, p, age) => {
        const k = E.outElastic(U.seg(age, 0, 0.8));
        const out = U.seg(age, 2.8, 3.2);
        ctx.globalAlpha = 1 - out;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
        FX.rays(ctx, W / 2, H / 2, 800, age * 1.2, 'rgba(255,255,255,0.25)', 24, 0.05);
        ctx.translate(W / 2, H / 2); ctx.scale(k, k);
        ctx.save(); ctx.translate(0, -130);
        ctx.beginPath(); ctx.moveTo(-70, 30); ctx.lineTo(-80, -20); ctx.lineTo(-40, 5); ctx.lineTo(0, -40); ctx.lineTo(40, 5); ctx.lineTo(80, -20); ctx.lineTo(70, 30); ctx.closePath();
        A.fillStroke(ctx, A.lg(ctx, 0, -40, 0, 30, ['#fff8c0', '#ffc020', '#8a5000']), 4);
        [-40, 0, 40].forEach((x) => { ctx.fillStyle = '#ff2040'; A.ell(ctx, x, 12, 7, 7); ctx.fill(); });
        ctx.restore();
        FX.fancyText(ctx, '世界征服', 0, -10, 130, { palette: 'rainbow', glow: 'rgba(255,120,40,0.9)' });
        FX.fancyText(ctx, 'RUSH', 0, 100, 100, { palette: 'gold', glow: 'rgba(255,60,20,0.9)', shine: U.seg(age, 0.6, 1.6), font: '"Cinzel", "Dela Gothic One", serif', weight: '900' });
        ctx.globalAlpha = (1 - out) * U.seg(age, 1, 1.4);
        A.label(ctx, '12の地域を制圧せよ　継続率 約' + Math.round(MK.CFG.UPPER.winRate * 100) + '%', 0, 175, 24, '#ffe7c0', 'center');
      });
      await wait(3200);
      clearInterval(fire);
    },
    // ---- 制圧の見せ場：最初の村 / 中盤の要塞 / 最後の王都 ----
    async regionSpecial(idx) {
      const name = MK.LCD.helpers.REGION_NAMES[idx];
      const C = MK.Castle;
      if (idx === 0) {
        MK.Audio.play('fanfare', 'at');
        overlay(2.2, (ctx, p, age) => {
          ctx.globalAlpha = Math.min(1, age * 4) * (1 - U.seg(age, 1.9, 2.2));
          ctx.fillStyle = 'rgba(10,4,10,0.75)'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#2a1a14';
          [[260, 60], [360, 80], [600, 70], [700, 55]].forEach(([x, h]) => { ctx.fillRect(x - 40, 420 - h, 80, h); ctx.beginPath(); ctx.moveTo(x - 50, 420 - h); ctx.lineTo(x, 380 - h); ctx.lineTo(x + 50, 420 - h); ctx.fill(); });
          ctx.fillRect(0, 420, W, 120);
          const rise = E.outBack(U.seg(age, 0.2, 0.8));
          C.flag(ctx, W / 2, 430, 4 * rise, age, 1);
          FX.fancyText(ctx, '初陣　' + name + ' 制圧!!', W / 2, 110, 56, { palette: 'gold' });
        });
        FX.shake(10);
        await wait(2200);
      } else if (idx === 5) {
        MK.Audio.play('alarm');
        const st = { crack: 0 };
        overlay(3.0, (ctx, p, age) => {
          ctx.globalAlpha = Math.min(1, age * 4) * (1 - U.seg(age, 2.7, 3.0));
          ctx.fillStyle = 'rgba(20,6,6,0.85)'; ctx.fillRect(0, 0, W, H);
          // 城壁
          const fall = U.seg(age, 1.4, 2.2);
          for (let i = 0; i < 8; i++) {
            const x = 120 + i * 92;
            const dy = fall * (60 + (i % 3) * 50) * (i % 2 ? 1 : 1.4);
            ctx.save(); ctx.translate(0, dy); ctx.rotate(fall * (i % 2 ? 0.05 : -0.04));
            ctx.fillStyle = '#34314a'; ctx.fillRect(x, 230, 90, 200); ctx.strokeStyle = '#120f1c'; ctx.lineWidth = 2; ctx.strokeRect(x, 230, 90, 200); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; for (let yy = 242; yy < 430; yy += 14) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 90, yy); ctx.stroke(); } ctx.fillStyle = '#34314a';
            ctx.fillRect(x + 6, 214, 30, 16); ctx.fillRect(x + 54, 214, 30, 16);
            ctx.restore();
          }
          if (age > 0.4 && age < 1.6) {
            const dx = U.lerp(-200, 300, U.seg(age, 0.4, 1.0));
            A.monster(ctx, { type: 'dragon', x: dx, y: 200, s: 1.3, face: 1, anim: 'attack', at: (age * 2) % 0.5, lv: 9 }, age);
          }
          if (age > 1.2) FX.fancyText(ctx, name + ' 陥落!!', W / 2, 110, 64, { palette: 'blood', glow: 'rgba(255,60,20,0.8)' });
        });
        await wait(800);
        MK.LCD.helpers.breath(300, 160, 600, 330);
        await wait(600);
        MK.Audio.play('explode'); FX.shake(26); FX.P.shards(W / 2, 330, 50, '#8a86a0');
        await wait(1600);
      } else if (idx === 11) {
        MK.Audio.play('thunder');
        const st = { swap: 0 };
        overlay(3.6, (ctx, p, age) => {
          ctx.globalAlpha = Math.min(1, age * 4) * (1 - U.seg(age, 3.3, 3.6));
          ctx.fillStyle = 'rgba(6,2,12,0.88)'; ctx.fillRect(0, 0, W, H);
          if (age % 0.5 < 0.1) FX.lightning(ctx, U.rand(200, 760), 0, W / 2, 200, '#d0c0ff', 4, Math.floor(age * 10));
          // 王城
          ctx.fillStyle = '#c8c4d8';
          [[-170, 160], [-90, 230], [0, 300], [90, 230], [170, 160]].forEach(([dx, h]) => {
            ctx.fillRect(W / 2 + dx - 30, 470 - h, 60, h);
            ctx.beginPath(); ctx.moveTo(W / 2 + dx - 36, 470 - h); ctx.lineTo(W / 2 + dx, 420 - h); ctx.lineTo(W / 2 + dx + 36, 470 - h); ctx.fillStyle = '#3a5ab8'; ctx.fill(); ctx.fillStyle = '#c8c4d8';
          });
          // 旗のすり替え
          const sw = U.seg(age, 1.0, 1.6);
          ctx.save(); ctx.translate(W / 2, 120); ctx.scale(2.4, 2.4);
          if (sw < 0.5) { ctx.fillStyle = '#3a6ad8'; ctx.fillRect(0, -38 + sw * 60, 28, 16); ctx.fillStyle = '#1a0a0a'; ctx.fillRect(-1.5, -40, 3, 40); }
          else C.flag(ctx, 0, 0, 1, age, E.outBack((sw - 0.5) * 2));
          ctx.restore();
          if (age > 1.6) FX.fancyText(ctx, name + ' 陥落!!', W / 2, 500, 72, { palette: 'rainbow', glow: 'rgba(255,120,40,0.9)' });
        });
        await wait(1600);
        MK.Audio.play('explode'); FX.flash('#ffffff', 0.8); FX.shake(28);
        await wait(2000);
      }
    },
    async upperFall() {
      await MK.LCD.scenes.judge.finish(false);
      MK.Audio.play('lose');
      FX.slam('撤退…', { size: 110, palette: 'silver', sub: '魔王経営RUSHへ戻る', dur: 1.8 });
      await wait(1900);
    },

    // ---- 世界征服 達成 ----
    async ending() {
      MK.Audio.stopBgm();
      lamps('upper');
      MK.Audio.play('fanfare', 'upper');
      const fw = setInterval(() => {
        const x = U.rand(100, 860), y = U.rand(60, 260);
        FX.P.burst(x, y, 50, U.pick(['rgba(255,80,80,0.9)', 'rgba(255,220,80,0.9)', 'rgba(120,200,255,0.9)', 'rgba(200,120,255,0.9)']), 420, 22);
        MK.Audio.play('coin');
      }, 380);
      const lines = ['魔王経営記（仮）', '企画・開発　バク（ナギバク研究所 メカニック担当）', '試作機 No.001', 'Thank you for playing!'];
      overlay(9, (ctx, p, age) => {
        const a = Math.min(1, age * 2) * (1 - U.seg(age, 8.4, 9));
        ctx.globalAlpha = a;
        A.background(ctx, W, H, 'at', age);
        FX.rays(ctx, W / 2, 260, 700, age * 0.3, 'rgba(255,220,120,0.25)', 20, 0.06);
        A.castle(ctx, W / 2, 470, 0.68, 5, age);
        MK.S.monsters.slice(0, 8).forEach((m, i) => {
          A.monster(ctx, { type: m.type, x: 110 + i * 105, y: 520, s: 0.7, face: 1, anim: 'cheer', at: age + i * 0.2, lv: m.lv }, age);
        });
        const k = E.outBack(U.seg(age, 0.5, 1.2));
        ctx.save(); ctx.translate(W / 2, 150); ctx.scale(k, k);
        FX.fancyText(ctx, '世界征服 達成!!', 0, 0, 96, { palette: 'rainbow', glow: 'rgba(255,200,60,0.9)' });
        ctx.restore();
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#000'; ctx.fillRect(0, 222, W, 156); ctx.globalAlpha = a;
        lines.forEach((l, i) => {
          ctx.globalAlpha = a * U.seg(age, 2 + i * 1.2, 2.6 + i * 1.2);
          A.label(ctx, l, W / 2, 250 + i * 34, i === 0 ? 28 : 18, '#fff3d0', 'center');
        });
      });
      await wait(9000);
      clearInterval(fw);
    },

    // ---- 撮影用：タイトル ----
    async title() {
      MK.LCD.setScene('title');
      FX.flash('#000', 1, 1);
    },
  };

  MK.Seq = Seq;
})(window.MK);
