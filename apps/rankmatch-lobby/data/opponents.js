/* 防衛データ（仮）。非同期PvPでは、相手プレイヤーの「学力ステータス＋ナビ＋主戦場＋陣地の並び」が
 * 防衛データとして保存され、挑戦者はそれと自動戦闘する。本番はサーバーから同ランク帯を取得する。 */
window.OPPONENTS = [
  { id: 'op1', name: 'レン', rank: 'B', rp: 1180, nav: { type: 'ignite', gender: 'f' }, focus: '数学', order: ['数学', '英語', '国語', '理科', '社会'],
    stats: { 国語: { speed: 60, acc: 62, app: 50 }, 数学: { speed: 74, acc: 64, app: 55 }, 英語: { speed: 63, acc: 58, app: 49 }, 理科: { speed: 58, acc: 63, app: 51 }, 社会: { speed: 55, acc: 66, app: 45 } },
    reward: { win: 18, lose: -20 } },
  { id: 'op2', name: 'ミナト', rank: 'B+', rp: 1440, nav: { type: 'logic', gender: 'm' }, focus: '英語', order: ['理科', '国語', '英語', '社会', '数学'],
    look: { skins: { 数学: 'skin_ma_crystal', 理科: 'skin_sc_obs' }, base: 'base_marble', decos: ['deco_flag', 'deco_lantern'] },
    stats: { 国語: { speed: 62, acc: 74, app: 58 }, 数学: { speed: 66, acc: 72, app: 61 }, 英語: { speed: 64, acc: 75, app: 62 }, 理科: { speed: 61, acc: 70, app: 57 }, 社会: { speed: 63, acc: 68, app: 51 } },
    reward: { win: 25, lose: -15 } },
  { id: 'op3', name: 'ユウキ', rank: 'A−', rp: 1655, nav: { type: 'vex', gender: 'm' }, focus: '数学', order: ['英語', '数学', '社会', '国語', '理科'],
    look: { skins: { 英語: 'skin_en_castle', 数学: 'skin_ma_crystal', 社会: 'skin_so_tenshu' }, base: 'base_neon', decos: ['deco_flag', 'deco_halo'] },
    stats: { 国語: { speed: 66, acc: 75, app: 60 }, 数学: { speed: 78, acc: 76, app: 70 }, 英語: { speed: 71, acc: 74, app: 66 }, 理科: { speed: 64, acc: 70, app: 59 }, 社会: { speed: 68, acc: 77, app: 54 } },
    reward: { win: 34, lose: -10 } },
  { id: 'op4', name: 'コハル', rank: 'A−', rp: 1620, nav: { type: 'halo', gender: 'f' }, focus: '国語', order: ['国語', '社会', '理科', '英語', '数学'],
    look: { skins: { 国語: 'skin_ja_shoin', 社会: 'skin_so_tenshu' }, base: 'base_garden', decos: ['deco_flag', 'deco_petals'] },
    stats: { 国語: { speed: 70, acc: 84, app: 66 }, 数学: { speed: 62, acc: 66, app: 58 }, 英語: { speed: 66, acc: 73, app: 61 }, 理科: { speed: 63, acc: 72, app: 60 }, 社会: { speed: 71, acc: 80, app: 57 } },
    reward: { win: 32, lose: -11 } },
  { id: 'op5', name: 'シオン', rank: 'B+', rp: 1390, nav: { type: 'echo', gender: 'f' }, focus: '理科', order: ['社会', '理科', '数学', '国語', '英語'],
    stats: { 国語: { speed: 55, acc: 70, app: 66 }, 数学: { speed: 60, acc: 67, app: 69 }, 英語: { speed: 56, acc: 64, app: 63 }, 理科: { speed: 62, acc: 73, app: 72 }, 社会: { speed: 58, acc: 71, app: 60 } },
    reward: { win: 23, lose: -16 } },
];
