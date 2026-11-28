/*
 * 玉の物理エンジン
 *  - 固定時間刻み（既定 1/480 秒）。描画フレームレートに依存しない
 *  - 外レール（円）／内レール（発射レーン）／線分壁／釘（空間グリッド）／風車／センサー
 *  - ステージ・ワープは疑似3D扱い（前こぼれ・ワープ通路）
 */
(function (NB) {
  'use strict';
  const STEP = 1 / 480;

  class Physics {
    constructor(layout, opts = {}) {
      this.L = layout;
      this.rng = opts.rng || new NB.RNG(opts.seed || 12345);
      this.g = layout.gravity;
      this.br = layout.ballRadius;
      this.balls = [];
      this.pool = [];
      this.time = 0;
      this.acc = 0;
      this.gates = { denchu: false, attacker: false };
      this.onEvent = opts.onEvent || (() => {});
      this.nextId = 1;
      this.windmills = layout.windmills.map((w) => ({ ...w, angle: 0, omega: 0 }));
      this.rebuild();
    }

    /** 釘・壁データから衝突構造を構築（釘調整後に呼ぶ） */
    rebuild() {
      const L = this.L;
      const e = L.restitution;
      this.segs = [];
      const add = (a, b, ee, tag, extra) => this.segs.push(Object.assign({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], e: ee, tag }, extra || {}));
      // 内レール
      const ir = L.lane.innerR;
      for (let d = L.lane.fromDeg; d < L.lane.toDeg; d += 4) {
        add(L.polar(d, ir), L.polar(Math.min(d + 4, L.lane.toDeg), ir), e.rail, 'rail');
      }
      // レーン出口の逆流防止弁（レーン内の玉は通過可）
      add(L.polar(L.lane.toDeg, ir), L.polar(L.lane.toDeg, L.outer.r), e.rail, 'gate', { laneOneWay: true });
      // 役物枠
      for (const fo of L.frame.outline) for (let i = 0; i < fo.length - 1; i++) add(fo[i], fo[i + 1], e.frame, 'frame');
      // ステージ
      const st = L.stage;
      for (const arr of [st.floor, st.floor2]) for (let i = 0; i < arr.length - 1; i++) add(arr[i], arr[i + 1], e.stage, 'stage', { friction: 0.0004 });
      for (const c of st.chute) add(c[0], c[1], e.stage, 'stage');
      // 入賞口
      for (const p of L.pockets) for (const w of p.walls) add(w[0], w[1], e.wall, 'pocket');
      // 電チュー
      for (const w of L.denchu.walls) add(w[0], w[1], e.wall, 'denchu');
      add(L.denchu.lid[0], L.denchu.lid[1], e.wall, 'denchuLid', { gate: 'denchu', when: false });
      for (const w of L.denchu.wingsOpen) add(w[0], w[1], e.wall, 'denchuWing', { gate: 'denchu', when: true });
      // アタッカー
      for (const w of L.attacker.guide) add(w[0], w[1], e.wall, 'guide');
      for (const w of L.attacker.walls) add(w[0], w[1], e.wall, 'attacker');
      add(L.attacker.lid[0], L.attacker.lid[1], e.wall, 'attackerLid', { gate: 'attacker', when: false });
      for (const w of L.walls) add(w[0], w[1], e.wall, 'rail');
      for (const s of this.segs) {
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1; s.len2 = dx * dx + dy * dy || 1;
        s.minx = Math.min(s.x1, s.x2) - 8; s.maxx = Math.max(s.x1, s.x2) + 8;
        s.miny = Math.min(s.y1, s.y2) - 8; s.maxy = Math.max(s.y1, s.y2) + 8;
      }
      // 釘グリッド
      this.cell = 16;
      this.grid = new Map();
      for (const n of L.nails) {
        const k = this.key(Math.floor(n.x / this.cell), Math.floor(n.y / this.cell));
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(n);
      }
    }
    key(i, j) { return i * 1000 + j; }

    /** 発射。power 0..1 */
    launch(power) {
      const L = this.L;
      const p = NB.math.clamp(power, 0, 1);
      const sp = L.launch.minSpeed + (L.launch.maxSpeed - L.launch.minSpeed) * p + this.rng.range(-1, 1) * L.launch.jitter;
      const [x, y] = L.polar(L.lane.spawnDeg, L.lane.spawnR);
      const a = (L.lane.spawnDeg * Math.PI) / 180;
      const b = this.pool.pop() || {};
      Object.assign(b, {
        id: this.nextId++, x, y, vx: -Math.sin(a) * sp, vy: Math.cos(a) * sp,
        inLane: true, onStage: false, ghost: false, warp: null, warpChecked: false, lastThrough: 0, still: 0, alive: true, age: 0, kicked: false, z: 0,
      });
      this.balls.push(b);
      return b;
    }

    /** 実時間 dt を受けて固定刻みで進める */
    update(dt) {
      this.acc += Math.min(dt, 0.1);
      let n = 0;
      while (this.acc >= STEP && n < 200) { this.step(STEP); this.acc -= STEP; n++; }
    }

    step(dt) {
      this.time += dt;
      for (const w of this.windmills) { w.angle += w.omega * dt; w.omega *= 1 - 0.9 * dt; }
      const balls = this.balls;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (!b.alive) continue;
        b.age += dt;
        if (b.warp) { this.stepWarp(b, dt); continue; }
        b.vy += this.g * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        this.collide(b, dt);
        if (b.onStage && !b.ghost) this.stageLogic(b, dt);
        this.sensors(b);
        // 停滞検出（玉詰まり防止）
        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 < 400 && !b.onStage) { b.still += dt; if (b.still > 2.5) { b.vx += this.rng.range(-60, 60); b.vy -= 40; b.still = 1.5; } }
        else b.still = 0;
        if (b.age > 40) this.remove(b, 'lost');
      }
      // 玉同士
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i]; if (!a.alive || a.warp) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j]; if (!c.alive || c.warp || c.ghost !== a.ghost) continue;
          const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy, rr = this.br * 2;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = (rr - d) / 2;
            a.x -= nx * pen; a.y -= ny * pen; c.x += nx * pen; c.y += ny * pen;
            const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rv < 0) { const imp = -(1 + 0.6) * rv / 2; a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
          }
        }
      }
      // 削除済み回収
      let w = 0;
      for (let i = 0; i < balls.length; i++) { if (balls[i].alive) balls[w++] = balls[i]; else this.pool.push(balls[i]); }
      balls.length = w;
    }

    resolve(b, nx, ny, pen, e, fr, jitter) {
      if (jitter) { // 釘個体差：法線をわずかに揺らす
        const a = this.rng.range(-jitter, jitter), c = Math.cos(a), s = Math.sin(a);
        const tx = nx * c - ny * s; ny = nx * s + ny * c; nx = tx;
      }
      b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
        if (fr) { const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty; b.vx -= vt * fr * tx; b.vy -= vt * fr * ty; }
        return -vn;
      }
      return 0;
    }

    collide(b, dt) {
      const L = this.L, r = this.br;
      // 外レール
      const dx = b.x - L.outer.x, dy = b.y - L.outer.y, d = Math.hypot(dx, dy), lim = L.outer.r - r;
      if (d > lim) {
        const nx = -dx / d, ny = -dy / d;
        b.x = L.outer.x - nx * lim; b.y = L.outer.y - ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= (1 + L.restitution.rail * (b.inLane ? 0 : 1)) * vn * nx; b.vy -= (1 + L.restitution.rail * (b.inLane ? 0 : 1)) * vn * ny; }
        const k = 1 - 0.06 * dt; b.vx *= k; b.vy *= k; // レール摩擦
      }
      // レーン離脱判定
      if (b.inLane) {
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI; if (deg < 0) deg += 360;
        if (deg > L.lane.toDeg + 2 && deg < 300) b.inLane = false;
        if (deg < L.lane.spawnDeg - 3 && deg > 60 && b.vy > 0) { this.remove(b, 'foul'); return; }
      }
      // 線分
      for (const s of this.segs) {
        if (b.x < s.minx || b.x > s.maxx || b.y < s.miny || b.y > s.maxy) continue;
        if (s.laneOneWay && b.inLane) continue;
        if (s.gate && this.gates[s.gate] !== s.when) continue;
        if (b.ghost && (s.tag === 'frame' || s.tag === 'stage')) continue;
        if (b.inLane && s.tag !== 'rail') continue;
        const t = NB.math.clamp(((b.x - s.x1) * (s.x2 - s.x1) + (b.y - s.y1) * (s.y2 - s.y1)) / s.len2, 0, 1);
        const px = s.x1 + (s.x2 - s.x1) * t, py = s.y1 + (s.y2 - s.y1) * t;
        const ex = b.x - px, ey = b.y - py, e2 = ex * ex + ey * ey;
        if (e2 < r * r) {
          const ed = Math.sqrt(e2) || 1e-4;
          const imp = this.resolve(b, ex / ed, ey / ed, r - ed, s.e, s.friction || 0.01, 0);
          if (s.tag === 'stage' && b.onStage && imp < 30) { b.vx *= 1 - 0.25 * dt; }
          if (imp > 140) this.onEvent('hit', { ball: b, tag: s.tag, imp });
        }
      }
      if (b.inLane) return;
      // 釘
      const nr = L.nailRadius + r;
      const ci = Math.floor(b.x / this.cell), cj = Math.floor(b.y / this.cell);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const arr = this.grid.get(this.key(i, j)); if (!arr) continue;
        for (const n of arr) {
          const ex = b.x - n.x, ey = b.y - n.y, e2 = ex * ex + ey * ey;
          if (e2 < nr * nr) {
            const ed = Math.sqrt(e2) || 1e-4;
            const imp = this.resolve(b, ex / ed, ey / ed, nr - ed, L.restitution.nail, 0.03, 0.05);
            if (imp > 120) { n.flash = 1; this.onEvent('nail', { ball: b, nail: n, imp }); }
          }
        }
      }
      // 風車
      for (const w of this.windmills) {
        const ex = b.x - w.x, ey = b.y - w.y, e2 = ex * ex + ey * ey, rr = w.r + r;
        if (e2 < rr * rr) {
          const ed = Math.sqrt(e2) || 1e-4, nx = ex / ed, ny = ey / ed;
          this.resolve(b, nx, ny, rr - ed, 0.3, 0, 0.12);
          const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty, vs = w.omega * w.r;
          const dv = (vs - vt) * 0.4;
          b.vx += dv * tx; b.vy += dv * ty;
          w.omega -= (dv * 0.6) / w.r;
          if (Math.abs(w.omega) > 40) w.omega = Math.sign(w.omega) * 40;
        }
      }
    }

    stageLogic(b, dt) {
      const st = this.L.stage;
      // 前こぼれ：ステージ上の転がり中に確率で手前へ落下
      if (b.y < 660 && b.x > 236 && b.x < 664 && Math.abs(b.x - 450) > 30) {
        if (this.rng.chance(st.frontFallRate * dt)) { b.ghost = true; b.vy = 60; b.vx *= 0.5; this.onEvent('stageFall', { ball: b }); }
      }
      // センター穴を抜けた
      if (b.y > 690 && Math.abs(b.x - 450) < 12) {
        b.onStage = false;
        if (!b.kicked) { b.kicked = true; b.vx = this.rng.range(-1, 1) * st.exitKick; b.vy = Math.max(b.vy, 120); this.onEvent('stageCenter', { ball: b }); }
      }
    }

    stepWarp(b, dt) {
      const W = this.L.warp;
      b.warp.t += dt / W.duration;
      const t = Math.min(1, b.warp.t), P = W.path, f = t * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i;
      b.x = P[i][0] + (P[i + 1][0] - P[i][0]) * u; b.y = P[i][1] + (P[i + 1][1] - P[i][1]) * u;
      if (t >= 1) {
        b.warp = null; b.onStage = true; b.ghost = false;
        const en = this.L.stage.entry; b.x = en.x; b.y = en.y; b.vx = en.vx * this.rng.range(0.7, 1.4); b.vy = 0;
        this.onEvent('stageIn', { ball: b });
      }
    }

    sensors(b) {
      if (!b.alive) return;
      const L = this.L;
      if (b.ghost && b.y > 716) { b.ghost = false; b.onStage = false; }
      // ワープ
      const W = L.warp.sensor;
      if (!b.onStage && !b.ghost && !b.warpChecked && Math.hypot(b.x - W.x, b.y - W.y) < W.r + this.br && (b.warpChecked = true) && this.rng.chance(L.warp.chance)) {
        b.warp = { t: 0 }; this.onEvent('warp', { ball: b }); return;
      }
      // 入賞口
      for (const p of L.pockets) {
        if (Math.abs(b.x - p.x) < p.w / 2 && Math.abs(b.y - p.y) < p.h / 2) { this.remove(b, p.type); return; }
      }
      // スルー
      const T = L.through;
      if (Math.hypot(b.x - T.x, b.y - T.y) < T.r && b.lastThrough !== b.id) { b.lastThrough = b.id; this.onEvent('through', { ball: b }); }
      // 電チュー
      const D = L.denchu;
      if (Math.abs(b.x - D.x) < D.w / 2 && Math.abs(b.y - D.y) < D.h / 2) { this.remove(b, 'denchu'); return; }
      // アタッカー
      const A = L.attacker;
      if (this.gates.attacker && Math.abs(b.x - A.x) < A.w / 2 && Math.abs(b.y - A.y) < A.h / 2) { this.remove(b, 'attacker'); return; }
      // アウト
      if (Math.hypot(b.x - L.out.x, b.y - L.out.y) < L.out.r || b.y > L.outer.y + L.outer.r + 10) { this.remove(b, 'out'); }
    }

    remove(b, reason) {
      if (!b.alive) return;
      b.alive = false;
      this.onEvent('remove', { ball: b, reason });
    }

    clear() { for (const b of this.balls) b.alive = false; this.balls.length = 0; }
  }

  Physics.STEP = STEP;
  NB.Physics = Physics;
})(globalThis.NB);
