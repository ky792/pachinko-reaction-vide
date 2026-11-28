/* ==========================================================
 * 魔王経営記 v2（魂札リール）― データ定義
 * 数値はすべて試作用の仮の値です。
 * ========================================================== */
(function (MK) {
  'use strict';
  const D = {};

  // ---- 種族 ----
  D.TRIBES = {
    none:   { name: '',     color: '#3a3440' },
    swarm:  { name: '群れ', color: '#1f5a52' },
    labor:  { name: '労働', color: '#4a4a1e' },
    undead: { name: '不死', color: '#2a3550' },
    magic:  { name: '魔術', color: '#4a1f50' },
    gamble: { name: '博徒', color: '#5a1a22' },
    human:  { name: '捕虜', color: '#3a3a4a' },
  };

  // ---- 魂札 ----
  // atk=攻撃 gold=金貨 shard=魂の欠片 wage=給料（3夜ごと） rarity=召喚の出やすさ（1よく出る〜3まれ）
  D.TILES = {
    stone:     { name: '石ころ', tribe: 'none', wage: 0, desc: '何もしない。焼却炉で捨てられる' },
    coin:      { name: '金貨', tribe: 'none', wage: 0, gold: 1, desc: '金貨＋1' },
    shard:     { name: '魂の欠片', tribe: 'none', wage: 0, shard: 1, desc: '欠片＋1。3つで召喚。戦闘中は攻撃1' },
    slime:     { name: 'スライム', tribe: 'swarm', wage: 1, atk: 1, rarity: 1, desc: '攻撃1。3揃いで分裂して1枚増える' },
    bombslime: { name: 'ボムスライム', tribe: 'swarm', wage: 1, rarity: 2, desc: '自爆して攻撃6。その戦闘中は眠る' },
    goblin:    { name: 'ゴブリン', tribe: 'labor', wage: 1, atk: 1, gold: 1, rarity: 1, desc: '攻撃1・金貨＋1。給料が安い' },
    engineer:  { name: 'ゴブリン技師', tribe: 'labor', wage: 2, gold: 1, rarity: 2, desc: '同じラインのゴブリンの効果×2' },
    bellcat:   { name: 'ベルキャット', tribe: 'gamble', wage: 1, rarity: 1, desc: '鈴の音で台の機嫌を1段上げる' },
    bone:      { name: 'ボーンナイト', tribe: 'undead', wage: 2, atk: 1, rarity: 2, desc: '攻撃1・盾1（勇者の攻撃か封印を1回防ぐ）' },
    dice:      { name: 'ダイスゴーレム', tribe: 'gamble', wage: 2, rarity: 2, desc: '攻撃1〜6（サイコロ）' },
    mandrake:  { name: 'マンドレイク', tribe: 'magic', wage: 1, rarity: 2, desc: '叫び：勇者全員の次の行動を止める' },
    mushroom:  { name: 'マジックマッシュ', tribe: 'magic', wage: 1, atk: 1, rarity: 1, desc: '攻撃1・同じラインの他の札を永久に攻撃＋1' },
    imp:       { name: 'ガーゴイル', tribe: 'magic', wage: 2, atk: 3, rarity: 2, desc: '攻撃3' },
    dragon:    { name: 'ジャックポットドラゴン', tribe: 'gamble', wage: 5, atk: 8, rarity: 3, unique: true, desc: '攻撃8。3揃いで勇者全員に30' },
    knight:    { name: '捕虜の聖騎士', tribe: 'human', wage: 3, atk: 4, desc: '攻撃4・盾1。10%で裏切って攻撃しない' },
  };
  D.SUMMONABLE = ['slime', 'bombslime', 'goblin', 'engineer', 'bellcat', 'bone', 'dice', 'mandrake', 'mushroom', 'imp', 'dragon'];

  // ---- 初期リール（各8コマ） ----
  D.START_STRIPS = [
    ['stone', 'shard', 'coin', 'stone', 'shard', 'coin'],
    ['shard', 'stone', 'coin', 'shard', 'stone', 'coin'],
    ['stone', 'coin', 'shard', 'stone', 'shard', 'coin'],
  ];
  D.BATTLE_SPINS = 8;   // 1回の戦闘で回せる回数（BET2以上は魔力を追加で使う）
  D.MAX_STRIP = 14;

  // ---- 勇者側 ----
  // pattern：順番に行う行動。atk=魔王軍の士気を削る / seal=最強の札を封印 / heal=味方回復 / fake=偽の前兆 / reverse=魔眼を封じる
  D.ENEMIES = {
    villager: { name: '自警団', art: 'warrior', s: 0.85, hp: 5, pattern: [['atk', 1]] },
    soldier:  { name: '王国兵', art: 'warrior', s: 1.0, hp: 9, pattern: [['atk', 2], ['atk', 1]] },
    paladin:  { name: '聖騎士', art: 'hero', s: 1.0, hp: 15, pattern: [['seal', 2], ['atk', 2]] },
    priest:   { name: '僧侶', art: 'priest', s: 1.0, hp: 8, pattern: [['heal', 4], ['atk', 1]] },
    illusion: { name: '幻術師', art: 'mage', s: 1.0, hp: 8, pattern: [['fake', 1], ['atk', 2]] },
    hero:     { name: '勇者アルス', art: 'hero', s: 1.35, hp: 42, pattern: [['atk', 3], ['seal', 2], ['reverse', 1], ['atk', 4]] },
  };
  D.INTENT = {
    atk: (n) => '攻撃 ' + n,
    seal: (n) => '封印 ' + n + '回転',
    heal: (n) => '回復 ' + n,
    fake: () => '偽の前兆',
    reverse: () => '魔眼封じ',
  };

  // ---- 侵攻地図（5段） ----
  D.MAP = [
    [{ id: 'village', name: '最初の村', foes: ['villager', 'villager'], reward: { gold: 4 } }],
    [{ id: 'mine', name: '鉄鉱山', foes: ['soldier', 'villager'], reward: { gold: 10 } },
     { id: 'forest', name: '魔女の森', foes: ['soldier', 'villager'], reward: { shard: 3 } }],
    [{ id: 'fort', name: '聖騎士の砦', foes: ['paladin', 'soldier'], reward: { gold: 6 }, captive: true },
     { id: 'tower', name: '幻術師の塔', foes: ['illusion', 'soldier'], reward: { shard: 3 } }],
    [{ id: 'chapel', name: '聖堂', foes: ['paladin', 'priest'], reward: { gold: 8 }, captive: true },
     { id: 'port', name: '港町', foes: ['soldier', 'soldier', 'illusion'], reward: { gold: 12 } }],
    [{ id: 'capital', name: '王都', foes: ['hero', 'priest'], reward: {}, boss: true }],
  ];

  // ---- 遺物（勝利報酬：3つから1つ） ----
  D.RELICS = {
    diag:     { icon: '斜', name: '斜めの呪文', desc: '斜め2ラインも有効になる' },
    eye:      { icon: '眼', name: '魔眼の義眼', desc: '魔眼の回数＋1' },
    coinAtk:  { icon: '貨', name: '血塗れ金貨', desc: '金貨札も攻撃1を持つ' },
    shard2:   { icon: '魂', name: '魂の器', desc: '欠片2つで召喚できる' },
    mana:     { icon: '魔', name: '魔力の泉', desc: '最大魔力＋3' },
    boom:     { icon: '暴', name: '暴走の歯車', desc: '暴走が1回転長く続く' },
    split:    { icon: '分', name: '分裂促進剤', desc: 'スライムの攻撃＋1' },
    morale:   { icon: '旗', name: '魔王軍旗', desc: '士気の上限＋5' },
  };

  // ---- 施設（昼に金貨で建てる） ----
  D.FACILITIES = {
    furnace: { name: '魔力炉', desc: '最大魔力＋2', cost: [8, 14, 22] },
    eyeRoom: { name: '魔眼の間', desc: '魔眼の回数＋1', cost: [6, 14] },
    barrack: { name: '兵舎', desc: '士気の上限＋4', cost: [6, 12] },
  };
  D.BURN_COST = 2;      // 焼却炉で札を1枚捨てる費用
  D.PAYDAY_EVERY = 3;   // 何夜ごとに給料日か

  D.BASE = { mana: 10, eye: 1, morale: 18, gold: 3 };

  MK.D = D;
})(window.MK);
