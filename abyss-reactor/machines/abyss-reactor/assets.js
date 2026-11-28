/*
 * P 深淵機関 ABYSS REACTOR — 素材マニフェスト
 * src のファイルを配置すると自動で差し替わる（未配置時は仮素材＝プロシージャル描画）。
 * 座標：筐体系は 900x1560、液晶系(lcd: true)は 960x540 の液晶内座標。
 * 詳細な制作仕様・生成AIプロンプトは docs/ASSET_LIST.md を参照。
 */
(function () {
  const A = 'assets/';
  const items = [
    // ---- 筐体
    { id: 'cabinet_frame', src: A + 'cabinet/cabinet_frame.png', x: 0, y: 0, w: 900, h: 1560, layer: 'cabinet', desc: '筐体フレーム全体（盤面・液晶部は透過）' },
    { id: 'cabinet_top', src: A + 'cabinet/cabinet_top.png', x: 0, y: 0, w: 900, h: 156, layer: 'cabinet', desc: '上部トップユニット（ロゴ部）' },
    { id: 'cabinet_lower', src: A + 'cabinet/cabinet_lower.png', x: 0, y: 1050, w: 900, h: 510, layer: 'cabinet', desc: '下皿・上皿・スピーカー部' },
    { id: 'handle', src: A + 'cabinet/handle.png', x: 790, y: 1400, w: 150, h: 150, anchor: [0.5, 0.5], desc: '発射ハンドル（回転部）' },
    { id: 'push_button', src: A + 'cabinet/push_button.png', x: 450, y: 1210, w: 190, h: 190, anchor: [0.5, 0.5], desc: 'プッシュボタン（通常）' },
    { id: 'push_button_lit', src: A + 'cabinet/push_button_lit.png', x: 450, y: 1210, w: 190, h: 190, anchor: [0.5, 0.5], desc: 'プッシュボタン（発光）' },
    // ---- 盤面
    { id: 'board_art', src: A + 'playfield/board_art.png', x: 46, y: 150, w: 808, h: 900, desc: '盤面セル画（ベニヤ/透明板の印刷）' },
    { id: 'center_frame', src: A + 'playfield/center_frame.png', x: 140, y: 214, w: 620, h: 510, desc: 'センター役物枠（液晶周囲）' },
    { id: 'stage', src: A + 'playfield/stage.png', x: 200, y: 590, w: 500, h: 120, desc: 'ステージ（透明樹脂）' },
    { id: 'heso', src: A + 'playfield/heso.png', x: 450, y: 800, w: 60, h: 46, anchor: [0.5, 0.5], desc: 'ヘソ（始動口）' },
    { id: 'attacker', src: A + 'playfield/attacker.png', x: 600, y: 850, w: 116, h: 50, desc: 'アタッカー' },
    { id: 'denchu', src: A + 'playfield/denchu.png', x: 760, y: 712, w: 56, h: 52, desc: '電チュー' },
    { id: 'glass', src: A + 'playfield/glass_reflection.png', x: 46, y: 150, w: 808, h: 900, desc: '盤面ガラス反射（加算合成）' },
    // ---- 役物
    { id: 'core_ring', src: A + 'mechanism/core_ring.png', w: 300, h: 300, desc: '深淵コア 外輪' },
    { id: 'core_plate', src: A + 'mechanism/core_plate.png', w: 90, h: 130, desc: '深淵コア 可動プレート（8枚）' },
    { id: 'core_orb', src: A + 'mechanism/core_orb.png', w: 150, h: 150, desc: '深淵コア 中心球' },
    // ---- 図柄
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: 'symbol_' + n, src: A + 'symbols/symbol_' + n + '.png', w: 220, h: 220, lcd: true, desc: n + '図柄' })),
    // ---- 保留
    ...['normal', 'blue', 'green', 'red', 'gold', 'rainbow'].map((c) => ({ id: 'hold_' + c, src: A + 'hold/hold_' + c + '.png', w: 96, h: 96, lcd: true, desc: '保留 ' + c })),
    // ---- 液晶背景（画像 or ループ動画）
    { id: 'bg_lab', src: A + 'backgrounds/bg_lab.webm', type: 'video', loop: true, lcd: true, desc: '通常 研究施設ステージ' },
    { id: 'bg_core', src: A + 'backgrounds/bg_core.webm', type: 'video', loop: true, lcd: true, desc: '通常 深淵機関内部ステージ' },
    { id: 'bg_alert', src: A + 'backgrounds/bg_alert.webm', type: 'video', loop: true, lcd: true, desc: '通常 警戒区域ステージ' },
    { id: 'bg_rush', src: A + 'backgrounds/bg_rush.webm', type: 'video', loop: true, lcd: true, desc: '深淵RUSH 背景' },
    { id: 'bg_sp_connect', src: A + 'backgrounds/bg_sp_connect.webm', type: 'video', loop: true, lcd: true, desc: 'SP 機関接続リーチ' },
    { id: 'bg_sp_control', src: A + 'backgrounds/bg_sp_control.webm', type: 'video', loop: true, lcd: true, desc: 'SP 暴走制御リーチ' },
    { id: 'bg_sp_awaken', src: A + 'backgrounds/bg_sp_awaken.webm', type: 'video', loop: true, lcd: true, desc: 'SP 深淵覚醒リーチ' },
    // ---- 演出動画（存在すればプロシージャル演出の上に再生）
    { id: 'mv_overdrive', src: A + 'movies/mv_overdrive.webm', type: 'video', lcd: true, desc: 'ABYSS OVERDRIVE 本編' },
    { id: 'mv_rush_in', src: A + 'movies/mv_rush_in.webm', type: 'video', lcd: true, desc: '深淵RUSH 突入' },
    { id: 'mv_awaken_core', src: A + 'movies/mv_awaken_core.webm', type: 'video', lcd: true, desc: '深淵覚醒 コア起動' },
    // ---- エフェクト
    { id: 'fx_shockwave', src: A + 'effects/fx_shockwave.png', frames: 16, cols: 4, lcd: true, desc: '衝撃波スプライト' },
    { id: 'fx_spark', src: A + 'effects/fx_spark.png', lcd: true, desc: '火花パーティクル' },
    { id: 'fx_lightning', src: A + 'effects/fx_lightning.png', frames: 8, cols: 4, lcd: true, desc: '放電スプライト' },
    // ---- 液晶 UI
    { id: 'logo_title', src: A + 'ui/logo_title.png', w: 640, h: 220, lcd: true, desc: '機種ロゴ' },
    { id: 'logo_rush', src: A + 'ui/logo_rush.png', w: 640, h: 240, lcd: true, desc: '深淵RUSH ロゴ' },
    { id: 'logo_overdrive', src: A + 'ui/logo_overdrive.png', w: 760, h: 220, lcd: true, desc: 'ABYSS OVERDRIVE ロゴ' },
    { id: 'title_sp_connect', src: A + 'ui/title_sp_connect.png', w: 700, h: 200, lcd: true, desc: '機関接続リーチ タイトル' },
    { id: 'title_sp_control', src: A + 'ui/title_sp_control.png', w: 700, h: 200, lcd: true, desc: '暴走制御リーチ タイトル' },
    { id: 'title_sp_awaken', src: A + 'ui/title_sp_awaken.png', w: 700, h: 200, lcd: true, desc: '深淵覚醒リーチ タイトル' },
  ];
  NB.registerMachine('abyss-reactor', 'assets', { items });
})();
