/*
 * P 深淵機関 ABYSS REACTOR — スペック設定ファイル
 * ここを書き換えるだけで確率・出玉・ST回数等を変更できる。
 * 抽選エンジンはこの値のみを参照し、演出側からは一切変更されない。
 */
NB.registerMachine('abyss-reactor', 'spec', {
  id: 'abyss-reactor',
  title: 'P 深淵機関 ABYSS REACTOR',
  titleEn: 'ABYSS REACTOR',
  maker: 'NAGIBAKU LAB',
  makerJa: 'ナギバク研究所',
  serial: 'NBL-001',

  // 乱数範囲（実機同様 16bit 乱数を 1 つ取得して当否判定）
  randomRange: 65536,

  normal: {
    label: '通常時',
    probability: 1 / 99.9,
    rounds: 3,          // 3R × 10C × 10玉 = 300玉
    rushRate: 0.55,     // 初当たり後 深淵RUSH 振り分け
    holdMax: 4,
    lossReachRate: 1 / 9, // ハズレ時リーチ（この内訳は演出テーブル側）
  },

  rush: {
    name: '深淵RUSH',
    nameEn: 'ABYSS RUSH',
    type: 'ST',
    stSpins: 31,
    probability: 1 / 20,
    rounds: 10,        // 10R × 10C × 10玉 = 1000玉
    afterWin: 'reset', // 大当たり後 ST31 に再セット
    holdMax: 4,
    lossReachRate: 1 / 7,
  },

  attacker: { count: 10, payout: 10, maxOpenSec: 29.5, roundIntervalSec: 1.6 },

  pockets: {
    heso: 3,      // ヘソ（特図1）賞球
    denchu: 1,    // 電チュー（特図2）賞球
    general: 4,   // 一般入賞口
  },

  // 普図（スルー → 電チュー）
  futsuzu: {
    normal: { probability: 1 / 50, spinSec: 22, openSec: 0.08, openCount: 1 },
    rush:   { probability: 255 / 256, spinSec: 0.9, openSec: 1.4, openCount: 3, gapSec: 0.4 },
    holdMax: 4,
  },

  // 変動時間（ハズレ・リーチ無し）保留数別、秒
  variation: {
    normal: { noReach: [10.5, 8.6, 7.4, 4.2, 3.4] },
    rush: { noReach: [2.6, 2.2, 1.9, 1.6, 1.5] },
  },

  launch: { ballsPerMinute: 99, startBalls: 1000, lendUnit: 125 },
});
