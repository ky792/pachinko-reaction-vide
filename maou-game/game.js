'use strict';
// =====================================================================
//  まおうぐんの日々  — 弱小魔王軍 育成・侵略シミュレーション（試作）
// =====================================================================
const TILE = 16, COLS = 24, ROWS = 16, W = COLS * TILE, H = ROWS * TILE, S = 3;
const HOUR_REAL = 2.5;           // 通常速度での1時間の実時間（秒）→ 1日 = 60秒
const $ = id => document.getElementById(id);
const cv = $('game'); cv.width = W * S; cv.height = H * S;
const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;

// ---------- util ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pad2 = n => String(n).padStart(2, '0');

// ---------- data ----------
const SPECIES = {
  goblin: { name: 'ゴブリン', hp: [18, 22], atk: [4, 5], speed: 56, adultAge: 40, farm: 1.0, death: 0.4, cd: 0.8, food: 1 },
  orc:    { name: 'オーク',   hp: [30, 35], atk: [6, 7], speed: 44, adultAge: 52, farm: 0.7, death: 0.25, cd: 1.1, food: 1.5 },
};
const PERS = {
  '勤勉':     { desc: 'よく働く',                   work: 3,   train: 1,   idle: 0.5 },
  '怠け者':   { desc: 'すぐサボって寝る',           work: 0.4, train: 0.5, idle: 3 },
  '好戦的':   { desc: '訓練好き。空腹だと喧嘩する', work: 0.7, train: 3,   idle: 0.7 },
  '臆病':     { desc: '危なくなると逃げ出す',       work: 1.3, train: 0.4, idle: 1.2 },
  '食いしん坊': { desc: '早めに食事をとる',         work: 1,   train: 1,   idle: 1 },
  '陽気':     { desc: '子どもができやすい',         work: 1,   train: 1,   idle: 1.3 },
};
const PERS_KEYS = Object.keys(PERS);
const BLD = {
  house:    { name: '住居',   cost: 40, w: 2, h: 2, slots: 0, desc: '収容数+4。中で眠ると回復が早い' },
  farm:     { name: '農場',   cost: 50, w: 3, h: 2, slots: 3, desc: '魔物が働くと食料が増える' },
  training: { name: '訓練場', cost: 70, w: 3, h: 2, slots: 3, desc: '魔物が鍛えると攻撃力・体力が上がる' },
};
const HUMAN = {
  villager:   { name: '村人',       hp: 12, atk: 3,  pal: 'villager',   weapon: 'fork' },
  guard:      { name: '衛兵',       hp: 22, atk: 5,  pal: 'guard',      weapon: 'spear' },
  adventurer: { name: '冒険者',     hp: 38, atk: 8,  pal: 'adventurer', weapon: 'sword' },
  hero:       { name: '勇者見習い', hp: 70, atk: 12, pal: 'hero',       weapon: 'sword' },
};

const GOB_SYL = ['ギ', 'ゴ', 'グ', 'ザ', 'ズ', 'ピ', 'ポ', 'ケ', 'ロ', 'ム', 'チ', 'ニ', 'ビ', 'ヌ', 'ゲ'];
const ORC_SYL = ['ガ', 'ド', 'ボ', 'バ', 'ゾ', 'ル', 'ダ', 'ゴ', 'ブ', 'ラ', 'ズ', 'モ', 'ギ'];
const MID = { goblin: ['ッ', 'ー', 'ン'], orc: ['ン', 'ッ', 'ル'] };

// ---------- map ----------
const CASTLE = { x: 16, y: 56, w: 80, h: 104 };
const STORE = { x: 112, y: 154 };
const DOOR = { x: 56, y: 166 };
const ROAD_Y = 137;
const BUSH_TILES = [[3, 1], [9, 1], [15, 1], [21, 1], [8, 14], [14, 14], [20, 14]];
let grid;

function buildGrid() {
  grid = [];
  for (let y = 0; y < ROWS; y++) { grid.push([]); for (let x = 0; x < COLS; x++) grid[y].push(0); }
  const block = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[y] && x < COLS) grid[y][x] = 1; };
  block(0, 0, 23, 0); block(0, 15, 23, 15);
  block(0, 3, 6, 10);        // castle
  block(6, 8, 8, 10);        // storage
  block(7, 8, 23, 8);        // road
  block(0, 11, 5, 14);       // graveyard
  BUSH_TILES.forEach(([x, y]) => block(x, y, x, y));
}

// ---------- state ----------
let G;
function newGame() {
  G = {
    t: 6, nextHour: 7, speed: 1, gold: 130, food: 50,
    monsters: [], humans: [], buildings: [], fx: [], texts: [], graves: [], bushes: [],
    selected: null, build: null, ghost: null, nextId: 1, banner: null, toast: null,
    village: { gold: 90, food: 60, alert: 0, resist: 200, maxResist: 200, conquered: false, lastRaidDay: 0 },
    exp: null, battle: null, logs: [], stats: { births: 0, raids: 0, wins: 0, deaths: 0, kills: 0 },
    goalIdx: 0, foodHist: [], started: false, finished: false,
  };
  buildGrid();
  G.bushes = BUSH_TILES.map(([x, y]) => ({ x: x * 16 + 8, y: y * 16 + 13, berries: 3 }));
  const start = [
    ['goblin', '勤勉'], ['goblin', '陽気'], ['orc', '好戦的'], ['orc', '食いしん坊'],
  ];
  start.forEach(([sp, pers], i) => {
    const m = makeMonster(sp, { age: randi(80, 130), pers, x: 120 + i * 18, y: 175 + (i % 2) * 10, breedCD: 6 });
    G.monsters.push(m);
  });
  addLog('魔王城に4体の手下が集まった。弱小魔王軍の始まりだ。');
}

// ---------- monsters ----------
function uniqueName(sp) {
  const syl = sp === 'goblin' ? GOB_SYL : ORC_SYL;
  for (let k = 0; k < 50; k++) {
    let n = pick(syl);
    const r = Math.random();
    if (r < 0.45) n += pick(MID[sp]) + pick(syl); else if (r < 0.75) n += pick(syl); else n += pick(syl) + pick(syl);
    if (!G.monsters.some(m => m.name === n) && !G.graves.some(g => g.name === n)) return n;
  }
  return pick(syl) + G.nextId;
}
function makeMonster(sp, o = {}) {
  const d = SPECIES[sp];
  const m = {
    id: G.nextId++, name: o.name || uniqueName(sp), species: sp, variant: !!o.variant,
    baseHp: o.baseHp ?? randi(...d.hp), baseAtk: o.baseAtk ?? randi(...d.atk), trainHp: 0, trainAtk: 0, exp: 0,
    age: o.age ?? 0, pers: o.pers ?? pick(PERS_KEYS), hunger: o.hunger ?? rand(60, 90), energy: rand(60, 95),
    x: o.x ?? DOOR.x, y: o.y ?? DOOR.y, task: null, dir: Math.random() < .5 ? 1 : -1, moving: false,
    parents: o.parents || null, parentIds: o.parentIds || [], kids: 0, breedCD: o.breedCD ?? 0, flag: false,
    away: false, hidden: false, battles: 0, kills: 0, growT: 0, hitT: 0, alive: true, cd: 0,
  };
  m.hp = maxHp(m);
  return m;
}
const isChild = m => m.age < SPECIES[m.species].adultAge;
const maxHp = m => Math.round((m.baseHp * (m.variant ? 1.2 : 1) + m.trainHp) * (isChild(m) ? 0.5 : 1));
const atkOf = m => Math.max(1, Math.round((m.baseAtk * (m.variant ? 1.2 : 1) + m.trainAtk) * (isChild(m) ? 0.4 : 1)));
const hourOf = () => G.t % 24;
const dayOf = () => Math.floor(G.t / 24) + 1;
const isNight = () => { const h = hourOf(); return h >= 19 || h < 5; };
const timeBonus = sp => isNight() ? (sp === 'goblin' ? 1.3 : 1) : (sp === 'orc' ? 1.2 : 1);
const popCap = () => 4 + 4 * G.buildings.filter(b => b.type === 'house').length;
const kindOf = m => m.species + (isChild(m) ? 'Child' : '');
const palOf = m => m.variant ? (m.species === 'goblin' ? 'goblin_red' : 'orc_iron') : m.species;
const spName = m => (m.variant ? (m.species === 'goblin' ? '赤い' : '黒鉄の') : '') + SPECIES[m.species].name;
const foodCost = m => (isChild(m) ? 0.5 : 1) * SPECIES[m.species].food;
const visible = m => m.alive && !m.away && !m.hidden;
const byId = id => G.monsters.find(m => m.id === id);

function sleepy(m) {
  const h = hourOf();
  if (isChild(m)) return h >= 21 || h < 6;
  if (m.species === 'orc') return h >= 21 || h < 5;
  return h >= 11 && h < 15;   // ゴブリンは夜型。昼に昼寝
}

function setTask(m, t) { endTask(m); m.task = t; t.phase = t.phase || 'go'; }
function endTask(m) {
  const t = m.task; if (!t) return;
  if (t.slot) { const b = t.slot.b; if (b.slots[t.slot.i] === m.id) b.slots[t.slot.i] = null; }
  if (m.hidden && !m.away) { m.hidden = false; const p = t.place && t.place.door ? t.place.door : DOOR; m.x = p.x + rand(-4, 4); m.y = p.y + 2; }
  m.task = null;
}

function moveTo(m, tx, ty, dtH, mul = 1) {
  const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
  const sp = (isChild(m) ? 34 : SPECIES[m.species].speed) * mul * dtH;
  if (Math.abs(dx) > 0.3) m.dir = dx < 0 ? -1 : 1;
  if (d <= sp || d < 0.5) { m.x = tx; m.y = ty; return true; }
  m.x += dx / d * sp; m.y += dy / d * sp; m.moving = true; return false;
}

function randomSpot() {
  for (let k = 0; k < 30; k++) {
    const x = rand(20, W - 20), y = rand(30, H - 22);
    const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
    if (tx <= 6 && ty >= 3 && ty <= 10) continue;   // 城の中は歩かない
    return { x, y };
  }
  return { x: 150, y: 180 };
}

function freeSlot(type, m) {
  const cands = [];
  G.buildings.forEach(b => { if (b.type === type) b.slots.forEach((s, i) => { if (s === null) cands.push({ b, i }); }); });
  if (!cands.length) return null;
  cands.sort((a, c) => dist(m, slotPos(a)) - dist(m, slotPos(c)));
  return cands[0];
}
function slotPos(s) {
  const b = s.b;
  if (b.type === 'farm') return { x: b.x + 9 + s.i * 15, y: b.y + 22 };
  return { x: b.x + 4 + s.i * 16, y: b.y + 26 };   // training: 人形の左に立つ
}

function decide(m) {
  const P = PERS[m.pers];
  const thr = m.pers === '食いしん坊' ? 55 : 35;
  if (m.hunger < thr) {
    if (G.food >= foodCost(m)) return setTask(m, { type: 'eat', ox: rand(-10, 10), oy: rand(0, 8) });
    const b = G.bushes.filter(b => b.berries > 0).sort((a, c) => dist(m, a) - dist(m, c))[0];
    if (b) return setTask(m, { type: 'forage', bush: b });
  }
  if (m.energy < 20 || m.hp < maxHp(m) * 0.4 || (sleepy(m) && m.energy < 85) || (m.pers === '怠け者' && m.energy < 45))
    return startSleep(m);
  if (isChild(m)) {
    const p = m.parentIds.map(byId).find(p => p && visible(p));
    if (p && Math.random() < 0.6) return setTask(m, { type: 'follow', target: p.id, timer: rand(2, 4), ox: rand(-10, 10), oy: rand(4, 8) });
    return setTask(m, { type: 'wander', to: randomSpot() });
  }
  const opts = [];
  const fs = freeSlot('farm', m);
  if (fs) opts.push(['work', 2 * P.work * (G.food < G.monsters.length * 4 ? 2 : 1), fs]);
  const ts = freeSlot('training', m);
  if (ts && m.trainAtk < 15) opts.push(['train', 2 * P.train, ts]);
  opts.push(['wander', P.idle]); opts.push(['idle', 0.6 * P.idle]);
  let tot = opts.reduce((a, o) => a + o[1], 0), r = Math.random() * tot, ch = opts[0];
  for (const o of opts) { r -= o[1]; if (r <= 0) { ch = o; break; } }
  if (ch[0] === 'work' || ch[0] === 'train') { ch[2].b.slots[ch[2].i] = m.id; return setTask(m, { type: ch[0], slot: ch[2] }); }
  if (ch[0] === 'wander') return setTask(m, { type: 'wander', to: randomSpot() });
  setTask(m, { type: 'idle', phase: 'idle', timer: rand(0.5, 1.5) });
}

