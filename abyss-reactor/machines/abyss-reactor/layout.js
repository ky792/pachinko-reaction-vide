/*
 * P 深淵機関 ABYSS REACTOR — 盤面レイアウト（ゲージ）
 * 座標系：筐体キャンバス 900 x 1560（論理px, 1px ≒ 1mm）
 * 釘・役物・入賞口はすべてデータ。開発者モードの釘調整はこのデータを上書きする。
 */
(function () {
  const C = { x: 450, y: 600 };
  const R = 392;
  const rad = (d) => (d * Math.PI) / 180;
  const polar = (deg, r) => [C.x + r * Math.cos(rad(deg)), C.y + r * Math.sin(rad(deg))];

  // ------------------------------------------------------------ helpers
  const nails = [];
  const N = (x, y, group) => nails.push({ x: +x.toFixed(1), y: +y.toFixed(1), g: group || 'field' });
  const line = (x0, y0, x1, y1, n, g) => { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); N(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, g); } };
  const inside = (x, y, m) => Math.hypot(x - C.x, y - C.y) < R - m;
  const insideLane = (x, y) => Math.hypot(x - C.x, y - C.y) < R - 32; // 内レールとの隙間確保

  // 役物枠（センターフレーム）外形：上部は楕円アーチ
  const frame = [];
  frame.push([162, 476]);
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (Math.PI * i) / 24;
    frame.push([450 + 288 * Math.cos(a), 476 + 240 * Math.sin(a)]);
  }
  frame.push([738, 476], [732, 612], [708, 662], [606, 696], [462, 706]);
  const frameLeftBottom = [[438, 706], [294, 696], [192, 662], [168, 612], [162, 476]];

  // 枠の外側にある点か（釘の自動配置用）
  const inFrame = (x, y, m) => {
    if (y < 476) { const dx = (x - 450) / (288 + m), dy = (y - 476) / (240 + m); return dx * dx + dy * dy < 1; }
    return x > 162 - m && x < 738 + m && y < 706 + m;
  };

  // ---- 左側：ワープ上部の盤面釘（千鳥）
  for (let row = 0; row < 11; row++) {
    const y = 388 + row * 21;
    const off = row % 2 ? 11 : 0;
    for (let x = 92 + off; x < 170; x += 22) {
      if (inside(x, y, 14) && Math.hypot(x - C.x, y - C.y) < R - 30 && !inFrame(x, y, 11)) N(x, y, 'left');
    }
  }
  // ---- 天釘（レール内側・枠アーチ上）
  for (let d = 232; d <= 254; d += 7) { const [x, y] = polar(d, R - 24); if (!inFrame(x, y, 20)) N(x, y, 'top'); }
  // ---- 風車（左）周辺
  N(104, 640, 'windmill'); N(150, 642, 'windmill'); N(127, 704, 'windmill');
  // ---- 道釘（左下 → ヘソ方向）
  line(120, 726, 404, 776, 20, 'road');
  // ---- 寄り釘・ジャンプ釘
  N(414, 768, 'yori'); N(424, 775, 'yori');
  // ---- 命釘（ヘソ上）
  N(441, 786, 'heso'); N(459, 786, 'heso');
  // ---- ステージ下 センター
  N(404, 728, 'center'); N(496, 728, 'center'); N(380, 744, 'center'); N(520, 744, 'center');
  // ---- 右側ステージ下（左打ちのこぼれ）
  line(498, 778, 700, 742, 12, 'rroad');
  // ---- 下部ハカマ・アウト周辺
  for (let row = 0; row < 4; row++) {
    const y = 826 + row * 24; const off = row % 2 ? 12 : 0;
    for (let x = 200 + off; x < 700; x += 26) {
      if (insideLane(x, y) && Math.abs(x - 450) > 22 && !(x > 588 && y > 850) && !(x > 278 && x < 322 && y > 860)) N(x, y, 'bottom');
    }
  }
  // ---- 右ルート（右打ち）
  for (let row = 0; row < 12; row++) {
    const y = 300 + row * 22; const off = row % 2 ? 11 : 0;
    for (let x = 742 + off; x < 830; x += 22) {
      if (Math.hypot(x - C.x, y - C.y) < R - 22 && !inFrame(x, y, 12) && !(Math.hypot(x - 764, y - 452) < 20) && y > 360) N(x, y, 'right');
    }
  }
  line(750, 606, 764, 700, 5, 'right'); // 電チュー誘導
  line(826, 640, 812, 690, 3, 'right');
  // 枠左側面の弾き釘（ワープ入口へは一部のみ到達）
  N(146, 482, 'warp'); N(148, 500, 'warp'); N(150, 572, 'warp');

  NB.registerMachine('abyss-reactor', 'layout', {
    canvas: { w: 900, h: 1560 },
    gravity: 2300,
    ballRadius: 5.5,
    nailRadius: 2.2,
    outer: { x: C.x, y: C.y, r: R },
    board: { x: 46, y: 150, w: 808, h: 900 },
    lcd: { x: 190, y: 318, w: 520, h: 292 },      // 液晶開口
    frame: { outline: [frame, frameLeftBottom], arch: { cx: 450, cy: 476, rx: 288, ry: 240 } },
    // 発射レーン
    lane: { innerR: R - 14, fromDeg: 112, toDeg: 215, spawnDeg: 116, spawnR: R - 6.5 },
    // 発射強度（ハンドル 0..1 → 初速 px/s）
    launch: { minSpeed: 1600, maxSpeed: 2300, jitter: 10, interval: 60 / 99 },
    restitution: { nail: 0.56, wall: 0.38, frame: 0.32, stage: 0.18, rail: 0.25 },
    nails,
    windmills: [{ id: 'wm1', x: 127, y: 672, r: 13, blades: 4 }],
    // ステージ（枠内）
    stage: {
      floor: [[214, 600], [216, 628], [300, 648], [382, 640], [441, 652]],
      floor2: [[459, 652], [518, 640], [600, 648], [684, 628], [686, 600]],
      chute: [[[441, 652], [441, 706]], [[459, 652], [459, 706]]],
      entry: { x: 232, y: 612, vx: 140 },
      frontFallRate: 0.85, // 1秒あたりの前こぼれ率
      exitKick: 34,
    },
    warp: {
      sensor: { x: 157, y: 536, r: 5 },
      path: [[164, 536], [186, 560], [200, 596], [214, 606], [232, 612]],
      duration: 0.75,
      chance: 0.22,
    },
    pockets: [
      { id: 'heso', type: 'heso', x: 450, y: 802, w: 22, h: 12, walls: [[[439, 792], [439, 812]], [[461, 792], [461, 812]]] },
      { id: 'general', type: 'general', x: 300, y: 876, w: 24, h: 10, walls: [[[286, 866], [286, 884]], [[314, 866], [314, 884]]] },
    ],
    through: { id: 'through', x: 764, y: 452, r: 12 },
    denchu: {
      x: 788, y: 744, w: 22, h: 12,
      walls: [[[775, 734], [775, 756]], [[801, 734], [801, 756]]],
      lid: [[803, 729], [771, 736]],
      wingsOpen: [[[775, 734], [756, 712]], [[801, 734], [820, 712]]],
    },
    attacker: {
      x: 655, y: 878, w: 92, h: 14,
      lid: [[606, 872], [704, 872]],
      guide: [[[836, 780], [812, 806]], [[812, 806], [704, 870]], [[606, 874], [566, 890]]],
      walls: [[[606, 872], [606, 890]], [[704, 870], [704, 890]]],
    },
    out: { x: 450, y: 980, r: 20 },
    walls: [
      [polar(112, R - 14), polar(104, R)],          // レーン下部の閉塞（盤面側）
      [polar(317, R), polar(327, R - 44)],          // 右打ち 返し（レールから右ルートへ落とす）
      [[801, 731], [822, 714]],                     // 電チュー右の閉塞
    ],
    // 角度ヘルパ
    polar,
  });
})();
