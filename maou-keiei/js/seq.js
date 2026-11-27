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

    // ---- AT 突入 ----
    async atEntry(opt = {}) {
      MK.Audio.stopBgm();
      lamps('off');
      MK.Reels.setAllLight(0.1);
      // 暗転
      overlay(5.6, (ctx, p, age) => {
        const a = Math.min(1, age * 3) * (1 - U.seg(age, 5.0, 5.6));
        ctx.fillStyle = `rgba(0,0,0,${a * 0.92})`; ctx.fillRect(0, 0, W, H);
        // 魔法陣の成長
        const g = E.outCubic(U.seg(age, 0.4, 2.4));
        if (age < 3.4) {
          ctx.globalAlpha = a;
          FX.rays(ctx, W / 2, H / 2, 600 * g, age * 0.8, 'rgba(255,180,60,0.35)', 18, 0.05 + g * 0.05);
          FX.magicCircle(ctx, W / 2, H / 2, 40 + 230 * g, age * (1 + g * 4), 'rgba(255,190,80,1)', { points: 6 });
          FX.magicCircle(ctx, W / 2, H / 2, 20 + 130 * g, -age * 3, 'rgba(200,100,255,1)', { points: 5, seed: 40 });
        }
      }, 'top');
      MK.Audio.play('magic');
      const rise = setInterval(() => { FX.P.rise(W / 2, H / 2 + 120, 300, 6, U.pick(['rgba(255,200,80,0.9)', 'rgba(200,120,255,0.9)'])); }, 60);
      FX.shake(3, 0.2);
      await wait(800);
      MK.Audio.play('rare', 5);
      await wait(1400);
      clearInterval(rise);
      FX.shake(4, 0.3);
      await wait(400);
      // 爆発
      MK.Audio.play('explode');
      FX.flash('#ffffff', 1.2, 1.5);
      FX.shake(34, 3);
      FX.P.burst(W / 2, H / 2, 120, 'rgba(255,210,90,0.9)', 1100, 50);
      FX.P.shards(W / 2, H / 2, 40, '#ffd34a');
      lamps('at');
      MK.Reels.setAllLight(1);
      MK.LCD.setScene('at');
      await wait(500);
      FX.cutin({ text: '経営拡大だ!!', size: 78, palette: 'gold', drawChar: (c, x, y, a) => A.maou(c, x, y, 1.0, a, 'laugh'), dur: 1.6 });
      await wait(1500);
      // ロゴ
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
        A.label(ctx, '1SET ' + MK.CFG.AT.setGames + 'G ＋ 継続ジャッジ', 0, 150, 22, '#ffe7c0', 'center');
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

    // ---- 上位AT 昇格 ----
    async upperEntry() {
      MK.Audio.stopBgm();
      lamps('off');
      MK.Audio.play('thunder');
      FX.flash('#000', 1, 0.6);
      overlay(6.6, (ctx, p, age) => {
        const a = Math.min(1, age * 2) * (1 - U.seg(age, 6.0, 6.6));
        ctx.fillStyle = `rgba(20,0,0,${a * 0.85})`; ctx.fillRect(0, 0, W, H);
        if (age < 3.6 && (age % 0.45) < 0.12) {
          ctx.globalAlpha = a;
          FX.lightning(ctx, U.rand(80, 880), 0, U.rand(200, 760), H, '#ff4040', 6, Math.floor(age * 13));
          FX.lightning(ctx, U.rand(80, 880), 0, U.rand(200, 760), H, '#ffd0a0', 3, Math.floor(age * 17) + 3);
        }
        if (age > 0.6 && age < 3.6) {
          ctx.globalAlpha = a * U.seg(age, 0.6, 1.4);
          A.castle(ctx, W / 2, 470 + Math.sin(age * 40) * 3, 0.72, 5, age);
        }
        if (age > 1.6 && age < 3.6) {
          const dx = U.lerp(-300, W + 300, U.seg(age, 1.6, 3.2));
          ctx.globalAlpha = a;
          A.monster(ctx, { type: 'dragon', x: dx, y: 220, s: 1.5, face: 1, anim: 'attack', at: (age * 2) % 0.5, lv: 9 }, age);
        }
      }, 'top');
      FX.shake(8, 0.4);
      await wait(1600);
      MK.Audio.play('explode');
      FX.shake(20, 1);
      await wait(1000);
      FX.cutin({ text: '次は人間どもの王国だ!!', size: 56, palette: 'rainbow', color: '#6a0a1a', drawChar: (c, x, y, a) => A.maou(c, x, y, 1.0, a, 'laugh'), dur: 1.6 });
      await wait(1500);
      MK.Audio.play('explode');
      FX.flash('#ffffff', 1.3, 1.2);
      FX.shake(40, 2.5);
      FX.P.burst(W / 2, H / 2, 140, 'rgba(255,150,60,0.9)', 1200, 54);
      lamps('upper');
      MK.LCD.setScene('upper');
      MK.Audio.play('fanfare', 'upper');
      const fire = setInterval(() => { for (let i = 0; i < 4; i++) FX.P.fire(U.rand(0, W), H, 1, 2.6); }, 40);
      overlay(3.4, (ctx, p, age) => {
        const k = E.outElastic(U.seg(age, 0, 0.8));
        const out = U.seg(age, 3.0, 3.4);
        ctx.globalAlpha = 1 - out;
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H);
        FX.rays(ctx, W / 2, H / 2, 800, age * 1.2, 'rgba(255,255,255,0.25)', 24, 0.05);
        ctx.translate(W / 2, H / 2); ctx.scale(k, k);
        // 王冠
        ctx.save(); ctx.translate(0, -130);
        ctx.beginPath(); ctx.moveTo(-70, 30); ctx.lineTo(-80, -20); ctx.lineTo(-40, 5); ctx.lineTo(0, -40); ctx.lineTo(40, 5); ctx.lineTo(80, -20); ctx.lineTo(70, 30); ctx.closePath();
        A.fillStroke(ctx, A.lg(ctx, 0, -40, 0, 30, ['#fff8c0', '#ffc020', '#8a5000']), 4);
        [-40, 0, 40].forEach((x) => { ctx.fillStyle = '#ff2040'; A.ell(ctx, x, 12, 7, 7); ctx.fill(); });
        ctx.restore();
        FX.fancyText(ctx, '世界征服', 0, -10, 130, { palette: 'rainbow', glow: 'rgba(255,120,40,0.9)' });
        FX.fancyText(ctx, 'RUSH', 0, 100, 100, { palette: 'gold', glow: 'rgba(255,60,20,0.9)', shine: U.seg(age, 0.6, 1.6), font: '"Cinzel", "Dela Gothic One", serif', weight: '900' });
        ctx.globalAlpha = (1 - out) * U.seg(age, 1, 1.4);
        A.label(ctx, '人間の王国へ侵攻せよ！ 継続率 約' + Math.round(MK.CFG.UPPER.winRate * 100) + '%', 0, 175, 22, '#ffe7c0', 'center');
      });
      await wait(3400);
      clearInterval(fire);
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
