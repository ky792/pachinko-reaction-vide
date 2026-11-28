/*
 * P 深淵機関 ABYSS REACTOR — 演出選択テーブル
 * 抽選結果（当否・リーチ有無）を受けて、演出の種類と煽り要素を選ぶための重み。
 * 抽選確率には一切影響しない。信頼度は開発者モードで自動計算される。
 */
NB.registerMachine('abyss-reactor', 'performance', {
  normal: {
    // 当選時の演出種別
    win: { normal: 3, sp_connect: 12, sp_control: 25, sp_awaken: 40, overdrive: 20 },
    // ハズレ・リーチ時の演出種別（lossReachRate の内訳）
    loseReach: { normal: 9.4, sp_connect: 1.0, sp_control: 0.47, sp_awaken: 0.22, overdrive: 0.0106 },
    // 疑似連回数（追加回数 0..3 → ×1..×4）
    giji: {
      win: [10, 30, 35, 25],
      noReach: [97, 3, 0, 0],
      normal: [80, 18, 2, 0],
      sp_connect: [40, 45, 15, 0],
      sp_control: [20, 45, 30, 5],
      sp_awaken: [10, 30, 40, 20],
      overdrive: [0, 20, 40, 40],
    },
    // 保留色（先読み）
    hold: {
      win: { normal: 30, blue: 15, green: 18, red: 22, gold: 10, rainbow: 5 },
      noReach: { normal: 97, blue: 3 },
      normal: { normal: 85, blue: 12, green: 3 },
      sp_connect: { normal: 60, blue: 28, green: 10, red: 2 },
      sp_control: { normal: 45, blue: 30, green: 18, red: 7 },
      sp_awaken: { normal: 35, blue: 25, green: 22, red: 16, gold: 2 },
      overdrive: { normal: 20, blue: 10, green: 20, red: 35, gold: 15 },
    },
    holdChangeRate: 0.5, // 入賞時に最終色を見せず、後から変化させる割合
    zone: { win: 0.5, sp_awaken: 0.35, sp_control: 0.22, sp_connect: 0.06, normal: 0.01, noReach: 0.004 },
    yokoku: { win: 0.45, sp_awaken: 0.3, sp_control: 0.18, sp_connect: 0.08, normal: 0.03, noReach: 0.01 },
    // SP 内チャンスアップ
    telop: { win: { blue: 10, green: 20, red: 40, gold: 25, rainbow: 5 }, lose: { white: 30, blue: 40, green: 22, red: 8, gold: 0.4 } },
    cutin: { win: { none: 20, green: 15, red: 40, gold: 25 }, lose: { none: 65, green: 25, red: 10, gold: 0.3 } },
    button: { win: { normal: 40, big: 60 }, lose: { normal: 86, big: 14 } },
    gimmick: { win: { none: 30, tease: 20, full: 50 }, lose: { none: 70, tease: 28, full: 2 } },
    reachText: { win: { red: 50, gold: 50 }, lose: { red: 96, gold: 4 } },
    sevenOnRush: 0.25, // RUSH 振り分け当選時に 7 揃いで告知する割合（RUSH 確定）
  },
  rush: {
    win: { sudden: 25, short: 35, sp_rush: 40 },
    loseReach: { short: 75, sp_rush: 25 },
    lastSpins: 3,
  },
  // 演出名（表示用）
  names: {
    noReach: 'リーチなし', normal: 'ノーマルリーチ', sp_connect: '機関接続リーチ', sp_control: '暴走制御リーチ', sp_awaken: '深淵覚醒リーチ', overdrive: 'ABYSS OVERDRIVE',
    sudden: '突発当たり', short: 'RUSHリーチ', sp_rush: '深淵迎撃リーチ',
  },
  stages: ['lab', 'core'],
  stageSpins: 25,
});
