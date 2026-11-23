'use strict';
// ===== Pixel sprites defined as text. '.' = transparent =====
const SPR = {};

const SPRITE_DEF = {
  goblin: {
    body: [
      "kk........kk",
      "kgkkkkkkkkgk",
      ".kggggggggk.",
      ".kGggggggGk.",
      ".kgykggykgk.",
      ".kggggggggk.",
      ".kggwmmwggk.",
      "..kkggggkk..",
      "..kbbbbbbk..",
      ".kgbBbbBbgk.",
      ".kkbbbbbbkk.",
      "..kbbbbbbk..",
    ],
    legsA: ["..kgk..kgk..", "..kk....kk.."],
    legsB: ["...kgkkgk...", "...kk..kk..."],
  },
  goblinChild: {
    body: [
      "kk......kk",
      "kgkkkkkkgk",
      ".kggggggk.",
      ".kgykykgk.",
      ".kggmmggk.",
      "..kkkkkk..",
      "..kbbbbk..",
    ],
    legsA: ["..kg..gk.."],
    legsB: ["...kggk..."],
  },
  orc: {
    body: [
      "....kkkkkk....",
      "...khhhhhhk...",
      "..khhhhhhhhk..",
      ".kooooooooook.",
      "kooykooooykook",
      "kOooooooooooOk",
      "kOowoOOOOowoOk",
      ".kowkkkkkkwok.",
      "..kkooooookk..",
      ".kaaaaaaaaaak.",
      "kokAaaaaaaAkok",
      "kokaabbbbaakok",
      ".k.kaaaaaak.k.",
    ],
    legsA: ["...kOok.kOok..", "...kkkk.kkkk.."],
    legsB: ["....kOokOok...", "....kkkkkkk..."],
  },
  orcChild: {
    body: [
      "...kkkkk...",
      "..khhhhhk..",
      ".koooooook.",
      ".koykoykook",
      ".kowoooowok",
      "..kkkkkkkk.",
      "..kaaaaaak.",
    ],
    legsA: ["..kok.kok.."],
    legsB: ["...kokok..."],
  },
  human: {
    body: [
      "...kkkk...",
      "..khhhhk..",
      ".khhhhhhk.",
      ".khssssk..",
      ".kskssksk.",
      "..kssssk..",
      "..kccccck.",
      ".kscccccsk",
      ".kkCCCCCkk",
      "..kccccck.",
    ],
    legsA: ["..kpk.kpk.", "..kk...kk."],
    legsB: ["...kpkpk..", "...kk.kk.."],
  },
};

const PAL_BASE = { k: '#1b1226' };
const PALETTES = {
  goblin:      { g:'#73c24a', G:'#4c8a34', y:'#ffd84a', m:'#5a1a2a', w:'#f4f0e0', b:'#8a5a34', B:'#5e3a22' },
  goblin_red:  { g:'#e0644a', G:'#a03c2c', y:'#fff27a', m:'#3a0a1a', w:'#f4f0e0', b:'#3a3048', B:'#241c30' },
  orc:         { o:'#8fa86a', O:'#647a48', h:'#2a1a1a', y:'#ff5a3a', w:'#f4f0e0', a:'#6b6f80', A:'#45485a', b:'#7a4a2a' },
  orc_iron:    { o:'#7a7aa0', O:'#55557a', h:'#e8e0ff', y:'#7af0ff', w:'#ffffff', a:'#3a2a48', A:'#24182e', b:'#c0a040' },
  villager:    { h:'#6a4a2a', s:'#f0c8a0', c:'#b8925a', C:'#8a6a3a', p:'#4a3a2a' },
  guard:       { h:'#a0a8b8', s:'#f0c8a0', c:'#3a5aa0', C:'#2a3a70', p:'#3a3a4a' },
  adventurer:  { h:'#b03a2a', s:'#f0c8a0', c:'#4a8a3a', C:'#2e5a24', p:'#4a3a2a' },
  hero:        { h:'#f0d050', s:'#f8d8b0', c:'#e8e8f0', C:'#4a6ad0', p:'#2a2a4a' },
};

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function renderRows(rows, pal) {
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue;
    const col = pal[ch] || PAL_BASE[ch]; if (!col) continue; x.fillStyle = col; x.fillRect(i, j, 1, 1); } });
  return c;
}

// returns {A, B, w, h} frames
function getSprite(kind, palName) {
  const key = kind + '|' + palName;
  if (SPR[key]) return SPR[key];
  const d = SPRITE_DEF[kind], pal = PALETTES[palName];
  const A = renderRows(d.body.concat(d.legsA), pal), B = renderRows(d.body.concat(d.legsB), pal);
  return SPR[key] = { A, B, w: A.width, h: A.height };
}

// ===== small icons =====
const ICON_DEF = {
  heart: { rows: [".kk.kk.", "krrkrrk", "krrrrrk", ".krrrk.", "..krk..", "...k..."], pal: { r: '#ff6ab0' } },
  meat:  { rows: ["..kkkk.", ".kmmmmk", "kmmMmmk", "kmmmmk.", "kwkkk..", "kk....."], pal: { m: '#d0603a', M: '#f09a6a', w: '#f4f0e0' } },
  coin:  { rows: [".kkk.", "kyYyk", "kyYyk", "kyYyk", ".kkk."], pal: { y: '#ffcc33', Y: '#fff2a0' } },
  sword: { rows: ["......k", ".....kw", "....kwk", ".k.kwk.", "..kwk..", ".kbk...", "kbk.k.."], pal: { w: '#e0e8ff', b: '#8a5a34' } },
  hoe:   { rows: ["kkkk.", "kmmk.", "..kb.", "...b.", "....b"], pal: { m: '#b0b8c8', b: '#8a5a34' } },
  bandage:{ rows: [".kkk.", "kwrwk", "krrrk", "kwrwk", ".kkk."], pal: { w: '#ffffff', r: '#e04040' } },
  anger: { rows: ["r.r.r", ".rrr.", "rr.rr", ".rrr.", "r.r.r"], pal: { r: '#ff3a3a' } },
  sack:  { rows: ["..kk..", ".kyyk.", "kbbbbk", "kbbbbk", "kbbbbk", ".kkkk."], pal: { y: '#ffcc33', b: '#a07a4a' } },
  star:  { rows: ["..y..", ".yyy.", "yyyyy", ".yyy.", "..y.."], pal: { y: '#fff27a' } },
};
const ICON = {};
for (const k in ICON_DEF) ICON[k] = renderRows(ICON_DEF[k].rows, ICON_DEF[k].pal);