function sleepersAt(place) { return G.monsters.filter(o => o.task && o.task.type === 'sleep' && o.task.place === place).length; }
function startSleep(m, here) {
  let place = null;
  if (!here) {
    const houses = G.buildings.filter(b => b.type === 'house' && sleepersAt(b) < 4);
    houses.sort((a, c) => dist(m, a.door) - dist(m, c.door));
    if (houses[0]) place = houses[0];
    else if (sleepersAt(CASTLE_PLACE) < 4) place = CASTLE_PLACE;
  }
  const spot = here ? { x: m.x, y: m.y } : { x: rand(110, 190), y: rand(180, 222) };
  setTask(m, { type: 'sleep', place, spot, phase: here ? 'sleep' : 'go' });
}
const CASTLE_PLACE = { name: '魔王城', door: DOOR, rate: 9, heal: 2 };

function updateMonster(m, dtH) {
  m.moving = false;
  if (m.away) return;
  m.age += dtH;
  if (m.growT > 0) m.growT -= dtH * 0.6;
  if (m.hitT > 0) m.hitT -= dtH * 3;
  if (m.wasChild && !isChild(m)) {
    const ratio = m.hp / Math.max(1, Math.round(maxHp(m) * 0.5)); m.hp = Math.round(maxHp(m) * Math.min(1, ratio));
    m.growT = 1; burst(m.x, m.y - 8, 'star', 10); floatText(m.x, m.y - 16, '成長！', '#fff27a');
    addLog(`${m.name}（${spName(m)}）が大人になった！ 仕事や戦いに参加できる。`, 'good'); sfx('level');
  }
  m.wasChild = isChild(m);
  const t = m.task, type = t ? t.type : '';
  // needs
  let hr = 4, er = 3;
  if (type === 'work' && t.phase === 'do') { hr = 6; er = 5; }
  if (type === 'train' && t.phase === 'do') { hr = 7; er = 6; }
  if (type === 'sleep' && t.phase === 'sleep') { hr = 2.2; er = 0; }
  if (isChild(m)) hr *= 1.1;
  if (m.pers === '食いしん坊') hr *= 1.2;
  if (m.pers === '怠け者') er *= 1.2;
  if (type === 'flee' && m.hidden) hr = 0;   // 城にこもっている間は備蓄をかじっている
  m.hunger = clamp(m.hunger - hr * dtH, 0, 100);
  m.energy = clamp(m.energy - er * dtH, 0, 100);
  if (m.hunger <= 0) {   // 飢え：半日以上なにも食べられないと命にかかわる
    m.starve = (m.starve || 0) + dtH; m.hp = Math.max(m.starve > 12 ? 0 : 1, m.hp - 0.6 * dtH);
    if (m.hp <= 0) return die(m, '飢え');
  } else m.starve = 0;
  // 空腹が限界なら、ほとんどの行動を中断して食べに行く
  if (m.hunger < 12 && t && !['eat', 'forage', 'march', 'return', 'defend', 'breed'].includes(type) &&
      (G.food >= foodCost(m) || G.bushes.some(b => b.berries > 0)) && !(type === 'flee' && G.humans.length)) { endTask(m); }
  else if (type !== 'sleep' && m.hunger > 20) m.hp = Math.min(maxHp(m), m.hp + 0.4 * dtH);
  m.breedCD -= dtH;
  if (!m.task) decide(m);
  runTask(m, dtH);
}

function runTask(m, dtH) {
  const t = m.task; if (!t) return;
  switch (t.type) {
    case 'eat': {
      if (t.phase === 'go') { if (moveTo(m, STORE.x + t.ox, STORE.y + 8 + t.oy, dtH)) {
        const c = foodCost(m);
        if (G.food >= c) { G.food -= c; t.phase = 'do'; t.timer = 1; } else endTask(m);
      } } else if ((t.timer -= dtH) <= 0) { m.hunger = Math.min(100, m.hunger + 65); endTask(m); }
      break;
    }
    case 'forage': {
      if (t.phase === 'go') { if (moveTo(m, t.bush.x + 6, t.bush.y + 3, dtH)) {
        if (t.bush.berries > 0) { t.bush.berries--; t.phase = 'do'; t.timer = 1.2; floatText(m.x, m.y - 14, '木の実', '#ff8aa0'); }
        else endTask(m);
      } } else if ((t.timer -= dtH) <= 0) { m.hunger = Math.min(100, m.hunger + 45); endTask(m); }
      break;
    }
    case 'sleep': {
      if (t.phase === 'go') {
        const target = t.place ? t.place.door : t.spot;
        if (moveTo(m, target.x, target.y, dtH)) { t.phase = 'sleep'; if (t.place) m.hidden = true; }
      } else {
        const rate = t.place ? (t.place.rate || 12) : 6, heal = t.place ? (t.place.heal || 3) : 1;
        m.energy = Math.min(100, m.energy + rate * dtH);
        if (m.hunger > 0) m.hp = Math.min(maxHp(m), m.hp + heal * dtH);
        const need = (sleepy(m) ? 100 : 75);
        if ((m.energy >= need && m.hp >= maxHp(m) * 0.5) || (m.hunger < 22 && m.energy > 15)) endTask(m);   // お腹が空いたら起きる
      }
      break;
    }
    case 'work': {
      const p = slotPos(t.slot);
      if (t.phase === 'go') { if (moveTo(m, p.x, p.y, dtH)) { t.phase = 'do'; t.timer = rand(4, 6); m.dir = 1; } }
      else {
        const b = t.slot.b;
        let rate = SPECIES[m.species].farm * (m.pers === '勤勉' ? 1.4 : m.pers === '怠け者' ? 0.7 : 1) * (isNight() && m.species === 'goblin' ? 1.15 : 1);
        b.acc += rate * dtH; b.growth += rate * dtH * 0.18;
        while (b.acc >= 1) { b.acc -= 1; G.food += 1; floatText(p.x, p.y - 16, '+1', '#9cf07a', 'meat'); }
        if ((t.timer -= dtH) <= 0 || m.hunger < 15) endTask(m);
      }
      break;
    }
    case 'train': {
      const p = slotPos(t.slot);
      if (t.phase === 'go') { if (moveTo(m, p.x, p.y, dtH)) { t.phase = 'do'; t.timer = rand(3, 5); m.dir = 1; } }
      else {
        m.dir = 1;
        const b = t.slot.b;
        t.hit = (t.hit || 0) + dtH;
        if (t.hit > 0.35) { t.hit = 0; b.hitT[t.slot.i] = 1; if (Math.random() < 0.5) burst(p.x + 9, p.y - 8, 'spark', 2); }
        gainExp(m, dtH * (m.pers === '好戦的' ? 1.5 : m.pers === '臆病' ? 0.6 : 1));
        if ((t.timer -= dtH) <= 0 || m.hunger < 15 || m.energy < 10) endTask(m);
      }
      break;
    }
    case 'wander': {
      if (t.phase === 'go') { if (moveTo(m, t.to.x, t.to.y, dtH, 0.7)) { t.phase = 'idle'; t.timer = rand(0.5, 2); } }
      else if ((t.timer -= dtH) <= 0) endTask(m);
      break;
    }
    case 'idle': if ((t.timer -= dtH) <= 0) endTask(m); break;
    case 'follow': {
      const p = byId(t.target);
      if (!p || !visible(p) || (t.timer -= dtH) <= 0) { endTask(m); break; }
      if (dist(m, { x: p.x + t.ox, y: p.y + t.oy }) > 3) moveTo(m, p.x + t.ox, p.y + t.oy, dtH, 1.1);
      break;
    }
    case 'breed': {
      const p = byId(t.partner);
      if (!p || !p.task || p.task.type !== 'breed') { endTask(m); break; }
      t.age = (t.age || 0) + dtH;
      if (t.age > 10) { endTask(m); break; }   // 相手が来ないときは諦める
      if (t.phase === 'go') { if (moveTo(m, t.at.x + t.side * 6, t.at.y, dtH)) { t.phase = 'wait'; m.dir = -t.side; } }
      else if (t.phase === 'wait') { if (p.task.phase !== 'go') { t.phase = 'love'; t.timer = 1.5; } }
      else if (t.phase === 'love') {
        if (Math.random() < dtH * 4) burst(t.at.x, t.at.y - 14, 'heart', 1);
        if ((t.timer -= dtH) <= 0) { if (!t.born && !p.task.born) { giveBirth(m, p, t.at); p.task.born = true; } t.born = true; endTask(m); }
      }
      break;
    }
    case 'defend': {
      const h = G.humans.find(h => h.id === t.target && h.alive);
      if (!h) { endTask(m); break; }
      if (dist(m, h) > 9) moveTo(m, h.x - 7 * Math.sign(h.x - m.x || 1), h.y, dtH, 1.2);
      else {
        m.dir = h.x < m.x ? -1 : 1;
        m.cd -= dtH;
        if (m.cd <= 0) {
          m.cd = SPECIES[m.species].cd * 0.45; m.lunge = 1;
          const dmg = Math.max(1, Math.round(atkOf(m) * timeBonus(m.species) * rand(0.8, 1.2)));
          hitHuman(h, dmg, m);
        }
      }
      break;
    }
    case 'flee': {
      if (t.phase === 'go') { if (moveTo(m, DOOR.x, DOOR.y, dtH, 1.4)) { t.phase = 'hide'; m.hidden = true; t.timer = 3; } }
      else if ((t.timer -= dtH) <= 0 && (!G.humans.some(h => h.alive) || t.timer < -6)) endTask(m);
      break;
    }
    case 'quarrel': {
      const o = byId(t.target);
      if (!o) { endTask(m); break; }
      if (t.phase === 'go') { if (moveTo(m, o.x + (m.x < o.x ? -8 : 8), o.y, dtH)) { t.phase = 'do'; t.timer = 1; } }
      else { m.dir = o.x < m.x ? -1 : 1; if ((t.timer -= dtH) <= 0) { const d = randi(2, 5); m.hp -= d; floatText(m.x, m.y - 16, '-' + d, '#ff6a6a'); endTask(m); if (m.hp <= 0) monsterDown(m, '仲間との喧嘩'); } }
      break;
    }
    case 'march': {
      if (t.phase === 'go') { if (moveTo(m, 118, ROAD_Y + (t.idx % 2) * 6 - 3, dtH, 1.2)) t.phase = 'line'; }
      else if (t.phase === 'line') { if (G.exp.ready) t.phase = 'out'; }
      else { moveTo(m, W + 30, ROAD_Y + (t.idx % 2) * 6 - 3, dtH, 1.1); m.dir = 1; if (m.x > W + 8) { m.away = true; } }
      break;
    }
    case 'return': {
      if (moveTo(m, STORE.x + 14 + t.idx * 9, STORE.y + 14 + (t.idx % 2) * 6, dtH, 1.1)) {
        if (G.exp && !G.exp.deposited) depositLoot(m);
        endTask(m);
        if (G.exp && G.exp.phase === 'arrive' && !G.exp.members.some(id => { const x = byId(id); return x && x.task && x.task.type === 'return'; })) finishExpedition();
      }
      break;
    }
  }
}

function gainExp(m, amt) {
  if (m.trainAtk >= 15) return;
  m.exp += amt;
  while (m.exp >= 4 && m.trainAtk < 15) {
    m.exp -= 4; m.trainAtk += 1; m.trainHp += 2; m.hp += 2;
    floatText(m.x, m.y - 18, '攻撃+1', '#ffd24a'); burst(m.x, m.y - 8, 'star', 3); sfx('level');
  }
}

function giveBirth(a, b, at) {
  if (G.monsters.length >= popCap()) return;
  const r = Math.random();
  const pers = r < 0.4 ? a.pers : r < 0.8 ? b.pers : pick(PERS_KEYS);
  const variant = ((a.variant || b.variant) && Math.random() < 0.5) || Math.random() < 0.06;
  const baseHp = Math.round((a.baseHp + b.baseHp) / 2 * rand(0.92, 1.14)) + Math.floor((a.trainHp + b.trainHp) / 8);
  const baseAtk = Math.max(1, Math.round((a.baseAtk + b.baseAtk) / 2 * rand(0.9, 1.18)) + Math.floor((a.trainAtk + b.trainAtk) / 8));
  const c = makeMonster(a.species, { age: 0, pers, variant, baseHp, baseAtk, x: at.x, y: at.y + 4, hunger: 85,
    parents: [a.name, b.name], parentIds: [a.id, b.id] });
  c.wasChild = true; c.growT = 1;
  G.monsters.push(c); a.kids++; b.kids++; a.breedCD = b.breedCD = 30; G.stats.births++;
  burst(at.x, at.y - 6, 'heart', 6); burst(at.x, at.y - 6, 'star', 6);
  floatText(at.x, at.y - 22, '誕生！', '#ffa0e0'); sfx('birth');
  let msg = `${a.name}と${b.name}の子「${c.name}」が生まれた！（${PERS[pers] ? pers : ''}）`;
  if (variant && !a.variant && !b.variant) { msg += ' なんと突然変異だ！'; showBanner('突然変異！', `${spName(c)}「${c.name}」が誕生`); }
  addLog(msg, 'birth');
}

