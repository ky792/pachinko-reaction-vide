/* ==========================================================
 * 謎のスロット台：魂札リール・台の機嫌（隠れ状態）・魔眼
 * 機嫌：0 静寂 / 1 ざわめき / 2 前兆 / 3 暴走
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U;
  const SPEED = 16; // コマ/秒
  let uid = 1;

  function tile(type) { return { id: uid++, type, lv: 1, bonus: 0, sealed: 0, asleep: false }; }

  const M = {
    strips: [], reels: [], mood: 0, boomLeft: 0, sinceBoom: 0, preCount: 0, fake: false,
    tile,
    init(stripTypes) {
      M.strips = stripTypes.map((s) => s.map(tile));
      M.reels = M.strips.map((s, i) => ({ pos: U.randi(0, s.length - 1) + s.length * 50, state: 'stop', from: 0, target: 0, t0: 0, dur: 0, bounce: 0, done: null }));
      M.mood = 0; M.boomLeft = 0; M.sinceBoom = 0; M.fake = false;
    },
    len(i) { return M.strips[i].length; },
    idx(i, row) { return U.mod(Math.round(M.reels[i].pos) + row, M.len(i)); },
    tileAt(i, row) { return M.strips[i][M.idx(i, row)]; },
    anySpinning() { return M.reels.some((r) => r.state !== 'stop'); },
    spinning(i) { return M.reels[i].state === 'spin'; },

    // ---- 台の機嫌：回転開始ごとに推移（setting=設定1〜6） ----
    advance(setting) {
      if (M.mood === 3) {
        M.boomLeft--;
        if (M.boomLeft <= 0) { M.mood = 0; M.sinceBoom = 0; }
        return;
      }
      M.sinceBoom++;
      if (M.mood === 2) {
        M.preCount--;
        if (M.preCount <= 0) return M.boom();
        return;
      }
      const r = Math.random();
      if (M.mood === 0 && r < 0.08 + 0.02 * setting) M.mood = 1;
      else if (M.mood === 1) {
        if (r < 0.28 + 0.02 * setting) { M.mood = 2; M.preCount = U.randi(1, 3); }
        else if (r > 0.86) M.mood = 0;
      }
      if (M.sinceBoom >= 28 && M.mood < 2) { M.mood = 2; M.preCount = 1; } // 天井：魔導機の怒り
    },
    boom(extra = 0) { M.mood = 3; M.boomLeft = 3 + extra; M.justBoomed = true; },
    raise() { if (M.mood < 2) { M.mood++; if (M.mood === 2) M.preCount = U.randi(1, 2); } },
    // 表示上の期待度（★1〜5）とランプ色。偽の前兆は色が少し違う（見抜ける）
    signs() {
      if (M.mood === 3) return { stars: 5, lamp: 'boom' };
      if (M.fake) return { stars: 4, lamp: 'fake' };
      return { stars: [1, 2 + (M.sinceBoom % 2), 4, 5][M.mood], lamp: ['dim', 'violet', 'red', 'boom'][M.mood] };
    },

    start() {
      const now = U.now();
      M.reels.forEach((r, k) => { r.state = 'spin'; r.spinStart = now + k * 0.05; r.pos = Math.round(r.pos); });
    },
    // 停止：forced に行番号を渡すと決め打ち（チュートリアル用）
    stop(i, forced) {
      const r = M.reels[i];
      if (r.state !== 'spin') return Promise.resolve();
      const n = M.len(i);
      const base = Math.floor(r.pos);
      let target;
      if (forced != null) {
        let d = U.mod(base - forced, n); if (d < 2) d += n;
        target = base - d;
      } else target = base - U.randi(2, 2 + n);
      // 前兆中は、ときどき上段に石ころが並ぶ（リーチ目）
      if (M.mood === 2 && M.reachMe) {
        for (let k = 0; k < n; k++) { const tg = target - k; if (M.strips[i][U.mod(tg - 1, n)].type === 'stone') { target = tg; break; } }
      }
      r.state = 'stopping'; r.from = r.pos; r.target = target; r.t0 = U.now();
      r.dur = Math.max(0.12, (r.from - target) / (SPEED * 1.4));
      return new Promise((res) => { r.done = res; });
    },
    // 魔眼：止まったリールを1コマずらす（d=+1で下の札が中段へ）
    shift(i, d) {
      const r = M.reels[i];
      r.state = 'stopping'; r.from = r.pos; r.target = Math.round(r.pos) + d; r.t0 = U.now(); r.dur = 0.18;
      return new Promise((res) => { r.done = res; });
    },
    update(dt) {
      const now = U.now();
      M.reels.forEach((r) => {
        if (r.state === 'spin') { if (now >= r.spinStart) r.pos -= SPEED * dt * U.clamp((now - r.spinStart) / 0.2, 0, 1); }
        else if (r.state === 'stopping') {
          const p = U.clamp((now - r.t0) / r.dur, 0, 1);
          r.pos = U.lerp(r.from, r.target, U.ease.outCubic(p));
          if (p >= 1) { r.pos = r.target; r.state = 'stop'; r.bounce = now; const d = r.done; r.done = null; d && d(); }
        }
        if (r.pos < 1000 && r.state === 'stop') r.pos += M.len(M.reels.indexOf(r)) * 100;
      });
    },
    // 札を追加（石ころがあれば置き換え）
    addTile(i, type) {
      const s = M.strips[i];
      const st = s.findIndex((t) => t.type === 'stone');
      const t = tile(type);
      if (st >= 0) s[st] = t;
      else if (s.length < MK.D.MAX_STRIP) s.splice(U.randi(0, s.length), 0, t);
      else return null;
      return t;
    },
    removeTile(i, id) {
      const s = M.strips[i];
      const k = s.findIndex((t) => t.id === id);
      if (k < 0) return;
      if (s.length > 5) s.splice(k, 1); else s[k] = tile('stone');
      M.reels[i].pos = Math.round(M.reels[i].pos);
    },
    allTiles() { return M.strips.flat(); },
    monsters() { return M.allTiles().filter((t) => MK.D.TILES[t.type].wage > 0 || t.type === 'knight'); },
  };
  MK.Machine = M;
})(window.MK);
