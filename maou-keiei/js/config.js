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

  // ---- 魔物（単位：金貨） ----
  // wage = 1期（10G）ごとの給料 / cost = 契約金 / power = 戦力 / job = 担当の部屋
  CFG.MONSTERS = {
    slime:    { name: 'スライム',   cost: 0,  wage: 3,  power: 1,  minCastle: 1, job: '金庫番' },
    goblin:   { name: 'ゴブリン',   cost: 0,  wage: 6,  power: 2,  minCastle: 1, job: '工事係' },
    skeleton: { name: 'スケルトン', cost: 25, wage: 9,  power: 3,  minCastle: 2, job: '洗濯係' },
    imp:      { name: 'ガーゴイル', cost: 40, wage: 12, power: 5,  minCastle: 3, job: '経理係' },
    dragon:   { name: 'ドラゴン',   cost: 80, wage: 20, power: 10, minCastle: 4, job: '風呂焚き' },
  };
  CFG.CASTLE = {
    names: ['', '廃墟の塔', '小さな砦', '魔王の城', '大魔城', '万魔殿'],
    upgradeCost: [0, 0, 30, 60, 100, 150], // Lv(n) にする費用（金貨）
    slots: (lv) => 2 + lv * 2, // 雇える魔物の上限
  };

  // ---- 通常時（経営）：金庫の金貨で給料を払う ----
  // 1期 = 10G。最終Gの第3停止後に、金庫から給料を一括で支払う。
  // 足りなければ、いちばん古株の社員が辞表を出して本当に辞める。
  CFG.NORMAL = {
    startGold: 2,        // 開始時の金庫（金貨）
    settleEvery: 10,     // 給料日の間隔（G）
    warnGames: 3,        // 給料日の何G前から給料袋を出すか（足りないときだけ）
    payNavi: true,       // 給料が足りない残り3Gは押し順ナビ（給料日ナビ）を出す
    // 実際の出目ごとの収入（金貨）
    gold: { coin: 3, coinMiss: 1, replay: 1, none: 0, slime: 2, skull: 3, skull_strong: 8, chance: 5, chest3: 12, bar: 15, seven: 30 },
    approachPerGame: [1.6, 2.6], // 勇者接近度 / G
    approachRare: { skull: 8, slime: 6, chance: 12, skull_strong: 20, chest3: 25 },
    approachDeficit: 15,
    czDirect: { slime: 0.1, skull: 0.08, chance: 0.2, skull_strong: 0.4, chest3: 0.6, bar: 1, seven: 1 },
    choiceEvery: 3,      // 2回目以降の経営判断は、この期数以上あけて「余裕がある決算」だけ
    czReward: 30,        // 勇者撃退の報奨金
    czLossRate: 0.3,     // CZ失敗時に荒らされる金庫の割合
  };

  // ---- CZ 勇者襲来 ----
  CFG.CZ = {
    games: 7,
    heroHp: 100,
    // 第3停止の味方攻撃（役の基本値 × 魔王軍の戦力倍率。乱数なし＝演出と判定が一致）
    dmg: { none: 5, replay: 8, coin_oshi: 10, coin_common: 12, slime: 30, skull: 25, skull_strong: 100, chance: 40, chest3: 100, bar: 100, seven: 100 },
    critBonus: 2.0,       // 押し順正解時の倍率
    multBase: 0.7, multPerPower: 0.05, multMax: 1.6,
    // 経営判断で雇った魔物の追撃（HPが残ったとき一拍遅れて飛び出す）
    follow: { base: 8, perLv: 3, chance: 0.5 }, // 残りHPが追撃で削り切れる量なら必ず出る
    finalRescue: 0.12,
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

  // ---- 勇者戦の隊長（CZ開始時に1体選ぶ。どの小役が強くなるかが変わる） ----
  CFG.LEADERS = {
    slime:    { role: 'replay',      mult: 3, text: 'リプレイの攻撃×3' },
    goblin:   { role: 'coin',        mult: 2, text: '金貨揃いの攻撃×2' },
    skeleton: { role: 'none',        mult: 3, text: 'ハズレでも攻撃×3' },
    imp:      { role: 'crit',        mult: 1.5, text: '押し順正解のクリティカル×3' },
    dragon:   { role: 'rare',        mult: 2, text: 'レア役の攻撃×2' },
  };

  // ---- 撃破ボーナス（勇者を倒すたびに3枚から1枚。ずっと効く。各最大2回） ----
  CFG.PERKS = {
    coinPlus:   { icon: '鍵', name: '金庫の合鍵',   text: '金貨揃いの収入＋1枚' },
    replayPlus: { icon: '夜', name: '夜勤手当',     text: 'リプレイの収入＋1枚' },
    wageCut:    { icon: '福', name: '福利厚生',     text: '給料−2枚/期' },
    czAtk:      { icon: '鍛', name: '鍛錬場',       text: '勇者戦の攻撃＋20%' },
    heroHp:     { icon: '罠', name: '城門の罠',     text: '勇者のHP−10' },
    followPlus: { icon: '研', name: '新人研修',     text: '新人の追撃＋4' },
    czLong:     { icon: '砦', name: '籠城の備え',   text: '勇者戦＋1G' },
    judgeUp:    { icon: '絆', name: '魔物の絆',     text: '継続ジャッジ勝率＋5%' },
  };
  CFG.PERK_MAX = 2;

  // ---- 経営カード（黒字の給料日ごとに、2枚＋「資金を残す」から1枚） ----
  CFG.CARDS = {
    trainCostPer: 2,  // 特訓：魔物1体あたりの費用（金貨）
    insureCost: 4,    // 魔物保険：次の給料不足を1回だけ肩代わり
  };

  CFG.START_MEDALS = 1000; // 仮想メダル（換金不可）

  MK.CFG = CFG;
})(window.MK);
