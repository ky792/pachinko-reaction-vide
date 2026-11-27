/* ==========================================================
 * 演出エフェクト：パーティクル / 魔法陣 / 光 / 振動 / 文字
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, E = U.ease;

  // ---------- スプライトキャッシュ（光の玉） ----------
  const spriteCache = {};
  function glow(color, size = 64, hard = 0.0) {
    const key = color + size + hard;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(Math.max(0.05, hard), color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    spriteCache[key] = c;
    return c;
  }
  function softDot(color, size = 64) {
    const key = 'soft' + color + size;
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    spriteCache[key] = c;
    return c;
  }

  // 魔法陣ルーン（手続き生成の記号）
  const runeCache = {};
  function rune(i, size, color) {
    const key = i + '_' + size + color;
    if (runeCache[key]) return runeCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = U.srand(i * 7919 + 13);
    g.strokeStyle = color; g.lineWidth = Math.max(1.5, size / 14); g.lineCap = 'round';
    g.beginPath();
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const pts = [[r(), r()], [r(), r()], [r(), r()]];
      g.moveTo(size * (0.15 + pts[0][0] * 0.7), size * (0.15 + pts[0][1] * 0.7));
      if (r() < 0.5) g.lineTo(size * (0.15 + pts[1][0] * 0.7), size * (0.15 + pts[1][1] * 0.7));
      else g.quadraticCurveTo(size * pts[1][0], size * pts[1][1], size * (0.15 + pts[2][0] * 0.7), size * (0.15 + pts[2][1] * 0.7));
    }
    if (r() < 0.4) { g.moveTo(size * 0.7, size * 0.5); g.arc(size * 0.5, size * 0.5, size * 0.2, 0, U.TAU); }
    g.stroke();
    runeCache[key] = c;
    return c;
  }

  // ---------- パーティクル ----------
  const parts = [];
  const MAX_PARTS = 900;
  function emit(o) {
    if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
    parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, life: 1, age: 0,
      size: 20, size1: null, alpha: 1, alpha1: 0, rot: 0, vr: 0,
      sprite: glow('rgba(255,140,40,0.8)'), blend: 'lighter', wobble: 0, kind: 'sprite',
    }, o));
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag) { const d = Math.pow(1 - p.drag, dt * 60); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt + (p.wobble ? Math.sin(p.age * 8 + p.seed) * p.wobble * dt : 0);
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  function drawParts(ctx, layer) {
    for (const p of parts) {
      if ((p.layer || 'front') !== layer) continue;
      const t = p.age / p.life;
      const a = U.lerp(p.alpha, p.alpha1, t);
      if (a <= 0.01) continue;
      const s = p.size1 == null ? p.size : U.lerp(p.size, p.size1, t);
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = p.blend;
      if (p.kind === 'coin') {
        ctx.save(); ctx.translate(p.x, p.y);
        const sx = Math.cos(p.age * 10 + p.seed);
        ctx.scale(sx, 1);
        MK.Art.coin(ctx, 0, 0, s);
        ctx.restore();
      } else if (p.kind === 'shard') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.4); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      } else {
        if (p.rot) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(p.sprite, -s / 2, -s / 2, s, s); ctx.restore();
        } else ctx.drawImage(p.sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- プリセット ----------
  const P = {
    fire(x, y, n = 3, scale = 1, layer) {
      for (let i = 0; i < n; i++) {
        emit({
          x: x + U.rand(-6, 6) * scale, y: y + U.rand(-3, 3) * scale, vx: U.rand(-12, 12) * scale, vy: U.rand(-90, -40) * scale,
          life: U.rand(0.4, 0.9), size: U.rand(18, 30) * scale, size1: 2, alpha: 0.9, sprite: glow(U.pick(['rgba(255,120,30,0.9)', 'rgba(255,70,20,0.9)', 'rgba(255,190,60,0.9)'])),
          wobble: 40 * scale, seed: Math.random() * 10, layer,
        });
      }
    },
    smoke(x, y, n = 1, scale = 1, color = 'rgba(40,30,50,0.55)', layer) {
      for (let i = 0; i < n; i++) {
        emit({
          x: x + U.rand(-10, 10) * scale, y, vx: U.rand(-15, 15) * scale, vy: U.rand(-40, -15) * scale,
          life: U.rand(1.5, 3), size: U.rand(20, 40) * scale, size1: U.rand(80, 140) * scale, alpha: 0.5, alpha1: 0,
          sprite: softDot(color), blend: 'source-over', wobble: 10, seed: Math.random() * 10, layer,
        });
      }
    },
    embers(W, H, n = 1, color = 'rgba(255,110,40,0.9)', layer = 'back') {
      for (let i = 0; i < n; i++) {
        emit({
          x: U.rand(0, W), y: H + 10, vx: U.rand(-20, 20), vy: U.rand(-80, -30),
          life: U.rand(3, 6), size: U.rand(4, 10), alpha: 0.9, alpha1: 0, sprite: glow(color, 32), wobble: 30, seed: Math.random() * 10, layer,
        });
      }
    },
    burst(x, y, n = 30, color = 'rgba(255,200,80,0.9)', speed = 400, size = 22) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(0.3, 1) * speed;
        emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.06, life: U.rand(0.5, 1.1), size: U.rand(0.5, 1.2) * size, size1: 1, sprite: glow(color) });
      }
    },
    sparks(x, y, n = 20, color = '#ffe27a', speed = 600) {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(0.4, 1) * speed;
        emit({ kind: 'spark', color, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ay: 600, drag: 0.04, life: U.rand(0.3, 0.7), size: U.rand(2, 4), size1: 0.5 });
      }
    },
    coins(x, y, tx, ty, n = 8) {
      for (let i = 0; i < n; i++) {
        const life = U.rand(0.7, 1.1);
        emit({
          kind: 'coin', x: x + U.rand(-30, 30), y: y + U.rand(-20, 10), vx: (tx - x) / life + U.rand(-60, 60), vy: (ty - y) / life - 260,
          ay: 520, life, size: U.rand(10, 15), alpha: 1, alpha1: 0.6, blend: 'source-over', seed: Math.random() * 10,
        });
      }
    },
    shards(x, y, n = 18, color = '#c9b8ff') {
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), s = U.rand(150, 500);
        emit({ kind: 'shard', color, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, ay: 500, life: U.rand(0.6, 1.2), size: U.rand(5, 12), rot: U.rand(0, 6), vr: U.rand(-10, 10), blend: 'source-over' });
      }
    },
    rise(x, y, w, n, color) {
      for (let i = 0; i < n; i++) {
        emit({ x: x + U.rand(-w, w), y: y + U.rand(-10, 10), vy: U.rand(-160, -60), life: U.rand(0.6, 1.4), size: U.rand(8, 18), size1: 2, sprite: glow(color, 32) });
      }
    },
  };

  // ---------- オーバーレイ（時間で消える描画物） ----------
  const overlays = [];
  function add(o) {
    o.age = 0; o.dur = o.dur || 1; o.layer = o.layer || 'front';
    overlays.push(o);
    return o;
  }
  function updateOverlays(dt) {
    for (let i = overlays.length - 1; i >= 0; i--) {
      const o = overlays[i];
      o.age += dt;
      if (o.update) o.update(dt, o);
      if (o.age >= o.dur && !o.hold) overlays.splice(i, 1);
    }
  }
  function drawOverlays(ctx, layer) {
    for (const o of overlays) {
      if (o.layer !== layer) continue;
      ctx.save();
      o.draw(ctx, U.clamp(o.age / o.dur, 0, 1), o.age, o);
      ctx.restore();
    }
  }
  function clearOverlays(filter) {
    for (let i = overlays.length - 1; i >= 0; i--) if (!filter || filter(overlays[i])) overlays.splice(i, 1);
  }

  // ---------- 画面振動 / フラッシュ ----------
  const shake = { amp: 0, decay: 6 };
  const flash = { a: 0, color: '#fff', decay: 3 };

  // ---------- 描画部品 ----------
  // 豪華文字：太縁取り＋グラデーション＋光沢
  function fancyText(ctx, text, x, y, size, style = {}) {
    const font = style.font || '"Dela Gothic One", "Hiragino Kaku Gothic StdN", "Yu Gothic", sans-serif';
    ctx.font = `${style.weight || ''} ${size}px ${font}`;
    ctx.textAlign = style.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const pal = style.palette || 'gold';
    const grads = {
      gold: ['#fffbe0', '#ffe066', '#e09a20', '#ffe48a', '#a05a10'],
      blood: ['#fff0f0', '#ff6a5a', '#d01020', '#ff8a7a', '#7a0010'],
      violet: ['#f4e8ff', '#c38bff', '#5a1ea8', '#d7b4ff', '#1d0640'],
      silver: ['#ffffff', '#d6dbe6', '#6d7488', '#e8ecf5', '#2a2e3a'],
      ice: ['#ffffff', '#9fe8ff', '#1773b8', '#b8f1ff', '#06223d'],
      rainbow: null,
    };
    const h = size;
    let fill;
    if (pal === 'rainbow') {
      const w = ctx.measureText(text).width;
      fill = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      const off = (U.now() * 0.5) % 1;
      const cols = ['#ff3b3b', '#ffb03b', '#fff23b', '#4bff6a', '#3bd8ff', '#6a5bff', '#e43bff', '#ff3b3b'];
      cols.forEach((c, i) => fill.addColorStop(U.mod(i / (cols.length - 1) + off, 1) * 0.999, c));
    } else {
      const c = grads[pal] || grads.gold;
      fill = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      if (size < 56) {
        // 小さい文字は暗い帯を入れず、明るく読みやすく
        fill.addColorStop(0, c[0]); fill.addColorStop(0.55, c[1]); fill.addColorStop(1, c[3]);
      } else {
        fill.addColorStop(0, c[0]); fill.addColorStop(0.45, c[1]); fill.addColorStop(0.5, c[2]);
        fill.addColorStop(0.75, c[3]); fill.addColorStop(1, c[4]);
      }
    }
    // 外側の光
    if (style.glow) {
      ctx.save();
      ctx.shadowColor = style.glow; ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = style.glow; ctx.fillText(text, x, y);
      ctx.restore();
    }
    const small = size < 56;
    ctx.strokeStyle = style.outer || '#120308';
    ctx.lineWidth = size * (style.outerW || (small ? 0.14 : 0.26));
    ctx.strokeText(text, x, y);
    ctx.strokeStyle = style.mid || (pal === 'blood' ? '#ffb347' : pal === 'violet' ? '#ffe08a' : '#ffffff');
    ctx.lineWidth = small ? 1.5 : size * 0.1;
    ctx.strokeText(text, x, y);
    if (!small) {
      ctx.strokeStyle = style.inner || '#2a0a10';
      ctx.lineWidth = size * 0.05;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    // 光沢スイープ
    if (style.shine != null) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const w = ctx.measureText(text).width;
      const sx = x - w / 2 - 100 + (w + 200) * style.shine;
      const sg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }

  // 魔法陣
  function magicCircle(ctx, x, y, r, t, color = 'rgba(190,120,255,1)', opt = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (opt.tilt) ctx.scale(1, opt.tilt);
    ctx.globalCompositeOperation = 'lighter';
    const a = opt.alpha == null ? 1 : opt.alpha;
    ctx.globalAlpha = a;
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = opt.blur == null ? 18 : opt.blur;
    const ring = (rr, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, rr, 0, U.TAU); ctx.stroke(); };
    ring(r, 4); ring(r * 0.92, 1.5); ring(r * 0.62, 3); ring(r * 0.56, 1.2);
    // 星形
    ctx.save(); ctx.rotate(t * 0.4);
    const pts = opt.points || 6;
    ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const k = (i * (pts === 5 ? 2 : 1)) % pts;
      const ang = (k / pts) * U.TAU - Math.PI / 2;
      const px = Math.cos(ang) * r * 0.9, py = Math.sin(ang) * r * 0.9;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    if (pts === 6) {
      ctx.moveTo(Math.cos(-Math.PI / 2) * r * 0.9, Math.sin(-Math.PI / 2) * r * 0.9);
      for (let i = 0; i <= 3; i++) { const ang = (i * 2 / 6) * U.TAU - Math.PI / 2; ctx.lineTo(Math.cos(ang) * r * 0.9, Math.sin(ang) * r * 0.9); }
      ctx.moveTo(Math.cos(Math.PI / 6) * r * 0.9, Math.sin(Math.PI / 6) * r * 0.9);
      for (let i = 0; i <= 3; i++) { const ang = ((i * 2 + 1) / 6) * U.TAU - Math.PI / 2; ctx.lineTo(Math.cos(ang) * r * 0.9, Math.sin(ang) * r * 0.9); }
    }
    ctx.stroke();
    ctx.restore();
    // ルーン環
    ctx.save(); ctx.rotate(-t * 0.25);
    ctx.shadowBlur = 0;
    const n = 18, rs = r * 0.13;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.rotate((i / n) * U.TAU);
      ctx.translate(0, -r * 0.77);
      ctx.drawImage(rune(i + (opt.seed || 0), 48, color), -rs / 2, -rs / 2, rs, rs);
      ctx.restore();
    }
    ctx.restore();
    // 内側の小円
    ctx.save(); ctx.rotate(t * 0.9);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * U.TAU;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 0.36, Math.sin(ang) * r * 0.36, r * 0.12, 0, U.TAU); ctx.stroke();
    }
    ctx.restore();
    // 中心の光
    ctx.globalAlpha = a * (0.5 + 0.2 * Math.sin(t * 5));
    ctx.drawImage(glow(color, 128), -r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
    ctx.restore();
  }

  // 放射光
  function rays(ctx, x, y, r, t, color = 'rgba(255,220,120,0.35)', n = 14, width = 0.12) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * U.TAU;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a - width, a + width);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // 集中線
  function speedLines(ctx, W, H, cx, cy, t, color = 'rgba(255,255,255,0.6)', n = 70) {
    ctx.save();
    const r = U.srand(Math.floor(t * 20) + 1);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = r() * U.TAU, w = 0.004 + r() * 0.01;
      const r0 = 120 + r() * 160, r1 = 900;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
      ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // 稲妻
  function lightning(ctx, x0, y0, x1, y1, color = '#d9c2ff', w = 4, seed = 1) {
    const r = U.srand(seed);
    const pts = [[x0, y0]];
    const n = 12;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([U.lerp(x0, x1, t) + (r() - 0.5) * 70, U.lerp(y0, y1, t) + (r() - 0.5) * 20]);
    }
    pts.push([x1, y1]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 25; ctx.lineJoin = 'round';
    [w * 3, w, w * 0.4].forEach((lw, k) => {
      ctx.lineWidth = lw; ctx.globalAlpha = k === 0 ? 0.3 : 1;
      if (k === 2) ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- 高レベル演出 ----------
  const FX = {
    glow, softDot, rune, emit, P, add, clearOverlays,
    fancyText, magicCircle, rays, speedLines, lightning,
    shake(amp = 12, decay = 6) { shake.amp = Math.max(shake.amp, amp); shake.decay = decay; },
    flash(color = '#ffffff', a = 1, decay = 3) { flash.color = color; flash.a = a; flash.decay = decay; },
    get parts() { return parts; },

    // 文字を叩きつける
    slam(text, opt = {}) {
      const W = MK.LCD.W, H = MK.LCD.H;
      const x = opt.x == null ? W / 2 : opt.x, y = opt.y == null ? H / 2 : opt.y;
      const size = opt.size || 110;
      const dur = opt.dur || 1.8;
      if (opt.sfx !== false) MK.Audio.play('hit');
      FX.shake(opt.shake == null ? 14 : opt.shake);
      return add({
        dur, layer: opt.layer || 'top',
        draw(ctx, p, age) {
          const inT = U.seg(age, 0, 0.18);
          const outT = U.seg(age, dur - 0.25, dur);
          const sc = U.lerp(2.6, 1, E.outBack(inT)) * (1 + outT * 0.3);
          ctx.globalAlpha = (1 - outT) * U.clamp(inT * 3, 0, 1);
          ctx.translate(x, y); ctx.scale(sc, sc);
          if (opt.rotate) ctx.rotate(opt.rotate);
          if (opt.back) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(-W, -size * 0.75, W * 2, size * 1.5);
            ctx.restore();
          }
          fancyText(ctx, text, 0, 0, size, { palette: opt.palette || 'gold', glow: opt.glow, shine: U.seg(age, 0.25, 0.9), font: opt.font });
          if (opt.sub) fancyText(ctx, opt.sub, 0, size * 0.85, size * 0.32, { palette: 'silver' });
        },
      });
    },

    // カットイン（斜めの帯＋キャラ）
    cutin(opt = {}) {
      const W = MK.LCD.W, H = MK.LCD.H;
      const dur = opt.dur || 1.6;
      MK.Audio.play('cutin');
      FX.shake(6);
      const color = opt.color || '#8a1020';
      return add({
        dur, layer: 'top',
        draw(ctx, p, age) {
          const inT = E.outCubic(U.seg(age, 0, 0.25));
          const outT = E.inCubic(U.seg(age, dur - 0.3, dur));
          const off = (1 - inT) * -W + outT * W;
          // 暗転
          ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - outT) * inT})`;
          ctx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.translate(off, 0);
          // 帯
          ctx.beginPath();
          ctx.moveTo(-100, H * 0.22); ctx.lineTo(W + 100, H * 0.12); ctx.lineTo(W + 100, H * 0.82); ctx.lineTo(-100, H * 0.92); ctx.closePath();
          const g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.9);
          g.addColorStop(0, '#000'); g.addColorStop(0.15, color); g.addColorStop(0.5, '#1a0208'); g.addColorStop(0.85, color); g.addColorStop(1, '#000');
          ctx.fillStyle = g; ctx.fill();
          ctx.save(); ctx.clip();
          speedLines(ctx, W, H, W * 0.3, H * 0.5, age, 'rgba(255,200,160,0.25)', 50);
          // キャラ
          const cx = W * 0.3 + (1 - inT) * -80 + age * 20;
          if (opt.drawChar) opt.drawChar(ctx, cx, H * 0.95, age);
          ctx.restore();
          // 縁
          ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(-100, H * 0.22); ctx.lineTo(W + 100, H * 0.12); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-100, H * 0.92); ctx.lineTo(W + 100, H * 0.82); ctx.stroke();
          // セリフ
          if (opt.text) {
            const tIn = E.outBack(U.seg(age, 0.2, 0.45));
            ctx.save();
            ctx.translate(W * 0.68, H * 0.5);
            ctx.rotate(-0.08);
            ctx.scale(tIn, tIn);
            fancyText(ctx, opt.text, 0, 0, opt.size || 72, { palette: opt.palette || 'gold', shine: U.seg(age, 0.4, 1.1) });
            if (opt.sub) fancyText(ctx, opt.sub, 0, (opt.size || 72) * 0.85, 28, { palette: 'silver', outerW: 0.3 });
            ctx.restore();
          }
          ctx.restore();
        },
      });
    },

    update(dt) {
      updateParts(dt);
      updateOverlays(dt);
      shake.amp = Math.max(0, shake.amp - shake.amp * shake.decay * dt - dt * 2);
      flash.a = Math.max(0, flash.a - flash.decay * dt);
    },
    drawLayer(ctx, layer) {
      drawOverlays(ctx, layer);
      drawParts(ctx, layer);
    },
    shakeOffset() {
      if (shake.amp < 0.3) return [0, 0];
      return [U.rand(-1, 1) * shake.amp, U.rand(-1, 1) * shake.amp];
    },
    drawFlash(ctx, W, H) {
      if (flash.a <= 0.01) return;
      ctx.globalAlpha = Math.min(1, flash.a);
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
    reset() { parts.length = 0; clearOverlays(); shake.amp = 0; flash.a = 0; },
  };

  MK.FX = FX;
})(window.MK);
