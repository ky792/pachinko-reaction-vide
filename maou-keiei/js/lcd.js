/* ==========================================================
 * 液晶：エンジン・アクター・各モードのシーン
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, E = U.ease, FX = MK.FX, A = MK.Art;
  const W = 960, H = 540;

  // ---------- アクター ----------
  function actor(o) {
    return Object.assign({ kind: 'monster', type: 'slime', x: 0, y: 0, s: 1, face: 1, anim: 'idle', at: 0, lv: 1, seed: Math.random() * 10, tx: null, speed: 70, animDur: 0, alpha: 1 }, o);
  }
  function setAnim(a, anim, dur = 0) { a.anim = anim; a.at = 0; a.animDur = dur; }
  function updateActor(a, dt) {
    a.at += dt;
    if (a.tx != null) {
      const d = a.tx - a.x;
      if (Math.abs(d) < 2) { a.x = a.tx; a.tx = null; if (a.anim === 'walk') setAnim(a, 'idle'); }
      else {
        a.x += Math.sign(d) * Math.min(Math.abs(d), a.speed * dt);
        if (!a.lockFace) a.face = Math.sign(d);
        if (a.anim === 'idle') setAnim(a, 'walk');
      }
    }
    if (a.ty != null) { a.y += (a.ty - a.y) * Math.min(1, dt * 3); }
    if (a.animDur && a.at >= a.animDur) setAnim(a, a.tx != null ? 'walk' : 'idle');
  }
  function drawActors(ctx, list, t) {
    list.slice().sort((a, b) => a.y - b.y).forEach((a) => {
      if (a.hidden) return;
      if (a.kind === 'hero') A.hero(ctx, a, t); else A.monster(ctx, a, t);
      if (a.badge && a.kind === 'monster') {
        const hh = (a.type === 'dragon' ? 150 : a.type === 'imp' ? 110 : 92) * a.s;
        const bx = a.x, by = a.y - hh - 6;
        ctx.save();
        ctx.fillStyle = a.lv >= 7 ? '#ffcc33' : a.lv >= 4 ? '#c38bff' : '#7ad8ff';
        ctx.font = 'bold 13px "Dela Gothic One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('Lv' + a.lv, bx, by);
        ctx.fillText('Lv' + a.lv, bx, by);
        ctx.restore();
      }
    });
  }
  function until(cond, max = 2) {
    return new Promise((res) => {
      const t0 = U.now();
      const f = () => { if (cond() || U.now() - t0 > max / MK.timeScale) res(); else requestAnimationFrame(f); };
      f();
    });
  }
  function topY(a) { return a.y - (a.type === 'dragon' ? 140 : a.type === 'imp' ? 100 : 80) * a.s; }

  // ダメージ数字
  function popNumber(x, y, text, opt = {}) {
    FX.add({
      dur: 1.1, layer: 'front',
      draw(ctx, p, age) {
        const k = E.outBack(U.seg(age, 0, 0.2));
        ctx.globalAlpha = 1 - U.seg(age, 0.8, 1.1);
        ctx.translate(x, y - age * 40); ctx.scale(k, k);
        FX.fancyText(ctx, text, 0, 0, opt.size || 40, { palette: opt.palette || 'gold', outerW: 0.3 });
      },
    });
  }
  function hitFx(x, y, big) {
    FX.P.sparks(x, y, big ? 40 : 18, '#fff1a0', big ? 900 : 500);
    FX.P.burst(x, y, big ? 30 : 12, 'rgba(255,140,60,0.9)', big ? 500 : 260, big ? 40 : 26);
    FX.add({ dur: 0.25, layer: 'front', draw(ctx, p) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - p;
      const r = (big ? 140 : 70) * E.outCubic(p);
      ctx.drawImage(FX.glow('rgba(255,230,160,0.9)', 128), x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p) + ')'; ctx.lineWidth = 6 * (1 - p);
      ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, U.TAU); ctx.stroke();
    } });
    FX.shake(big ? 18 : 7);
    MK.Audio.play(big ? 'explode' : 'hit');
  }
  function slashFx(x, y, color = 'rgba(255,255,255,0.95)') {
    MK.Audio.play('slash');
    FX.add({ dur: 0.3, layer: 'front', draw(ctx, p) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x, y); ctx.rotate(-0.7);
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      ctx.lineWidth = 12 * (1 - p); ctx.shadowColor = color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(0, 0, 60, -1.2 + p * 0.6, 0.6 + p * 1.2); ctx.stroke();
    } });
  }
  // 魔法弾
  function projectile(x0, y0, x1, y1, color, dur = 0.35) {
    return new Promise((res) => {
      FX.add({ dur, layer: 'front', update(dt, o) {
        const p = o.age / dur;
        const x = U.lerp(x0, x1, p), y = U.lerp(y0, y1, p) - Math.sin(p * Math.PI) * 40;
        FX.emit({ x, y, life: 0.3, size: 24, size1: 2, sprite: FX.glow(color) });
        if (p >= 1 && !o.fired) { o.fired = true; res(); }
      }, draw() {} });
      setTimeout(res, dur * 1000 / MK.timeScale + 50);
    });
  }
  function breath(x0, y0, x1, y1) {
    MK.Audio.play('explode');
    FX.add({ dur: 0.6, layer: 'front', update(dt, o) {
      for (let i = 0; i < 5; i++) {
        const sp = U.rand(600, 900);
        const a = Math.atan2(y1 - y0, x1 - x0) + U.rand(-0.15, 0.15);
        FX.emit({ x: x0, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: U.rand(0.3, 0.5), size: U.rand(30, 50), size1: 70, alpha: 0.9, sprite: FX.glow(U.pick(['rgba(255,120,30,0.9)', 'rgba(255,200,60,0.9)', 'rgba(255,60,20,0.9)'])) });
      }
    }, draw() {} });
  }

  // ---------- 共通HUD部品 ----------
  function goldHud(ctx, S) {
    A.panel(ctx, 14, 12, 262, 84, { title: '魔王城 資金' });
    A.coin(ctx, 42, 62, 15);
    A.num(ctx, U.fmt(S.goldShown) + ' G', 66, 62, 34, 'gold');
    if (S.lastSettle) {
      const n = S.lastSettle.net;
      A.label(ctx, (n >= 0 ? '前期 黒字 +' : '前期 赤字 ') + n + 'G', 262, 28, 13, n >= 0 ? '#7dff9a' : '#ff6a6a', 'right');
    }
  }
  function approachHud(ctx, S, t) {
    A.panel(ctx, 684, 12, 262, 84, { title: '勇者 接近度', color: '#e04040' });
    const v = S.approach / 100;
    const hot = v > 0.75;
    A.bar(ctx, 700, 46, 196, 18, v, hot ? ['#ffd04a', '#ff2020'] : ['#ff8a5a', '#a01010']);
    A.num(ctx, Math.floor(S.approach) + '%', 930, 55, 24, hot ? 'blood' : 'silver', 'right');
    // 勇者アイコン（剣）
    ctx.save(); ctx.translate(700 + 196 * v, 44); ctx.rotate(0.6 + (hot ? Math.sin(t * 20) * 0.1 : 0));
    ctx.fillStyle = '#e8f0ff'; ctx.fillRect(-2, -18, 4, 18); ctx.fillStyle = '#d4a531'; ctx.fillRect(-7, 0, 14, 3); ctx.fillRect(-1.5, 3, 3, 6);
    ctx.restore();
    if (hot) A.label(ctx, '勇者が近づいている…！', 700, 82, 13, '#ff9a9a');
  }
  function bottomHud(ctx, S, extra) {
    ctx.save();
    ctx.fillStyle = A.lg(ctx, 0, H - 40, 0, H, ['rgba(10,2,10,0)', 'rgba(10,2,10,0.85)']);
    ctx.fillRect(0, H - 46, W, 46);
    ctx.restore();
    const CFG = MK.CFG;
    const items = extra || [
      ['城', 'Lv' + S.castleLv + ' ' + CFG.CASTLE.names[S.castleLv]],
      ['魔物', S.monsters.length + '/' + CFG.CASTLE.slots(S.castleLv)],
      ['人件費', MK.Game.wages() + 'G/期'],
      ['決算まで', (CFG.NORMAL.settleEvery - S.settleCount) + 'G'],
    ];
    let x = 20;
    items.forEach(([k, v]) => {
      A.label(ctx, k, x, H - 18, 14, '#c9a65a');
      ctx.font = 'bold 14px "Shippori Mincho B1", serif';
      const kw = ctx.measureText(k).width;
      A.label(ctx, v, x + kw + 8, H - 18, 17, '#fff3d0');
      ctx.font = 'bold 17px "Shippori Mincho B1", serif';
      x += kw + 8 + ctx.measureText(v).width + 26;
    });
  }
  // 押し順ナビ
  function naviHud(ctx, t) {
    const g = MK.Game.cur;
    if (!g || !g.navi) return;
    const xs = [W * 0.27, W * 0.5, W * 0.73];
    const rank = [0, 0, 0];
    g.order.forEach((reel, k) => { rank[reel] = k + 1; });
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - 150, W, 110);
    A.label(ctx, '押し順ナビ', W / 2, H - 138, 16, '#ffe08a', 'center');
    xs.forEach((x, i) => {
      const done = MK.Reels.reels[i].state !== 'spin';
      const next = g.order[g.pressed.length] === i;
      const pulse = next ? 1 + 0.1 * Math.sin(t * 14) : 1;
      ctx.save(); ctx.translate(x, H - 88); ctx.scale(pulse, pulse);
      ctx.globalAlpha = done ? 0.25 : 1;
      if (next) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(FX.glow('rgba(255,180,40,0.8)', 128), -70, -70, 140, 140); ctx.globalCompositeOperation = 'source-over'; }
      FX.fancyText(ctx, String(rank[i]), 0, 0, 74, { palette: rank[i] === 1 ? 'blood' : rank[i] === 2 ? 'gold' : 'ice' });
      ctx.restore();
    });
    ctx.restore();
  }
  function rushBanner(ctx, text, palette, t, x = 20, y = 18) {
    ctx.save();
    ctx.fillStyle = A.lg(ctx, x, 0, x + 380, 0, ['rgba(120,0,40,0.9)', 'rgba(40,0,30,0.6)', 'rgba(0,0,0,0)']);
    ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 380, y); ctx.lineTo(x + 350, y + 50); ctx.lineTo(x - 10, y + 50); ctx.closePath(); ctx.fill();
    ctx.restore();
    FX.fancyText(ctx, text, x + 8, y + 26, 36, { palette, align: 'left', shine: U.mod(t * 0.4, 1.5), outerW: 0.22 });
  }

  // ---------- シーン基底 ----------
  class Scene {
    constructor() { this.actors = []; this.t = 0; }
    enter() {}
    exit() {}
    update(dt) { this.t += dt; this.actors.forEach((a) => updateActor(a, dt)); }
    drawWorld(ctx, t) {}
    drawHud(ctx, t) {}
    lever() {}
    stop() {}
  }

  // ---------- 通常時：魔王城経営 ----------
  const TICKER = [
    'フハハ！今期も黒字で勇者を迎え撃つぞ！',
    '人件費が…いや、福利厚生は大事だ。',
    'スライム君、今日も笑顔で接客だ。',
    '城の修繕費、経費で落ちるかな…',
    '勇者め、アポなしで来るんじゃない！',
    'ゴブリン部長、売上報告を頼む。',
    '魔王たる者、赤字だけは許さん！',
    '勇者を倒せ。赤字を出すな。それが我が社訓だ。',
  ];
  class NormalScene extends Scene {
    enter() {
      this.sync(true);
      this.tick = 0; this.tickT = 0;
      this.castleS = 0.7;
      MK.Audio.bgm('normal');
    }
    sync(reset) {
      const S = MK.S;
      const ids = new Set(S.monsters.map((m) => m.id));
      this.actors = this.actors.filter((a) => ids.has(a.id));
      S.monsters.forEach((m, i) => {
        let a = this.actors.find((x) => x.id === m.id);
        if (!a) {
          a = actor({ id: m.id, type: m.type, x: reset ? U.rand(80, 880) : 600, y: U.rand(452, 512), s: m.type === 'dragon' ? 0.7 : 0.8, face: U.pick([-1, 1]) });
          if (!reset) a.tx = U.rand(80, 880);
          this.actors.push(a);
        }
        a.lv = m.lv; a.badge = true;
      });
    }
    update(dt) {
      super.update(dt);
      const t = this.t;
      // 歩き回る
      this.actors.forEach((a) => {
        if (a.tx == null && a.anim === 'idle' && Math.random() < dt * 0.25) { a.tx = U.clamp(a.x + U.rand(-180, 180), 60, 900); a.speed = U.rand(40, 80); }
      });
      // 松明
      if (Math.random() < 0.8) { FX.P.fire(70, 410, 1, 0.8, 'back'); FX.P.fire(890, 410, 1, 0.8, 'back'); }
      if (Math.random() < dt * 4) FX.P.embers(W, H, 1, 'rgba(255,110,40,0.9)', 'back');
      if (MK.S.castleLv >= 5 && Math.random() < dt * 0.15) this.bolt = { t, seed: Math.random() * 999 };
      this.tickT += dt;
      if (this.tickT > 7) { this.tickT = 0; this.tick = (this.tick + 1) % TICKER.length; }
      MK.S.goldShown += (MK.S.gold - MK.S.goldShown) * Math.min(1, dt * 6);
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'normal', t);
      if (this.bolt && t - this.bolt.t < 0.25) {
        FX.lightning(ctx, U.rand(400, 800), 0, 600, 200, '#ffb0c0', 3, this.bolt.seed);
      }
      A.castle(ctx, 560, 430, this.castleS, MK.S.castleLv, t);
      // 松明台
      [70, 890].forEach((x) => { ctx.fillStyle = '#1a1014'; ctx.fillRect(x - 5, 410, 10, 70); ctx.fillStyle = '#3a2a20'; ctx.fillRect(x - 12, 404, 24, 10); });
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
    }
    drawHud(ctx, t) {
      const S = MK.S;
      goldHud(ctx, S);
      approachHud(ctx, S, t);
      bottomHud(ctx, S);
      // 魔王のつぶやき
      const msg = this.msg && t < this.msgUntil ? this.msg : TICKER[this.tick];
      ctx.save();
      const mw = 400;
      ctx.fillStyle = 'rgba(10,2,12,0.75)';
      ctx.beginPath(); ctx.roundRect(W / 2 - mw / 2, 104, mw, 34, 17); ctx.fill();
      ctx.strokeStyle = 'rgba(217,166,64,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      A.label(ctx, '魔王「' + msg + '」', W / 2, 121, 15, '#ffe7c0', 'center');
      ctx.restore();
    }
    say(msg, sec = 3) { this.msg = msg; this.msgUntil = this.t + sec; }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      const roll = Math.random();
      if (r >= 3 || (r >= 1 && roll < 0.35) || (r === 0 && roll < 0.04)) {
        // 予告：魔物ざわめき
        this.actors.forEach((a) => { a.tx = null; setAnim(a, 'cheer', 0.8); });
        this.actors.slice(0, 4).forEach((a) => {
          FX.add({ dur: 0.9, layer: 'front', draw(ctx, p) { ctx.globalAlpha = 1 - U.seg(p, 0.7, 1); FX.fancyText(ctx, '!', a.x, topY(a) - 18 - E.outBack(U.seg(p, 0, 0.3)) * 10, 34, { palette: 'blood' }); } });
        });
        MK.Audio.play('coin');
      }
      if (r >= 2 && (roll < 0.6 || r >= 3)) {
        // 魔法陣予告
        MK.Audio.play('magic');
        FX.add({ dur: 1.4, layer: 'back', draw(ctx, p, age) {
          ctx.globalAlpha = Math.sin(p * Math.PI);
          FX.magicCircle(ctx, W / 2, 470, 260, age * 2, r >= 3 ? 'rgba(255,60,80,1)' : 'rgba(160,110,255,1)', { tilt: 0.25 });
        } });
      }
      if (r >= 3 && roll < 0.7) {
        setTimeout(() => FX.cutin({ text: 'む…この気配は！？', size: 54, drawChar: (c, x, y, a) => A.maou(c, x, y, 0.9, a, 'shock'), dur: 1.3 }), 300);
      }
      if (r >= 3) MK.Reels.setAllLight(0.25);
    }
    result(res) {
      const S = MK.S;
      const gain = res.goldGain;
      if (gain > 0) {
        FX.P.coins(W / 2, 300, 60, 62, Math.min(14, 2 + Math.floor(gain / 10)));
        popNumber(170, 108, '+' + gain + 'G', { size: 26 });
        setTimeout(() => MK.Audio.play('coin'), 500);
      }
      const label = MK.CFG.ROLES[res.role].rare ? MK.CFG.ROLES[res.role].label : null;
      if (label) FX.slam(label + '!!', { size: 64, y: 230, palette: MK.CFG.ROLES[res.role].rare >= 3 ? 'blood' : 'gold', dur: 1.2, shake: 6 });
      MK.Reels.setAllLight(1);
    }
    hire(m) {
      this.sync(false);
      const a = this.actors.find((x) => x.id === m.id);
      if (a) {
        a.x = 560; a.y = 470; a.tx = U.rand(120, 840); a.speed = 90;
        FX.P.burst(a.x, a.y - 40, 20, 'rgba(160,110,255,0.9)', 200);
      }
      this.say(MK.CFG.MONSTERS[m.type].name + 'を雇用した！ よろしく頼むぞ。', 3);
      FX.add({ dur: 1.8, layer: 'top', draw(ctx, p, age) {
        ctx.globalAlpha = Math.min(1, age * 4) * (1 - U.seg(p, 0.8, 1));
        A.panel(ctx, W / 2 - 170, 160, 340, 60, { color: '#7ad8ff' });
        A.label(ctx, '新規雇用', W / 2, 178, 14, '#9fe8ff', 'center');
        A.label(ctx, MK.CFG.MONSTERS[m.type].name + '  人件費 ' + MK.CFG.MONSTERS[m.type].wage + 'G/期', W / 2, 202, 20, '#ffffff', 'center');
      } });
      MK.Audio.play('levelup');
    }
    leave(m) {
      const a = this.actors.find((x) => x.id === m.id);
      if (a) { a.tx = a.x < W / 2 ? -100 : W + 100; a.speed = 160; a.leaving = true; setTimeout(() => this.sync(false), 1500); }
      this.say(MK.CFG.MONSTERS[m.type].name + 'が給料未払いで辞めてしまった…', 3.5);
    }
    settle(info) {
      MK.Audio.play(info.net >= 0 ? 'coin' : 'lose');
      FX.add({ dur: 2.4, layer: 'top', draw(ctx, p, age) {
        const k = E.outBack(U.seg(age, 0, 0.3));
        ctx.globalAlpha = 1 - U.seg(p, 0.85, 1);
        ctx.translate(W / 2, 270); ctx.scale(k, k);
        A.panel(ctx, -200, -80, 400, 160, { color: info.net >= 0 ? '#ffd34a' : '#ff4040' });
        A.label(ctx, '― 第' + info.term + '期 決算報告 ―', 0, -56, 18, '#e8c87a', 'center');
        A.label(ctx, '売上', -150, -22, 17, '#c9a65a'); A.num(ctx, '+' + info.income + 'G', 150, -22, 24, 'gold', 'right');
        A.label(ctx, '人件費', -150, 10, 17, '#c9a65a'); A.num(ctx, '-' + info.wage + 'G', 150, 10, 24, 'silver', 'right');
        ctx.fillStyle = '#d9a640'; ctx.fillRect(-160, 28, 320, 2);
        FX.fancyText(ctx, info.net >= 0 ? '黒字 +' + info.net + 'G' : '赤字 ' + info.net + 'G', 0, 54, 34, { palette: info.net >= 0 ? 'gold' : 'blood' });
      } });
      if (info.net < 0) { FX.shake(10); FX.flash('#ff0000', 0.35); this.say('ぐぬぬ…赤字だと！？', 3); }
      else this.say(info.net > 60 ? 'フハハハ！大幅黒字だ！' : 'うむ、堅実な経営だ。', 3);
    }
    invest(kind, data) {
      if (kind === 'castle') {
        MK.Audio.play('build');
        const S = MK.S;
        FX.P.smoke(560, 420, 20, 2, 'rgba(120,100,120,0.6)', 'front');
        FX.P.burst(560, 300, 40, 'rgba(200,140,255,0.9)', 400, 30);
        FX.flash('#ffffff', 0.6);
        FX.shake(12);
        this.castleS = 0.6;
        const self = this;
        FX.add({ dur: 1, update(dt, o) { self.castleS = 0.6 + 0.1 * E.outElastic(o.age); }, draw() {} });
        FX.slam('城 増築!!', { y: 210, size: 72, sub: 'Lv' + S.castleLv + '「' + MK.CFG.CASTLE.names[S.castleLv] + '」', palette: 'violet' });
        this.say('見よ、この威容！ 勇者も震えるがよい！', 3);
      }
    }
  }

  // ---------- CZ：勇者襲来 ----------
  class CZScene extends Scene {
    enter() {
      const S = MK.S;
      this.actors = [];
      const sorted = S.monsters.slice().sort((a, b) => MK.CFG.MONSTERS[b.type].power - MK.CFG.MONSTERS[a.type].power).slice(0, 6);
      sorted.forEach((m, i) => {
        this.actors.push(actor({ id: m.id, type: m.type, lv: m.lv, x: 110 + (i % 3) * 95 + (i >= 3 ? 45 : 0), y: i >= 3 ? 500 : 455, s: m.type === 'dragon' ? 0.75 : 0.9, face: 1, badge: true }));
      });
      this.hero = actor({ kind: 'hero', type: 'hero', x: 1050, y: 470, s: 1.25, face: -1, tx: 760, speed: 260 });
      this.party = [
        actor({ kind: 'hero', type: 'warrior', x: 1120, y: 430, s: 0.9, face: -1, tx: 860, speed: 240 }),
        actor({ kind: 'hero', type: 'mage', x: 1160, y: 505, s: 0.9, face: -1, tx: 900, speed: 240 }),
      ];
      this.actors.push(this.hero, ...this.party);
      this.hpShown = S.cz.hp;
      MK.Audio.bgm('cz');
    }
    update(dt) {
      super.update(dt);
      if (Math.random() < dt * 14) FX.P.embers(W, H, 1, 'rgba(255,80,30,0.9)', 'back');
      if (Math.random() < dt * 3) FX.P.smoke(U.rand(0, W), H - 40, 1, 1.5, 'rgba(40,10,10,0.5)', 'back');
      this.hpShown += (MK.S.cz.hp - this.hpShown) * Math.min(1, dt * 5);
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'cz', t);
      A.castle(ctx, 210, 400, 0.42, MK.S.castleLv, t);
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
    }
    drawHud(ctx, t) {
      const S = MK.S;
      rushBanner(ctx, '勇者襲来', 'gold', t);
      A.panel(ctx, 20, 76, 250, 66, { color: '#e04040' });
      A.label(ctx, '残り', 36, 108, 18, '#ff9a9a');
      A.num(ctx, Math.max(0, MK.CFG.CZ.games - S.cz.game + 1) + 'G', 84, 108, 40, 'gold');
      A.label(ctx, '勇者を撃退せよ！', 256, 128, 13, '#ffd0d0', 'right');
      // 勇者HP
      A.panel(ctx, 560, 18, 384, 70, { color: '#7ad8ff' });
      A.label(ctx, '勇者アルス', 578, 38, 16, '#bfe8ff');
      A.label(ctx, 'HP', 578, 66, 16, '#bfe8ff');
      A.bar(ctx, 610, 56, 310, 20, this.hpShown / S.cz.maxHp, ['#7aff9a', '#1a8a3a']);
      A.num(ctx, Math.max(0, Math.ceil(S.cz.hp)), 926, 38, 20, 'silver', 'right');
      // 戦力
      A.label(ctx, '魔王軍 戦力 ' + MK.Game.armyPower().toFixed(1), 20, H - 18, 15, '#ffd34a');
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 2) { MK.Audio.play('magic'); FX.add({ dur: 1.2, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, 250, 480, 200, age * 3, 'rgba(255,60,60,1)', { tilt: 0.3 }); } }); }
      this.hero.anim === 'idle' && setAnim(this.hero, 'attack', 0.5);
    }
    async attack(res) {
      const S = MK.S;
      const list = this.actors.filter((a) => a.kind === 'monster');
      if (!list.length) return;
      const big = res.dmg >= 30;
      const atk = big ? list.reduce((a, b) => (MK.CFG.MONSTERS[b.type].power > MK.CFG.MONSTERS[a.type].power ? b : a)) : U.pick(list);
      const hx = this.hero.x, hy = this.hero.y - 60;
      if (atk.type === 'dragon') {
        setAnim(atk, 'attack', 0.8);
        breath(atk.x + 80, atk.y - 120, hx, hy);
        await MK.wait(350);
      } else if (atk.type === 'imp') {
        setAnim(atk, 'attack', 0.5);
        MK.Audio.play('magic');
        await projectile(atk.x + 20, atk.y - 80, hx, hy, 'rgba(200,120,255,0.9)');
      } else {
        const home = atk.x; atk.speed = 1100; atk.lockFace = true; atk.tx = hx - 70;
        await until(() => atk.tx == null, 0.8);
        setAnim(atk, 'attack', 0.5);
        await MK.wait(160);
        slashFx(hx, hy);
        atk._home = home;
      }
      hitFx(hx, hy, big);
      setAnim(this.hero, 'hurt', 0.45);
      popNumber(hx, hy - 50, res.dmg + (res.crit ? '!!' : ''), { size: big ? 64 : 44, palette: res.crit ? 'blood' : 'gold' });
      if (res.crit) FX.slam('CRITICAL!!', { y: 200, size: 60, palette: 'blood', dur: 0.9, sfx: false });
      if (atk._home != null) { await MK.wait(250); atk.tx = atk._home; atk._home = null; await until(() => atk.tx == null, 1); atk.speed = 70; atk.lockFace = false; atk.face = 1; }
    }
  }

  // ---------- AT：魔王経営RUSH ----------
  class ATScene extends Scene {
    enter(opt = {}) {
      this.actors = [];
      this.sync();
      this.castleS = 0.68;
      MK.Audio.bgm('at');
    }
    sync() {
      const S = MK.S;
      const ids = new Set(S.monsters.map((m) => m.id));
      this.actors = this.actors.filter((a) => ids.has(a.id));
      S.monsters.forEach((m, i) => {
        let a = this.actors.find((x) => x.id === m.id);
        if (!a) {
          a = actor({ id: m.id, type: m.type, x: U.rand(90, 870), y: U.rand(455, 505), s: m.type === 'dragon' ? 0.7 : 0.8, badge: true, face: U.pick([-1, 1]) });
          this.actors.push(a);
        }
        a.lv = m.lv;
      });
    }
    update(dt) {
      super.update(dt);
      this.actors.forEach((a) => {
        if (a.tx == null && a.anim === 'idle' && Math.random() < dt * 0.35) { a.tx = U.clamp(a.x + U.rand(-200, 200), 60, 900); a.speed = U.rand(60, 110); }
      });
      if (Math.random() < dt * 8) FX.P.embers(W, H, 1, U.pick(['rgba(255,200,80,0.9)', 'rgba(200,120,255,0.9)']), 'back');
      MK.S.goldShown += (MK.S.gold - MK.S.goldShown) * Math.min(1, dt * 6);
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'at', t);
      FX.rays(ctx, 560, 230, 520, t * 0.15, 'rgba(255,200,255,0.12)', 16, 0.06);
      A.castle(ctx, 560, 430, this.castleS, MK.S.castleLv, t);
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
    }
    drawHud(ctx, t) {
      const S = MK.S, at = S.at;
      rushBanner(ctx, '魔王経営RUSH', 'gold', t);
      A.panel(ctx, 20, 76, 200, 42, { color: '#ffd34a' });
      A.label(ctx, 'SET', 34, 97, 15, '#e8c87a'); A.num(ctx, at.set, 80, 97, 26, 'gold');
      A.label(ctx, '撃退 ' + at.wins + '回', 206, 97, 15, '#ffe7c0', 'right');
      // 残りG
      A.panel(ctx, 744, 14, 200, 88, { color: '#ffd34a' });
      A.label(ctx, '継続ジャッジまで', 760, 34, 14, '#e8c87a');
      A.num(ctx, at.left, 900, 70, 50, 'gold', 'right');
      A.label(ctx, 'G', 928, 76, 18, '#ffe08a', 'right');
      // 戦力比較
      const army = MK.Game.armyPower(), party = MK.Game.partyPower();
      A.panel(ctx, 600, 110, 344, 58, { color: '#c38bff' });
      A.label(ctx, '魔王軍', 616, 128, 13, '#d7b4ff'); A.label(ctx, '勇者一行', 928, 128, 13, '#9fe8ff', 'right');
      const ratio = army / (army + party);
      ctx.fillStyle = '#3ab8ff'; ctx.fillRect(616, 140, 312, 16);
      ctx.fillStyle = A.lg(ctx, 0, 140, 0, 156, ['#ff9ad0', '#a01a6a']); ctx.fillRect(616, 140, 312 * ratio, 16);
      ctx.fillStyle = '#fff'; ctx.fillRect(616 + 312 * ratio - 1, 136, 3, 24);
      A.label(ctx, army.toFixed(1), 622, 148, 12, '#fff'); A.label(ctx, party.toFixed(1), 922, 148, 12, '#fff', 'right');
      // 城の発展
      A.label(ctx, '城の発展', 20, 140, 14, '#e8c87a');
      A.bar(ctx, 90, 132, 130, 14, S.castleLv >= 5 ? 1 : at.dev / MK.CFG.AT.devToUpgrade, ['#e0c0ff', '#7a3ac8']);
      // 獲得
      bottomHud(ctx, S, [['獲得', U.fmt(at.totalWin) + '枚'], ['資金', U.fmt(S.goldShown) + 'G'], ['城', 'Lv' + S.castleLv], ['魔物', S.monsters.length + '体']]);
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 1) {
        MK.Audio.play('magic');
        FX.add({ dur: 1.2, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, W / 2, 470, 300, age * 3, r >= 3 ? 'rgba(255,200,60,1)' : 'rgba(200,120,255,1)', { tilt: 0.25 }); } });
      }
    }
    result(res) {
      const S = MK.S;
      if (res.pay > 0 && res.outcome === 'coin') {
        FX.P.coins(W / 2, 330, 130, H - 20, 6);
      }
      // 経験値の光
      if (res.expTo) {
        const a = this.actors.find((x) => x.id === res.expTo.id);
        if (a) {
          FX.P.rise(a.x, a.y - 20, 20, 6 + Math.min(20, res.exp), 'rgba(140,220,255,0.9)');
          popNumber(a.x, topY(a) - 20, 'EXP+' + res.exp, { size: 20, palette: 'ice' });
        }
      }
      if (res.add) {
        FX.slam('+' + res.add + 'G', { y: 250, size: 110, palette: 'blood', sub: '継続ジャッジまでのG数 上乗せ', glow: 'rgba(255,60,30,0.8)' });
        FX.P.burst(820, 60, 40, 'rgba(255,200,60,0.9)', 300);
      } else if (MK.CFG.ROLES[res.role].rare) {
        FX.slam(MK.CFG.ROLES[res.role].label + '!!', { size: 60, y: 240, dur: 1.0, shake: 5 });
      }
    }
    levelup(m) {
      const a = this.actors.find((x) => x.id === m.id);
      if (!a) return;
      a.lv = m.lv;
      setAnim(a, 'cheer', 1);
      MK.Audio.play('levelup');
      FX.P.rise(a.x, a.y, 30, 30, 'rgba(255,220,100,0.9)');
      FX.add({ dur: 1.2, layer: 'front', draw(ctx, p, age) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - p;
        ctx.drawImage(FX.glow('rgba(255,220,120,0.8)', 128), a.x - 70, a.y - 140, 140, 160);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - U.seg(p, 0.7, 1);
        FX.fancyText(ctx, 'LEVEL UP!', a.x, topY(a) - 30 - age * 20, 26, { palette: 'gold' });
      } });
    }
    hire(m) {
      this.sync();
      const a = this.actors.find((x) => x.id === m.id);
      if (a) { a.x = 560; a.y = 470; a.tx = U.rand(120, 840); FX.P.burst(560, 430, 30, 'rgba(160,110,255,0.9)', 260); }
      FX.slam(MK.CFG.MONSTERS[m.type].name + ' 入社!!', { y: 220, size: 56, palette: 'violet', dur: 1.3 });
      MK.Audio.play('levelup');
    }
    invest(kind) {
      if (kind !== 'castle') return;
      MK.Audio.play('build');
      FX.P.smoke(560, 420, 20, 2, 'rgba(160,120,180,0.6)', 'front');
      FX.P.burst(560, 280, 50, 'rgba(255,200,255,0.9)', 420, 30);
      FX.flash('#ffffff', 0.7); FX.shake(14);
      const self = this; self.castleS = 0.58;
      FX.add({ dur: 1, update(dt, o) { self.castleS = 0.58 + 0.1 * E.outElastic(o.age); }, draw() {} });
      FX.slam('魔王城 発展!!', { y: 200, size: 72, sub: 'Lv' + MK.S.castleLv + '「' + MK.CFG.CASTLE.names[MK.S.castleLv] + '」', palette: 'violet' });
    }
  }

  // ---------- 継続ジャッジ：自動戦闘 ----------
  class JudgeScene extends Scene {
    enter(opt = {}) {
      const S = MK.S;
      this.variant = opt.variant || 'at'; // at | upper
      this.actors = [];
      const ms = S.monsters.slice().sort((a, b) => MK.Game.monsterPower(b) - MK.Game.monsterPower(a)).slice(0, 5);
      ms.forEach((m, i) => {
        this.actors.push(actor({ id: m.id, type: m.type, lv: m.lv, x: -80 - i * 60, tx: 90 + (i % 3) * 100 + (i >= 3 ? 50 : 0), y: i >= 3 ? 505 : 450, s: m.type === 'dragon' ? 0.75 : 0.9, speed: 300, face: 1, badge: true, side: 'm' }));
      });
      const partyTypes = this.variant === 'upper' ? ['warrior', 'hero', 'warrior', 'priest'] : ['hero', 'warrior', 'mage', 'priest'];
      partyTypes.forEach((ty, i) => {
        this.actors.push(actor({ kind: 'hero', type: ty, x: 1040 + i * 60, tx: 640 + (i % 2) * 110 + (i >= 2 ? 60 : 0), y: i >= 2 ? 505 : 445, s: ty === 'hero' ? 1.15 : 0.95, speed: 300, face: -1, side: 'h' }));
      });
      this.mhp = 1; this.hhp = 1; this.mhpT = 1; this.hhpT = 1;
      this.next = 1.4; this.final = null;
      MK.Audio.bgm('judge');
    }
    update(dt) {
      super.update(dt);
      this.mhp += (this.mhpT - this.mhp) * Math.min(1, dt * 4);
      this.hhp += (this.hhpT - this.hhp) * Math.min(1, dt * 4);
      if (Math.random() < dt * 10) FX.P.embers(W, H, 1, 'rgba(255,90,40,0.9)', 'back');
      if (this.final) return;
      this.next -= dt;
      if (this.next <= 0 && !this.busy) { this.next = U.rand(0.7, 1.2); this.exchange(); }
    }
    async exchange(forceSide) {
      const ms = this.actors.filter((a) => a.side === 'm' && a.anim !== 'down');
      const hs = this.actors.filter((a) => a.side === 'h' && a.anim !== 'down');
      if (!ms.length || !hs.length) return;
      this.busy = true;
      const monsterTurn = forceSide ? forceSide === 'm' : Math.random() < 0.5;
      const atk = monsterTurn ? U.pick(ms) : U.pick(hs);
      const def = monsterTurn ? U.pick(hs) : U.pick(ms);
      const tx = def.x, ty = def.y - 50;
      if (atk.type === 'mage' || atk.type === 'priest' || atk.type === 'imp') {
        setAnim(atk, 'attack', 0.5); MK.Audio.play('magic');
        await projectile(atk.x, atk.y - 70, tx, ty, atk.type === 'imp' ? 'rgba(200,120,255,0.9)' : atk.type === 'priest' ? 'rgba(255,255,180,0.9)' : 'rgba(80,170,255,0.9)');
      } else if (atk.type === 'dragon') {
        setAnim(atk, 'attack', 0.8); breath(atk.x + 80, atk.y - 120, tx, ty); await MK.wait(350);
      } else {
        const home = atk.x; atk.speed = 1000; atk.lockFace = true; atk.tx = tx - atk.face * 65;
        await until(() => atk.tx == null, 0.8);
        setAnim(atk, 'attack', 0.5); await MK.wait(160);
        slashFx(tx, ty);
        hitFx(tx, ty, false); setAnim(def, 'hurt', 0.45);
        await MK.wait(200);
        atk.tx = home; await until(() => atk.tx == null, 1); atk.lockFace = false; atk.face = atk.side === 'm' ? 1 : -1; atk.speed = 300;
        this.applyDmg(monsterTurn);
        this.busy = false;
        return;
      }
      hitFx(tx, ty, false); setAnim(def, 'hurt', 0.45);
      this.applyDmg(monsterTurn);
      this.busy = false;
    }
    applyDmg(monsterTurn) {
      if (this.final) return;
      // 最終結果までは五分の攻防に見せる
      const floor = 0.18;
      if (monsterTurn) this.hhpT = Math.max(floor, this.hhpT - U.rand(0.06, 0.12));
      else this.mhpT = Math.max(floor, this.mhpT - U.rand(0.06, 0.12));
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, this.variant === 'upper' ? 'upper' : 'judge', t);
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
    }
    drawHud(ctx, t) {
      const S = MK.S;
      const g = this.variant === 'upper' ? S.upper.judgeGame : S.at.judgeGame;
      FX.fancyText(ctx, this.variant === 'upper' ? '王国軍との決戦' : '継続ジャッジ', W / 2, 36, 40, { palette: this.variant === 'upper' ? 'rainbow' : 'blood', shine: U.mod(t * 0.5, 1.5) });
      A.label(ctx, (this.variant === 'upper' ? '' : '勇者パーティー Lv' + S.at.partyLv + '  ') + '決戦 ' + Math.min(3, g) + '/3G', W / 2, 72, 16, '#ffd0d0', 'center');
      // HPバー
      A.panel(ctx, 14, 92, 300, 46, { color: '#c38bff' });
      A.label(ctx, '魔王軍', 28, 106, 13, '#d7b4ff');
      A.bar(ctx, 28, 116, 272, 14, this.mhp, ['#ff9ad0', '#a01a6a']);
      A.panel(ctx, 646, 92, 300, 46, { color: '#7ad8ff' });
      A.label(ctx, this.variant === 'upper' ? '王国騎士団' : '勇者一行', 932, 106, 13, '#9fe8ff', 'right');
      A.bar(ctx, 660, 116, 272, 14, this.hhp, ['#7aff9a', '#1a8a3a']);
      // VS
      FX.fancyText(ctx, 'VS', W / 2, 116, 36, { palette: 'gold' });
      if (this.variant === 'at') {
        const wr = MK.Game.judgeWinRate();
        A.label(ctx, '戦力 ' + MK.Game.armyPower().toFixed(1) + ' vs ' + MK.Game.partyPower().toFixed(1), W / 2, 152, 14, '#ffe7c0', 'center');
        if (MK.Dev && MK.Dev.showRates) A.label(ctx, '(勝率 ' + Math.round(wr * 100) + '%)', W / 2, 170, 12, '#aaa', 'center');
      }
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 1) {
        MK.Audio.play('rare', r);
        FX.add({ dur: 1.0, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, 250, 480, 240, age * 3, 'rgba(255,200,60,1)', { tilt: 0.3 }); } });
      }
    }
    async finish(win) {
      this.final = win ? 'win' : 'lose';
      while (this.busy) await MK.wait(50);
      const ms = this.actors.filter((a) => a.side === 'm');
      const hs = this.actors.filter((a) => a.side === 'h');
      // 必殺の一撃
      FX.flash('#000000', 0.7, 1.5);
      MK.Audio.play('thunder');
      await MK.wait(500);
      if (win) {
        const best = ms[0];
        if (best) {
          FX.cutin({ text: '魔王軍 総攻撃!!', size: 64, palette: 'violet', drawChar: (c, x, y, a) => A.maou(c, x, y, 0.95, a, 'laugh'), dur: 1.4 });
          await MK.wait(1400);
          ms.forEach((m) => setAnim(m, 'attack', 0.6));
          FX.add({ dur: 0.9, layer: 'front', draw(ctx, p, age) { ctx.globalAlpha = 1 - p; FX.magicCircle(ctx, 780, 470, 160 + p * 120, age * 5, 'rgba(255,80,200,1)', { tilt: 0.35 }); } });
          hs.forEach((h, i) => setTimeout(() => { hitFx(h.x, h.y - 50, true); setAnim(h, 'down'); }, i * 140));
          this.hhpT = 0;
        }
      } else {
        FX.cutin({ text: '勇者の聖剣が光る…！', size: 52, palette: 'ice', color: '#103a8a', drawChar: (c, x, y, a) => { c.save(); c.translate(x, y - 40); c.scale(3, 3); MK.Art.Heroes.hero(c, { breath: 0, walk: 0, swing: -1, lunge: 0, hurt: 0 }, a); c.restore(); }, dur: 1.4 });
        await MK.wait(1400);
        FX.flash('#ffffff', 1, 2);
        ms.forEach((m, i) => setTimeout(() => { hitFx(m.x, m.y - 50, true); setAnim(m, 'down'); }, i * 140));
        this.mhpT = 0;
      }
      await MK.wait(900);
    }
  }

  // ---------- 上位AT：世界征服RUSH ----------
  const REGION_POS = [
    [250, 230], [340, 180], [430, 220], [520, 170], [610, 210], [700, 180],
    [280, 320], [380, 300], [480, 330], [580, 300], [680, 320], [760, 270],
  ];
  const REGION_NAMES = ['北の港町', '鉄鉱山', '学術都市', '王都', '聖堂', '大森林', '漁村', '穀倉地帯', '交易都市', '古戦場', '砂漠の砦', '東の関所'];
  class UpperScene extends Scene {
    enter() {
      this.dragon = { x: -200, y: 140 };
      this.march = [];
      MK.Audio.bgm('upper');
      // 大陸の形（シード固定）
      const r = U.srand(MK.S.upper.continent * 31 + 5);
      this.shape = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * U.TAU;
        this.shape.push([500 + Math.cos(a) * (330 + r() * 50), 255 + Math.sin(a) * (130 + r() * 30)]);
      }
    }
    update(dt) {
      super.update(dt);
      this.dragon.x += dt * 120; if (this.dragon.x > W + 300) this.dragon.x = -300;
      if (Math.random() < dt * 12) FX.P.embers(W, H, 1, U.pick(['rgba(255,120,40,0.9)', 'rgba(255,200,60,0.9)']), 'back');
      // 制圧済みの街から煙
      MK.S.upper.regions.forEach((v, i) => { if (v >= 100 && Math.random() < dt * 1.5) FX.P.smoke(REGION_POS[i][0], REGION_POS[i][1] - 10, 1, 0.5, 'rgba(40,10,10,0.5)', 'back'); });
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'upper', t);
      FX.rays(ctx, W / 2, 250, 700, t * 0.1, 'rgba(255,120,40,0.1)', 12, 0.08);
      // 大陸
      ctx.save();
      ctx.beginPath(); this.shape.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = A.lg(ctx, 0, 100, 0, 420, ['#5a4a32', '#3a2a1a', '#2a1a10']); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#d9a640'; ctx.stroke();
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,160,60,0.15)'; ctx.stroke();
      ctx.clip();
      // 侵略の赤い染み
      const S = MK.S;
      S.upper.regions.forEach((v, i) => {
        const [x, y] = REGION_POS[i];
        const k = v / 100;
        if (k > 0) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * k + 10);
          g.addColorStop(0, 'rgba(160,0,20,0.85)'); g.addColorStop(1, 'rgba(60,0,10,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 110, y - 110, 220, 220);
        }
      });
      // 川
      ctx.strokeStyle = 'rgba(80,140,200,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(200, 120); ctx.bezierCurveTo(350, 260, 500, 240, 640, 420); ctx.stroke();
      ctx.restore();
      // 街
      S.upper.regions.forEach((v, i) => {
        const [x, y] = REGION_POS[i];
        const done = v >= 100;
        const cur = i === S.upper.target;
        ctx.save(); ctx.translate(x, y);
        // 建物
        ctx.fillStyle = done ? '#1a0a0a' : '#c8c0b0';
        ctx.strokeStyle = '#0a0606'; ctx.lineWidth = 2;
        [[-12, -14, 8, 14], [-3, -22, 8, 22], [6, -12, 8, 12]].forEach(([bx, by, bw, bh]) => { ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh); });
        ctx.fillStyle = done ? '#5a0a10' : '#3a6ad8';
        ctx.beginPath(); ctx.moveTo(1, -22); ctx.lineTo(1, -36); ctx.lineTo(14, -32); ctx.lineTo(1, -28); ctx.fill();
        if (done) { FX.P.fire(x + U.rand(-8, 8), y - 14, Math.random() < 0.3 ? 1 : 0, 0.5); }
        if (cur && !done) {
          ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, -10, 26, -Math.PI / 2, -Math.PI / 2 + U.TAU * (v / 100)); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,210,80,' + (0.4 + 0.4 * Math.sin(t * 8)) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, -10, 32, 0, U.TAU); ctx.stroke();
        }
        ctx.restore();
        A.label(ctx, REGION_NAMES[i], x, y + 14, 11, done ? '#ff8a8a' : '#f3e2b0', 'center');
      });
      FX.drawLayer(ctx, 'back');
      // ドラゴン飛行
      ctx.save(); ctx.globalAlpha = 0.85;
      A.monster(ctx, { type: 'dragon', x: this.dragon.x, y: this.dragon.y + Math.sin(t * 2) * 10, s: 0.5, face: 1, anim: 'idle', lv: 9 }, t);
      ctx.restore();
      // 進軍する魔物
      const shown = MK.S.monsters.slice(0, 6);
      shown.forEach((m, i) => {
        A.monster(ctx, { type: m.type, x: 120 + i * 120 + Math.sin(t + i) * 6, y: 520, s: 0.55, face: 1, anim: 'walk', at: t + i, lv: m.lv }, t);
      });
    }
    drawHud(ctx, t) {
      const S = MK.S, up = S.upper;
      ctx.save();
      ctx.fillStyle = A.lg(ctx, 0, 0, 0, 70, ['rgba(0,0,0,0.85)', 'rgba(0,0,0,0)']); ctx.fillRect(0, 0, W, 80);
      ctx.restore();
      FX.fancyText(ctx, '世界征服RUSH', 30, 36, 40, { palette: 'rainbow', align: 'left', glow: 'rgba(255,120,40,0.6)' });
      A.panel(ctx, 744, 10, 200, 76, { color: '#ff7a1a' });
      A.label(ctx, '決戦まで', 760, 28, 14, '#ffbf8a');
      A.num(ctx, up.left, 900, 60, 44, 'blood', 'right');
      A.label(ctx, 'G', 928, 66, 18, '#ffbf8a', 'right');
      const conquered = up.regions.filter((v) => v >= 100).length;
      A.panel(ctx, 30, 70, 280, 40, { color: '#ff7a1a' });
      A.label(ctx, '第' + up.continent + '大陸 制圧', 44, 90, 15, '#ffbf8a');
      A.num(ctx, conquered + ' / ' + MK.CFG.UPPER.regions, 296, 90, 24, 'gold', 'right');
      bottomHud(ctx, S, [['獲得', U.fmt(S.at.totalWin) + '枚'], ['SET', String(up.set)], ['侵攻中', REGION_NAMES[up.target] || '-']]);
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 1) {
        MK.Audio.play('magic');
        FX.add({ dur: 1.2, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, W / 2, 260, 240, age * 3, 'rgba(255,140,40,1)', { tilt: 0.5 }); } });
      }
    }
    conquer(info) {
      const [x, y] = REGION_POS[info.region];
      FX.P.fire(x, y, 6, 0.8);
      FX.P.sparks(x, y - 10, 8, '#ffb347', 300);
      popNumber(x, y - 40, '+' + info.gain + '%', { size: 24, palette: 'blood' });
      if (info.captured) {
        hitFx(x, y - 10, true);
        FX.slam(REGION_NAMES[info.region] + ' 陥落!!', { size: 64, y: 260, palette: 'blood', glow: 'rgba(255,80,20,0.8)', dur: 1.4 });
      }
    }
  }

  // ---------- タイトル（撮影用） ----------
  class TitleScene extends Scene {
    enter() { MK.Audio.bgm('normal'); this.t = 0; }
    update(dt) { super.update(dt); if (Math.random() < dt * 20) FX.P.embers(W, H, 1, 'rgba(255,110,40,0.9)', 'back'); if (Math.random() < 0.6) { FX.P.fire(U.rand(100, 860), 470, 1, 1.4, 'back'); } }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'normal', t);
      A.castle(ctx, W / 2, 470, 0.7, 5, t);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
      FX.drawLayer(ctx, 'back');
    }
    drawHud(ctx, t) {
      const k = E.outBack(U.seg(this.t, 0.2, 1.0));
      ctx.save(); ctx.translate(W / 2, 220); ctx.scale(k, k);
      A.logo(ctx, 0, 0, 1, t);
      ctx.restore();
      ctx.globalAlpha = U.seg(this.t, 1.2, 2);
      FX.fancyText(ctx, '勇者を倒せ。赤字を出すな。', W / 2, 362, 44, { palette: 'gold', outerW: 0.2 });
      A.label(ctx, '開発：バク（ナギバク研究所 メカニック担当）  ※架空の試作機です', W / 2, 420, 16, '#e8c87a', 'center');
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
      A.label(ctx, '― レバーを叩いて経営開始 ―', W / 2, 480, 20, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
  }

  // ---------- エンジン ----------
  const LCD = {
    W, H, scene: null, sceneName: '', canvas: null, ctx: null, overlayDraw: null,
    scenes: { normal: new NormalScene(), cz: new CZScene(), at: new ATScene(), judge: new JudgeScene(), upper: new UpperScene(), title: new TitleScene() },
    init(canvas) {
      this.canvas = canvas;
      const dpr = Math.min(2, window.devicePixelRatio || 1) > 1.3 ? 1.5 : 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      this.dpr = dpr;
      this.ctx = canvas.getContext('2d');
    },
    setScene(name, opt) {
      if (this.scene) this.scene.exit();
      this.sceneName = name;
      this.scene = this.scenes[name];
      this.scene.t = 0;
      this.scene.enter(opt || {});
    },
    call(method, ...args) {
      const s = this.scene;
      if (s && typeof s[method] === 'function') return s[method](...args);
    },
    update(dt) { if (this.scene) this.scene.update(dt); },
    draw(t) {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const [sx, sy] = FX.shakeOffset();
      ctx.save();
      ctx.translate(sx, sy);
      if (this.scene) this.scene.drawWorld(ctx, t);
      FX.drawLayer(ctx, 'front');
      if (this.scene) this.scene.drawHud(ctx, t);
      ctx.restore();
      ctx.save(); ctx.translate(sx * 1.5, sy * 1.5);
      FX.drawLayer(ctx, 'top');
      ctx.restore();
      if (this.overlayDraw) this.overlayDraw(ctx, t);
      FX.drawFlash(ctx, W, H);
      // 液晶の質感（走査線＋周辺減光）
      ctx.save();
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  };
  LCD.helpers = { actor, setAnim, until, popNumber, hitFx, slashFx, projectile, breath, topY, REGION_POS, REGION_NAMES };
  MK.LCD = LCD;
})(window.MK);
