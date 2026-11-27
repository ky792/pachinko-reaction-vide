/* ==========================================================
 * 魔王経営記 v2（魂札リール）― 進行・画面・操作
 * 画面 720x1280（縦持ち）：上 0-80 状態バー / 80-690 場面 / 690-1280 スロット台
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, E = U.ease, FX = MK.FX, A = MK.Art, A2 = MK.Art2, D = MK.D, M = MK.Machine, C = MK.Castle;
  const W = 720, H = 1280, SY = 80, SH = 610;
  const RX = [24, 248, 472], RW = 212, CELL = 80, RY = 790; // リール窓
  MK.LCD = { W, H: SH }; // 演出部品（FX）用の画面サイズ

  // ---------- 状態 ----------
  let S;
  function newRun() {
    M.init(D.START_STRIPS);
    S = {
      phase: 'night', night: 1, mana: D.BASE.mana, gold: D.BASE.gold, shards: 0,
      dignity: 3, relics: {}, fac: { furnace: 0, eyeRoom: 0, barrack: 0 },
      tier: 0, cleared: [], bet: 1, eyes: 0, eyeBlocked: 0, auto: !!(MK.v2Auto),
      tutorial: 0, hints: {}, battle: null, choice: null, overlay: null, burnMode: false,
      log: [], lastResult: null, payday: null, oldest: [],
    };
    S.eyes = maxEyes();
    hint('lever', 'レバーを叩いて、謎の台を回せ');
  }
  const maxMana = () => D.BASE.mana + 2 * S.fac.furnace + (S.relics.mana ? 3 : 0);
  const maxEyes = () => D.BASE.eye + S.fac.eyeRoom + (S.relics.eye ? 1 : 0);
  const maxMorale = () => D.BASE.morale + 4 * S.fac.barrack + (S.relics.morale ? 5 : 0);
  const facLv = () => S.fac.furnace + S.fac.eyeRoom + S.fac.barrack;
  const setting = () => U.clamp(1 + Math.floor(facLv() / 1.4) + Math.floor(S.cleared.length / 2), 1, 6);
  const form = () => (S.cleared.length >= 4 || facLv() >= 5 ? 2 : S.cleared.length >= 1 || facLv() >= 2 ? 1 : 0);
  const shardNeed = () => (S.relics.shard2 ? 2 : 3);
  const wages = () => M.monsters().reduce((s, t) => s + D.TILES[t.type].wage, 0);
  function hint(key, text) { if (S.hints[key]) return; S.hints[key] = true; S.hint = { text, t: U.now() }; }

  // ---------- UIボタン ----------
  let buttons = [], offY = 0;
  function btn(x, y, w, h, label, fn, opt = {}) { buttons.push({ x, y: y + offY, w, h, fn, label, opt }); drawButton(x, y, w, h, label, opt); }
  let ctx, canvas, dpr = 1;
  function drawButton(x, y, w, h, label, opt) {
    ctx.save();
    const on = opt.on, dis = opt.disabled;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, opt.r || 12);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    const c = opt.color || (on ? ['#ff8a4a', '#a8301a'] : ['#4a3a5a', '#1e1428']);
    g.addColorStop(0, dis ? '#2a2430' : c[0]); g.addColorStop(1, dis ? '#151018' : c[1]);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = on ? '#ffd9a0' : dis ? '#3a3040' : '#8a7aa0'; ctx.stroke();
    if (opt.pulse && !dis) { ctx.globalAlpha = 0.4 + 0.4 * Math.sin(U.now() * 6); ctx.lineWidth = 4; ctx.strokeStyle = '#ffe08a'; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.fillStyle = dis ? '#6a6070' : '#fff';
    ctx.font = `${opt.size || 22}px "Dela Gothic One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = String(label).split('\n');
    lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * (opt.size || 22) * 1.15));
    ctx.restore();
  }
  function txt(t, x, y, size = 20, color = '#fff', align = 'left', font = '"Dela Gothic One", sans-serif') {
    ctx.save(); ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.18; ctx.strokeStyle = '#0a0206'; ctx.strokeText(t, x, y);
    ctx.fillStyle = color; ctx.fillText(t, x, y); ctx.restore();
  }
  function body(t, x, y, size = 18, color = '#f3e6d0', align = 'left') { txt(t, x, y, size, color, align, '"Shippori Mincho B1", serif'); }

  // ---------- 回転 ----------
  let spinning = false;
  const spinCost = () => (S.phase === 'battle' ? S.bet - 1 : S.bet);
  function canSpin() {
    if (spinning || S.choice || S.overlay) return false;
    if (S.phase === 'battle') return S.battle && S.battle.spins > 0 && S.mana >= spinCost();
    return S.phase === 'night' && S.mana >= S.bet;
  }
  async function lever() {
    if (!canSpin()) { if (S.mana < spinCost() && S.bet > 1) S.bet = Math.max(1, S.bet - 1); return; }
    MK.Audio.unlock();
    spinning = true;
    S.mana -= spinCost();
    if (S.phase === 'battle') S.battle.spins--;
    // 封印の残りを減らす
    M.allTiles().forEach((t) => { if (t.sealed > 0) t.sealed--; });
    M.advance(setting());
    M.reachMe = M.mood === 2 && Math.random() < 0.35;
    if (M.justBoomed) { M.justBoomed = false; boomFx(); }
    M.fake = false;
    S.phase === 'battle' && S.battle && S.battle.fakeNext && (M.fake = true, S.battle.fakeNext = false);
    MK.Audio.play('lever');
    if (M.mood >= 2 && Math.random() < 0.6) preFx();
    M.start();
    S.stopsLeft = 3;
    S.autoStopAt = U.now() + (S.auto || S.omakase ? 0.5 : 3.0);
    hint('stop', '下のリールをタップして止める（放っておいても止まる）');
  }
  function forcedRow() {
    // チュートリアル：最初の1回は欠片が3つ揃う
    if (S.tutorial === 0) return (i) => M.strips[i].findIndex((t) => t.type === 'shard');
    return null;
  }
  async function stopReel(i) {
    if (!M.spinning(i)) return;
    const f = forcedRow();
    MK.Audio.play('stop', 3 - S.stopsLeft);
    S.stopsLeft--;
    await M.stop(i, f ? f(i) : null);
    if (!M.anySpinning() && S.stopsLeft <= 0) afterStop();
  }
  function afterStop() {
    if (S.tutorial === 0) S.tutorial = 1;
    if (S.eyes > 0 && !S.eyeBlocked && !S.auto) { S.eyePhase = true; hint('eye', '魔眼：▲▼で止まったリールを1コマずらせる'); }
    else resolve();
  }
  async function useEye(i, d) {
    if (!S.eyePhase || S.eyes <= 0) return;
    S.eyes--;
    MK.Audio.play('magic');
    await M.shift(i, d);
    if (S.eyes <= 0) { S.eyePhase = false; resolve(); }
  }
  function confirmEye() { if (!S.eyePhase) return; S.eyePhase = false; resolve(); }

  // ---------- 判定 ----------
  function activeLines() {
    const L = [[0, 0, 0]];
    if (M.mood === 3) L.push([-1, -1, -1], [1, 1, 1]);
    if (S.relics.diag) L.push([-1, 0, 1], [1, 0, -1]);
    return L;
  }
  function evalLine(rows, inBattle, ctxR) {
    const tiles = rows.map((r, i) => M.tileAt(i, r));
    let atk = 0, gold = 0, shard = 0;
    const ev = [];
    const T = (t) => D.TILES[t.type];
    const engineer = tiles.some((t) => t.type === 'engineer' && !t.sealed && !t.asleep);
    const types = tiles.map((t) => t.type);
    const triple = types.every((x) => x === types[0]) && types[0] !== 'stone';
    const tribe = T(tiles[0]).tribe;
    const tribeTriple = !triple && tribe !== 'none' && tiles.every((t) => T(t).tribe === tribe);
    tiles.forEach((t, k) => {
      if (t.sealed > 0) { ev.push({ k, label: '封印中' }); return; }
      if (t.asleep) { ev.push({ k, label: 'zzz' }); return; }
      const d = T(t);
      let a = (d.atk || 0) + t.bonus + (d.atk ? t.lv - 1 : 0), g = d.gold || 0, sh = d.shard || 0;
      if (t.type === 'coin' && S.relics.coinAtk) a += 1;
      if (t.type === 'slime' && S.relics.split) a += 1;
      let label = '';
      switch (t.type) {
        case 'dice': a = U.randi(1, 6) + t.bonus; label = '🎲' + a; break;
        case 'bombslime': a = 6 + t.bonus; if (inBattle) t.asleep = true; label = '自爆!'; break;
        case 'bellcat': ctxR.moodUp++; label = 'チリン'; break;
        case 'bone': ctxR.shield++; label = '盾'; break;
        case 'knight': if (Math.random() < 0.1) { ev.push({ k, label: '裏切り…' }); return; } ctxR.shield++; break;
        case 'mandrake': ctxR.stun = true; label = '叫び!'; break;
        case 'mushroom': tiles.forEach((o) => { if (o !== t && D.TILES[o.type].tribe !== 'none') o.bonus++; }); label = '胞子'; break;
        default: break;
      }
      if (engineer && d.tribe === 'labor') { a *= 2; g *= 2; }
      atk += a; gold += g; shard += sh;
      ev.push({ k, atk: a, gold: g, shard: sh, label });
    });
    if (triple) {
      atk *= 2; gold *= 2; shard *= 2;
      tiles.forEach((t) => { if (D.TILES[t.type].tribe !== 'none') t.lv = Math.min(5, t.lv + 1); });
      if (types[0] === 'slime') ctxR.split++;
      if (types[0] === 'dragon') ctxR.dragonAll += 30;
      ctxR.triples++;
    }
    if (tribeTriple) { atk += 3; ctxR.resonance++; }
    return { rows, atk, gold, shard, triple, tribeTriple, ev, type: types[0] };
  }
  async function resolve() {
    const inBattle = S.phase === 'battle';
    const ctxR = { moodUp: 0, shield: 0, stun: false, split: 0, dragonAll: 0, triples: 0, resonance: 0 };
    const lines = activeLines().map((rows) => evalLine(rows, inBattle, ctxR));
    const mult = S.bet * (M.mood === 3 ? 2 : 1);
    let atk = 0, gold = 0, shard = 0;
    lines.forEach((l) => { atk += l.atk; gold += l.gold; shard += l.shard; });
    atk *= mult; gold *= mult; shard *= (M.mood === 3 ? 2 : 1); // 欠片はBETで増えない
    const res = { lines, atk, gold, shard, mult, ctxR };
    S.lastResult = { res, t: U.now() };
    // 表示
    lines.forEach((l) => l.ev.forEach((e) => {
      const x = RX[e.k] + RW / 2, y = RY + (l.rows[e.k] + 1) * CELL + CELL / 2;
      const parts = [];
      if (e.atk) parts.push('攻' + e.atk * mult);
      if (e.gold) parts.push('金' + e.gold * mult);
      if (e.shard) parts.push('魂' + e.shard * mult);
      const s = (e.label ? e.label + ' ' : '') + parts.join(' ');
      if (s) floatText(x, y - 20, s, '#ffe7a0');
    }));
    const big = lines.some((l) => l.triple);
    if (big) { MK.Audio.play('levelup'); sceneFx((c) => FX.slam(lines.find((l) => l.triple).type === 'shard' ? '魂の共鳴!!' : '3揃い 進化!!', { y: 200, size: 66, dur: 1.2, shake: 8 })); }
    else if (lines.some((l) => l.tribeTriple)) sceneFx(() => FX.slam('種族共鳴!!', { y: 200, size: 56, palette: 'violet', dur: 1.0, shake: 5 }));
    if (ctxR.moodUp) { for (let k = 0; k < ctxR.moodUp; k++) M.raise(); MK.Audio.play('coin'); }
    if (ctxR.split) { for (let k = 0; k < ctxR.split; k++) { const r = U.randi(0, 2); M.addTile(r, 'slime'); } floatText(W / 2, RY - 20, 'スライムが分裂した', '#9affd8'); }
    S.gold += gold;
    if (gold) MK.Audio.play('pay', Math.min(10, gold));
    S.shards += shard;
    if (inBattle) await battleResolve(res);
    else await nightResolve(res);
    spinning = false;
    S.eyes = S.eyePhaseUsed ? S.eyes : S.eyes;
    if (S.eyeBlocked > 0) S.eyeBlocked--;
  }

  // ---------- 夜：召喚の刻 ----------
  async function nightResolve(res) {
    if (res.atk > 0) floatText(W / 2, SY + 420, '（夜は攻撃しない）', '#9a8aa8');
    await MK.wait(300);
    for (let n = 0; n < 2 && S.shards >= shardNeed(); n++) { // 1回転で召喚は2回まで
      S.shards -= shardNeed();
      await summon();
    }
    if (S.mana <= 0) hint('nomana', '魔力が尽きた。「出陣」で勇者の土地へ攻め込もう');
  }
  function candidates() {
    const pool = D.SUMMONABLE.filter((t) => !(D.TILES[t].unique && M.allTiles().some((x) => x.type === t)));
    const out = [];
    while (out.length < 3) {
      const t = U.pick(pool);
      const r = D.TILES[t].rarity;
      if (Math.random() < [0, 1, 0.55, 0.15 + 0.05 * S.cleared.length][r] && !out.includes(t)) out.push(t);
    }
    if (S.tutorial === 1) { S.tutorial = 2; return ['slime', 'goblin', 'bellcat']; }
    return out;
  }
  async function summon() {
    MK.Audio.play('magic');
    sceneFx(() => {
      FX.add({ dur: 1.6, layer: 'top', draw(c, p, age) { c.globalAlpha = Math.sin(p * Math.PI); FX.magicCircle(c, W / 2, 330, 200, age * 3, 'rgba(120,220,255,1)', { tilt: 0.45 }); } });
      FX.flash('#bff0ff', 0.5);
    });
    await MK.wait(700);
    const cands = candidates();
    const k = await choose('召喚陣', cands.map((t) => ({ kind: 'tile', type: t, title: D.TILES[t].name, lines: [D.TILES[t].desc, '給料 ' + D.TILES[t].wage + '枚/3夜'] })));
    const type = cands[k];
    const reel = await chooseReel(D.TILES[type].name + 'をどのリールに入れる？');
    const t = M.addTile(reel, type);
    if (t) {
      MK.Audio.play('levelup');
      floatText(RX[reel] + RW / 2, RY - 10, D.TILES[type].name + ' 入隊', '#9affd8');
      S.joined = { type, t: U.now() };
      hint('joined', '揃うほど働く。同じ魔物3つで進化、同じ種族3つで共鳴');
    } else floatText(W / 2, RY - 10, 'リールがいっぱい', '#ff9a9a');
  }

  // ---------- 侵攻 ----------
  function goMap() { if (spinning || S.choice) return; S.phase = 'map'; S.burnMode = false; hint('map', '光っている土地を選んで攻め込む'); }
  function startBattle(node) {
    S.phase = 'battle';
    S.battle = {
      node, morale: maxMorale(), shield: 0, fakeNext: false, t0: U.now(), spins: D.BATTLE_SPINS,
      foes: node.foes.map((id, i) => ({ id, ...D.ENEMIES[id], hpMax: D.ENEMIES[id].hp, hp: D.ENEMIES[id].hp, step: 0, stun: false, x: 470 + i * 95 + (i % 2) * 20, y: SY + 400 + (i % 2) * 70, hurt: 0, anim: 'idle', at: 0 })),
    };
    S.eyes = maxEyes();
    M.allTiles().forEach((t) => { t.sealed = 0; t.asleep = false; });
    MK.Audio.play('alarm');
    sceneFx(() => FX.slam(node.name + ' 侵攻!!', { y: 230, size: 64, palette: 'blood', dur: 1.4 }));
    hint('battle', '勇者の頭上は「次の行動」。8回転以内に倒せ。BET2以上は魔力を使う');
  }
  function intentOf(f) { const p = f.pattern[f.step % f.pattern.length]; return { kind: p[0], n: p[1] }; }
  async function battleResolve(res) {
    const B = S.battle;
    B.shield += res.ctxR.shield;
    // こちらの攻撃（魔王の爪：毎回転の確定ダメージ）
    const claw = (1 + form()) * S.bet;
    let dmg = res.atk + claw;
    floatScene(160, SY + 430, '魔王の爪 ' + claw, '#d7b4ff');
    if (dmg > 0 || res.ctxR.dragonAll) {
      MK.Audio.play(dmg >= 10 ? 'explode' : 'hit');
      sceneFx(() => { FX.shake(dmg >= 10 ? 16 : 7); });
      B.attackT = U.now();
    }
    for (const f of B.foes) {
      if (f.hp <= 0) continue;
      if (res.ctxR.dragonAll) { f.hp -= res.ctxR.dragonAll; f.hurt = 1; }
    }
    for (const f of B.foes) {
      if (dmg <= 0) break;
      if (f.hp <= 0) continue;
      const d = Math.min(dmg, f.hp); f.hp -= d; dmg -= d; f.hurt = 1;
      sceneFx(() => { FX.P.sparks(f.x, f.y - 60 - SY, 16, '#fff1a0', 500); popAt(f.x, f.y - 120 - SY, String(d), 'gold'); });
    }
    if (res.ctxR.dragonAll) sceneFx(() => FX.slam('ジャックポット!!', { y: 220, size: 72, palette: 'rainbow', dur: 1.5 }));
    if (res.ctxR.stun) B.foes.forEach((f) => { if (f.hp > 0) f.stun = true; });
    await MK.wait(500);
    B.foes.forEach((f) => { if (f.hp <= 0 && !f.dead) { f.dead = true; MK.Audio.play('hit'); } });
    if (B.foes.every((f) => f.hp <= 0)) return battleWin();
    // 勇者側の行動
    for (const f of B.foes) {
      if (f.hp <= 0) continue;
      if (f.stun) { f.stun = false; floatScene(f.x, f.y - 140, '動けない!', '#9affd8'); f.step++; continue; }
      const it = intentOf(f);
      f.anim = 'attack'; f.at = 0;
      await MK.wait(260);
      if (it.kind === 'atk') {
        if (B.shield > 0) { B.shield--; floatScene(150, SY + 300, '盾で防いだ', '#bfe8ff'); }
        else { B.morale -= it.n; floatScene(150, SY + 300, '士気 −' + it.n, '#ff8a8a'); sceneFx(() => FX.shake(6)); MK.Audio.play('hit'); }
      } else if (it.kind === 'seal') {
        if (B.shield > 0) { B.shield--; floatScene(150, SY + 300, '封印を防いだ', '#bfe8ff'); }
        else {
          let best = null, bv = 0;
          M.allTiles().forEach((t) => { const v = (D.TILES[t.type].atk || 0) + t.bonus + t.lv + (D.TILES[t.type].wage || 0); if (!t.sealed && D.TILES[t.type].tribe !== 'none' && v > bv) { bv = v; best = t; } });
          if (best) { best.sealed = it.n + 1; floatText(W / 2, RY - 20, D.TILES[best.type].name + 'が封印された', '#ff9ad0'); MK.Audio.play('magic'); }
        }
      } else if (it.kind === 'heal') {
        const tgt = B.foes.filter((x) => x.hp > 0).sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
        if (tgt) { tgt.hp = Math.min(tgt.hpMax, tgt.hp + it.n); floatScene(tgt.x, tgt.y - 140, '+' + it.n, '#9affb0'); }
      } else if (it.kind === 'fake') { B.fakeNext = true; floatScene(f.x, f.y - 140, '幻術…', '#ff9ad0'); }
      else if (it.kind === 'reverse') { S.eyeBlocked = 2; floatScene(f.x, f.y - 140, '魔眼封じ', '#ff9ad0'); }
      f.step++;
      await MK.wait(240);
    }
    if (B.morale <= 0) return battleLose('士気が尽きた');
    if (B.spins <= 0) return battleLose('勇者の援軍が来た（回転切れ）');
  }
  async function battleWin() {
    const B = S.battle;
    MK.Audio.play('win');
    sceneFx(() => { FX.slam(B.node.name + ' 制圧!!', { y: 230, size: 70, dur: 1.8 }); FX.P.burst(W / 2, 260, 60, 'rgba(255,200,80,0.9)', 600, 30); });
    await MK.wait(1800);
    S.cleared.push(B.node.id);
    S.tier++;
    const rw = B.node.reward;
    if (rw.gold) S.gold += rw.gold;
    if (rw.shard) S.shards += rw.shard;
    if (B.node.boss) { S.phase = 'victory'; MK.Audio.play('fanfare', 'upper'); return; }
    // 遺物
    const ids = Object.keys(D.RELICS).filter((r) => !S.relics[r]);
    for (let i = ids.length - 1; i > 0; i--) { const j = U.randi(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const opts = ids.slice(0, 3).map((id) => ({ kind: 'relic', id, icon: D.RELICS[id].icon, title: D.RELICS[id].name, lines: [D.RELICS[id].desc, 'ずっと効く'] }));
    if (B.node.captive) opts.push({ kind: 'tile', type: 'knight', title: '捕虜の聖騎士', lines: [D.TILES.knight.desc, '給料 3枚/3夜'] });
    const k = await choose('戦利品', opts);
    const o = opts[k];
    if (o.kind === 'relic') S.relics[o.id] = true;
    else { const r = await chooseReel('捕虜をどのリールに入れる？'); M.addTile(r, 'knight'); }
    for (let n = 0; n < 2 && S.shards >= shardNeed(); n++) { S.shards -= shardNeed(); await summon(); }
    endBattle();
  }
  async function battleLose(why) {
    MK.Audio.play('lose');
    sceneFx(() => FX.slam('撤退…', { y: 230, size: 80, palette: 'silver', sub: why, dur: 1.8 }));
    await MK.wait(1800);
    S.dignity--;
    if (S.dignity <= 0) { S.phase = 'gameover'; return; }
    endBattle();
  }
  function endBattle() {
    M.allTiles().forEach((t) => { t.sealed = 0; t.asleep = false; });
    S.battle = null;
    S.phase = 'day';
    if (S.night % D.PAYDAY_EVERY === 0) payday();
  }

  // ---------- 昼：魔王城 ----------
  function payday() {
    const w = wages();
    const ok = S.gold >= w;
    let leaver = null;
    if (ok) S.gold -= w;
    else {
      S.gold = 0;
      const mons = M.allTiles().filter((t) => D.TILES[t.type].wage > 0).sort((a, b) => a.id - b.id);
      leaver = mons[0];
      if (leaver) { const ri = M.strips.findIndex((s) => s.includes(leaver)); M.removeTile(ri, leaver.id); }
    }
    S.overlay = { kind: 'payday', w, ok, leaver: leaver ? leaver.type : null, t: U.now() };
    MK.Audio.play(ok ? 'coin' : 'lose');
  }
  function buildFac(id) {
    const f = D.FACILITIES[id], lv = S.fac[id];
    if (lv >= f.cost.length || S.gold < f.cost[lv]) return;
    S.gold -= f.cost[lv]; S.fac[id]++;
    MK.Audio.play('build');
    sceneFx(() => { FX.flash('#fff', 0.4); FX.slam(f.name + ' 再建!!', { y: 200, size: 54, palette: 'violet', sub: '設定 ' + setting(), dur: 1.3 }); });
  }
  function nextNight() {
    S.night++;
    S.phase = 'night';
    S.mana = maxMana();
    S.eyes = maxEyes();
    S.burnMode = false;
    MK.Audio.play('magic');
  }
  function burnTile(ri, id) {
    if (S.gold < D.BURN_COST) return;
    S.gold -= D.BURN_COST;
    M.removeTile(ri, id);
    MK.Audio.play('explode');
  }

  // ---------- 選択（カード） ----------
  function choose(title, opts) {
    return new Promise((res) => { S.choice = { title, opts, res, t0: U.now(), mode: 'card' }; MK.Audio.play('coin'); });
  }
  function chooseReel(title) {
    return new Promise((res) => { S.choice = { title, res, t0: U.now(), mode: 'reel' }; });
  }
  function pick(i) { const c = S.choice; if (!c) return; S.choice = null; MK.Audio.play('navi'); c.res(i); }

  // ---------- 演出ユーティリティ ----------
  const floats = [];
  function floatText(x, y, t, color) { floats.push({ x, y, t, color, age: 0 }); }
  function floatScene(x, y, t, color) { floatText(x, y, t, color); }
  function popAt(x, y, t, pal) {
    FX.add({ dur: 1.0, layer: 'top', draw(c, p, age) { c.globalAlpha = 1 - U.seg(p, 0.7, 1); const k = E.outBack(U.seg(age, 0, 0.2)); c.translate(x, y - age * 40); c.scale(k, k); FX.fancyText(c, t, 0, 0, 44, { palette: pal }); } });
  }
  function sceneFx(fn) { fn(); }
  function preFx() {
    sceneFx(() => FX.add({ dur: 1.0, layer: 'top', draw(c, p, age) { c.globalAlpha = Math.sin(p * Math.PI) * 0.8; FX.magicCircle(c, W / 2, 520, 240, age * 3, 'rgba(255,60,90,1)', { tilt: 0.3 }); } }));
    MK.Audio.play('rare', 2);
  }
  function boomFx() {
    MK.Audio.play('fanfare', 'at');
    sceneFx(() => { FX.flash('#ffffff', 1, 2); FX.shake(20); FX.slam('暴 走 !!', { y: 280, size: 120, palette: 'rainbow', glow: 'rgba(255,80,40,0.8)', sub: '全ライン有効・効果2倍', dur: 1.8 }); FX.P.burst(W / 2, 300, 80, 'rgba(255,150,60,0.9)', 800, 40); });
    hint('boom', '暴走中は上中下すべてのラインが有効。勝負どころ');
  }

  // ---------- 描画：状態バー ----------
  function drawTop(t) {
    ctx.fillStyle = '#0e0814'; ctx.fillRect(0, 0, W, SY);
    ctx.fillStyle = '#2a1a30'; ctx.fillRect(0, SY - 3, W, 3);
    // 魔力
    body('魔力', 18, 22, 16, '#c8a8ff');
    const mm = maxMana();
    for (let i = 0; i < mm; i++) {
      const x = 18 + i * 17, on = i < S.mana;
      ctx.beginPath(); ctx.moveTo(x + 6, 36); ctx.lineTo(x + 12, 46); ctx.lineTo(x + 6, 58); ctx.lineTo(x, 46); ctx.closePath();
      ctx.fillStyle = on ? '#b070ff' : '#2a2034'; ctx.fill(); ctx.strokeStyle = '#0a0610'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    A.coin(ctx, 330, 46, 13); txt(String(S.gold), 350, 47, 24, '#ffe08a');
    // 欠片
    body('魂', 420, 22, 16, '#9fe8ff');
    for (let i = 0; i < shardNeed(); i++) { ctx.fillStyle = i < S.shards ? '#7ad8ff' : '#1e2a34'; ctx.beginPath(); ctx.moveTo(430 + i * 22, 36); ctx.lineTo(438 + i * 22, 46); ctx.lineTo(430 + i * 22, 58); ctx.lineTo(422 + i * 22, 46); ctx.closePath(); ctx.fill(); }
    // 威厳
    body('威厳', 530, 22, 16, '#ff9ab0');
    for (let i = 0; i < 3; i++) txt('♥', 530 + i * 24, 47, 22, i < S.dignity ? '#ff4060' : '#3a2030');
    txt('夜' + S.night, 702, 47, 22, '#ffe7c0', 'right');
    body('設定' + setting(), 702, 20, 14, '#c9a65a', 'right');
  }

  // ---------- 描画：場面 ----------
  function drawScene(t) {
    ctx.save(); ctx.translate(0, SY); ctx.beginPath(); ctx.rect(0, 0, W, SH); ctx.clip();
    const [sx, sy] = FX.shakeOffset(); ctx.translate(sx, sy);
    offY = SY;
    const ph = S.phase;
    if (ph === 'night' || ph === 'day') drawCastle(t, ph);
    else if (ph === 'map') drawMap(t);
    else if (ph === 'battle') drawBattle(t);
    else if (ph === 'victory') drawVictory(t);
    else if (ph === 'gameover') drawGameover(t);
    FX.drawLayer(ctx, 'back'); FX.drawLayer(ctx, 'front'); FX.drawLayer(ctx, 'top');
    FX.drawFlash(ctx, W, SH);
    offY = 0;
    ctx.restore();
  }
  function drawCastle(t, ph) {
    A.background(ctx, W, SH, ph === 'day' ? 'at' : 'normal', t);
    const lv = U.clamp(1 + Math.floor(facLv() / 2), 1, 5);
    const g = C.fitGeo(lv, { x: 440, bottom: 540, h: 420, maxS: 0.95 });
    C.section(ctx, g, lv, t, { vault: S.gold, floors: g.floors });
    // 在籍する魔物（リールの魔物から最大6体を城に）
    const mons = M.monsters().slice(0, 6);
    mons.forEach((m, i) => {
      const room = Math.min(g.floors - 2, i % 2);
      const r = C.roomRect(room);
      const x = g.x + (r.x0 + 60 + (i >> 1) * 110 + (i % 2) * 40) * g.s, y = g.y + (r.y1 - 3) * g.s;
      A2.unit(ctx, m.type, x, y, 0.55 * g.s / 0.95, t, { seed: m.id, face: i % 2 ? -1 : 1, anim: (Math.sin(t * 0.7 + m.id) > 0.85) ? 'cheer' : 'idle', at: t });
    });
    A2.maou(ctx, 120, 560, 0.85, t, form(), S.joined && U.now() - S.joined.t < 2 ? 'happy' : '');
    txt(ph === 'day' ? '昼 ・ 魔王城' : '夜' + S.night + ' ・ 召喚の刻', 20, 30, 26, ph === 'day' ? '#ffe08a' : '#c8a8ff');
    if (ph === 'night') {
      body('給料日まで ' + (D.PAYDAY_EVERY - ((S.night - 1) % D.PAYDAY_EVERY)) + '夜 ・ 給料 ' + wages() + '枚', 20, 62, 17, '#f3e2b0');
    } else {
      // 施設
      const keys = Object.keys(D.FACILITIES);
      keys.forEach((id, i) => {
        const f = D.FACILITIES[id], lv2 = S.fac[id], max = lv2 >= f.cost.length;
        const cost = max ? '最大' : '金貨' + f.cost[lv2];
        btn(16 + i * 232, SH - 112, 220, 96, f.name + ' Lv' + lv2 + '\n' + f.desc + '\n' + cost, () => buildFac(id), { size: 17, disabled: max || S.gold < f.cost[lv2], color: ['#5a3a2a', '#24160e'] });
      });
      btn(20, 60, 200, 44, S.burnMode ? '焼却をやめる' : '札を焼く（' + D.BURN_COST + '枚）', () => { S.burnMode = !S.burnMode; }, { size: 17, on: S.burnMode });
      if (S.burnMode) drawStrips(t);
    }
  }
  function drawStrips(t) {
    ctx.fillStyle = 'rgba(6,2,10,0.88)'; ctx.fillRect(0, 110, W, SH - 230);
    body('焼く札をタップ（石ころを捨てると揃いやすくなる）', W / 2, 130, 17, '#ffd0a0', 'center');
    M.strips.forEach((s, ri) => {
      s.forEach((tl, k) => {
        const x = 30 + ri * 230, y = 150 + k * 22;
        ctx.fillStyle = D.TRIBES[D.TILES[tl.type].tribe].color; ctx.fillRect(x, y, 200, 20);
        body(D.TILES[tl.type].name + (tl.lv > 1 ? ' ★' + tl.lv : ''), x + 8, y + 10, 14, '#fff');
        buttons.push({ x, y: y + SY, w: 200, h: 20, fn: () => burnTile(ri, tl.id) });
      });
    });
  }
  function drawMap(t) {
    A.background(ctx, W, SH, 'upper', t);
    txt('侵攻 ・ 攻め込む土地を選べ', 20, 30, 26, '#ffbf8a');
    const pos = (ti, k, n) => [n === 1 ? W / 2 : W / 2 + (k - 0.5) * 300, SH - 80 - ti * 108];
    // 線
    ctx.strokeStyle = 'rgba(255,200,140,0.35)'; ctx.lineWidth = 4;
    D.MAP.forEach((tier, ti) => { if (ti === 0) return; tier.forEach((n, k) => D.MAP[ti - 1].forEach((p, j) => { const a = pos(ti, k, tier.length), b = pos(ti - 1, j, D.MAP[ti - 1].length); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); })); });
    D.MAP.forEach((tier, ti) => tier.forEach((n, k) => {
      const [x, y] = pos(ti, k, tier.length);
      const done = S.cleared.includes(n.id), avail = ti === S.tier;
      const r = n.boss ? 42 : 34;
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU);
      ctx.fillStyle = done ? '#5a0a14' : avail ? '#3a4a8a' : '#24202c'; ctx.fill();
      ctx.lineWidth = avail ? 4 + 2 * Math.sin(t * 6) : 2; ctx.strokeStyle = avail ? '#ffe08a' : '#6a5a7a'; ctx.stroke();
      if (done) C.flag(ctx, x + 2, y + 14, 1.1, t, 1);
      else n.foes.slice(0, 2).forEach((f, i) => { const e = D.ENEMIES[f]; A.hero(ctx, { type: e.art, x: x - 10 + i * 20, y: y + 22, s: 0.32, face: -1, anim: 'idle' }, t); });
      body(n.name, x, y + r + 16, 17, done ? '#ff9a9a' : avail ? '#ffffff' : '#9a8aa8', 'center');
      if (avail) buttons.push({ x: x - r, y: y - r + SY, w: r * 2, h: r * 2 + 30, fn: () => startBattle(n) });
    }));
    btn(W - 180, 60, 160, 44, '城へ戻る', () => { S.phase = 'night'; }, { size: 18 });
  }
  function drawBattle(t) {
    const B = S.battle;
    A.background(ctx, W, SH, 'cz', t);
    txt(B.node.name, 20, 30, 26, '#ff9a8a');
    // 士気・盾
    body('士気', 20, 66, 16, '#ffb0c0');
    A.bar(ctx, 70, 58, 200, 16, B.morale / maxMorale(), ['#ff8aa0', '#a01a3a']);
    txt(Math.max(0, B.morale) + '', 280, 67, 18, '#fff');
    if (B.shield) txt('盾×' + B.shield, 330, 67, 18, '#bfe8ff');
    txt('残り ' + B.spins + '回転', W - 20, 30, 26, B.spins <= 2 ? '#ff6a5a' : '#ffe7c0', 'right');
    // 魔王軍（中段の札の魔物が前に出る）
    A2.maou(ctx, 90, 520, 0.6, t, form(), '');
    const atkT = B.attackT ? U.now() - B.attackT : 9;
    [0, 1, 2].forEach((i) => {
      const tl = M.tileAt(i, 0);
      if (D.TILES[tl.type].tribe === 'none') return;
      const lunge = atkT < 0.5 ? Math.sin(atkT / 0.5 * Math.PI) * 60 : 0;
      A2.unit(ctx, tl.type, 210 + i * 80 + lunge, 470 + (i % 2) * 40, 0.8, t, { seed: tl.id, anim: atkT < 0.5 ? 'attack' : 'idle', at: atkT });
    });
    // 勇者側
    B.foes.forEach((f) => {
      f.at = (f.at || 0) + 1 / 60;
      if (f.anim === 'attack' && f.at > 0.5) f.anim = 'idle';
      f.hurt = Math.max(0, (f.hurt || 0) - 0.03);
      const y = f.y - SY;
      A.hero(ctx, { type: f.art, x: f.x, y, s: f.s, face: -1, anim: f.hp <= 0 ? 'down' : f.hurt > 0.5 ? 'hurt' : f.anim, at: f.hurt > 0.5 ? 0.1 : f.at }, t);
      if (f.hp <= 0) return;
      const bx = f.x - 50, by = y - 150 * f.s - 30;
      A.bar(ctx, bx, by, 100, 10, f.hp / f.hpMax, ['#7aff9a', '#1a8a3a']);
      body(f.name + ' ' + f.hp, f.x, by - 12, 14, '#fff', 'center');
      const it = intentOf(f);
      const col = it.kind === 'atk' ? '#ff8a8a' : it.kind === 'heal' ? '#9affb0' : '#ff9ad0';
      ctx.fillStyle = 'rgba(10,2,12,0.85)'; ctx.beginPath(); ctx.roundRect(f.x - 58, by - 52, 116, 26, 10); ctx.fill();
      body(f.stun ? '気絶中' : D.INTENT[it.kind](it.n), f.x, by - 39, 15, f.stun ? '#9affd8' : col, 'center');
    });
  }
  function drawVictory(t) {
    A.background(ctx, W, SH, 'at', t);
    FX.rays(ctx, W / 2, 300, 600, t * 0.3, 'rgba(255,220,120,0.25)', 20, 0.06);
    A2.maou(ctx, W / 2, 470, 1.4, t, 2, 'happy');
    FX.fancyText(ctx, '世界征服 達成!!', W / 2, 90, 64, { palette: 'rainbow' });
    body('夜' + S.night + 'で王都を陥落 ・ 魔物' + M.monsters().length + '体', W / 2, 150, 20, '#fff', 'center');
    btn(W / 2 - 140, SH - 90, 280, 64, 'もう一度 侵攻する', () => restart(), { pulse: true });
  }
  function drawGameover(t) {
    A.background(ctx, W, SH, 'normal', t);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, SH);
    A2.maou(ctx, W / 2, 450, 1.2, t, 0, '');
    FX.fancyText(ctx, '魔王、再び失墜…', W / 2, 100, 56, { palette: 'silver' });
    body('制圧 ' + S.cleared.length + '/5 ・ 夜' + S.night, W / 2, 160, 20, '#fff', 'center');
    btn(W / 2 - 140, SH - 90, 280, 64, 'やり直す', () => restart(), { pulse: true });
  }

  // ---------- 描画：スロット台 ----------
  function drawMachine(t) {
    const y0 = 690;
    const g = ctx.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, '#1e1626'); g.addColorStop(1, '#08060c');
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = '#5a1a2a'; ctx.fillRect(0, y0, W, 4);
    // 台の気配
    const sg = M.signs();
    const lampCol = { dim: '#3a3040', violet: '#a060ff', red: '#ff2a3a', fake: '#ff4aa8', boom: `hsl(${(t * 300) % 360},90%,60%)` }[sg.lamp];
    const pulse = sg.lamp === 'dim' ? 0.3 : 0.6 + 0.4 * Math.sin(t * (sg.lamp === 'red' || sg.lamp === 'fake' ? 10 : 5));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
    ctx.drawImage(FX.glow(lampCol, 64), 10, y0 + 6, 80, 80); ctx.restore();
    ctx.beginPath(); ctx.arc(50, y0 + 46, 18, 0, U.TAU); ctx.fillStyle = lampCol; ctx.globalAlpha = 0.4 + 0.6 * pulse; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a0610'; ctx.stroke();
    body('台の気配', 84, y0 + 30, 16, '#c9a65a');
    for (let i = 0; i < 5; i++) txt('★', 84 + i * 30, y0 + 62, 28, i < sg.stars ? (sg.stars >= 4 ? '#ff5a4a' : '#ffd34a') : '#2a2430');
    if (M.mood === 3) txt('暴走 残り' + M.boomLeft, 250, y0 + 62, 26, '#ff9a4a');
    // BET
    body('魔力投入', 420, y0 + 24, 15, '#c8a8ff');
    [1, 2, 3].forEach((b) => btn(420 + (b - 1) * 96, y0 + 40, 86, 52, 'BET' + b, () => { if (!spinning) { S.bet = b; MK.Audio.play('bet'); } }, { on: S.bet === b, size: 20, disabled: !spinning && S.mana < (S.phase === 'battle' ? b - 1 : b) }));
    // リール
    ctx.fillStyle = '#c9a23a'; ctx.fillRect(RX[0] - 8, RY - 8, RX[2] + RW - RX[0] + 16, CELL * 3 + 16);
    ctx.fillStyle = '#0a0606'; ctx.fillRect(RX[0] - 4, RY - 4, RX[2] + RW - RX[0] + 8, CELL * 3 + 8);
    const lines = activeLines();
    [0, 1, 2].forEach((i) => {
      const r = M.reels[i], n = M.len(i);
      ctx.save(); ctx.beginPath(); ctx.rect(RX[i], RY, RW, CELL * 3); ctx.clip();
      ctx.fillStyle = '#120c18'; ctx.fillRect(RX[i], RY, RW, CELL * 3);
      const base = Math.floor(r.pos), frac = r.pos - base;
      for (let k = -2; k <= 2; k++) {
        const tl = M.strips[i][U.mod(base + k, n)];
        const y = RY + CELL + (k - frac) * CELL;
        const art = A2.tileArt(tl.type, RW, CELL);
        const spin = r.state === 'spin';
        ctx.globalAlpha = spin ? 0.7 : 1;
        ctx.drawImage(art, RX[i], y, RW, CELL);
        ctx.globalAlpha = 1;
        if (!spin) {
          if (tl.lv > 1) txt('★' + tl.lv, RX[i] + RW - 8, y + 14, 15, '#ffe08a', 'right');
          if (tl.bonus) txt('+' + tl.bonus, RX[i] + 8, y + 14, 14, '#9affd8');
          if (tl.sealed > 0) { ctx.fillStyle = 'rgba(80,0,40,0.6)'; ctx.fillRect(RX[i], y, RW, CELL); txt('封印 ' + tl.sealed, RX[i] + RW / 2, y + CELL / 2, 20, '#ff9ad0', 'center'); }
          if (tl.asleep) txt('zzz', RX[i] + RW - 12, y + CELL - 14, 16, '#bfe8ff', 'right');
        }
      }
      const sh = ctx.createLinearGradient(0, RY, 0, RY + CELL * 3);
      sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = sh; ctx.fillRect(RX[i], RY, RW, CELL * 3);
      ctx.restore();
      if (M.spinning(i)) buttons.push({ x: RX[i], y: RY, w: RW, h: CELL * 3, fn: () => stopReel(i) });
    });
    // 有効ライン
    lines.forEach((L) => {
      ctx.strokeStyle = L[0] === 0 && L[2] === 0 ? 'rgba(255,80,80,0.75)' : 'rgba(255,170,60,0.55)'; ctx.lineWidth = 3;
      ctx.beginPath(); L.forEach((row, i) => { const x = RX[i] + (i === 0 ? 0 : i === 2 ? RW : RW / 2), y = RY + CELL * 1.5 + row * CELL; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    });
    // 結果のハイライト
    if (S.lastResult && U.now() - S.lastResult.t < 1.5 && !M.anySpinning()) {
      S.lastResult.res.lines.forEach((l) => {
        if (!(l.triple || l.tribeTriple)) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 12);
        l.rows.forEach((row, i) => ctx.drawImage(FX.glow('rgba(255,220,120,0.8)', 64), RX[i] - 10, RY + (row + 1) * CELL - 10, RW + 20, CELL + 20));
        ctx.restore();
      });
    }
    // 魔眼
    if (S.eyePhase) {
      [0, 1, 2].forEach((i) => {
        btn(RX[i] + RW / 2 - 40, RY - 2, 80, 34, '▲', () => useEye(i, -1), { size: 18, color: ['#3a6ab8', '#12305a'] });
        btn(RX[i] + RW / 2 - 40, RY + CELL * 3 - 32, 80, 34, '▼', () => useEye(i, 1), { size: 18, color: ['#3a6ab8', '#12305a'] });
      });
    }
    // 操作部
    const cy = 1050;
    body('魔眼 ' + S.eyes + (S.eyeBlocked ? '（封じられている）' : ''), 24, cy + 16, 17, S.eyeBlocked ? '#ff9ad0' : '#9fc8ff');
    btn(24, cy + 40, 160, 50, S.omakase ? 'おまかせ停止\nON' : 'おまかせ停止\nOFF', () => { S.omakase = !S.omakase; }, { size: 15, on: S.omakase });
    if (S.phase === 'night') btn(24, cy + 104, 160, 60, '出陣', () => goMap(), { color: ['#c0302a', '#5a0a10'], size: 24, pulse: S.mana <= 0, disabled: spinning });
    if (S.phase === 'day') btn(24, cy + 104, 160, 60, '夜を迎える', () => nextNight(), { color: ['#5a3ab8', '#1e0a4a'], size: 20, pulse: true });
    // レバー（大）
    const lx = 470, ly = cy + 28, lw = 226, lh = 170;
    if (S.eyePhase) btn(lx, ly, lw, lh, '決定', () => confirmEye(), { color: ['#3a8ad8', '#0a2a5a'], size: 40, r: 24 });
    else {
      const can = canSpin();
      const cost = spinCost();
      btn(lx, ly, lw, lh, can ? (cost > 0 ? 'レバー\n（魔力' + cost + '）' : 'レバー') : spinning ? '停止して' : S.phase === 'night' ? '魔力切れ' : S.phase === 'battle' ? '—' : '—', () => lever(), { color: ['#e03a4a', '#5a0010'], size: 30, r: 24, disabled: !can, pulse: can && S.hints.lever && !S.leverUsed });
    }
    // チュートリアル的ヒント
    if (S.hint && U.now() - S.hint.t < 6) {
      const a = Math.min(1, (U.now() - S.hint.t) * 4) * (1 - U.seg(U.now() - S.hint.t, 5.4, 6));
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(20,8,30,0.92)'; ctx.beginPath(); ctx.roundRect(200, cy + 104, 260, 96, 12); ctx.fill();
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.stroke();
      wrap(S.hint.text, 330, cy + 128, 240, 17, '#ffe7c0');
      ctx.restore();
    }
  }
  function wrap(text, cx, y, maxW, size, color) {
    ctx.font = `bold ${size}px "Shippori Mincho B1", serif`;
    let line = '', ly = y;
    const lines = [];
    for (const ch of text) { if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch; }
    lines.push(line);
    lines.forEach((l, i) => body(l, cx, ly + i * (size + 6), size, color, 'center'));
  }

  // ---------- 描画：選択・オーバーレイ ----------
  function drawChoice(t) {
    const c = S.choice;
    if (!c) return;
    if (c.mode === 'reel') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, RY - 10);
      txt(c.title, W / 2, RY - 50, 28, '#ffe08a', 'center');
      [0, 1, 2].forEach((i) => {
        ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6); ctx.fillStyle = '#ffe08a'; ctx.fillRect(RX[i], RY, RW, CELL * 3); ctx.restore();
        txt((i + 1) + '', RX[i] + RW / 2, RY + CELL * 1.5, 54, '#fff', 'center');
        body(M.strips[i].filter((x) => x.type === 'stone').length ? '石ころと入れ替え' : '1コマ増える', RX[i] + RW / 2, RY + CELL * 2.5, 16, '#fff', 'center');
        buttons.push({ x: RX[i], y: RY, w: RW, h: CELL * 3, fn: () => pick(i) });
      });
      return;
    }
    ctx.fillStyle = 'rgba(4,0,8,0.82)'; ctx.fillRect(0, SY, W, SH);
    txt(c.title, W / 2, SY + 40, 34, '#ffe08a', 'center');
    const n = c.opts.length, cw = n >= 4 ? 166 : 218, gap = 10;
    const x0 = (W - (cw * n + gap * (n - 1))) / 2, y = SY + 76, ch = 470;
    c.opts.forEach((o, i) => {
      const x = x0 + i * (cw + gap), cx = x + cw / 2;
      A.panel(ctx, x, y, cw, ch, { color: o.kind === 'relic' ? '#ffb0e0' : '#9fe8ff', bg: ['rgba(40,16,40,0.96)', 'rgba(10,4,14,0.98)'] });
      if (o.kind === 'tile') {
        const tr = D.TRIBES[D.TILES[o.type].tribe];
        ctx.fillStyle = tr.color; ctx.fillRect(x + 8, y + 8, cw - 16, 190);
        A2.unit(ctx, o.type, cx, y + 186, o.type === 'dragon' ? 0.7 : 1.25, t, { anim: 'cheer', at: t + i });
        if (tr.name) body(tr.name, x + 16, y + 24, 15, '#fff');
      } else {
        A.ell(ctx, cx, y + 110, 64, 64); ctx.fillStyle = A.rg(ctx, cx - 20, y + 90, 2, cx, y + 110, 64, ['#fff2b0', '#d9a020', '#6a3a00']); ctx.fill();
        txt(o.icon, cx, y + 112, 64, '#3a1600', 'center', '"Shippori Mincho B1", serif');
      }
      txt(o.title, cx, y + 232, n >= 4 ? 19 : 23, '#ffffff', 'center');
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
      o.lines.forEach((l, k) => { ctx.font = 'bold 16px "Shippori Mincho B1", serif'; wrapLeft(l, cx, y + 272 + k * 76, cw - 24, 16, k ? '#ffd34a' : '#f3e6d0'); });
      ctx.restore();
      buttons.push({ x, y, w: cw, h: ch, fn: () => pick(i) });
    });
    body('カードをタップして選ぶ', W / 2, SY + SH - 20, 16, '#c9a65a', 'center');
  }
  function wrapLeft(text, cx, y, maxW, size, color) {
    ctx.font = `bold ${size}px "Shippori Mincho B1", serif`;
    let line = ''; const lines = [];
    for (const ch of text) { if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch; }
    lines.push(line);
    lines.slice(0, 3).forEach((l, i) => body(l, cx, y + i * (size + 6), size, color, 'center'));
  }
  function drawOverlay(t) {
    const o = S.overlay;
    if (!o) return;
    if (o.kind === 'payday') {
      const age = U.now() - o.t;
      ctx.fillStyle = 'rgba(4,0,8,0.8)'; ctx.fillRect(0, SY, W, SH);
      txt('給料日', W / 2, SY + 60, 44, '#ffe08a', 'center');
      C.payBag(ctx, W / 2, SY + 330, 1.6, o.ok ? Math.min(1, age) : 0.3, t, { glow: o.ok ? 0.6 : 0, shake: !o.ok && age < 0.8 });
      body('給料 金貨' + o.w + '枚', W / 2, SY + 380, 22, '#fff', 'center');
      if (o.ok) txt('支払い完了', W / 2, SY + 430, 34, '#9affb0', 'center');
      else {
        txt('払えない…', W / 2, SY + 430, 34, '#ff8a8a', 'center');
        if (o.leaver) {
          const k = E.outBack(U.clamp((age - 0.6) / 0.4, 0, 1));
          if (age > 0.6) C.letter(ctx, W / 2 + 180, SY + 220, 3.2 * k, -0.1, { stamp: true });
          body(D.TILES[o.leaver].name + 'が辞表を出して去った', W / 2, SY + 480, 20, '#ffb0b0', 'center');
          A2.unit(ctx, o.leaver, W / 2 - 200 - Math.max(0, age - 1.4) * 200, SY + 300, 1.0, t, { face: -1, anim: 'walk', at: age });
        }
      }
      btn(W / 2 - 110, SY + SH - 90, 220, 60, 'OK', () => { S.overlay = null; }, { pulse: age > 1 });
    }
  }
  function drawFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.age += dt;
      if (f.age > 1.3) { floats.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = 1 - U.seg(f.age, 0.9, 1.3);
      txt(f.t, f.x, f.y - f.age * 30, 20, f.color, 'center'); ctx.restore();
    }
  }

  // ---------- オート（撮影・テスト用） ----------
  let autoT = 0;
  function autoplay(dt) {
    if (!S.auto) return;
    autoT -= dt; if (autoT > 0) return;
    autoT = 0.4;
    if (S.overlay) { S.overlay = null; return; }
    if (S.choice) {
      if (S.choice.mode === 'reel') { const sc = M.strips.map((r) => r.filter((x) => x.type === 'stone').length * 100 - r.length); return pick(sc.indexOf(Math.max(...sc))); }
      pick(0); return;
    }
    if (S.phase === 'night') {
      if (S.mana <= Math.ceil(maxMana() * 0.5) && !spinning) return goMap();
      if (canSpin()) { S.bet = M.signs().stars >= 4 ? Math.min(3, S.mana) : 1; lever(); }
    } else if (S.phase === 'battle') {
      if (canSpin()) { S.bet = (M.signs().stars >= 4 || M.mood === 3) ? Math.min(3, S.mana + 1) : 1; lever(); }
    } else if (S.phase === 'map') {
      const n = D.MAP[S.tier] && D.MAP[S.tier][0]; if (n) startBattle(n);
    } else if (S.phase === 'day') {
      const id = Object.keys(D.FACILITIES).find((k) => S.fac[k] < D.FACILITIES[k].cost.length && S.gold >= D.FACILITIES[k].cost[S.fac[k]]);
      if (id) buildFac(id); else nextNight();
    } else if (S.phase === 'victory' || S.phase === 'gameover') { /* 停止 */ }
  }

  // ---------- 入力・ループ ----------
  function restart() { FX.reset(); newRun(); }
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  }
  function onDown(e) {
    e.preventDefault();
    MK.Audio.unlock();
    const [x, y] = toLogical(e);
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.opt && b.opt.disabled) return;
        if (b.label && b.label.startsWith && b.label.startsWith('レバー')) S.leverUsed = true;
        b.fn(); return;
      }
    }
  }
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = U.now();
    FX.update(dt); M.update(dt);
    if (spinning && M.anySpinning() && U.now() > S.autoStopAt) {
      const nx = [0, 1, 2].find((i) => M.spinning(i));
      if (nx != null) { stopReel(nx); S.autoStopAt = U.now() + (S.auto || S.omakase ? 0.25 : 0.6); }
    }
    autoplay(dt);
    buttons = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawScene(t);
    drawTop(t);
    drawMachine(t);
    drawChoice(t);
    drawOverlay(t);
    drawFloats(dt);
    requestAnimationFrame(frame);
  }
  function boot() {
    canvas = document.getElementById('game');
    dpr = (window.devicePixelRatio || 1) > 1.3 ? 1.5 : 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    fit(); window.addEventListener('resize', fit);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); S.eyePhase ? confirmEye() : lever(); }
      if (['1', '2', '3'].includes(e.key)) { const i = +e.key - 1; if (S.choice) S.choice.mode === 'reel' ? pick(i) : (S.choice.opts[i] && pick(i)); else stopReel(i); }
      if (e.key === 'm') MK.Audio.setMuted(!MK.Audio.muted);
    });
    const q = new URLSearchParams(location.search);
    MK.v2Auto = !!q.get('auto');
    newRun();
    if (q.get('mute')) MK.Audio.setMuted(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => A2.clearTileCache());
    requestAnimationFrame(frame);
  }
  MK.V2 = { get S() { return S; }, lever, stopReel, pick, goMap, startBattle, nextNight, buildFac, restart, useEye, confirmEye, M };
  MK.Assets.load().then(boot);
})(window.MK);
