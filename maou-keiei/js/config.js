/* ==========================================================
 * 仮スペック・調整値（ゲーム性確認用の仮仕様）
 * ここを書き換えるだけで確率・枚数・経営バランスを調整できます。
 * ========================================================== */
(function (MK) {
  'use strict';

  const CFG = {};

  // ---- リール図柄 ----
  // id: 内部名 / name: 表示名 / role: 相当する一般的な役割（企画メモ用）
  CFG.SYMBOLS = {
    SEVEN: { name: '魔王7', note: '最高図柄。揃えば上位AT直撃' },
    BAR: { name: '魔BAR', note: 'CZ確定図柄' },
    COIN: { name: '魔金貨', note: '押し順ベル相当' },
    REPLAY: { name: '魔法陣', note: 'リプレイ' },
    SLIME: { name: 'スライム', note: 'スイカ相当（魔物雇用）' },
    SKULL: { name: 'ドクロ', note: 'チェリー相当' },
    CHEST: { name: '宝箱', note: 'チャンス目素材' },
  };

  // ---- リール配列（21コマ） ----
  const S = 'SEVEN', B = 'BAR', C = 'COIN', R = 'REPLAY', M = 'SLIME', K = 'SKULL', T = 'CHEST';
  CFG.STRIPS = [
    [S, R, C, M, R, C, K, B, R, C, T, R, C, M, K, R, C, T, R, C, M],
    [S, C, R, M, C, R, T, C, R, K, B, C, R, M, C, R, T, C, R, K, M],
    [S, R, C, T, R, C, M, B, R, C, K, R, C, T, M, R, C, T, R, C, M],
  ];
  CFG.MAX_SLIP = 4; // 最大スベリコマ数（不可能な場合のみロングスベリ演出）

  // ---- 払い出し（3枚掛け） ----
  CFG.BET = 3;
  CFG.PAY = { replay: 0, coin: 8, slime: 5, skull: 2, skull3: 4, chance: 2, chest3: 4, bar: 10, seven: 15, none: 0 };

  // ---- 小役抽選（分母 65536） ----
  CFG.ROLES = {
    replay:       { w: 8978,  label: 'リプレイ' },
    coin_oshi:    { w: 26214, label: '押し順金貨' },
    coin_common:  { w: 4096,  label: '共通金貨' },
    skull:        { w: 1638,  label: '弱ドクロ', rare: 1 },
    skull_strong: { w: 328,   label: '強ドクロ', rare: 3 },
    slime:        { w: 819,   label: 'スライム', rare: 1 },
    chance:       { w: 655,   label: 'チャンス目', rare: 2 },
    chest3:       { w: 218,   label: '強チャンス目', rare: 3 },
    bar:          { w: 44,    label: '魔BAR揃い', rare: 4 },
    seven:        { w: 8,     label: '魔王7揃い', rare: 5 },
    none:         { w: 0,     label: 'ハズレ' }, // 残り全部
  };
  // 役 → 目指す出目
  CFG.ROLE_OUTCOME = {
    replay: 'replay', coin_oshi: 'coin', coin_common: 'coin', skull: 'skull', skull_strong: 'skull3',
    slime: 'slime', chance: 'chance', chest3: 'chest3', bar: 'bar', seven: 'seven', none: 'none',
  };
  // 押し順（0=左,1=中,2=右）
  CFG.ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  // ---- 魔物 ----
  CFG.MONSTERS = {
    slime:    { name: 'スライム',   cost: 0,   wage: 4,  power: 1, minCastle: 1 },
    goblin:   { name: 'ゴブリン',   cost: 90,  wage: 8,  power: 2, minCastle: 1 },
    skeleton: { name: 'スケルトン', cost: 160, wage: 12, power: 3, minCastle: 2 },
    imp:      { name: 'ガーゴイル', cost: 260, wage: 18, power: 5, minCastle: 3 },
    dragon:   { name: 'ドラゴン',   cost: 650, wage: 35, power: 10, minCastle: 4 },
  };
  CFG.CASTLE = {
    names: ['', '廃墟の塔', '小さな砦', '魔王の城', '大魔城', '万魔殿'],
    upgradeCost: [0, 0, 280, 560, 950, 1500], // Lv(n) にする費用
    slots: (lv) => 2 + lv * 2, // 雇える魔物の上限
  };

  // ---- 通常時（経営） ----
  CFG.NORMAL = {
    startGold: 300,
    settleEvery: 10, // 何Gごとに決算（人件費の支払い）
    gold: { coin: 12, coinMiss: 4, replay: 5, none: 2, slime: 20, skull: 40, skull_strong: 80, chance: 60, chest3: 150, bar: 200, seven: 500 },
    approachPerGame: [0.6, 1.6], // 勇者接近度 / G
    approachRare: { skull: 10, slime: 8, chance: 15, skull_strong: 25, chest3: 30 },
    approachDeficit: 15, // 赤字時の接近
    czDirect: { slime: 0.2, skull: 0.15, chance: 0.3, skull_strong: 0.5, chest3: 0.7, bar: 1, seven: 1 },
  };

  // ---- CZ 勇者襲来 ----
  CFG.CZ = {
    games: 7,
    heroHp: 100,
    dmg: { none: 6, replay: 10, coin_oshi: 12, coin_common: 14, slime: 35, skull: 30, skull_strong: 100, chance: 45, chest3: 100, bar: 100, seven: 100 },
    critBonus: 2.0, // 押し順正解時の倍率
    finalRescue: 0.15, // 最終G「魔王降臨」逆転率
  };

  // ---- AT 魔王経営RUSH ----
  CFG.AT = {
    setGames: 20,
    judgeGames: 3,
    addGames: { slime: 5, skull: 3, skull_strong: 20, chance: 10, chest3: 30, bar: 50 },
    exp: { none: 1, replay: 2, coin_oshi: 3, coin_common: 3, slime: 12, skull: 8, skull_strong: 30, chance: 15, chest3: 40, bar: 50, seven: 80 },
    devPerGame: 1, devToUpgrade: 12, // 城の発展ポイント
    partyBase: 8, partyPerSet: 5,
    winBase: 0.58, winPerPower: 0.018, winMin: 0.42, winMax: 0.9,
    upgrade: { base: 0.06, castle5: 0.15, chest3InSet: 0.5, autoAtWins: 5, autoCastle: 4 },
    hire: { slime: 0.6, skull: 0.3, chance: 0.5, skull_strong: 1, chest3: 1, bar: 1 },
  };

  // ---- 上位AT 世界征服RUSH ----
  CFG.UPPER = {
    setGames: 15,
    winRate: 0.85,
    conquest: { none: 3, replay: 5, coin_oshi: 7, coin_common: 7, slime: 25, skull: 20, skull_strong: 60, chance: 30, chest3: 80, bar: 100, seven: 100 },
    regions: 12,
    conquestBonus: 300, // 世界征服達成時の仮想メダル
  };

  CFG.START_MEDALS = 1000; // 仮想メダル（換金不可）

  MK.CFG = CFG;
})(window.MK);