function monsterDown(m, cause) {
  if (Math.random() < SPECIES[m.species].death) return die(m, cause);
  m.hp = 1; floatText(m.x, m.y - 16, '重傷', '#ff8a8a');
  addLog(`${m.name}が倒れた…（重傷）`, 'bad');
  startSleep(m, true);
}
function die(m, cause) {
  if (!m.alive) return;
  m.alive = false; endTask(m);
  G.monsters = G.monsters.filter(o => o !== m);
  addGrave(m, cause);
  if (!m.away) burst(m.x, m.y - 6, 'dust', 8);
  addLog(`${m.name}（${spName(m)}）が${cause}で死んだ…`, 'bad');
  if (G.selected === m) selectMonster(null);
}
function addGrave(m, cause) {
  G.stats.deaths++;
  const i = G.graves.length, col = i % 5, row = Math.floor(i / 5) % 3;
  G.graves.push({ name: m.name, species: m.species, day: dayOf(), cause, x: 22 + col * 15, y: 190 + row * 14 });
}

// ---------- hourly / daily ----------
function hourly(h) {
  const hr = h % 24;
  if (hr === 6) dawn();
  if (hr === 20) dusk();
  if (h % 4 === 0) G.bushes.forEach(b => { if (b.berries < 3) b.berries++; });
  G.foodHist.push(G.food); if (G.foodHist.length > 7) G.foodHist.shift();
  breedingCheck();
  quarrelCheck();
}
function dawn() {
  const d = dayOf();
  G.gold += 15;
  const v = G.village;
  v.gold = Math.min(260, v.gold + 30); v.food = Math.min(160, v.food + 20);
  if (v.alert > 0 && d - v.lastRaidDay >= 3) { v.alert--; v.lastRaidDay = d - 1; addLog('人間の村の警戒が少しゆるんだ。', 'war'); }
  let msg = `${d}日目の朝。手下の拾い物 +15G`;
  if (v.conquered) { G.gold += 25; G.food += 20; msg += '／支配した村から貢ぎ物 +25G +20食料'; }
  addLog(msg);
}
function dusk() {
  const v = G.village;
  if (v.conquered || v.alert < 1 || dayOf() < 2) return;
  if (Math.random() < Math.min(0.65, 0.22 * v.alert)) spawnRaiders();
}
function breedingCheck() {
  if (G.monsters.length >= popCap()) return;
  if (G.food < G.monsters.length * 2 + 6) return;
  for (const sp of ['goblin', 'orc'].sort(() => Math.random() - 0.5)) {
    const el = G.monsters.filter(m => m.species === sp && !isChild(m) && visible(m) && m.breedCD <= 0 && m.hunger > 25 &&
      m.energy > 15 && m.hp > maxHp(m) * 0.5 && !(m.task && ['march', 'return', 'defend', 'flee', 'breed', 'sleep', 'quarrel'].includes(m.task.type)));
    if (el.length < 2) continue;
    const fl = el.filter(m => m.flag).sort(() => Math.random() - 0.5), rest = el.filter(m => !m.flag).sort(() => Math.random() - 0.5);
    const pool = fl.concat(rest), a = pool[0], b = pool[1];
    const chance = 0.14 + 0.14 * ((a.flag ? 1 : 0) + (b.flag ? 1 : 0)) + 0.05 * ((a.pers === '陽気') + (b.pers === '陽気'));
    if (Math.random() < chance) {
      const houses = G.buildings.filter(b => b.type === 'house');
      const at = houses.length ? { ...pick(houses).door } : { x: DOOR.x + 20, y: DOOR.y + 6 };
      at.y += 6;
      setTask(a, { type: 'breed', partner: b.id, at, side: -1 });
      setTask(b, { type: 'breed', partner: a.id, at, side: 1 });
      return;
    }
  }
}
function quarrelCheck() {
  for (const m of G.monsters) {
    if (m.pers !== '好戦的' || m.hunger > 15 || G.food >= 1 || !visible(m) || isChild(m) || (m.task && ['quarrel', 'march', 'return', 'defend'].includes(m.task.type))) continue;
    if (Math.random() > 0.3) continue;
    const o = G.monsters.find(o => o !== m && visible(o) && !isChild(o) && dist(o, m) < 50 && !(o.task && ['march', 'return'].includes(o.task.type)));
    if (!o) continue;
    setTask(m, { type: 'quarrel', target: o.id }); setTask(o, { type: 'quarrel', target: m.id });
    addLog(`空腹で気が立った${m.name}が${o.name}に喧嘩を売った！`, 'bad');
    return;
  }
}

// ---------- counter-attack (humans on map) ----------
let humanId = 1;
function spawnRaiders() {
  const v = G.village;
  const n = Math.min(4, 1 + Math.floor(v.alert / 2));
  for (let i = 0; i < n; i++) {
    const type = v.alert >= 3 && i === 0 ? 'adventurer' : 'guard';
    const d = HUMAN[type], mul = 1 + 0.06 * v.alert;
    G.humans.push({ id: humanId++, type, x: W + 10 + i * 14, y: ROAD_Y + (i % 2) * 8 - 4, hp: Math.round(d.hp * mul), maxHp: Math.round(d.hp * mul),
      atk: Math.round(d.atk * mul), cd: 0.3, state: 'advance', dir: -1, alive: true, loot: false, lunge: 0, hitT: 0 });
  }
  showBanner('夜襲！', `人間の討伐隊（${n}人）が魔王城に迫る`);
  addLog(`人間の討伐隊が夜襲を仕掛けてきた！ 起きている魔物が迎え撃つ。`, 'war'); sfx('alarm');
}
function updateHumans(dtH) {
  for (const h of G.humans) {
    if (!h.alive) continue;
    if (h.hitT > 0) h.hitT -= dtH * 3;
    if (h.lunge > 0) h.lunge -= dtH * 5;
    const sp = 40 * dtH;
    if (h.state === 'flee') { h.dir = 1; h.x += sp * 1.2; if (h.x > W + 20) h.alive = false; continue; }
    let tgt = G.monsters.filter(visible).sort((a, b) => dist(a, h) - dist(b, h))[0];
    if (tgt && dist(tgt, h) < 60) {
      if (dist(tgt, h) > 9) { const d = dist(tgt, h); h.x += (tgt.x - h.x) / d * sp; h.y += (tgt.y - h.y) / d * sp; h.dir = tgt.x < h.x ? -1 : 1; }
      else {
        h.cd -= dtH;
        if (h.cd <= 0) {
          h.cd = 0.5; h.lunge = 1;
          const dmg = Math.max(1, Math.round(h.atk * rand(0.8, 1.2)));
          tgt.hp -= dmg; tgt.hitT = 1; floatText(tgt.x, tgt.y - 16, '-' + dmg, '#ff6a6a'); sfx('hit');
          if (tgt.hp <= 0) monsterDown(tgt, '人間の夜襲');
          else if (!tgt.task || !['defend', 'flee', 'march', 'return'].includes(tgt.task.type)) reactToHuman(tgt, h);
        }
      }
    } else {
      const d = dist(h, STORE);
      if (d > 6) { h.x += (STORE.x - h.x) / d * sp; h.y += (STORE.y - h.y) / d * sp; h.dir = STORE.x < h.x ? -1 : 1; }
      else {
        const g = Math.min(G.gold, 20 + G.village.alert * 5), f = Math.min(G.food, 12 + G.village.alert * 3);
        G.gold -= g; G.food -= Math.floor(f); h.state = 'flee'; h.loot = true;
        floatText(h.x, h.y - 18, `-${g}G -${Math.floor(f)}食料`, '#ff6a6a');
        addLog(`人間に食料庫を荒らされた！ ${g}Gと食料${Math.floor(f)}を奪われた。`, 'bad'); sfx('bad');
      }
    }
  }
  G.humans = G.humans.filter(h => h.alive);
  // 魔物の反応
  if (G.humans.length) for (const m of G.monsters) {
    if (!visible(m) && !(m.task && m.task.type === 'sleep' && m.hidden)) continue;
    if (m.task && ['defend', 'flee', 'march', 'return'].includes(m.task.type)) continue;
    const h = G.humans.filter(h => h.state !== 'flee').sort((a, b) => dist(a, m) - dist(b, m))[0];
    if (!h) continue;
    const range = m.hidden ? 0 : (m.task && m.task.type === 'sleep' ? 35 : 90);
    if (dist(h, m) < range) reactToHuman(m, h);
  }
}
function reactToHuman(m, h) {
  if (isChild(m) || m.pers === '臆病' || m.hp < maxHp(m) * 0.25) {
    if (m.pers === '臆病' && !isChild(m)) floatText(m.x, m.y - 16, 'ひぃっ！', '#c0c0ff');
    setTask(m, { type: 'flee' });
  } else { setTask(m, { type: 'defend', target: h.id }); m.cd = rand(0, 0.3); floatText(m.x, m.y - 16, '!', '#ffd24a'); }
}
function hitHuman(h, dmg, m) {
  h.hp -= dmg; h.hitT = 1; floatText(h.x, h.y - 16, '-' + dmg, '#ffffff'); sfx('hit');
  if (h.hp <= 0) {
    h.alive = false; const g = randi(10, 20); G.gold += g; G.stats.kills++; m.kills++;
    burst(h.x, h.y - 6, 'coin', 6); burst(h.x, h.y - 6, 'dust', 6); floatText(h.x, h.y - 22, `撃退！+${g}G`, '#ffd24a');
    addLog(`${m.name}が${HUMAN[h.type].name}を倒した！（+${g}G）`, 'good');
    gainExp(m, 2);
    if (!G.humans.some(o => o.alive && o.state !== 'flee')) { addLog('夜襲を退けた！', 'good'); }
  } else if (h.hp < h.maxHp * 0.2 && Math.random() < 0.3) { h.state = 'flee'; floatText(h.x, h.y - 20, '退却', '#c0c0ff'); }
}

// ---------- buildings ----------
function canPlace(type, tx, ty) {
  const d = BLD[type];
  if (tx < 0 || ty < 0 || tx + d.w > COLS || ty + d.h > ROWS) return false;
  for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) if (grid[y][x]) return false;
  return true;
}
function placeBuilding(type, tx, ty) {
  const d = BLD[type];
  const b = { type, tx, ty, x: tx * 16, y: ty * 16, w: d.w * 16, h: d.h * 16, slots: Array(d.slots).fill(null), acc: 0, growth: 0,
    hitT: [0, 0, 0], born: 1, id: G.nextId++ };
  b.door = { x: b.x + b.w / 2, y: b.y + b.h + 2 };
  b.rate = 12; b.heal = 3; b.name = d.name;
  for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) grid[y][x] = 2;
  G.buildings.push(b);
  return b;
}

