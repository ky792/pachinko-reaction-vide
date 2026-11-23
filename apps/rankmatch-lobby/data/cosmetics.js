/* マイ陣地のカスタマイズ用アイテム（見た目だけ。対戦の強さには一切影響しない）。
 * 陣地の「持ち主の色」（自分＝ナビの色／相手＝相手ナビの色）は変えられない。素材や装飾はそれ以外の部分だけを変える。
 *
 * アイテムはパラメータ付きの定義から量産する。新しいアイテムは下の表に1行足すだけでよい。
 *   kind   : skin（科目ごとの建物）/ material（質感）/ base（台座）/ garden（庭・3つまで）/ fx（エフェクト）/ orbit（周回物）/ flag（旗の柄）
 *   price  : クリスタル（0＝最初から所持）  rarity: common / rare / epic / legend
 *   unlock : 学習の実績で無料開放 { type: streak|train|duel|solved, value, label }
 *   set    : シリーズ名（まとめ買いの対象）  p: 3D 側に渡すパラメータ */
(function () {
  const PRICE = { common: 120, rare: 220, epic: 350, legend: 600 };
  const items = [];
  const add = (kind, id, name, rarity, extra = {}) => items.push(Object.assign({ id, kind, name, rarity, price: extra.free ? 0 : extra.price || PRICE[rarity] }, extra));

  /* ---- 建物（科目ごと） ---- */
  [
    ['国語', 'skin_ja_std', '本の塔', null], ['国語', 'skin_ja_shoin', '書院の塔', 'epic', '三層の屋根をもつ書庫', '和の陣'],
    ['国語', 'skin_ja_goju', '五重塔', 'legend', '五層の屋根が重なる塔', '和の陣'], ['国語', 'skin_ja_library', '浮遊図書館', 'epic', '本棚が輪になって宙を巡る', '学び舎'],
    ['数学', 'skin_ma_std', '多面体の核', null], ['数学', 'skin_ma_crystal', '結晶の尖塔', 'epic', '幾何学的な結晶が突き出す', '星空'],
    ['数学', 'skin_ma_mobius', 'メビウスの輪', 'legend', 'ねじれた輪がゆっくり回り続ける'], ['数学', 'skin_ma_stairs', '無限階段', 'epic', 'らせん状にどこまでも続く階段'],
    ['英語', 'skin_en_std', '時計塔と地球儀', null], ['英語', 'skin_en_castle', '古城', 'epic', '四隅に塔を備えた城砦'],
    ['英語', 'skin_en_bridge', '跳ね橋', 'epic', '二つの塔を結ぶ橋'], ['英語', 'skin_en_torch', '知恵の灯火', 'legend', '高く掲げられた炎の像'],
    ['理科', 'skin_sc_std', '原子と実験器具', null], ['理科', 'skin_sc_obs', '天文台', 'epic', '回転するドームと望遠鏡', '星空'],
    ['理科', 'skin_sc_tesla', 'テスラコイル', 'legend', '放電が走るコイル塔', 'サイバー'], ['理科', 'skin_sc_rocket', 'ロケット発射台', 'epic', '発射を待つロケット'],
    ['社会', 'skin_so_std', '遺跡群', null], ['社会', 'skin_so_tenshu', '天守閣', 'epic', '石垣の上の三層の天守', '和の陣'],
    ['社会', 'skin_so_arch', '凱旋門', 'epic', '堂々とした石の門'], ['社会', 'skin_so_light', '灯台', 'rare', '光が回り続ける灯台'],
  ].forEach(([subject, id, name, rarity, desc, set]) => add('skin', id, name, rarity || 'common', { subject, desc, set, free: !rarity }));

  /* ---- 素材（持ち主の色以外の質感） ---- */
  [
    ['mat_std', '標準メタル', null, { body: 0xc9d2ec, page: 0xeef2ff, metal: 0.45, rough: 0.32 }],
    ['mat_porcelain', '白磁', 'rare', { body: 0xf4f6fb, page: 0xffffff, metal: 0.05, rough: 0.2 }, '和の陣'],
    ['mat_iron', '黒鉄', 'rare', { body: 0x3a3f4c, page: 0x5b6274, metal: 0.8, rough: 0.35 }],
    ['mat_gold', '金箔', 'epic', { body: 0xe6c36a, page: 0xf6e3a8, metal: 0.95, rough: 0.2 }],
    ['mat_chrome', '銀鏡', 'epic', { body: 0xdfe6f2, page: 0xf2f6ff, metal: 1.0, rough: 0.05 }, '星空'],
    ['mat_sakura', '桜木', 'rare', { body: 0xd9b3a5, page: 0xf3ddd3, metal: 0.05, rough: 0.7 }, '和の陣'],
    ['mat_jade', '翡翠', 'epic', { body: 0x9fbfb1, page: 0xd5e6dc, metal: 0.2, rough: 0.25 }],
    ['mat_ice', '氷晶', 'epic', { body: 0xcfe8ff, page: 0xeef8ff, metal: 0.1, rough: 0.05, opacity: 0.75 }],
    ['mat_lacquer', '黒漆', 'rare', { body: 0x1b1c22, page: 0x2c2d36, metal: 0.3, rough: 0.08 }, '和の陣'],
    ['mat_marble', '大理石', 'rare', { body: 0xe9e6e0, page: 0xf7f5f1, metal: 0.05, rough: 0.4 }],
    ['mat_bronze', 'ブロンズ', 'rare', { body: 0xa87a4a, page: 0xc79a6a, metal: 0.85, rough: 0.4 }],
    ['mat_holo', 'ホログラム', 'legend', { body: 0x9fd8ff, page: 0xd0f0ff, metal: 0.1, rough: 0.1, opacity: 0.45, holo: true }, 'サイバー'],
  ].forEach(([id, name, rarity, p, set]) => add('material', id, name, rarity || 'common', { p, set, free: !rarity, unlock: id === 'mat_porcelain' ? { type: 'solved', value: 50, label: '問題を50問解く' } : undefined }));

  /* ---- 台座 ---- */
  [
    ['base_std', '標準', null], ['base_garden', '庭園', 'rare', '木々と池のある台座', null, { type: 'streak', value: 7, label: '7日連続で学習' }],
    ['base_neon', 'ネオン', 'rare', '二重の光の縁と光る柱', 'サイバー'], ['base_marble', '白亜', 'rare', '白い石と列柱'],
    ['base_float', '浮島', 'epic', '岩ごと宙に浮かぶ', '星空'], ['base_snow', '雪原', 'rare', '雪に覆われた台座'],
    ['base_desert', '砂の遺跡', 'rare', '砂と崩れた柱'], ['base_water', '水鏡', 'epic', '水面に囲まれた台座', '和の陣'],
  ].forEach(([id, name, rarity, desc, set, unlock]) => add('base', id, name, rarity || 'common', { desc, set, unlock, free: !rarity }));

  /* ---- 庭（3つまで） ---- */
  [
    ['gd_sakura', '桜の木', 'rare', { type: 'tree', leaf: 0xffb7d0, trunk: 0x6a4a3a, shape: 'round' }, '和の陣'],
    ['gd_pine', '松', 'common', { type: 'tree', leaf: 0x2f6e4a, trunk: 0x5a4030, shape: 'pine' }, '和の陣'],
    ['gd_bamboo', '竹', 'common', { type: 'bamboo' }, '和の陣'],
    ['gd_palm', '椰子', 'rare', { type: 'palm' }],
    ['gd_maple', '紅葉の木', 'rare', { type: 'tree', leaf: 0xe2683c, trunk: 0x5a3a2a, shape: 'round' }],
    ['gd_stonelamp', '石灯籠', 'common', { type: 'stonelamp' }, '和の陣'],
    ['gd_rock', '庭石', 'common', { type: 'rock' }],
    ['gd_torii', '小さな鳥居', 'rare', { type: 'torii' }, '和の陣'],
    ['gd_fountain', '噴水', 'epic', { type: 'fountain' }],
    ['gd_shelf', '本棚', 'common', { type: 'shelf' }, '学び舎'],
    ['gd_board', '黒板', 'rare', { type: 'board', text: '∫ dx' }, '学び舎'],
    ['gd_globe', '地球儀', 'common', { type: 'globe' }, '学び舎'],
    ['gd_server', 'サーバーラック', 'rare', { type: 'server' }, 'サイバー'],
    ['gd_telescope', '望遠鏡', 'rare', { type: 'telescope' }, '星空'],
  ].forEach(([id, name, rarity, p, set]) => add('garden', id, name, rarity, { p, set, unlock: id === 'gd_shelf' ? { type: 'train', value: 1, label: '演習を1セット' } : undefined }));

  /* ---- エフェクト（1つ） ---- */
  [
    ['fx_none', 'なし', null, null],
    ['fx_sakura', '桜吹雪', 'rare', { motion: 'fall', colors: [0xffb7d0, 0xffd6e4], size: 0.09, n: 70 }, '和の陣'],
    ['fx_snow', '雪', 'rare', { motion: 'fall', colors: [0xffffff], size: 0.08, n: 90, sway: 0.4 }, null, { type: 'streak', value: 10, label: '10日連続で学習' }],
    ['fx_maple', '紅葉', 'rare', { motion: 'fall', colors: [0xe2683c, 0xf0a030, 0xc0402a], size: 0.11, n: 60 }],
    ['fx_firefly', '蛍', 'epic', { motion: 'float', colors: [0xd8ff8a], size: 0.1, n: 40, blink: true }],
    ['fx_stardust', '星屑', 'epic', { motion: 'twinkle', colors: [0xffffff, 0xfff2b0, 0xb8d8ff], size: 0.08, n: 120 }, '星空'],
    ['fx_bubble', '泡', 'rare', { motion: 'rise', colors: [0xbfe8ff], size: 0.13, n: 50 }],
    ['fx_ember', '火の粉', 'epic', { motion: 'rise', colors: [0xffb060, 0xff7a30], size: 0.07, n: 70, blink: true }],
    ['fx_rain', '光の雨', 'epic', { motion: 'fall', colors: [0x8fe8ff], size: 0.06, n: 120, speed: 3 }, 'サイバー'],
    ['fx_confetti', '紙吹雪', 'rare', { motion: 'fall', colors: [0xff6b7a, 0xffd34d, 0x6be3a8, 0x6bb8ff, 0xd58bff], size: 0.1, n: 80 }],
    ['fx_notes', '音符', 'epic', { motion: 'rise', glyphs: ['♪', '♫', '♩'], n: 12 }],
    ['fx_math', '数式の雨', 'legend', { motion: 'fall', glyphs: ['π', '∑', '√', '∫', '∞', 'x²'], n: 16 }, '学び舎', { type: 'duel', value: 3, label: '直接対決で3回奪還' }],
    ['fx_kanji', '文字の雨', 'legend', { motion: 'fall', glyphs: ['文', '学', '知', '語', '書', '理'], n: 16 }, '学び舎'],
  ].forEach(([id, name, rarity, p, set, unlock]) => add('fx', id, name, rarity || 'common', { p, set, unlock, free: !rarity }));

  /* ---- 周回物（1つ） ---- */
  [
    ['orb_none', 'なし', null, null],
    ['orb_lantern', '灯籠', 'rare', { shape: 'lantern', n: 5, r: 2.2 }, '和の陣', { type: 'train', value: 3, label: '演習を3セット' }],
    ['orb_halo', '天輪', 'epic', { shape: 'halo' }, null, { type: 'duel', value: 1, label: '直接対決で陣地を1回奪還' }],
    ['orb_books', '舞う本', 'rare', { shape: 'book', n: 6, r: 2.0 }, '学び舎'],
    ['orb_planets', '惑星', 'epic', { shape: 'planet', n: 4, r: 2.3 }, '星空'],
    ['orb_dice', 'サイコロ', 'common', { shape: 'dice', n: 4, r: 2.0 }],
    ['orb_gears', '歯車', 'rare', { shape: 'gear', n: 4, r: 2.1 }, 'サイバー'],
    ['orb_cranes', '折り鶴', 'epic', { shape: 'crane', n: 6, r: 2.2 }, '和の陣'],
    ['orb_crystals', '浮遊結晶', 'rare', { shape: 'crystal', n: 7, r: 2.0 }],
    ['orb_drones', 'ドローン', 'epic', { shape: 'drone', n: 3, r: 2.3 }, 'サイバー'],
  ].forEach(([id, name, rarity, p, set, unlock]) => add('orbit', id, name, rarity || 'common', { p, set, unlock, free: !rarity }));

  /* ---- 旗の柄 ---- */
  [
    ['flag_none', '旗なし', null, null], ['flag_plain', '無地', null, { pattern: 'plain', bg: '#ffffff', fg: '#05080F' }],
    ['flag_stripe', '二色帯', 'common', { pattern: 'stripe', bg: '#ffffff', fg: '#05080F', alt: '#c9d2ec' }],
    ['flag_diag', '斜め帯', 'common', { pattern: 'diag', bg: '#1b1c22', fg: '#ffffff', alt: '#e6c36a' }],
    ['flag_check', '市松', 'rare', { pattern: 'check', bg: '#f4f6fb', fg: '#05080F', alt: '#3a3f4c' }, '和の陣'],
    ['flag_star', '星', 'rare', { pattern: 'star', bg: '#0b1530', fg: '#ffffff', alt: '#fff2b0' }, '星空'],
    ['flag_wave', '青海波', 'epic', { pattern: 'wave', bg: '#f4f6fb', fg: '#05080F', alt: '#9fb8d8' }, '和の陣'],
    ['flag_circuit', '回路', 'epic', { pattern: 'circuit', bg: '#05080F', fg: '#ffffff', alt: '#8fe8ff' }, 'サイバー'],
  ].forEach(([id, name, rarity, p, set]) => add('flag', id, name, rarity || 'common', { p, set, free: !rarity }));

  /* ---- シリーズ（まとめ買い 20% 引き） ---- */
  const SETS = { 和の陣: '日本の美をまとった陣地', サイバー: '光と回路の近未来陣地', 星空: '夜空を映す天体の陣地', 学び舎: '本と黒板に囲まれた学びの陣地' };
  const sets = Object.entries(SETS).map(([name, desc]) => ({ name, desc, items: items.filter((i) => i.set === name).map((i) => i.id), off: 0.2 }));

  window.COSMETICS = {
    items, sets,
    kinds: [['skin', '建物'], ['material', '素材'], ['base', '台座'], ['garden', '庭'], ['fx', 'エフェクト'], ['orbit', '周回'], ['flag', '旗'], ['set', 'シリーズ']],
    rarity: { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legend: 'LEGEND' },
    packs: [{ id: 'p1', crystals: 60, yen: 120 }, { id: 'p2', crystals: 320, yen: 610, bonus: '+20' }, { id: 'p3', crystals: 680, yen: 1220, bonus: '+60' }, { id: 'p4', crystals: 1400, yen: 2440, bonus: '+160' }],
    limits: [{ label: '15歳以下', yen: 5000 }, { label: '16〜19歳', yen: 10000 }],
    defaults: {
      owned: items.filter((i) => i.price === 0).map((i) => i.id),
      equip: { skins: { 国語: 'skin_ja_std', 数学: 'skin_ma_std', 英語: 'skin_en_std', 理科: 'skin_sc_std', 社会: 'skin_so_std' }, material: 'mat_std', base: 'base_std', garden: [], fx: 'fx_none', orbit: 'orb_none', flag: 'flag_plain', flagText: '' },
    },
    gardenMax: 3,
  };
})();
