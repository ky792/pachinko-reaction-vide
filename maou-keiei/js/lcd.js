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
        const txt = a.recruit ? '新人' + (a.lv > 1 ? ' Lv' + a.lv : '') : 'Lv' + a.lv;
        ctx.fillStyle = a.recruit ? '#7dffb0' : a.lv >= 7 ? '#ffcc33' : a.lv >= 4 ? '#c38bff' : '#7ad8ff';
        ctx.font = (a.recruit ? 'bold 16px ' : 'bold 13px ') + '"Dela Gothic One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(txt, bx, by);
        ctx.fillText(txt, bx, by);
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
      A.label(ctx, k, x, H - 20, 16, '#c9a65a');
      ctx.font = 'bold 16px "Shippori Mincho B1", serif';
      const kw = ctx.measureText(k).width;
      A.label(ctx, v, x + kw + 8, H - 20, 21, '#fff3d0');
      ctx.font = 'bold 21px "Shippori Mincho B1", serif';
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

  // ---------- 通常時：魔王城経営（断面図） ----------
  const C = MK.Castle;
  const ROOM_OF = { slime: 0, goblin: 1, skeleton: 2, imp: 3, dragon: 4 };
  const CASTLE_GEO = { x: 480, y: 512, s: 1.2, floors: 3 };
  const CASTLE_BOX = { x: 480, bottom: 512, h: 400, maxS: 1.25 };
  const BAG = { x: 128, y: 528, s: 1.05 };
  const FG = { x: 850, y: 532, s: 1.75 };
  function roomOf(m) { const r = ROOM_OF[m.type]; return r == null || r > MK.S.castleLv ? 1 : r; }
  function localToScreen(lx, ly, geo = CASTLE_GEO) { return [geo.x + lx * geo.s, geo.y + ly * geo.s]; }
  // 選択肢カード（2〜3枚）
  function crown(ctx, x, y, k = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(-16, -6); ctx.lineTo(-7, 0); ctx.lineTo(0, -10); ctx.lineTo(7, 0); ctx.lineTo(16, -6); ctx.lineTo(14, 6); ctx.closePath();
    A.fillStroke(ctx, A.lg(ctx, 0, -10, 0, 6, ['#fff8c0', '#ffc020', '#8a5000']), 2);
    ctx.restore();
  }
  function perkIcon(ctx, x, y, r, glyph, lit = true) {
    A.ell(ctx, x, y, r, r);
    ctx.fillStyle = lit ? A.rg(ctx, x - r * 0.3, y - r * 0.3, 1, x, y, r, ['#fff2b0', '#d9a020', '#6a3a00']) : '#2a2030'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.strokeStyle = '#1a0a04'; ctx.stroke();
    ctx.fillStyle = lit ? '#3a1600' : '#7a6a80'; ctx.font = `bold ${r * 1.1}px "Shippori Mincho B1", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x, y + r * 0.06);
  }
  function choiceCards(ctx, t, choice) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,8,0.74)'; ctx.fillRect(0, 0, W, H);
    A.label(ctx, choice.title, W / 2, 40, 32, '#ffe08a', 'center', '"Dela Gothic One", sans-serif');
    const cards = choice.opts, n = cards.length;
    const gap = 16, w = n >= 3 ? 290 : 400, h = 340;
    const x0 = (W - (w * n + gap * (n - 1))) / 2, y = 76;
    const BTN = n >= 3 ? ['左ボタン', '中ボタン', '右ボタン'] : ['◀ 左ボタン', '右ボタン ▶'];
    cards.forEach((o, i) => {
      const x = x0 + i * (w + gap), cx = x + w / 2;
      const col = o.key === 'save' ? '#9fe8ff' : o.key === 'perk' ? '#ffb0e0' : o.key === 'leader' ? '#ff8a6a' : '#ffd34a';
      const pulse = 0.5 + 0.5 * Math.sin(t * 6 + i * 2);
      A.panel(ctx, x, y, w, h, { color: col, bg: ['rgba(40,12,30,0.95)', 'rgba(10,2,12,0.96)'] });
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 + 0.15 * pulse;
      ctx.drawImage(FX.glow('rgba(255,200,120,0.6)', 128), x, y + 20, w, 190); ctx.restore();
      // 絵
      ctx.save(); ctx.beginPath(); ctx.rect(x + 6, y + 6, w - 12, 205); ctx.clip();
      if (o.key === 'hire' || o.key === 'leader') {
        A.monster(ctx, { type: o.type, x: cx, y: y + 196, s: o.type === 'dragon' ? 0.85 : 1.3, face: 1, anim: o.key === 'leader' ? 'attack' : 'cheer', at: (t * 0.8) % 0.6, lv: 1 }, t);
        if (o.key === 'leader') crown(ctx, cx + 4, y + 62, 1.6);
      } else if (o.key === 'build') { const lv2 = Math.min(5, MK.S.castleLv + 1); const g = C.fitGeo(lv2, { x: cx, bottom: y + 190, h: 175, maxS: 0.5 }); C.section(ctx, g, lv2, t, { vault: MK.S.gold, floors: g.floors, flash: { [lv2]: 0.5 + 0.3 * Math.sin(t * 5) } }); }
      else if (o.key === 'train') { ['slime', 'goblin'].forEach((ty, k) => A.monster(ctx, { type: ty, x: cx - 50 + k * 100, y: y + 190, s: 1.0, face: k ? -1 : 1, anim: 'cheer', at: t + k * 0.3, lv: 1 }, t)); FX.fancyText(ctx, 'Lv UP', cx, y + 60, 40, { palette: 'gold' }); }
      else if (o.key === 'insure') { ctx.beginPath(); ctx.moveTo(cx, y + 50); ctx.lineTo(cx + 60, y + 74); ctx.quadraticCurveTo(cx + 56, y + 160, cx, y + 190); ctx.quadraticCurveTo(cx - 56, y + 160, cx - 60, y + 74); ctx.closePath(); A.fillStroke(ctx, A.lg(ctx, 0, y + 50, 0, y + 190, ['#bfe8ff', '#3a7ab8', '#12305a']), 4); A.label(ctx, '保', cx, y + 124, 52, '#ffffff', 'center'); }
      else if (o.key === 'perk') { perkIcon(ctx, cx, y + 116, 70, o.icon); }
      else C.payBag(ctx, cx, y + 200, 1.0, 0.85, t, { glow: 0.5 });
      ctx.restore();
      A.label(ctx, o.title, cx, y + 236, n >= 3 ? 26 : 32, col, 'center', '"Dela Gothic One", sans-serif');
      o.lines.forEach((l, k) => A.label(ctx, l, cx, y + 274 + k * 28, n >= 3 ? 18 : 21, k === 0 ? '#ffffff' : '#ffd34a', 'center'));
      A.label(ctx, BTN[i], cx, y + h + 22, 17, '#e8c87a', 'center');
    });
    ctx.restore();
  }
  // 持っている撃破ボーナスの列
  function perkRow(ctx, x, y) {
    const S = MK.S;
    let i = 0;
    Object.entries(S.perks).forEach(([id, n]) => {
      const p = MK.CFG.PERKS[id]; if (!p || !n) return;
      perkIcon(ctx, x + i * 30, y, 13, p.icon);
      if (n > 1) A.label(ctx, '×' + n, x + i * 30 + 12, y + 12, 11, '#ffffff');
      i++;
    });
    if (S.insurance) { perkIcon(ctx, x + i * 30, y, 13, '保'); }
  }

  class NormalScene extends Scene {
    enter() {
      this.actors = [];
      this.flash = {};
      Object.assign(CASTLE_GEO, C.fitGeo(MK.S.castleLv, CASTLE_BOX));
      this.fg = null;
      this.bagFill = 0; this.bagShow = 0;
      this.msg = null; this.msgUntil = 0;
      this.sync();
      MK.Audio.bgm('normal');
    }
    sync() {
      const S = MK.S;
      const ids = new Set(S.monsters.map((m) => m.id));
      this.actors = this.actors.filter((a) => ids.has(a.id));
      const perRoom = {};
      S.monsters.forEach((m) => {
        const room = roomOf(m);
        perRoom[room] = (perRoom[room] || 0) + 1;
        let a = this.actors.find((x) => x.id === m.id);
        const r = C.roomRect(room);
        if (!a) {
          a = actor({ id: m.id, type: m.type, s: m.type === 'dragon' ? 0.42 : 0.62, face: U.pick([-1, 1]) });
          a.x = U.rand(r.x0 + 60, r.x1 - 60);
          this.actors.push(a);
        }
        a.room = room; a.y = r.y1 - 3; a.lv = m.lv; a.badge = true; a.recruit = !!m.recruit;
        if (a.x < r.x0 + 40 || a.x > r.x1 - 40) a.x = U.rand(r.x0 + 60, r.x1 - 60);
      });
    }
    say(msg, sec = 2) { this.msg = msg; this.msgUntil = this.t + sec; }
    update(dt) {
      super.update(dt);
      const S = MK.S;
      this.actors.forEach((a) => {
        const r = C.roomRect(a.room);
        if (a.tx == null && a.anim === 'idle' && Math.random() < dt * 0.3) { a.tx = U.clamp(a.x + U.rand(-120, 120), r.x0 + 40, r.x1 - 40); a.speed = U.rand(30, 60); }
        // 所帯じみた仕事
        if (a.anim === 'idle' && Math.random() < dt * 0.25) {
          if (a.type === 'goblin') { setAnim(a, 'attack', 0.5); const [sx, sy] = localToScreen(a.x + a.face * 20, a.y - 18); setTimeout(() => FX.P.sparks(sx, sy, 5, '#ffd27a', 160), 200); }
          else if (a.type === 'slime') setAnim(a, 'cheer', 0.6);
          else if (a.type === 'dragon') { setAnim(a, 'attack', 0.8); const [sx, sy] = localToScreen(a.x + a.face * 40, a.y - 30); FX.P.fire(sx, sy, 6, 0.5); }
        }
      });
      for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 0.8);
      const g = C.fitGeo(S.castleLv, CASTLE_BOX);
      CASTLE_GEO.s += (g.s - CASTLE_GEO.s) * Math.min(1, dt * 2.5); CASTLE_GEO.floors = g.floors;
      // 給料袋
      const ps = MK.Game.payStatus();
      const show = ps.warn || (this.paydayAnim && this.bagShow > 0);
      this.bagShow = U.clamp(this.bagShow + (show ? dt * 3 : -dt * 3), 0, 1);
      const fillT = this.bagFillTarget != null ? this.bagFillTarget : U.clamp(S.gold / Math.max(1, ps.payroll), 0, 1);
      this.bagFill += (fillT - this.bagFill) * Math.min(1, dt * 5);
      // 辞表のゴブリン
      if (ps.warn && !this.fg && !this.paydayAnim) this.enterRisk();
      if (!ps.warn && this.fg && this.fg.state === 'hold' && !this.paydayAnim) this.pocket();
      if (this.fg) {
        updateActor(this.fg.a, dt);
        this.fg.p += dt;
        if (this.fg.state === 'out' && this.fg.a.tx == null) { this.unhide(this.fg.id); this.fg = null; }
      }
      if (Math.random() < 0.6) { FX.P.fire(60, 400, 1, 0.7, 'back'); FX.P.fire(900, 400, 1, 0.7, 'back'); }
      if (Math.random() < dt * 3) FX.P.embers(W, H, 1, 'rgba(255,110,40,0.9)', 'back');
      S.goldShown += (S.gold - S.goldShown) * Math.min(1, dt * 6);
    }
    unhide(id) { const a = this.actors.find((x) => x.id === id); if (a) a.hidden = false; }
    enterRisk() {
      const m = MK.Game.riskMonster();
      if (!m) return;
      const room = this.actors.find((x) => x.id === m.id);
      if (room) room.hidden = true;
      const a = actor({ id: m.id, type: m.type, lv: m.lv, x: W + 80, y: FG.y, s: FG.s, face: -1, speed: 160 });
      a.tx = FG.x;
      this.fg = { id: m.id, a, state: 'hold', p: 0 };
    }
    pocket() {
      if (!this.fg) return;
      this.fg.state = 'pocket'; this.fg.p = 0;
      const f = this.fg;
      setTimeout(() => { if (this.fg === f) { f.state = 'out'; f.a.tx = W + 120; f.a.speed = 120; } }, 1100 / MK.timeScale);
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'normal', t);
      [60, 900].forEach((x) => { ctx.fillStyle = '#1a1014'; ctx.fillRect(x - 5, 400, 10, 90); ctx.fillStyle = '#3a2a20'; ctx.fillRect(x - 12, 394, 24, 10); });
      C.section(ctx, CASTLE_GEO, MK.S.castleLv, t, { vault: MK.S.goldShown, flash: this.flash, floors: CASTLE_GEO.floors });
      FX.drawLayer(ctx, 'back');
      // 部屋の魔物（城ローカル座標）
      ctx.save(); ctx.translate(CASTLE_GEO.x, CASTLE_GEO.y); ctx.scale(CASTLE_GEO.s, CASTLE_GEO.s);
      drawActors(ctx, this.actors, t);
      ctx.restore();
    }
    drawHud(ctx, t) {
      const S = MK.S, ps = MK.Game.payStatus();
      // 金庫
      A.panel(ctx, 14, 12, 250, 92, { title: '金庫' });
      A.coin(ctx, 40, 58, 14);
      A.num(ctx, Math.round(S.goldShown), 62, 58, 38, 'gold');
      ctx.font = '400 38px "Dela Gothic One", sans-serif';
      const nw = ctx.measureText(String(Math.round(S.goldShown))).width;
      A.label(ctx, '枚', 70 + nw, 64, 18, '#ffe08a');
      A.label(ctx, '給料' + ps.payroll + '枚 ・ 給料日まで' + ps.left + 'G', 24, 90, 16, '#f3e2b0');
      approachHud(ctx, S, t);
      if (this.msg && this.t < this.msgUntil) {
        ctx.save(); ctx.fillStyle = 'rgba(10,2,12,0.8)'; ctx.beginPath(); ctx.roundRect(W / 2 - 110, 112, 220, 32, 16); ctx.fill(); ctx.restore();
        A.label(ctx, this.msg, W / 2, 128, 16, '#ffe7c0', 'center');
      }
      // 給料袋（決算前の3Gで足りないときだけ）
      if (this.bagShow > 0.01) {
        const k = U.ease.outBack(this.bagShow);
        ctx.save(); ctx.globalAlpha = Math.min(1, this.bagShow * 1.5);
        ctx.fillStyle = A.lg(ctx, 0, 300, 0, H, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']); ctx.fillRect(0, 300, 300, H - 300);
        C.payBag(ctx, BAG.x, BAG.y, BAG.s * k, this.bagFill, t, { glow: this.bagGlow || 0, shake: this.bagShake });
        if (!this.paydayAnim) {
          const left = ps.left;
          ctx.fillStyle = 'rgba(8,2,10,0.82)'; ctx.beginPath(); ctx.roundRect(12, 290, 290, 96, 12); ctx.fill();
          ctx.strokeStyle = 'rgba(217,166,64,0.7)'; ctx.lineWidth = 2; ctx.stroke();
          A.label(ctx, left <= 1 ? '今日が給料日' : '給料日まであと' + left + 'G', BAG.x + 30, 316, 26, '#ffffff', 'center', '"Dela Gothic One", sans-serif');
          if (ps.need > 0) {
            A.label(ctx, 'あと金貨' + ps.need + '枚', BAG.x + 30, 358, 38, '#ffd34a', 'center', '"Dela Gothic One", sans-serif');
            // 1回で足りる役
            const coin = MK.CFG.NORMAL.gold.coin;
            const times = Math.ceil(ps.need / coin);
            if (times <= 2) {
              ctx.save(); ctx.translate(BAG.x + 118, 442); ctx.scale(0.62, 0.62); ctx.translate(-75, -41);
              A.symbol(ctx, 'COIN', 150, 82); ctx.restore();
              A.label(ctx, times === 1 ? '1回で足りる' : '2回で足りる', BAG.x + 118, 482, 17, '#ffe08a', 'center');
            }
          }
        }
        ctx.restore();
      }
      // 辞表のゴブリン（手前）
      if (this.fg) this.drawRisk(ctx, t);
      naviHud(ctx, t);
      if (MK.Game.cur && MK.Game.cur.payNavi) A.label(ctx, '給料日ナビ', W / 2, H - 162, 18, '#7dffb0', 'center');
      perkRow(ctx, 30, 122);
    }
    drawRisk(ctx, t) {
      const f = this.fg, a = f.a;
      A.monster(ctx, a, t);
      const hx = a.x - 26, hy = a.y - 58 * a.s;
      if (f.state === 'hold') {
        const p = U.ease.outBack(U.clamp(f.p / 0.5, 0, 1));
        C.letter(ctx, hx, hy + Math.sin(t * 3) * 2, 1.1 * p, -0.15);
      } else if (f.state === 'pocket') {
        const p = U.clamp(f.p / 0.7, 0, 1);
        C.letter(ctx, U.lerp(hx, a.x + 4, p), U.lerp(hy, a.y - 40 * a.s, p), 1.1 * (1 - p), U.lerp(-0.15, 1.2, p));
        if (f.p > 0.6) A.label(ctx, '…', a.x, a.y - 130, 22, '#ffffff', 'center');
      } else if (f.state === 'quit') {
        const p = U.clamp(f.p / 0.45, 0, 1);
        const e = U.ease.outBack(p);
        ctx.save(); ctx.globalAlpha = 1 - U.seg(f.p, 1.6, 2.0);
        C.letter(ctx, U.lerp(hx, W / 2, e), U.lerp(hy, 250, e), U.lerp(1.1, 5, e), U.lerp(-0.15, -0.05, e), { stamp: true });
        ctx.restore();
      }
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      const roll = Math.random();
      if (r >= 3 || (r >= 1 && roll < 0.35) || (r === 0 && roll < 0.04)) {
        this.actors.forEach((a) => { a.tx = null; setAnim(a, 'cheer', 0.8); });
        MK.Audio.play('coin');
      }
      if (r >= 2 && (roll < 0.6 || r >= 3)) {
        MK.Audio.play('magic');
        FX.add({ dur: 1.4, layer: 'back', draw(ctx, p, age) {
          ctx.globalAlpha = Math.sin(p * Math.PI);
          FX.magicCircle(ctx, W / 2, 480, 260, age * 2, r >= 3 ? 'rgba(255,60,80,1)' : 'rgba(160,110,255,1)', { tilt: 0.25 });
        } });
      }
      if (r >= 3 && roll < 0.7) setTimeout(() => FX.cutin({ text: 'む…この気配は！？', size: 54, drawChar: (c, x, y, a) => A.maou(c, x, y, 0.9, a, 'shock'), dur: 1.3 }), 300);
      if (r >= 3) MK.Reels.setAllLight(0.25);
    }
    result(res) {
      const gain = res.goldGain;
      const toBag = this.bagShow > 0.3 || res.payday;
      const [vx, vy] = localToScreen(-140, -40);
      if (gain > 0) {
        FX.P.coins(W / 2, 470, toBag ? BAG.x : vx, toBag ? BAG.y - 80 : vy, Math.min(12, 2 + gain * 2));
        setTimeout(() => MK.Audio.play('coin'), 450);
        popNumber(toBag ? BAG.x + 60 : vx, toBag ? 300 : vy - 30, '+' + gain + '枚', { size: 28 });
      }
      const label = MK.CFG.ROLES[res.role].rare ? MK.CFG.ROLES[res.role].label : null;
      if (label) FX.slam(label + '!!', { size: 60, y: 220, palette: MK.CFG.ROLES[res.role].rare >= 3 ? 'blood' : 'gold', dur: 1.1, shake: 6 });
      MK.Reels.setAllLight(1);
    }
    // 給料日の支払い（成立役と実際の収支に連動）
    async payday(info) {
      const wait = MK.wait;
      if (!info.dramatic) {
        // 余裕の回は短く
        MK.Audio.play('coin');
        FX.add({ dur: 1.1, layer: 'top', draw(ctx, p, age) {
          ctx.globalAlpha = Math.min(1, age * 5) * (1 - U.seg(p, 0.75, 1));
          A.panel(ctx, W / 2 - 150, 112, 300, 48, { color: info.ok ? '#7dffb0' : '#ff4040' });
          A.label(ctx, info.ok ? '給料日　支払い完了　−' + info.wage + '枚' : '給料が払えない…', W / 2, 136, 18, '#ffffff', 'center');
        } });
        if (info.ok) { await wait(900); return; }
      }
      this.paydayAnim = true;
      if (!this.fg) this.enterRisk();
      this.bagShow = Math.max(this.bagShow, 0.6);
      if (info.insured) this.say('魔物保険で支払い', 2.5);
      if (info.ok) {
        // 給料袋が満ちる → 辞表をポケットへ
        this.bagFillTarget = 1;
        await wait(500);
        this.bagGlow = 1;
        MK.Audio.play('levelup');
        FX.P.burst(BAG.x, BAG.y - 60, 30, 'rgba(255,220,100,0.9)', 260);
        await wait(500);
        this.pocket();
        await wait(1300);
        this.bagGlow = 0;
      } else {
        // 足りない → 本当に提出
        this.bagFillTarget = Math.min(0.95, info.vault / Math.max(1, info.wage));
        this.bagShake = true;
        await wait(700);
        this.bagShake = false;
        if (this.fg) {
          this.fg.state = 'quit'; this.fg.p = 0;
          await wait(350);
          MK.Audio.play('hit'); FX.shake(10);
          await wait(1300);
          this.fg.state = 'out'; this.fg.a.tx = W + 140; this.fg.a.speed = 110;
          const m = MK.CFG.MONSTERS[this.fg.a.type];
          this.say(m.name + '　退職', 2.5);
          MK.Audio.play('lose');
          await wait(900);
        }
      }
      this.bagFillTarget = null;
      this.paydayAnim = false;
      this.bagShow = 0;
    }
    hire(m) {
      this.sync();
      const a = this.actors.find((x) => x.id === m.id);
      if (a) {
        const [sx, sy] = localToScreen(a.x, a.y - 30);
        FX.P.burst(sx, sy, 24, 'rgba(160,110,255,0.9)', 200);
        setAnim(a, 'cheer', 1.2);
      }
      FX.add({ dur: 1.6, layer: 'top', draw(ctx, p, age) {
        ctx.globalAlpha = Math.min(1, age * 4) * (1 - U.seg(p, 0.8, 1));
        A.panel(ctx, W / 2 - 160, 150, 320, 56, { color: '#7dffb0' });
        A.label(ctx, MK.CFG.MONSTERS[m.type].name + ' 入社　給料 ' + MK.CFG.MONSTERS[m.type].wage + '枚/期', W / 2, 178, 19, '#ffffff', 'center');
      } });
      MK.Audio.play('levelup');
    }
    invest(kind) {
      if (kind !== 'castle') return;
      const S = MK.S;
      MK.Audio.play('build');
      this.flash[S.castleLv] = 1.4;
      const r = C.roomRect(S.castleLv);
      const [sx, sy] = localToScreen(0, (r.y0 + r.y1) / 2);
      FX.P.smoke(sx, sy + 20, 14, 1.5, 'rgba(160,140,150,0.6)', 'front');
      FX.P.burst(sx, sy, 40, 'rgba(255,220,140,0.9)', 360, 26);
      FX.flash('#ffffff', 0.5); FX.shake(10);
      FX.slam(C.ROOMS[S.castleLv].name + ' 開設!!', { y: 200, size: 64, sub: '城Lv' + S.castleLv + '「' + MK.CFG.CASTLE.names[S.castleLv] + '」', palette: 'violet' });
      setTimeout(() => this.sync(), 300);
    }
  }

  // ---------- CZ：勇者襲来 ----------
  class CZScene extends Scene {
    enter() {
      const S = MK.S;
      this.actors = [];
      // 新人（経営判断で雇った魔物）は必ず並べる
      const rec = S.monsters.filter((m) => m.recruit);
      const rest = S.monsters.filter((m) => !m.recruit).sort((a, b) => MK.CFG.MONSTERS[b.type].power - MK.CFG.MONSTERS[a.type].power);
      const line = rest.slice(0, Math.max(0, 6 - rec.length)).concat(rec).slice(0, 6);
      line.forEach((m, i) => {
        this.actors.push(actor({ id: m.id, type: m.type, lv: m.lv, x: 90 + (i % 3) * 100 + (i >= 3 ? 50 : 0), y: i >= 3 ? 510 : 462, s: m.type === 'dragon' ? 0.8 : 1.0, face: 1, badge: true, recruit: !!m.recruit }));
      });
      this.hero = actor({ kind: 'hero', type: 'hero', x: 1050, y: 480, s: 1.35, face: -1, tx: 740, speed: 260 });
      this.party = [
        actor({ kind: 'hero', type: 'warrior', x: 1120, y: 440, s: 0.95, face: -1, tx: 860, speed: 240 }),
        actor({ kind: 'hero', type: 'mage', x: 1160, y: 515, s: 0.95, face: -1, tx: 900, speed: 240 }),
      ];
      this.actors.push(this.hero, ...this.party);
      this.hpShown = S.cz.hp; this.hpT = S.cz.hp;
      MK.Audio.bgm('cz');
    }
    update(dt) {
      super.update(dt);
      if (Math.random() < dt * 14) FX.P.embers(W, H, 1, 'rgba(255,80,30,0.9)', 'back');
      if (Math.random() < dt * 3) FX.P.smoke(U.rand(0, W), H - 40, 1, 1.5, 'rgba(40,10,10,0.5)', 'back');
      if (!this.animating) this.hpT = MK.S.cz.hp;
      this.hpShown += (this.hpT - this.hpShown) * Math.min(1, dt * 6);
      if (Math.abs(this.hpT - this.hpShown) < 0.4) this.hpShown = this.hpT;
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'cz', t);
      ctx.save(); ctx.globalAlpha = 0.85; C.section(ctx, { x: 150, y: 430, s: 0.4 }, MK.S.castleLv, t, { vault: MK.S.gold, floors: Math.min(6, MK.S.castleLv + 1) }); ctx.restore();
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
      this.actors.forEach((a) => { if (a.leader && a.anim !== 'down') crown(ctx, a.x, a.y - (a.type === 'dragon' ? 150 : a.type === 'imp' ? 120 : 100) * a.s - 22, 1.1); });
    }
    drawHud(ctx, t) {
      const S = MK.S;
      // 主役：勇者の残りHP（上段中央・大）
      const hpw = 600, hx = W / 2 - hpw / 2;
      A.panel(ctx, hx - 14, 10, hpw + 28, 86, { color: '#ff6a5a' });
      A.label(ctx, '勇者アルス', hx + 4, 32, 18, '#ffd0d0');
      A.num(ctx, Math.max(0, Math.ceil(this.hpShown)), hx + hpw, 32, 30, 'gold', 'right');
      const v = this.hpShown / S.cz.maxHp;
      A.bar(ctx, hx, 54, hpw, 30, v, v < 0.25 ? ['#ffd04a', '#ff2020'] : ['#7aff9a', '#1a8a3a']);
      // 残りG（左・大）
      const left = Math.max(0, MK.Game.czGames() - S.cz.game + 1);
      A.panel(ctx, 14, 108, 170, 92, { color: '#e04040' });
      A.label(ctx, '残り', 30, 134, 18, '#ff9a9a');
      A.num(ctx, left + 'G', 30, 172, 50, left <= 2 ? 'blood' : 'gold');
      A.label(ctx, '勇者襲来', W - 24, 136, 30, '#ff8a7a', 'right', '"Dela Gothic One", sans-serif');
      if (S.cz.leader) {
        const L = MK.CFG.LEADERS[S.cz.leader];
        A.panel(ctx, 14, 210, 250, 54, { color: '#ffd34a' });
        crown(ctx, 36, 237, 0.9);
        A.label(ctx, MK.CFG.MONSTERS[S.cz.leader].name + '隊長', 56, 228, 16, '#ffe08a');
        A.label(ctx, L.text, 56, 250, 15, '#ffffff');
      }
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 2) { MK.Audio.play('magic'); FX.add({ dur: 1.2, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, 250, 480, 200, age * 3, 'rgba(255,60,60,1)', { tilt: 0.3 }); } }); }
    }
    setLeader(type) {
      this.actors.forEach((a) => { a.leader = false; });
      const a = this.actors.find((x) => x.kind === 'monster' && x.type === type && !x.recruit) || this.actors.find((x) => x.kind === 'monster' && x.type === type);
      if (a) { a.leader = true; setAnim(a, 'cheer', 1); FX.P.burst(a.x, a.y - 60, 24, 'rgba(255,210,90,0.9)', 220); }
      MK.Audio.play('levelup');
    }
    async strike(atk, dmg, big, color) {
      const hx = this.hero.x, hy = this.hero.y - 70;
      if (atk.type === 'dragon') {
        setAnim(atk, 'attack', 0.8); breath(atk.x + 80, atk.y - 120, hx, hy); await MK.wait(350);
      } else if (atk.type === 'imp') {
        setAnim(atk, 'attack', 0.5); MK.Audio.play('magic');
        await projectile(atk.x + 20, atk.y - 80, hx, hy, 'rgba(200,120,255,0.9)');
      } else {
        const home = atk.x; atk.speed = 1200; atk.lockFace = true; atk.tx = hx - 75;
        await until(() => atk.tx == null, 0.8);
        setAnim(atk, 'attack', 0.5); await MK.wait(150);
        slashFx(hx, hy, color);
        atk._home = home;
      }
      hitFx(hx, hy, big);
      setAnim(this.hero, 'hurt', 0.45);
    }
    async back(atk) {
      if (atk._home == null) return;
      atk.tx = atk._home; atk._home = null;
      await until(() => atk.tx == null, 1);
      atk.speed = 70; atk.lockFace = false; atk.face = 1;
    }
    async attack(info) {
      this.animating = true;
      const list = this.actors.filter((a) => a.kind === 'monster' && !a.recruit);
      const pool = list.length ? list : this.actors.filter((a) => a.kind === 'monster');
      const big = info.dmg >= 30;
      // 第3停止：味方の攻撃
      if (pool.length && info.dmg > 0) {
        const leader = this.actors.find((a) => a.leader);
        const boosted = MK.Game.leaderMult(info.role, true) > 1 && leader;
        const atk = boosted ? leader : big ? pool.reduce((a, b) => (MK.CFG.MONSTERS[b.type].power > MK.CFG.MONSTERS[a.type].power ? b : a)) : U.pick(pool);
        if (boosted) FX.add({ dur: 0.8, layer: 'front', draw(ctx, p) { ctx.globalAlpha = 1 - p; FX.fancyText(ctx, '隊長!!', atk.x, atk.y - 140 * atk.s - p * 20, 30, { palette: 'gold' }); } });
        await this.strike(atk, info.dmg, big);
        this.hpT = info.hp1;
        popNumber(this.hero.x, this.hero.y - 130, String(info.dmg) + (info.crit ? '!!' : ''), { size: big ? 64 : 46, palette: info.crit ? 'blood' : 'gold' });
        if (info.crit) FX.slam('CRITICAL!!', { y: 230, size: 56, palette: 'blood', dur: 0.8, sfx: false });
        this.back(atk);
      }
      // 一拍おいて、新人の追撃
      if (info.follow) {
        await MK.wait(info.follow.kill ? 650 : 420);
        const nw = this.actors.find((a) => a.id === info.follow.id);
        if (nw) {
          FX.add({ dur: 0.5, layer: 'front', draw(ctx, p) { ctx.globalAlpha = 1 - p; FX.fancyText(ctx, '!', nw.x, nw.y - 130 * nw.s - p * 10, 40, { palette: 'gold' }); } });
          MK.Audio.play('coin');
          await MK.wait(180);
          await this.strike(nw, info.follow.dmg, info.follow.kill, 'rgba(140,255,170,0.95)');
          this.hpT = info.hp2;
          popNumber(this.hero.x + 40, this.hero.y - 160, '追撃 ' + info.follow.dmg, { size: 40, palette: 'ice' });
          if (info.follow.kill) {
            // 追撃で倒し切ったときだけの専用カット
            await MK.wait(250);
            FX.cutin({ text: '新人の追撃!!', size: 74, palette: 'gold', color: '#1a6a3a', dur: 1.5,
              drawChar: (c, x, y, a) => A.monster(c, { type: nw.type, x, y: y - 20, s: 3.0, face: 1, anim: 'attack', at: (a * 1.2) % 0.6, lv: nw.lv }, a) });
            await MK.wait(1500);
          }
          this.back(nw);
        }
      }
      await MK.wait(250);
      this.animating = false;
    }
  }

  // ---------- AT：魔王経営RUSH ----------
  class ATScene extends Scene {
    enter(opt = {}) {
      this.actors = [];
      this.geo = C.fitGeo(MK.S.castleLv, { x: 640, bottom: 470, h: 340, maxS: 0.95 });
      this.flash = {};
      this.sync();
      MK.Audio.bgm('at');
    }
    // 今セットでいちばん育っている魔物
    mvp() {
      const S = MK.S, at = S.at;
      let best = null, bx = -1;
      S.monsters.forEach((m) => { const e = at.setExp[m.id] || 0; if (e > bx || (e === bx && m.recruit)) { bx = e; best = m; } });
      return best;
    }
    sync() {
      const S = MK.S;
      const ids = new Set(S.monsters.map((m) => m.id));
      this.actors = this.actors.filter((a) => ids.has(a.id));
      S.monsters.forEach((m, i) => {
        let a = this.actors.find((x) => x.id === m.id);
        if (!a) {
          a = actor({ id: m.id, type: m.type, x: U.rand(340, 900), y: U.rand(492, 520), s: m.type === 'dragon' ? 0.6 : 0.72, badge: true, face: U.pick([-1, 1]) });
          this.actors.push(a);
        }
        a.lv = m.lv; a.recruit = !!m.recruit;
      });
    }
    update(dt) {
      super.update(dt);
      const g = C.fitGeo(MK.S.castleLv, { x: 640, bottom: 470, h: 340, maxS: 0.95 });
      this.geo.s += (g.s - this.geo.s) * Math.min(1, dt * 2); this.geo.floors = g.floors;
      for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt * 0.8);
      const m = this.mvp();
      this.actors.forEach((a) => {
        a.hidden = m && a.id === m.id;
        if (a.tx == null && a.anim === 'idle' && Math.random() < dt * 0.35) { a.tx = U.clamp(a.x + U.rand(-160, 160), 330, 910); a.speed = U.rand(60, 110); }
      });
      if (Math.random() < dt * 8) FX.P.embers(W, H, 1, U.pick(['rgba(255,200,80,0.9)', 'rgba(200,120,255,0.9)']), 'back');
      MK.S.goldShown += (MK.S.gold - MK.S.goldShown) * Math.min(1, dt * 6);
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'at', t);
      FX.rays(ctx, 640, 200, 520, t * 0.15, 'rgba(255,200,255,0.12)', 16, 0.06);
      C.section(ctx, this.geo, MK.S.castleLv, t, { vault: MK.S.goldShown, flash: this.flash, floors: this.geo.floors });
      FX.drawLayer(ctx, 'back');
      drawActors(ctx, this.actors, t);
    }
    drawHud(ctx, t) {
      const S = MK.S, at = S.at;
      rushBanner(ctx, '魔王経営RUSH', 'gold', t);
      A.label(ctx, 'SET ' + at.set + '　撃退 ' + at.wins + '回', 28, 90, 18, '#ffe7c0');
      perkRow(ctx, 340, 160);
      // 残りG
      A.panel(ctx, 744, 14, 200, 92, { color: '#ffd34a' });
      A.label(ctx, '継続ジャッジまで', 760, 34, 15, '#e8c87a');
      A.num(ctx, at.left, 900, 72, 54, 'gold', 'right');
      A.label(ctx, 'G', 928, 80, 20, '#ffe08a', 'right');
      // 主役：今セットで育っている魔物
      const m = this.mvp();
      if (m) {
        const px = 16, py = 118, pw = 290, ph = 330;
        A.panel(ctx, px, py, pw, ph, { color: '#ffd34a', bg: ['rgba(50,14,40,0.88)', 'rgba(10,2,14,0.92)'] });
        A.label(ctx, '今セットの育成 No.1', px + pw / 2, py + 22, 17, '#ffe08a', 'center');
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(FX.glow('rgba(255,200,90,0.55)', 128), px + 20, py + 40, pw - 40, 230);
        FX.rays(ctx, px + pw / 2, py + 170, 160, t * 0.5, 'rgba(255,220,140,0.25)', 10, 0.08);
        ctx.restore();
        const d = MK.CFG.MONSTERS[m.type];
        A.monster(ctx, { type: m.type, x: px + pw / 2, y: py + 246, s: m.type === 'dragon' ? 1.1 : 1.75, face: 1, anim: 'idle', lv: m.lv, seed: m.id }, t);
        const lv0 = at.lvStart[m.id] || 1;
        A.label(ctx, (m.recruit ? '新人 ' : '') + d.name, px + pw / 2, py + 270, 21, m.recruit ? '#7dffb0' : '#ffffff', 'center');
        FX.fancyText(ctx, 'Lv' + lv0 + (m.lv > lv0 ? ' → Lv' + m.lv : ''), px + pw / 2, py + 302, 30, { palette: m.lv > lv0 ? 'gold' : 'silver' });
      }
      // 戦力比較
      const army = MK.Game.armyPower(), party = MK.Game.partyPower();
      const bx = 330, by = 116, bw = 400;
      A.label(ctx, '魔王軍 ' + army.toFixed(1), bx, by, 16, '#ffb0e0');
      A.label(ctx, party.toFixed(1) + ' 勇者一行', bx + bw, by, 16, '#9fe8ff', 'right');
      const ratio = army / (army + party);
      ctx.fillStyle = '#2a8ad8'; ctx.fillRect(bx, by + 12, bw, 14);
      ctx.fillStyle = A.lg(ctx, 0, by + 12, 0, by + 26, ['#ff9ad0', '#a01a6a']); ctx.fillRect(bx, by + 12, bw * ratio, 14);
      ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * ratio - 1, by + 8, 3, 22);
      bottomHud(ctx, S, [['獲得', U.fmt(at.totalWin) + '枚'], ['金庫', U.fmt(S.goldShown) + '枚'], ['城', 'Lv' + S.castleLv], ['魔物', S.monsters.length + '体']]);
      naviHud(ctx, t);
    }
    lever(info) {
      const r = MK.CFG.ROLES[info.role].rare || 0;
      if (r >= 1) {
        MK.Audio.play('magic');
        FX.add({ dur: 1.2, layer: 'back', draw(ctx, p, age) { ctx.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(ctx, 620, 470, 300, age * 3, r >= 3 ? 'rgba(255,200,60,1)' : 'rgba(200,120,255,1)', { tilt: 0.25 }); } });
      }
    }
    posOf(m) {
      const mv = this.mvp();
      if (mv && m.id === mv.id) return [16 + 145, 118 + 246, 1.75];
      const a = this.actors.find((x) => x.id === m.id);
      return a ? [a.x, a.y, a.s] : [W / 2, 500, 0.8];
    }
    result(res) {
      if (res.pay > 0 && res.outcome === 'coin') FX.P.coins(W / 2, 330, 330, H - 20, 6);
      if (res.expTo) {
        const [x, y, s] = this.posOf(res.expTo);
        FX.P.rise(x, y - 20, 24 * s, 6 + Math.min(20, res.exp), 'rgba(140,220,255,0.9)');
        popNumber(x, y - 100 * s, 'EXP+' + res.exp, { size: 24, palette: 'ice' });
      }
      if (res.add) {
        FX.slam('+' + res.add + 'G', { y: 250, size: 110, palette: 'blood', sub: '継続ジャッジまでのG数 上乗せ', glow: 'rgba(255,60,30,0.8)' });
        FX.P.burst(840, 60, 40, 'rgba(255,200,60,0.9)', 300);
      } else if (MK.CFG.ROLES[res.role].rare) {
        FX.slam(MK.CFG.ROLES[res.role].label + '!!', { size: 60, y: 260, dur: 1.0, shake: 5 });
      }
    }
    levelup(m) {
      const a = this.actors.find((x) => x.id === m.id);
      if (a) { a.lv = m.lv; setAnim(a, 'cheer', 1); }
      const [x, y, s] = this.posOf(m);
      MK.Audio.play('levelup');
      FX.P.rise(x, y, 30 * s, 30, 'rgba(255,220,100,0.9)');
      FX.add({ dur: 1.2, layer: 'top', draw(ctx, p, age) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - p;
        ctx.drawImage(FX.glow('rgba(255,220,120,0.8)', 128), x - 80 * s, y - 150 * s, 160 * s, 170 * s);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - U.seg(p, 0.7, 1);
        FX.fancyText(ctx, 'LEVEL UP!', x, y - 120 * s - age * 20, 28, { palette: 'gold' });
      } });
    }
    hire(m) {
      this.sync();
      const a = this.actors.find((x) => x.id === m.id);
      if (a) { a.x = 640; a.y = 505; a.tx = U.rand(340, 900); FX.P.burst(640, 460, 30, 'rgba(160,110,255,0.9)', 260); }
      FX.slam(MK.CFG.MONSTERS[m.type].name + ' 入社!!', { y: 240, size: 56, palette: 'violet', dur: 1.3 });
      MK.Audio.play('levelup');
    }
    invest(kind) {
      if (kind !== 'castle') return;
      MK.Audio.play('build');
      this.flash[MK.S.castleLv] = 1.4;
      FX.P.burst(640, 280, 50, 'rgba(255,200,255,0.9)', 420, 30);
      FX.flash('#ffffff', 0.6); FX.shake(12);
      FX.slam(C.ROOMS[MK.S.castleLv].name + ' 開設!!', { y: 220, size: 64, sub: '城Lv' + MK.S.castleLv + '「' + MK.CFG.CASTLE.names[MK.S.castleLv] + '」', palette: 'violet' });
    }
  }

  // ---------- 継続ジャッジ：自動戦闘 ----------
  class JudgeScene extends Scene {
    enter(opt = {}) {
      const S = MK.S;
      this.variant = opt.variant || 'at'; // at | upper
      this.actors = [];
      const mvp = this.variant === 'at' && MK.LCD.scenes.at.mvp ? MK.LCD.scenes.at.mvp() : null;
      const ms = S.monsters.slice().sort((a, b) => (b === mvp) - (a === mvp) || MK.Game.monsterPower(b) - MK.Game.monsterPower(a)).slice(0, 5);
      ms.forEach((m, i) => {
        this.actors.push(actor({ id: m.id, type: m.type, lv: m.lv, recruit: !!m.recruit, x: -80 - i * 60, tx: 90 + (i % 3) * 100 + (i >= 3 ? 50 : 0), y: i >= 3 ? 505 : 450, s: m.type === 'dragon' ? 0.75 : 0.9, speed: 300, face: 1, badge: true, side: 'm' }));
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
          // 今セットで育った魔物の見せ場
          const mv = this.variant === 'at' && MK.LCD.scenes.at.mvp ? MK.LCD.scenes.at.mvp() : null;
          if (mv) {
            const d = MK.CFG.MONSTERS[mv.type];
            FX.cutin({ text: d.name + ' Lv' + mv.lv + 'の一撃!!', sub: mv.recruit ? '新人' : null, size: 58, palette: 'gold', color: '#5a1a6a', dur: 1.5,
              drawChar: (c, x, y, a) => A.monster(c, { type: mv.type, x, y: y - 20, s: mv.type === 'dragon' ? 1.8 : 3.0, face: 1, anim: 'attack', at: (a * 1.2) % 0.6, lv: mv.lv }, a) });
          } else {
            FX.cutin({ text: '魔王軍 総攻撃!!', size: 64, palette: 'violet', drawChar: (c, x, y, a) => A.maou(c, x, y, 0.95, a, 'laugh'), dur: 1.4 });
          }
          await MK.wait(1450);
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
  const REGION_NAMES = ['最初の村', '鉄鉱山', '学術都市', '穀倉地帯', '交易都市', '鉄壁要塞', '漁村', '聖堂', '大森林', '古戦場', '砂漠の砦', '王都'];
  const SPECIAL_REGIONS = [0, 5, 11];
  class UpperScene extends Scene {
    enter(opt = {}) {
      this.zoom = opt.intro ? 0 : 1;
      this.popT = {};
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
      if (this.zoom < 1) this.zoom = Math.min(1, this.zoom + dt / 1.4);
      if (Math.random() < dt * 12) FX.P.embers(W, H, 1, U.pick(['rgba(255,120,40,0.9)', 'rgba(255,200,60,0.9)']), 'back');
      // 制圧済みの街から煙
      MK.S.upper.regions.forEach((v, i) => { if (v >= 100 && Math.random() < dt * 1.5) FX.P.smoke(REGION_POS[i][0], REGION_POS[i][1] - 10, 1, 0.5, 'rgba(40,10,10,0.5)', 'back'); });
    }
    drawWorld(ctx, t) {
      A.background(ctx, W, H, 'upper', t);
      FX.rays(ctx, W / 2, 250, 700, t * 0.1, 'rgba(255,120,40,0.1)', 12, 0.08);
      // 昇格直後：城門の前（地図の左端）からカメラが引く
      const z = U.lerp(3.2, 1, E.inOutCubic(this.zoom));
      ctx.save();
      ctx.translate(160, 300); ctx.scale(z, z); ctx.translate(-160, -300);
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
        if (done) { const pt = this.popT[i]; const pop = pt == null ? 1 : E.outElastic(U.clamp((t - pt) / 0.8, 0, 1)); C.flag(ctx, x + 6, y - 8, 1.1, t, pop); }
        const sp = SPECIAL_REGIONS.includes(i);
        A.label(ctx, REGION_NAMES[i], x, y + 16, sp ? 15 : 13, done ? '#ff8a8a' : sp ? '#ffe08a' : '#f3e2b0', 'center');
      });
      FX.drawLayer(ctx, 'back');
      // ドラゴン飛行
      ctx.save(); ctx.globalAlpha = 0.85;
      A.monster(ctx, { type: 'dragon', x: this.dragon.x, y: this.dragon.y + Math.sin(t * 2) * 10, s: 0.5, face: 1, anim: 'idle', lv: 9 }, t);
      ctx.restore();
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
    async conquer(info) {
      const [x, y] = REGION_POS[info.region];
      FX.P.fire(x, y, 6, 0.8);
      FX.P.sparks(x, y - 10, 8, '#ffb347', 300);
      popNumber(x, y - 40, '+' + info.gain + '%', { size: 24, palette: 'blood' });
      if (!info.captured) return;
      this.popT[info.region] = this.t;
      MK.Audio.play('coin');
      if (SPECIAL_REGIONS.includes(info.region)) {
        await MK.wait(300);
        await MK.Seq.regionSpecial(info.region);
      } else {
        FX.P.burst(x, y - 20, 24, 'rgba(255,90,60,0.9)', 220);
        MK.Audio.play('hit');
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
      if (MK.Game.choice) choiceCards(ctx, t, MK.Game.choice);
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
  LCD.helpers = { SPECIAL_REGIONS, actor, setAnim, until, popNumber, hitFx, slashFx, projectile, breath, topY, REGION_POS, REGION_NAMES };
  MK.LCD = LCD;
})(window.MK);