// ---------- expedition / battle ----------
function sendExpedition(ids) {
  const ms = ids.map(byId).filter(Boolean);
  if (!ms.length) return;
  ms.forEach((m, i) => { setTask(m, { type: 'march', idx: i }); });
  G.exp = { members: ms.map(m => m.id), phase: 'march', timer: 0, ready: false, loot: null, deposited: false };
  G.stats.raids++;
  addLog(`${ms.length}体の部隊が人間の村へ出撃した！`, 'war');
  showBanner('出撃！', `${ms.map(m => m.name).slice(0, 5).join('・')}${ms.length > 5 ? ' ほか' : ''}`); sfx('fanfare');
}
function updateExpedition(dtH) {
  const ex = G.exp; if (!ex) return;
  if (ex.phase === 'march') ex.members = ex.members.filter(id => { const m = byId(id); return m && m.task && m.task.type === 'march'; });
  const ms = ex.members.map(byId).filter(Boolean);
  if (ex.phase === 'march' && !ms.length) { addLog('出撃は取りやめになった。', 'war'); G.exp = null; return; }
  if (ex.phase === 'arrive' && !ms.some(m => m.task && m.task.type === 'return')) { if (!ex.deposited && ms[0]) depositLoot(ms[0]); finishExpedition(); return; }
  if (ex.phase === 'march') {
    if (!ex.ready && ms.every(m => m.task && m.task.type === 'march' && m.task.phase !== 'go')) ex.ready = true;
    if (ms.length && ms.every(m => m.away)) { ex.phase = 'go'; ex.timer = 3; }
    if (!ms.length) G.exp = null;
  } else if (ex.phase === 'go') {
    if ((ex.timer -= dtH) <= 0) startBattle();
  } else if (ex.phase === 'return') {
    if ((ex.timer -= dtH) <= 0) {
      ex.phase = 'arrive';
      ms.forEach((m, i) => { m.hunger = Math.max(m.hunger, ex.win ? 70 : 40); m.away = false; m.hidden = false; m.x = W + 8 + i * 12; m.y = ROAD_Y + (i % 2) * 6 - 3; m.task = null; setTask(m, { type: 'return', idx: i }); });
      if (!ms.length) G.exp = null;
      return;
    }
  }
}
function depositLoot(m) {
  const ex = G.exp; ex.deposited = true;
  if (ex.win) {
    G.gold += ex.loot.gold; G.food += ex.loot.food;
    burst(STORE.x, STORE.y - 6, 'coin', 14);
    floatText(STORE.x, STORE.y - 24, `+${ex.loot.gold}G  +${ex.loot.food}食料`, '#ffd24a');
    showBanner('凱旋！', `戦利品 ${ex.loot.gold}G ・ 食料${ex.loot.food}`); sfx('fanfare');
    addLog(`部隊が凱旋した！ 戦利品 ${ex.loot.gold}G・食料${ex.loot.food}`, 'good');
  } else {
    showBanner('敗走…', '傷ついた部隊が帰ってきた'); sfx('bad');
    addLog('部隊がボロボロで帰ってきた…', 'bad');
  }
}
function finishExpedition() {
  G.exp = null;
  if (G.village.conquered && !G.finished) {
    G.finished = true;
    setTimeout(showVictory, 1500);
  }
}

// ----- battle scene -----
const bcv = $('bcv'), BW = 384, BH = 216; bcv.width = BW * S; bcv.height = BH * S;
const bctx = bcv.getContext('2d'); bctx.imageSmoothingEnabled = false;
let B = null;
function defenderList(a) {
  const L = [];
  for (let i = 0; i < 3; i++) L.push('villager');
  for (let i = 0; i < Math.min(a, 4); i++) L.push('guard');
  for (let i = 0; i < (a >= 2 ? Math.floor(a / 2) : 0); i++) L.push('adventurer');
  if (a >= 4) L.push('hero');
  return L;
}
function startBattle() {
  const ex = G.exp; ex.phase = 'battle';
  const v = G.village, night = isNight();
  const units = [];
  ex.members.map(byId).filter(Boolean).forEach((m, i) => {
    units.push({ side: 'm', ref: m, name: m.name, spr: getSprite(kindOf(m), palOf(m)), x: rand(26, 100), y: 120 + (i * 37) % 80,
      hp: m.hp, maxHp: maxHp(m), atk: atkOf(m) * timeBonus(m.species), cd: rand(0.3, 1.2), rate: SPECIES[m.species].cd,
      spd: SPECIES[m.species].speed * 0.7, coward: m.pers === '臆病', state: 'fight', lunge: 0, hitT: 0, dir: 1 });
  });
  const mul = 1 + 0.08 * v.alert;
  defenderList(v.alert).forEach((type, i) => {
    const d = HUMAN[type];
    units.push({ side: 'h', type, name: d.name, spr: getSprite('human', d.pal), weapon: d.weapon, x: rand(282, 360), y: 118 + (i * 31) % 84,
      hp: Math.round(d.hp * mul), maxHp: Math.round(d.hp * mul), atk: d.atk * mul, cd: rand(0.5, 1.5), rate: 1.0, spd: 26,
      state: 'fight', lunge: 0, hitT: 0, dir: -1 });
  });
  B = { units, t: 0, speed: 1, over: false, endT: 0, texts: [], fx: [], night, kills: 0, bg: makeBattleBG(night), shown: false };
  G.battle = B;
  $('battle').classList.remove('hidden'); $('battleResult').classList.add('hidden'); $('battleResult').innerHTML = '';
  $('battleTitle').textContent = `⚔ 人間の村で戦闘中（${night ? '夜：ゴブリン攻撃+30%' : '昼：オーク攻撃+20%'}）`;
  $('bFast').textContent = '⏩ 早送り'; $('bSkip').disabled = false; $('bFast').disabled = false;
  sfx('alarm');
}
function updateBattle(dt) {
  if (!B) return;
  const steps = B.speed;
  for (let s = 0; s < steps; s++) battleStep(dt);
  B.texts.forEach(t => { t.life -= dt; t.y -= 12 * dt; }); B.texts = B.texts.filter(t => t.life > 0);
  B.fx.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; }); B.fx = B.fx.filter(p => p.life > 0);
  if (B.over && !B.shown && B.t - B.endT > 1.4) { B.shown = true; finishBattle(); }
}
function battleStep(dt) {
  B.t += dt;
  if (B.t < 1.0) return;
  for (const u of B.units) {
    if (u.lunge > 0) u.lunge -= dt * 5; if (u.hitT > 0) u.hitT -= dt * 4;
    if (u.state === 'flee') { u.x += (u.side === 'm' ? -1 : 1) * 50 * dt; u.dir = u.side === 'm' ? -1 : 1; continue; }
    if (u.state !== 'fight' || B.over) continue;
    const foes = B.units.filter(e => e.side !== u.side && e.state === 'fight');
    if (!foes.length) continue;
    const tg = foes.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    const d = Math.hypot(tg.x - u.x, tg.y - u.y);
    u.dir = tg.x < u.x ? -1 : 1;
    if (d > 13) { u.x += (tg.x - u.x) / d * u.spd * dt; u.y += (tg.y - u.y) / d * u.spd * dt; }
    else if ((u.cd -= dt) <= 0) {
      u.cd = u.rate * rand(0.85, 1.25); u.lunge = 1;
      const crit = Math.random() < 0.1;
      const dmg = Math.max(1, Math.round(u.atk * rand(0.8, 1.2) * (crit ? 1.8 : 1)));
      tg.hp -= dmg; tg.hitT = 1;
      B.texts.push({ x: tg.x, y: tg.y - 22, text: (crit ? '会心 ' : '') + dmg, color: u.side === 'm' ? '#ffffff' : '#ff6a6a', life: 0.9, big: crit });
      for (let i = 0; i < 3; i++) B.fx.push({ x: tg.x, y: tg.y - 8, vx: rand(-30, 30), vy: rand(-50, -10), life: 0.4, c: '#fff27a' });
      sfx('hit');
      if (tg.hp <= 0) { tg.hp = 0; tg.state = 'down'; if (tg.side === 'h') { B.kills++; u.ref && u.ref.kills++; }
        B.texts.push({ x: tg.x, y: tg.y - 30, text: tg.side === 'h' ? '撃破！' : 'ダウン', color: tg.side === 'h' ? '#ffd24a' : '#ff8a8a', life: 1.2 }); }
      else if (tg.side === 'm' && tg.coward && tg.hp < tg.maxHp * 0.35) { tg.state = 'flee'; B.texts.push({ x: tg.x, y: tg.y - 30, text: '逃げた！', color: '#c0c0ff', life: 1.2 }); }
      else if (tg.side === 'h' && tg.hp < tg.maxHp * 0.2 && Math.random() < 0.3) { tg.state = 'flee'; B.texts.push({ x: tg.x, y: tg.y - 30, text: '逃走', color: '#c0c0ff', life: 1.2 }); }
    }
  }
  const mA = B.units.some(u => u.side === 'm' && u.state === 'fight'), hA = B.units.some(u => u.side === 'h' && u.state === 'fight');
  if (!B.over && (!mA || !hA)) { B.over = true; B.win = !hA && mA; B.endT = B.t; sfx(B.win ? 'fanfare' : 'bad'); }
}
function finishBattle() {
  const ex = G.exp, v = G.village, win = B.win;
  const res = { dead: [], hurt: [], fled: [], ok: [] };
  for (const u of B.units.filter(u => u.side === 'm')) {
    const m = u.ref; m.battles++;
    if (u.state === 'down') {
      if (Math.random() < SPECIES[m.species].death * (win ? 0.6 : 1)) { res.dead.push(m.name); m.alive = false; G.monsters = G.monsters.filter(o => o !== m); addGrave(m, '村での戦い'); if (G.selected === m) selectMonster(null); }
      else { m.hp = 1; res.hurt.push(m.name); }
    } else {
      m.hp = Math.max(1, Math.round(u.hp)); gainExp(m, win ? 3 : 1);
      (u.state === 'flee' ? res.fled : res.ok).push(m.name);
    }
  }
  let loot = { gold: 0, food: 0 }, dmg = 0;
  const survivors = res.ok.length + res.hurt.length + res.fled.length;
  if (win) {
    loot.gold = Math.round(v.gold * 0.6) + B.kills * 5; loot.food = Math.round(v.food * 0.6);
    v.gold -= Math.round(v.gold * 0.6); v.food -= loot.food;
    dmg = Math.min(50, 12 + 4 * res.ok.length + 2 * B.kills); v.resist = Math.max(0, v.resist - dmg);
    G.stats.wins++;
    if (v.resist <= 0) v.conquered = true;
  }
  v.alert = v.conquered ? 0 : v.alert + (win ? 1 : 0); v.lastRaidDay = dayOf();
  ex.win = win; ex.loot = loot;
  ex.members = ex.members.filter(id => byId(id));
  addLog(win ? `村での戦闘に勝利！ 抵抗力 -${dmg}（残り${v.resist}）` : '村での戦闘に敗北…', win ? 'good' : 'bad');
  if (res.dead.length) addLog(`戦死：${res.dead.join('、')}`, 'bad');
  const el = $('battleResult');
  el.innerHTML = `<h2 class="${win ? 'win' : 'lose'}">${win ? (v.conquered ? '👑 村を支配した！' : '勝利！') : '敗北…'}</h2>
    ${win ? `<div>戦利品：💰${loot.gold}G　🍖食料${loot.food}（部隊が城に持ち帰る）</div>
      <div>村の抵抗力：-${dmg} → <b>${v.resist}</b> / ${v.maxResist}</div>` : '<div>村人たちに追い返された。鍛え直して出直そう。</div>'}
    <div>撃破：${B.kills}人</div>
    ${res.ok.length ? `<div>無事：${res.ok.join('、')}</div>` : ''}
    ${res.fled.length ? `<div>逃走：${res.fled.join('、')}</div>` : ''}
    ${res.hurt.length ? `<div style="color:#ffb070">重傷：${res.hurt.join('、')}</div>` : ''}
    ${res.dead.length ? `<div style="color:#ff8a8a">戦死：${res.dead.join('、')} 🪦</div>` : ''}
    ${!win ? '' : `<div class="note">村の警戒度が上がった（${v.alert}）。守りが固くなり、夜襲を受けることも…</div>`}
    <div class="mbtns"><button class="go" id="bClose">${survivors ? '城へ帰還する' : '閉じる'}</button></div>`;
  el.classList.remove('hidden'); $('bSkip').disabled = true; $('bFast').disabled = true;
  $('bClose').onclick = () => {
    $('battle').classList.add('hidden'); G.battle = null; B = null;
    if (ex.members.length) { ex.phase = 'return'; ex.timer = 3; }
    else { addLog('部隊は全滅した…', 'bad'); G.exp = null; if (v.conquered && !G.finished) { G.finished = true; setTimeout(showVictory, 800); } }
  };
}
function makeBattleBG(night) {
  const c = makeCanvas(BW, BH), x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 90);
  sky.addColorStop(0, night ? '#0a0820' : '#6a7ac0'); sky.addColorStop(1, night ? '#2a1a40' : '#c8b8d8');
  x.fillStyle = sky; x.fillRect(0, 0, BW, 90);
  if (night) { x.fillStyle = '#fff'; for (let i = 0; i < 40; i++) x.fillRect(randi(0, BW), randi(0, 60), 1, 1); x.fillStyle = '#f8f0c0'; x.fillRect(320, 14, 10, 10); }
  x.fillStyle = night ? '#1a2030' : '#5a7a6a'; for (let i = 0; i < BW; i += 2) { const h = 14 + Math.sin(i / 30) * 8 + Math.sin(i / 11) * 3; x.fillRect(i, 90 - h, 2, h); }
  x.fillStyle = night ? '#1e2a1e' : '#4a7a3a'; x.fillRect(0, 88, BW, BH - 88);
  for (let i = 0; i < 400; i++) { x.fillStyle = Math.random() < .5 ? (night ? '#26341f' : '#5a8a44') : (night ? '#16201a' : '#3e6a30'); x.fillRect(randi(0, BW), randi(90, BH), 2, 1); }
  // village houses
  const houses = [[214, 52], [262, 44], [312, 54], [356, 46], [236, 74], [338, 76]];
  houses.forEach(([hx, hy]) => {
    x.fillStyle = '#d8c8a0'; x.fillRect(hx, hy + 12, 26, 16);
    x.fillStyle = '#8a6a4a'; x.fillRect(hx, hy + 12, 26, 2);
    for (let r = 0; r < 13; r++) { x.fillStyle = r % 3 ? '#a03a2a' : '#7a2a1e'; x.fillRect(hx + 13 - r - 2, hy + r, (r + 2) * 2, 1); }
    x.fillStyle = '#5a3a20'; x.fillRect(hx + 10, hy + 19, 6, 9);
    x.fillStyle = night ? '#ffcc55' : '#4a5a7a'; x.fillRect(hx + 3, hy + 16, 4, 4); x.fillRect(hx + 19, hy + 16, 4, 4);
  });
  x.fillStyle = '#7a5a3a'; for (let i = 196; i < BW; i += 8) { x.fillRect(i, 100, 2, 12); } x.fillRect(196, 103, BW - 196, 2);
  x.fillStyle = '#8a8a9a'; x.fillRect(280, 92, 14, 8); x.fillStyle = '#3a4a8a'; x.fillRect(282, 92, 10, 3);
  x.fillStyle = '#5a4632'; x.fillRect(0, 150, BW, 10);
  return c;
}
function drawBattle() {
  if (!B) return;
  const c = bctx; c.setTransform(S, 0, 0, S, 0, 0); c.imageSmoothingEnabled = false;
  c.drawImage(B.bg, 0, 0);
  const units = B.units.slice().sort((a, b) => a.y - b.y);
  for (const u of units) {
    if (u.x < -20 || u.x > BW + 20) continue;
    const s = u.spr, fr = (u.state === 'fight' && Math.floor(B.t * 6 + u.y) % 2) ? s.B : s.A;
    const lx = u.lunge > 0 ? Math.sin(u.lunge * Math.PI) * 5 * u.dir : 0;
    const x0 = Math.round(u.x - s.w / 2 + lx), y0 = Math.round(u.y - s.h);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(u.x, u.y, s.w * 0.45, 2.5, 0, 0, 7); c.fill();
    c.save();
    if (u.state === 'down') { c.globalAlpha = 0.65; c.translate(u.x, u.y - 3); c.rotate(u.side === 'm' ? -Math.PI / 2 : Math.PI / 2); c.drawImage(s.A, -s.w / 2, -s.h / 2); }
    else { if (u.dir < 0) { c.translate(x0 + s.w, y0); c.scale(-1, 1); } else c.translate(x0, y0); c.drawImage(fr, 0, 0);
      if (u.weapon) drawWeapon(c, u.weapon, s.w, u.lunge); if (u.hitT > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${u.hitT})`; c.fillRect(0, 0, s.w, s.h); } }
    c.restore();
    if (u.state === 'fight') {
      c.fillStyle = '#200'; c.fillRect(u.x - 8, y0 - 5, 16, 3);
      c.fillStyle = u.side === 'm' ? '#7be05a' : '#ff5a5a'; c.fillRect(u.x - 8, y0 - 5, 16 * u.hp / u.maxHp, 3);
      if (u.side === 'm') { c.font = 'bold 6px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(u.name, u.x, y0 - 7); }
    }
  }
  B.fx.forEach(p => { c.fillStyle = p.c; c.fillRect(p.x, p.y, 1.5, 1.5); });
  c.textAlign = 'center';
  B.texts.forEach(t => outlineText(c, t.text, t.x, t.y, t.color, t.big ? 10 : 8));
  if (B.night) { c.fillStyle = 'rgba(10,5,40,.25)'; c.fillRect(0, 0, BW, BH); }
  if (B.t < 1.0) outlineText(c, '戦闘開始！', BW / 2, BH / 2, '#ffd24a', 22);
  if (B.over) outlineText(c, B.win ? '勝利！' : '敗北…', BW / 2, 60, B.win ? '#ffd24a' : '#ff6a6a', 26);
}
function drawWeapon(c, w, sw, lunge) {
  c.fillStyle = '#7a5a3a';
  if (w === 'fork') { c.fillRect(sw - 1, 2, 1, 12); c.fillStyle = '#c0c0c8'; c.fillRect(sw - 3, 1, 5, 1); c.fillRect(sw - 3, 0, 1, 1); c.fillRect(sw - 1, 0, 1, 1); c.fillRect(sw + 1, 0, 1, 1); }
  else if (w === 'spear') { c.fillRect(sw - 1, 0, 1, 14); c.fillStyle = '#e0e8ff'; c.fillRect(sw - 2, -3, 3, 3); }
  else { c.fillStyle = '#e0e8ff'; c.fillRect(sw - 1, 3, 1, 7); c.fillStyle = '#c0a040'; c.fillRect(sw - 3, 9, 5, 1); }
}

// ---------- effects ----------
function burst(x, y, type, n) {
  for (let i = 0; i < n; i++) G.fx.push({ x, y, vx: rand(-18, 18), vy: rand(-30, -8), life: rand(0.6, 1.2), max: 1.2, type });
}
function floatText(x, y, text, color, icon) {
  if (G.texts.length > 40) G.texts.shift();
  G.texts.push({ x, y, text, color, icon, life: 1.4 });
}
function showBanner(text, sub) { G.banner = { text, sub, t: 0 }; }
function toast(text) { G.toast = { text, t: 0 }; }
function addLog(text, cls = '') {
  const t = `${dayOf()}日 ${pad2(Math.floor(hourOf()))}時`;
  G.logs.unshift({ text, cls, t }); if (G.logs.length > 40) G.logs.pop();
  renderLog();
}
function renderLog() {
  $('log').innerHTML = G.logs.slice(0, 4).map(l => `<div class="${l.cls}">[${l.t}] ${l.text}</div>`).join('');
}

// ---------- sound (WebAudio, 素材不要) ----------
let AC = null, lastSfx = {};
function initAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
function sfx(type) {
  if (!AC || G.speed === 0 && type !== 'build') return;
  const now = AC.currentTime;
  if (lastSfx[type] && now - lastSfx[type] < 0.09) return; lastSfx[type] = now;
  const seq = {
    hit: [[150, 0.05, 'square', 0.05]], coin: [[880, 0.06, 'square', 0.04], [1320, 0.08, 'square', 0.04]],
    birth: [[523, 0.1, 'triangle', 0.1], [659, 0.1, 'triangle', 0.1], [784, 0.18, 'triangle', 0.1]],
    level: [[660, 0.06, 'square', 0.04], [990, 0.1, 'square', 0.04]], build: [[110, 0.12, 'triangle', 0.15], [90, 0.12, 'triangle', 0.15]],
    fanfare: [[392, 0.12, 'square', 0.06], [523, 0.12, 'square', 0.06], [659, 0.12, 'square', 0.06], [784, 0.3, 'square', 0.06]],
    bad: [[300, 0.15, 'sawtooth', 0.05], [220, 0.25, 'sawtooth', 0.05]], alarm: [[700, 0.1, 'square', 0.05], [500, 0.1, 'square', 0.05], [700, 0.1, 'square', 0.05]],
    click: [[600, 0.03, 'square', 0.03]],
  }[type];
  if (!seq) return;
  let t = now;
  for (const [f, d, w, v] of seq) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = w; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
  }
}

// ---------- rendering ----------
let groundCanvas;
function makeGround() {
  const c = makeCanvas(W, H), x = c.getContext('2d');
  let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  x.fillStyle = '#2b3a2c'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) { x.fillStyle = r() < .5 ? '#33463a' : '#223026'; x.fillRect(Math.floor(r() * W), Math.floor(r() * H), r() < .3 ? 2 : 1, 1); }
  for (let i = 0; i < 40; i++) { x.fillStyle = r() < .5 ? '#8a5ab0' : '#c0b060'; x.fillRect(Math.floor(r() * W), 20 + Math.floor(r() * (H - 40)), 1, 1); }
  // road
  for (let px = 96; px < W; px++) { for (let py = ROAD_Y - 8; py < ROAD_Y + 8; py++) { const edge = py === ROAD_Y - 8 || py === ROAD_Y + 7; x.fillStyle = edge ? '#3e3226' : (r() < .1 ? '#6a5640' : '#584634'); x.fillRect(px, py, 1, 1); } }
  // castle plaza
  x.fillStyle = '#3a3440'; x.fillRect(20, 156, 116, 18);
  for (let i = 0; i < 120; i++) { x.fillStyle = r() < .5 ? '#45404c' : '#2e2a34'; x.fillRect(20 + Math.floor(r() * 116), 156 + Math.floor(r() * 18), 3, 1); }
  // graveyard
  x.fillStyle = '#26221e'; x.fillRect(14, 180, 78, 44);
  x.fillStyle = '#4a3a2a'; for (let i = 14; i < 92; i += 4) { x.fillRect(i, 180, 1, 4); x.fillRect(i, 220, 1, 4); } x.fillRect(14, 181, 78, 1); x.fillRect(14, 221, 78, 1);
  // forest rows
  const tree = (tx, ty) => {
    x.fillStyle = '#3a2a1e'; x.fillRect(tx + 6, ty + 10, 3, 5);
    const cols = ['#142418', '#1c3220', '#24402a'];
    for (let k = 0; k < 3; k++) { x.fillStyle = cols[k]; const s = 12 - k * 3; x.fillRect(tx + 8 - s / 2, ty + 1 + k * 2, s, 10 - k * 2); }
  };
  for (let i = -8; i < W; i += 11) { tree(i + Math.floor(r() * 4), -4 + Math.floor(r() * 4)); tree(i + Math.floor(r() * 4), H - 16 + Math.floor(r() * 3)); }
  return c;
}

function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function tri(c, cx, top, hgt, col, w0 = 0) { for (let i = 0; i < hgt; i++) px(c, cx - w0 - i, top + i, (w0 + i) * 2, 1, col); }

function drawCastle(c, night) {
  const win = night ? '#ffcc55' : '#1a1020';
  px(c, 28, 84, 56, 76, '#3d3550'); // keep
  for (let y = 88; y < 158; y += 6) for (let x = 28 + ((y / 6) % 2) * 4; x < 84; x += 8) px(c, x, y, 7, 1, '#322b44');
  for (let x = 28; x < 84; x += 6) px(c, x, 80, 4, 4, '#3d3550');
  // towers
  [[16, 70], [80, 70]].forEach(([tx, ty]) => {
    px(c, tx, ty, 18, 90, '#46405c'); px(c, tx, ty, 2, 90, '#2a2438'); px(c, tx + 16, ty, 2, 90, '#57506e');
    tri(c, tx + 9, ty - 18, 18, '#5a2a7a'); tri(c, tx + 9, ty - 18, 18, '#5a2a7a');
    px(c, tx + 8, ty - 22, 2, 4, '#c86cff');
    px(c, tx + 6, ty + 14, 6, 8, win); px(c, tx + 6, ty + 40, 6, 8, win);
  });
  px(c, 50, 64, 12, 20, '#46405c'); tri(c, 56, 48, 16, '#6a2a8a'); px(c, 55, 44, 2, 4, '#ffd24a');
  px(c, 53, 70, 6, 6, win);
  // banners
  [[36, 92], [68, 92]].forEach(([bx, by]) => { px(c, bx, by, 8, 22, '#6a1a5a'); px(c, bx, by + 22, 4, 3, '#6a1a5a'); px(c, bx + 3, by + 6, 2, 2, '#f0e0ff'); px(c, bx + 2, by + 9, 4, 1, '#f0e0ff'); });
  // gate
  px(c, 44, 126, 24, 34, '#120a18'); tri(c, 56, 118, 8, '#120a18', 4);
  for (let x = 46; x < 68; x += 4) px(c, x, 124, 1, 36, '#3a3040');
  px(c, 53, 110, 6, 5, '#e8e0f0'); px(c, 54, 112, 1, 1, '#200'); px(c, 57, 112, 1, 1, '#200');
  const sl = sleepersAt(CASTLE_PLACE);
  if (sl > 0) zzz(c, 64, 108, sl);
}
function zzz(c, x, y, n) {
  c.font = 'bold 7px sans-serif'; c.textAlign = 'left';
  const t = performance.now() / 600;
  for (let i = 0; i < Math.min(3, n); i++) outlineText(c, 'z', x + i * 4 + Math.sin(t + i) * 1.5, y - i * 5 - (t * 3 % 3), '#c8d0ff', 7 - i);
}
function drawHouse(c, b, night) {
  const x = b.x, y = b.y;
  px(c, x + 3, y + 14, 26, 17, '#6a4a32'); for (let j = y + 17; j < y + 31; j += 4) px(c, x + 3, j, 26, 1, '#553a26');
  for (let i = 0; i < 14; i++) px(c, x + 16 - 2 - i, y + 1 + i, 4 + i * 2, 1, i % 3 === 2 ? '#5a1e2c' : '#7a2a3a');
  px(c, x + 15, y - 2, 3, 3, '#e8e0d0'); px(c, x + 15, y - 1, 1, 1, '#200'); px(c, x + 17, y - 1, 1, 1, '#200');
  px(c, x + 13, y + 22, 6, 9, '#2a1a14'); px(c, x + 17, y + 26, 1, 1, '#c0a040');
  const sl = sleepersAt(b);
  px(c, x + 6, y + 18, 5, 5, night || sl ? '#ffcc55' : '#1a1020'); px(c, x + 21, y + 18, 5, 5, night || sl ? '#ffcc55' : '#1a1020');
  if (sl) zzz(c, x + 24, y + 8, sl);
  c.font = 'bold 5px sans-serif'; c.textAlign = 'center';
}
function drawFarm(c, b) {
  const x = b.x, y = b.y;
  px(c, x + 1, y + 3, 46, 28, '#3e2a1c');
  for (let r = 0; r < 3; r++) px(c, x + 3, y + 7 + r * 8, 42, 3, '#2e1e14');
  const g = b.growth % 4, stage = Math.floor(g);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const cx = x + 5 + i * 6, cy = y + 9 + r * 8;
    const h = 1 + stage + ((i + r) % 2);
    px(c, cx, cy - h, 1, h, '#5aa040'); px(c, cx - 1, cy - h, 3, 1, '#7ac05a');
    if (stage >= 3) px(c, cx - 1, cy - h - 2, 3, 2, (i + r) % 2 ? '#a050c0' : '#e08030');
  }
  px(c, x, y + 2, 48, 1, '#6a4a2a'); px(c, x, y + 31, 48, 1, '#6a4a2a');
  for (let i = 0; i < 48; i += 6) { px(c, x + i, y, 1, 4, '#6a4a2a'); px(c, x + i, y + 29, 1, 4, '#6a4a2a'); }
  // scarecrow skull
  px(c, x + 44, y - 6, 1, 12, '#6a4a2a'); px(c, x + 41, y - 2, 7, 1, '#6a4a2a'); px(c, x + 43, y - 9, 3, 3, '#e8e0d0');
}
function drawTraining(c, b) {
  const x = b.x, y = b.y;
  px(c, x + 1, y + 4, 46, 27, '#6a5a3a');
  for (let i = 0; i < 30; i++) px(c, x + 2 + (i * 37) % 44, y + 6 + (i * 13) % 24, 2, 1, '#7a6a48');
  for (let i = 0; i < 48; i += 8) px(c, x + i, y + 2, 2, 6, '#5a3a20'); px(c, x, y + 3, 48, 1, '#5a3a20');
  b.hitT = b.hitT || [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const dx = x + 14 + i * 16, dy = y + 26, wob = b.hitT[i] > 0 ? Math.round(Math.sin(b.hitT[i] * 12) * 2) : 0;
    px(c, dx, dy - 14, 2, 14, '#5a3a20');
    px(c, dx - 3 + wob, dy - 16, 8, 9, '#c8a050'); px(c, dx - 3 + wob, dy - 16, 8, 1, '#8a6a30');
    px(c, dx - 1 + wob, dy - 13, 4, 4, '#c03030'); px(c, dx + wob, dy - 12, 2, 2, '#f0e0d0');
    px(c, dx - 2 + wob, dy - 21, 6, 5, '#d8b860');
  }
  // weapon rack
  px(c, x + 2, y + 10, 6, 1, '#5a3a20'); px(c, x + 3, y + 6, 1, 10, '#c0c8d8'); px(c, x + 6, y + 7, 1, 9, '#c0c8d8');
}
function drawStore(c) {
  const x = STORE.x, y = STORE.y;
  px(c, x - 12, y - 10, 12, 10, '#6a4a2a'); px(c, x - 12, y - 10, 12, 1, '#8a6a3a'); px(c, x - 12, y - 6, 12, 1, '#4a3020');
  const n = Math.min(14, Math.ceil(G.food / 8));
  for (let i = 0; i < n; i++) c.drawImage(ICON.meat, Math.round(x + (i % 5) * 4 - 2), Math.round(y - 6 - Math.floor(i / 5) * 4));
  // gold chest
  const gx = x - 26, gy = y - 2;
  px(c, gx, gy - 8, 12, 8, '#5a3a20'); px(c, gx, gy - 8, 12, 2, '#7a5a30'); px(c, gx + 5, gy - 6, 2, 2, '#ffd24a');
  const gn = Math.min(10, Math.ceil(G.gold / 25));
  for (let i = 0; i < gn; i++) px(c, gx + 1 + (i % 5) * 2, gy - 10 - Math.floor(i / 5) * 2, 2, 2, i % 2 ? '#ffcc33' : '#fff2a0');
  // torch
  const fl = Math.sin(performance.now() / 120) > 0;
  px(c, x + 22, y - 14, 1, 12, '#5a3a20'); px(c, x + 21, y - 17, 3, 3, fl ? '#ff9a30' : '#ffcc55');
}
function drawBush(c, b) {
  px(c, b.x - 6, b.y - 8, 12, 8, '#1e3a24'); px(c, b.x - 4, b.y - 10, 8, 3, '#2a4a2e'); px(c, b.x - 6, b.y - 1, 12, 1, '#142418');
  const pos = [[-3, -6], [2, -4], [-1, -3]];
  for (let i = 0; i < b.berries; i++) px(c, b.x + pos[i][0], b.y + pos[i][1], 2, 2, '#e04060');
}
function drawGrave(c, g) {
  px(c, g.x - 3, g.y - 9, 7, 9, '#7a7a88'); px(c, g.x - 2, g.y - 10, 5, 1, '#7a7a88'); px(c, g.x - 3, g.y - 9, 1, 9, '#5a5a68');
  px(c, g.x, g.y - 8, 1, 5, '#3a3a48'); px(c, g.x - 1, g.y - 7, 3, 1, '#3a3a48');
}

function outlineText(c, text, x, y, col, size = 7) {
  c.font = `bold ${size}px sans-serif`; c.lineWidth = Math.max(1.5, size / 4); c.strokeStyle = '#120818'; c.lineJoin = 'round';
  c.strokeText(text, x, y); c.fillStyle = col; c.fillText(text, x, y);
}

function drawMonster(c, m, rt) {
  const s = getSprite(kindOf(m), palOf(m));
  const t = m.task;
  let fr = m.moving && Math.floor(rt * 7 + m.id) % 2 ? s.B : s.A, ox = 0, oy = 0;
  if (t && t.phase === 'do' && t.type === 'work') oy = Math.floor(rt * 3 + m.id) % 2 ? -1 : 0;
  if (t && t.phase === 'do' && t.type === 'train') ox = Math.max(0, Math.sin(rt * 9 + m.id)) * 3;
  if (t && t.type === 'quarrel' && t.phase === 'do') { ox = rand(-1.5, 1.5); oy = rand(-1, 0); }
  if (m.lunge > 0) { ox += m.lunge * 4 * m.dir; m.lunge -= 0.08; }
  if (t && t.type === 'eat' && t.phase === 'do') oy = Math.floor(rt * 5) % 2 ? -1 : 0;
  const lying = t && t.type === 'sleep' && t.phase === 'sleep' && !m.hidden;
  // shadow
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(m.x, m.y, s.w * 0.42, 2, 0, 0, 7); c.fill();
  if (G.selected === m) { c.strokeStyle = '#ffd24a'; c.lineWidth = 1; c.beginPath(); c.ellipse(m.x, m.y, s.w * 0.6, 3.5, 0, 0, 7); c.stroke(); }
  const sc = m.growT > 0 ? 1 + Math.sin(m.growT * Math.PI) * 0.35 : 1;
  c.save();
  if (lying) { c.translate(m.x, m.y - 4); c.rotate(m.dir * Math.PI / 2); c.drawImage(s.A, -s.w / 2, -s.h / 2); c.restore(); }
  else {
    const x0 = Math.round(m.x + ox), y0 = Math.round(m.y + oy);
    c.translate(x0, y0); c.scale(sc * (m.dir < 0 ? -1 : 1), sc);
    c.drawImage(fr, -Math.floor(s.w / 2), -s.h);
    if (m.hitT > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,80,80,${m.hitT * 0.8})`; c.fillRect(-s.w / 2, -s.h, s.w, s.h); }
    c.restore();
  }
  // icon above
  const top = m.y - s.h - 4;
  let icon = null;
  if (lying) zzz(c, m.x + 3, m.y - 8, 2);
  else if (t) {
    if (t.type === 'eat' && t.phase === 'do') icon = 'meat';
    else if (t.type === 'work' && t.phase === 'do') icon = 'hoe';
    else if (t.type === 'train' && t.phase === 'do') icon = 'sword';
    else if (t.type === 'breed' && t.phase !== 'go') icon = 'heart';
    else if (t.type === 'quarrel' || t.type === 'defend') icon = 'anger';
    else if (t.type === 'return' && G.exp && G.exp.win && !G.exp.deposited) icon = 'sack';
  }
  if (!icon && m.hunger < 12 && Math.floor(rt * 2) % 2) icon = 'meat';
  if (!icon && m.hp < maxHp(m) * 0.35) icon = 'bandage';
  if (icon && !lying) c.drawImage(ICON[icon], Math.round(m.x - ICON[icon].width / 2), Math.round(top - ICON[icon].height));
  if (m.flag && !lying) c.drawImage(ICON.heart, Math.round(m.x + s.w / 2 - 2), Math.round(m.y - s.h - 3));
  if (t && t.type === 'march' && t.idx === 0) { // 軍旗
    px(c, Math.round(m.x - 6), Math.round(m.y - s.h - 10), 1, s.h + 8, '#5a3a20');
    px(c, Math.round(m.x - 5), Math.round(m.y - s.h - 10), 8, 5, '#7a1a8a'); px(c, Math.round(m.x - 3), Math.round(m.y - s.h - 9), 2, 2, '#f0e0ff');
  }
  if (m.hp < maxHp(m) && !lying) {
    px(c, Math.round(m.x - 6), Math.round(m.y + 2), 12, 2, '#300');
    px(c, Math.round(m.x - 6), Math.round(m.y + 2), Math.max(0, Math.round(12 * m.hp / maxHp(m))), 2, m.hp < maxHp(m) * 0.35 ? '#ff5a5a' : '#7be05a');
  }
}
function drawHuman(c, h, rt) {
  const d = HUMAN[h.type], s = getSprite('human', d.pal);
  const fr = Math.floor(rt * 7 + h.id) % 2 ? s.B : s.A;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(h.x, h.y, 4, 2, 0, 0, 7); c.fill();
  c.save();
  const ox = h.lunge > 0 ? h.lunge * 4 * h.dir : 0;
  c.translate(Math.round(h.x + ox), Math.round(h.y)); if (h.dir < 0) c.scale(-1, 1);
  c.translate(-Math.floor(s.w / 2), -s.h); c.drawImage(fr, 0, 0); drawWeapon(c, d.weapon, s.w, 0);
  if (h.hitT > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${h.hitT})`; c.fillRect(0, 0, s.w, s.h); }
  c.restore();
  if (h.loot) c.drawImage(ICON.sack, Math.round(h.x - 3), Math.round(h.y - s.h - 8));
  px(c, Math.round(h.x - 6), Math.round(h.y - s.h - 3), 12, 2, '#300'); px(c, Math.round(h.x - 6), Math.round(h.y - s.h - 3), Math.round(12 * h.hp / h.maxHp), 2, '#ff5a5a');
}

const lightCv = makeCanvas(W * S, H * S), lctx = lightCv.getContext('2d');
function darkness() {
  const h = hourOf();
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 20) return (h - 17) / 3 * 0.62;
  if (h >= 20 || h < 4) return 0.62;
  return (7 - h) / 3 * 0.62;
}
function drawWorld(rt) {
  const c = ctx; c.setTransform(S, 0, 0, S, 0, 0); c.imageSmoothingEnabled = false;
  c.drawImage(groundCanvas, 0, 0);
  const night = darkness() > 0.3;
  // flat buildings first
  G.buildings.forEach(b => { if (b.type === 'farm') drawFarm(c, b); if (b.type === 'training') drawTraining(c, b); });
  G.graves.forEach(g => drawGrave(c, g));
  // ghost
  if (G.build && G.ghost) {
    const d = BLD[G.build], ok = canPlace(G.build, G.ghost.tx, G.ghost.ty);
    c.fillStyle = ok ? 'rgba(120,255,120,.35)' : 'rgba(255,80,80,.35)'; c.fillRect(G.ghost.tx * 16, G.ghost.ty * 16, d.w * 16, d.h * 16);
    c.strokeStyle = ok ? '#7be05a' : '#ff5a5a'; c.lineWidth = 1; c.strokeRect(G.ghost.tx * 16 + .5, G.ghost.ty * 16 + .5, d.w * 16 - 1, d.h * 16 - 1);
  }
  const ds = [];
  ds.push({ y: 160, f: () => drawCastle(c, night) });
  ds.push({ y: STORE.y, f: () => drawStore(c) });
  G.buildings.forEach(b => { if (b.type === 'house') ds.push({ y: b.y + 31, f: () => drawHouse(c, b, night) }); });
  G.bushes.forEach(b => ds.push({ y: b.y, f: () => drawBush(c, b) }));
  G.monsters.forEach(m => { if (visible(m)) ds.push({ y: m.y, f: () => drawMonster(c, m, rt) }); });
  G.humans.forEach(h => ds.push({ y: h.y, f: () => drawHuman(c, h, rt) }));
  ds.sort((a, b) => a.y - b.y).forEach(d => d.f());
  // fx
  for (const p of G.fx) {
    const a = clamp(p.life / 0.6, 0, 1); c.globalAlpha = a;
    if (p.type === 'dust') px(c, p.x, p.y, 2, 2, '#a89a8a');
    else if (p.type === 'spark') px(c, p.x, p.y, 1, 1, '#fff27a');
    else c.drawImage(ICON[p.type], Math.round(p.x - 3), Math.round(p.y - 3));
    c.globalAlpha = 1;
  }
  c.textAlign = 'center';
  for (const t of G.texts) {
    c.globalAlpha = clamp(t.life / 0.5, 0, 1);
    outlineText(c, t.text, t.x + (t.icon ? 4 : 0), t.y, t.color, 7);
    if (t.icon) c.drawImage(ICON[t.icon], Math.round(t.x - 10), Math.round(t.y - 6));
    c.globalAlpha = 1;
  }
  // night
  const dk = darkness();
  if (dk > 0) {
    lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, W * S, H * S);
    lctx.fillStyle = `rgba(12,6,36,${dk})`; lctx.fillRect(0, 0, W * S, H * S);
    lctx.globalCompositeOperation = 'destination-out';
    const light = (x, y, r, a = 1) => { const g = lctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); lctx.fillStyle = g; lctx.fillRect((x - r) * S, (y - r) * S, r * 2 * S, r * 2 * S); };
    const fl = 1 + Math.sin(rt * 8) * 0.05;
    light(STORE.x + 22, STORE.y - 16, 40 * fl); light(56, 130, 46); light(25, 90, 18); light(89, 90, 18);
    G.buildings.forEach(b => { if (b.type === 'house') light(b.x + 16, b.y + 22, 26, 0.8); else light(b.x + 24, b.y + 16, 22, 0.5); });
    G.humans.forEach(h => light(h.x, h.y - 6, 18, 0.7));
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(lightCv, 0, 0); c.setTransform(S, 0, 0, S, 0, 0);
  }
  // banner / toast
  if (G.banner) {
    const b = G.banner, a = b.t < 0.3 ? b.t / 0.3 : b.t > 2.6 ? Math.max(0, (3.2 - b.t) / 0.6) : 1;
    c.globalAlpha = a; c.fillStyle = 'rgba(15,5,25,.7)'; c.fillRect(0, H / 2 - 30, W, 46);
    c.textAlign = 'center'; const sc = b.t < 0.3 ? 1.5 - b.t / 0.6 : 1;
    outlineText(c, b.text, W / 2, H / 2 - 4, '#ffd24a', Math.round(22 * sc));
    if (b.sub) outlineText(c, b.sub, W / 2, H / 2 + 10, '#efe6ff', 8);
    c.globalAlpha = 1;
  }
  if (G.toast) {
    c.globalAlpha = G.toast.t > 1.8 ? Math.max(0, (2.4 - G.toast.t) / 0.6) : 1;
    c.font = 'bold 8px sans-serif'; const w = c.measureText(G.toast.text).width + 12;
    c.fillStyle = 'rgba(15,5,25,.85)'; c.fillRect(W / 2 - w / 2, H - 34, w, 14);
    c.textAlign = 'center'; outlineText(c, G.toast.text, W / 2, H - 24, '#ffffff', 8); c.globalAlpha = 1;
  }
}

// ---------- UI ----------
const GOALS = [
  { text: '<b>農場</b>を建てよう（魔物が働いて食料を作る）', done: () => G.buildings.some(b => b.type === 'farm') },
  { text: '<b>住居</b>を建てよう（収容数が増え、子どもが生まれる余地ができる）', done: () => G.buildings.some(b => b.type === 'house') },
  { text: '<b>子ども</b>の誕生を待とう（住居に空き＋食料に余裕。♥指定で確率UP）', done: () => G.stats.births > 0 },
  { text: '<b>訓練場</b>を建てて魔物を鍛えよう', done: () => G.buildings.some(b => b.type === 'training') },
  { text: '<b>侵略</b>ボタンから部隊を送り、村に勝利しよう', done: () => G.stats.wins > 0 },
  { text: '村の<b>抵抗力を0</b>にして支配しよう', done: () => G.village.conquered },
];
function updateGoals() {
  while (G.goalIdx < GOALS.length && GOALS[G.goalIdx].done()) {
    G.goalIdx++; G.gold += 20; toast('目標達成！ ボーナス +20G'); sfx('coin');
  }
  $('goal').innerHTML = G.goalIdx < GOALS.length ? `🎯 目標：${GOALS[G.goalIdx].text}` : '🎯 全目標達成！ 魔王軍の繁栄を見守ろう';
}
let uiT = 0, infoT = 0;
function updateUI(dt) {
  uiT += dt; infoT += dt;
  if (uiT < 0.15) return; uiT = 0;
  const h = hourOf();
  $('clock').textContent = `${dayOf()}日目 ${pad2(Math.floor(h))}:${pad2(Math.floor((h % 1) * 60 / 10) * 10)}`;
  $('dayicon').textContent = isNight() ? '🌙' : (h < 7 || h >= 17 ? '🌆' : '☀');
  $('gold').textContent = Math.floor(G.gold);
  $('food').textContent = Math.floor(G.food);
  const fh = G.foodHist; const delta = fh.length > 1 ? G.food - fh[0] : 0;
  $('foodDelta').textContent = delta > 1 ? '▲' : delta < -1 ? '▼' : '';
  $('foodDelta').style.color = delta > 1 ? '#7be05a' : '#ff8a8a';
  $('pop').textContent = `${G.monsters.length}/${popCap()}`;
  document.querySelectorAll('[data-build]').forEach(b => { b.disabled = G.gold < BLD[b.dataset.build].cost; b.classList.toggle('sel', G.build === b.dataset.build); });
  $('btnRaid').disabled = !!G.exp || G.village.conquered;
  const ex = G.exp, v = G.village;
  let es = '';
  if (ex) es = { march: '⚔ 部隊が出撃準備中…', go: `⚔ 村へ進軍中（あと${Math.ceil(ex.timer)}時間）`, battle: '⚔ 戦闘中！', return: `⚔ 部隊が帰還中（あと${Math.ceil(ex.timer)}時間）`, arrive: '⚔ 部隊が城に到着！' }[ex.phase];
  else es = v.conquered ? '👑 人間の村を支配中（毎朝 貢ぎ物）' : `🏘 村の抵抗力 ${v.resist}/${v.maxResist}・警戒度 ${v.alert}`;
  $('expedition').textContent = es;
  updateGoals();
  if (G.selected && infoT > 0.3) { infoT = 0; renderInfo(); }
}

function bar(v, max, col) { return `<div class="bar"><i style="width:${clamp(v / max * 100, 0, 100)}%;background:${col}"></i></div>`; }
function taskLabel(m) {
  if (m.away) return '遠征中';
  const t = m.task; if (!t) return 'ぼんやりしている';
  const L = {
    eat: t.phase === 'go' ? '食料庫へ向かっている' : '食事中', forage: t.phase === 'go' ? '木の実を探しに行く' : '木の実を食べている',
    sleep: t.phase === 'go' ? '寝床へ向かっている' : (t.place ? `${t.place.name}で眠っている` : '地べたで寝ている'),
    work: t.phase === 'go' ? '農場へ向かっている' : '農場で働いている', train: t.phase === 'go' ? '訓練場へ向かっている' : '訓練中',
    wander: 'うろついている', idle: 'ひと休み中', follow: '親についてまわっている', breed: t.phase === 'love' ? '仲良くしている♥' : '相手のもとへ',
    defend: '人間と戦っている！', flee: '城に逃げ込んだ', quarrel: '喧嘩中！', march: '出撃準備', return: '帰還中',
  };
  return L[t.type] || t.type;
}
function breedStatus() {
  const cap = popCap(), n = G.monsters.length, needFood = n * 2 + 6;
  return `<div class="note">繁殖条件：空き ${n < cap ? '✔' : '✖'}（${n}/${cap}）・食料 ${G.food >= needFood ? '✔' : '✖'}（${Math.floor(G.food)}/${needFood}）</div>`;
}
function renderInfo() {
  const m = G.selected, el = $('info');
  if (!m || !m.alive) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const child = isChild(m), ag = Math.floor(m.age / 24);
  const until = child ? Math.ceil((SPECIES[m.species].adultAge - m.age)) : 0;
  el.innerHTML = `<div class="head"><canvas id="portrait" width="16" height="16"></canvas>
    <div><div class="nm">${m.name} ${m.flag ? '<span style="color:#ff7ac8">♥</span>' : ''}</div>
    <div class="sp">${spName(m)}・${child ? `子ども（あと${until}時間で成体）` : '成体'}・${ag}日齢</div></div></div>
    <div><div class="row"><span>体力</span><span>${Math.ceil(m.hp)} / ${maxHp(m)}</span></div>${bar(m.hp, maxHp(m), '#7be05a')}</div>
    <div><div class="row"><span>攻撃力</span><span>${atkOf(m)}${m.trainAtk ? `（訓練+${m.trainAtk}）` : ''}</span></div></div>
    <div><div class="row"><span>満腹</span><span>${Math.round(m.hunger)}</span></div>${bar(m.hunger, 100, '#e0a040')}</div>
    <div><div class="row"><span>元気</span><span>${Math.round(m.energy)}</span></div>${bar(m.energy, 100, '#60a0ff')}</div>
    <div class="wide row"><span>性格</span><span class="pers">${m.pers}：${PERS[m.pers].desc}</span></div>
    <div class="wide row"><span>状態</span><span>${taskLabel(m)}</span></div>
    ${m.parents ? `<div class="wide row"><span>親</span><span>${m.parents.join(' と ')}</span></div>` : ''}
    <div class="wide row"><span>子ども / 戦歴</span><span>${m.kids}体 / ${m.battles}戦 ${m.kills}撃破</span></div>
    ${child ? '' : breedStatus()}
    <div class="btns">${child ? '' : `<button class="flag ${m.flag ? 'on' : ''}" data-act="flag">${m.flag ? '♥ 繁殖候補' : '♡ 繁殖候補に指定'}</button>`}<button data-act="close">閉じる</button></div>`;
  const pc = $('portrait').getContext('2d'); const s = getSprite(kindOf(m), palOf(m));
  pc.imageSmoothingEnabled = false; pc.drawImage(s.A, Math.floor((16 - s.w) / 2), Math.floor((16 - s.h) / 2));
}
$('info').addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'close') selectMonster(null);
  if (a.dataset.act === 'flag' && G.selected) { G.selected.flag = !G.selected.flag; sfx('click');
    if (G.selected.flag) toast(`${G.selected.name}を繁殖候補にした（同族の候補と優先的にペアになる）`); renderInfo(); }
});
function selectMonster(m) { G.selected = m; infoT = 1; if (!m) $('info').classList.add('hidden'); else renderInfo(); }

// build mode
function setBuild(type) {
  if (G.build === type) type = null;
  G.build = type; G.ghost = null;
  const h = $('buildhint');
  if (type) {
    if (G.gold < BLD[type].cost) { toast('資金が足りない'); G.build = null; h.classList.add('hidden'); return; }
    h.innerHTML = `${BLD[type].name}（${BLD[type].desc}）を置く場所をタップ <button id="bCancel">やめる</button>`;
    h.classList.remove('hidden'); $('bCancel').onclick = () => setBuild(null);
    selectMonster(null);
  } else h.classList.add('hidden');
}
document.querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => { sfx('click'); setBuild(b.dataset.build); }));

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function ghostAt(p) { const d = BLD[G.build]; return { tx: Math.round(p.x / 16 - d.w / 2), ty: Math.round(p.y / 16 - d.h / 2) }; }
cv.addEventListener('pointermove', e => { if (G.build && e.pointerType === 'mouse') G.ghost = ghostAt(canvasPos(e)); });
cv.addEventListener('pointerdown', e => {
  initAudio();
  const p = canvasPos(e);
  if (G.build) {
    const g = ghostAt(p);
    const confirm = e.pointerType === 'mouse' || (G.ghost && G.ghost.tx === g.tx && G.ghost.ty === g.ty);
    G.ghost = g;
    if (!confirm) { $('buildhint').firstChild.textContent = 'もう一度タップで建設（別の場所をタップで移動）'; return; }
    if (!canPlace(G.build, g.tx, g.ty)) { toast('そこには建てられない'); return; }
    const d = BLD[G.build];
    if (G.gold < d.cost) { toast('資金が足りない'); setBuild(null); return; }
    G.gold -= d.cost;
    const b = placeBuilding(G.build, g.tx, g.ty);
    for (let i = 0; i < 14; i++) G.fx.push({ x: b.x + rand(0, b.w), y: b.y + b.h - rand(0, 6), vx: rand(-15, 15), vy: rand(-20, -5), life: rand(.5, 1), type: 'dust' });
    addLog(`${d.name}を建てた！ ${d.desc}`, 'good'); sfx('build');
    setBuild(null);
    return;
  }
  // pick monster
  let best = null, bd = 13;
  for (const m of G.monsters) { if (!visible(m)) continue; const d = Math.hypot(m.x - p.x, m.y - 6 - p.y); if (d < bd) { bd = d; best = m; } }
  if (best) { selectMonster(best); sfx('click'); return; }
  const gr = G.graves.find(g => Math.abs(g.x - p.x) < 6 && Math.abs(g.y - 5 - p.y) < 7);
  if (gr) { toast(`🪦 ${gr.name}（${SPECIES[gr.species].name}）${gr.day}日目・${gr.cause}`); return; }
  const b = G.buildings.find(b => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h);
  if (b) {
    if (b.type === 'house') toast(`住居：${sleepersAt(b)}/4体が就寝中`);
    else toast(`${b.name}：${b.slots.map(byId).filter(Boolean).map(m => m.name).join('・') || '誰もいない'}`);
    return;
  }
  if (p.x < 100 && p.y > 50 && p.y < 165) { toast(`魔王城：${sleepersAt(CASTLE_PLACE)}/4体が就寝中`); return; }
  selectMonster(null);
});

// speed
function setSpeed(s) { G.speed = s; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s)); }
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { initAudio(); setSpeed(+b.dataset.speed); }));
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); setSpeed(G.speed ? 0 : 1); }
  if (e.key === '1') setSpeed(1); if (e.key === '2' || e.key === '3') setSpeed(3);
  if (e.key === 'Escape') { setBuild(null); closeModal(); }
});

// modals
function openModal(html) { $('modalBody').innerHTML = html; $('modal').classList.remove('hidden'); G.prevSpeed = G.speed; }
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

$('btnList').addEventListener('click', () => {
  sfx('click');
  const rows = G.monsters.slice().sort((a, b) => a.species.localeCompare(b.species) || b.age - a.age).map(m => `
    <div class="mitem" data-id="${m.id}"><span>${m.flag ? '<span style="color:#ff7ac8">♥</span>' : (isChild(m) ? '🍼' : '')}</span>
    <span><b>${m.name}</b> <span class="st">${spName(m)}${isChild(m) ? '（子）' : ''}・${m.pers}</span><br><span class="st">${taskLabel(m)}</span></span>
    <span class="st">体力${Math.ceil(m.hp)}/${maxHp(m)}<br>攻撃${atkOf(m)}</span></div>`).join('');
  const full = G.monsters.length >= popCap();
  openModal(`<h2>📜 魔物一覧（${G.monsters.length}/${popCap()}）</h2>${breedStatus()}<div class="mlist">${rows}</div>
    <h3>🍺 流れ者を雇う</h3><div class="note">資金で大人の魔物を1体迎え入れる（収容数に空きが必要）</div>
    <div class="mbtns" style="justify-content:flex-start"><button id="hGob" ${full || G.gold < HIRE.goblin ? 'disabled' : ''}>ゴブリン ${HIRE.goblin}G</button>
    <button id="hOrc" ${full || G.gold < HIRE.orc ? 'disabled' : ''}>オーク ${HIRE.orc}G</button></div>
    ${G.graves.length ? `<h3>🪦 墓地</h3><div class="note">${G.graves.map(g => `${g.name}（${g.day}日目・${g.cause}）`).join('、')}</div>` : ''}
    <div class="mbtns"><button id="mClose">閉じる</button></div>`);
  $('mClose').onclick = closeModal;
  $('hGob').onclick = () => hire('goblin'); $('hOrc').onclick = () => hire('orc');
  document.querySelectorAll('.mitem').forEach(el => el.onclick = () => { const m = byId(+el.dataset.id); closeModal(); if (m && visible(m)) selectMonster(m); else if (m) { selectMonster(m); } });
});

const HIRE = { goblin: 70, orc: 100 };
function hire(sp) {
  if (G.monsters.length >= popCap() || G.gold < HIRE[sp]) return;
  G.gold -= HIRE[sp];
  const m = makeMonster(sp, { age: randi(60, 90) + SPECIES[sp].adultAge, x: W + 6, y: ROAD_Y, breedCD: 4 });
  m.baseHp = Math.max(SPECIES[sp].hp[0] - 2, m.baseHp - 1); m.hp = maxHp(m);
  G.monsters.push(m); setTask(m, { type: 'wander', to: { x: 170, y: 170 } });
  closeModal(); addLog(`流れ者の${SPECIES[sp].name}「${m.name}」（${m.pers}）が仲間になった。`, 'good'); sfx('coin');
  selectMonster(m);
}
$('btnRaid').addEventListener('click', () => {
  sfx('click');
  const v = G.village;
  const defs = defenderList(v.alert); const cnt = {}; defs.forEach(d => cnt[d] = (cnt[d] || 0) + 1);
  const cand = G.monsters.filter(m => !isChild(m)).sort((a, b) => atkOf(b) - atkOf(a));
  const rows = cand.map(m => {
    const ok = visible(m) || (m.hidden && m.task && ['sleep', 'flee'].includes(m.task.type));
    const hurt = m.hp < maxHp(m) * 0.5;
    return `<label class="mitem ${ok ? '' : 'off'}"><input type="checkbox" value="${m.id}" ${ok ? '' : 'disabled'} ${ok && !hurt ? 'checked' : ''}>
      <span><b>${m.name}</b> <span class="st">${spName(m)}・${m.pers}${hurt ? ' <span style="color:#ff8a8a">負傷中</span>' : ''}</span></span>
      <span class="st">体力${Math.ceil(m.hp)}/${maxHp(m)}・攻撃${atkOf(m)}</span></label>`;
  }).join('');
  const night = isNight();
  openModal(`<h2>⚔ 人間の村へ侵略</h2>
    <div class="vinfo">抵抗力 ${v.resist}/${v.maxResist}${bar(v.resist, v.maxResist, '#ff5a5a')}
    警戒度 <b>${v.alert}</b>　予想される守備隊：${Object.entries(cnt).map(([k, n]) => `<span class="enemy">${HUMAN[k].name}×${n}</span>`).join('')}<br>
    村の蓄え（推定）：💰${Math.round(v.gold)}G　🍖${Math.round(v.food)}</div>
    <p class="note">移動に片道3時間。今出撃すると到着は${night || hourOf() >= 16 ? '夜（ゴブリン攻撃+30%）' : '昼（オーク攻撃+20%）'}の見込み。<br>勝つと戦利品を持ち帰り、抵抗力が減る。負けた魔物は重傷か、戦死することもある。</p>
    <h3>部隊を選ぶ（成体のみ）</h3><div class="mlist">${rows || '<div class="note">出撃できる成体がいない</div>'}</div>
    <div class="mbtns"><button id="mAll">全員</button><button id="mCancel">やめる</button><button class="go" id="mGo">出撃！</button></div>`);
  $('mCancel').onclick = closeModal;
  $('mAll').onclick = () => document.querySelectorAll('#modalBody input:not(:disabled)').forEach(i => i.checked = true);
  $('mGo').onclick = () => {
    const ids = [...document.querySelectorAll('#modalBody input:checked')].map(i => +i.value);
    if (!ids.length) { toast('魔物を選んでください'); return; }
    closeModal(); sendExpedition(ids);
  };
});
$('bFast').addEventListener('click', () => { if (!B) return; B.speed = B.speed === 1 ? 3 : 1; $('bFast').textContent = B.speed === 1 ? '⏩ 早送り' : '▶ 通常'; });
$('bSkip').addEventListener('click', () => { if (!B) return; let n = 0; while (!B.over && n++ < 20000) battleStep(0.05); B.endT = B.t - 2; });

function showVictory() {
  const s = G.stats;
  openModal(`<h2>👑 人間の村を支配した！</h2>
    <p>弱小だった魔王軍は、${dayOf()}日目にしてついに領土を広げた。</p>
    <div class="vinfo">魔物の数：${G.monsters.length}体　誕生：${s.births}体　死亡：${s.deaths}体<br>
    出撃：${s.raids}回（勝利${s.wins}回）　撃破した人間：${s.kills}人</div>
    <p class="note">これからは毎朝、村から貢ぎ物が届く。このまま魔王軍の繁栄を眺めて遊び続けられます。<br>（試作版はここまで。次の村や新種族は今後の改善候補です）</p>
    <div class="mbtns"><button id="mRestart">最初から</button><button class="go" id="mCont">続ける</button></div>`);
  showBanner('領土拡大！', '人間の村が魔王軍の支配下に入った'); sfx('fanfare');
  $('mCont').onclick = closeModal;
  $('mRestart').onclick = () => { closeModal(); restart(); };
}
function restart() { newGame(); selectMonster(null); setBuild(null); G.started = true; renderLog(); }

$('btnStart').addEventListener('click', () => { initAudio(); $('title').classList.add('hidden'); G.started = true; sfx('fanfare'); showBanner('1日目', '魔王軍、始動'); });

// ---------- main loop ----------
function simulate(dtH) {
  G.t += dtH;
  while (G.t >= G.nextHour) { hourly(G.nextHour); G.nextHour++; }
  for (const m of G.monsters.slice()) if (m.alive) updateMonster(m, dtH);
  updateHumans(dtH);
  updateExpedition(dtH);
}
let last = performance.now(), rt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; rt += dt;
  if (G.started && !G.battle && G.speed > 0 && $('modal').classList.contains('hidden')) {
    const dtH = dt * G.speed / HOUR_REAL, steps = Math.max(1, Math.ceil(dtH / 0.04));
    for (let i = 0; i < steps; i++) simulate(dtH / steps);
  }
  const fdt = G.speed === 0 && !G.battle ? dt * 0.3 : dt;
  G.fx.forEach(p => { p.life -= fdt; p.x += p.vx * fdt; p.y += p.vy * fdt; if (p.type !== 'heart' && p.type !== 'star') p.vy += 40 * fdt; else p.vy *= 0.98; });
  G.fx = G.fx.filter(p => p.life > 0);
  G.texts.forEach(t => { t.life -= fdt; t.y -= 10 * fdt; }); G.texts = G.texts.filter(t => t.life > 0);
  G.buildings.forEach(b => { if (b.hitT) b.hitT = b.hitT.map(v => Math.max(0, v - dt * 3)); });
  if (G.banner && (G.banner.t += dt) > 3.2) G.banner = null;
  if (G.toast && (G.toast.t += dt) > 2.4) G.toast = null;
  drawWorld(rt);
  if (G.battle) { updateBattle(dt); drawBattle(); }
  updateUI(dt);
  requestAnimationFrame(frame);
}

groundCanvas = makeGround();
newGame();
requestAnimationFrame(frame);
// デバッグ／検証用
window.__game = { get G() { return G; }, simulate, startBattle, sendExpedition, placeBuilding, setSpeed };
