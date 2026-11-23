/* 陣地の2D表示とバトル演出（Canvas 2D・斜め見下ろしのアイソメトリック）。
 *  - 本番の絵（assets/territory/…）があればそれを描き、なければコードで描いた仮の絵を描く
 *  - 陣地の色（持ち主の色）は絵とは別の「チーム色マスク」を実行時に塗る（ART_SPEC.md 参照）
 *  - 呼び出し方は旧 3D 版と同じ：create(order, colors, look) → { canvas, resize, setState, focus, intro, clash, capture, destroy, key }
 *  states: 'pending' | 'active' | 'me' | 'op' | 'none' | 'own'（マイ陣地用。光の柱を弱く） */
(function () {
  const CAT = () => window.COSMETICS || { items: [] };
  const item = (id) => CAT().items.find((x) => x.id === id);
  const NEUTRAL = '#3C4870';
  const ISO_X = 0.866, ISO_Y = 0.5;
  const ART_ANCHOR = 240 / 1024; // 建物の絵（1024×1536）：台座の中心は下端から 240px

  /* ---------- 色ユーティリティ ---------- */
  const hex = (n) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : n);
  function rgb(c) {
    if (Array.isArray(c)) return c;
    c = hex(c);
    const m = /^rgba?\(([^)]+)\)/.exec(c); // 'rgba(r,g,b,a)' 形式（持ち主の色）も読む
    if (m) return m[1].split(',').slice(0, 3).map(Number);
    c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  const css = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const shade = (a, k) => (k >= 0 ? mix(a, [255, 255, 255], k) : mix(a, [0, 0, 0], -k));

  /* ---------- 画像アセット（あれば使う） ---------- */
  const IMG = {};
  function img(path) {
    if (!path) return null;
    if (!IMG[path]) { const im = new Image(); im.onerror = () => { im.failed = true; }; im.src = path; IMG[path] = im; }
    const im = IMG[path]; return im.complete && !im.failed && im.naturalWidth ? im : null;
  }
  /* マゼンタ（#FF00FF）で塗られた部分を「持ち主の色」として抜き出す。
   * 本体はその部分を明るい無彩色に置き換え、マスクには陰影（明るさ）と強さを残す。1回だけ処理してキャッシュ */
  const KEYED = {};
  function keyed(im) {
    if (KEYED[im.src]) return KEYED[im.src];
    const w = im.naturalWidth, h = im.naturalHeight, base = document.createElement('canvas'), mask = document.createElement('canvas');
    base.width = mask.width = w; base.height = mask.height = h;
    const bg = base.getContext('2d'), mg = mask.getContext('2d'); bg.drawImage(im, 0, 0);
    let found = false, box = { x0: 0, y0: 0, x1: w, y1: h };
    try {
      const src = bg.getImageData(0, 0, w, h), m = mg.createImageData(w, h), a = src.data, o = m.data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let i = 0; i < a.length; i += 4) {
        const r = a[i], g = a[i + 1], b = a[i + 2], al = a[i + 3]; if (!al) continue;
        if (al > 200) { const p = i / 4, x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const key = Math.min(r, b) - g; // マゼンタらしさ（白と混ざった淡いピンクも拾う）
        if (key < 22 || r - b > 90 || b - r > 150) continue; // 青寄りの紫（発光の芯）も拾う
        const k = Math.min(1, (key - 22) / 70), lum = Math.max(r, b);
        o[i] = o[i + 1] = o[i + 2] = lum; o[i + 3] = al * k; found = true;
        const gray = 150 + lum * 0.4; a[i] = a[i] * (1 - k) + gray * k; a[i + 1] = a[i + 1] * (1 - k) + gray * k; a[i + 2] = a[i + 2] * (1 - k) + gray * k;
      }
      bg.putImageData(src, 0, 0); mg.putImageData(m, 0, 0);
      if (x1 > x0) box = { x0, y0, x1, y1 };
    } catch (e) { /* 別オリジンなどで読めない場合はそのまま */ }
    return (KEYED[im.src] = { base, mask: found ? mask : null, box });
  }
  const TINT = {};
  function tinted(mask, color, id) {
    const k = id + color; if (TINT[k]) return TINT[k];
    const c = document.createElement('canvas'); c.width = mask.width || mask.naturalWidth; c.height = mask.height || mask.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
    return (TINT[k] = c);
  }
  /* 本番の絵を描く：本体 → 持ち主の色（陰影つき）→ うっすら発光 */
  function drawArt(g, im, sep, x, y, w, h, color, id) {
    const K = keyed(im);
    g.drawImage(K.base, x, y, w, h);
    const m = sep ? sep : K.mask;
    if (m) {
      const tm = tinted(m, color, id + (sep ? 'sep' : 'key'));
      g.drawImage(tm, x, y, w, h);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(tm, x, y, w, h); g.restore();
    }
  }

  /* ---------- 描画ヘルパー（陣地ごとのローカル座標 → 画面） ----------
   * x: 右奥へ / z: 左奥へ（正で手前） / y: 上。単位 u は陣地の大きさ。 */
  function makeDraw(g, cx, cy, u) {
    const P = (x, y, z) => [cx + (x - z) * u * ISO_X, cy + (x + z) * u * ISO_Y - y * u];
    const poly = (pts, fill, stroke, lw = 1) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
    const OUT = 'rgba(5,8,15,.55)';
    const d = {
      g, u, P, poly,
      box(x, y, z, w, h, dd, col, o = {}) {
        const c = rgb(col), x0 = x - w / 2, x1 = x + w / 2, z0 = z - dd / 2, z1 = z + dd / 2;
        poly([P(x1, y, z0), P(x1, y, z1), P(x1, y + h, z1), P(x1, y + h, z0)], css(shade(c, -0.12)), o.line === false ? null : OUT, 0.8);
        poly([P(x0, y, z1), P(x1, y, z1), P(x1, y + h, z1), P(x0, y + h, z1)], css(shade(c, -0.32)), o.line === false ? null : OUT, 0.8);
        poly([P(x0, y + h, z0), P(x1, y + h, z0), P(x1, y + h, z1), P(x0, y + h, z1)], css(shade(c, 0.18)), o.line === false ? null : OUT, 0.8);
      },
      cyl(x, y, z, r, h, col, o = {}) {
        const c = rgb(col), [bx, by] = P(x, y, z), [tx, ty] = P(x, y + h, z), rx = r * u * 1.22, ry = r * u * 0.61;
        const gr = g.createLinearGradient(bx - rx, 0, bx + rx, 0); gr.addColorStop(0, css(shade(c, -0.38))); gr.addColorStop(0.55, css(shade(c, 0.05))); gr.addColorStop(1, css(shade(c, -0.15)));
        g.beginPath(); g.ellipse(bx, by, rx, ry, 0, 0, Math.PI); g.lineTo(tx - rx, ty); g.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fillStyle = gr; g.fill();
        g.beginPath(); g.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = css(shade(c, o.top == null ? 0.2 : o.top)); g.fill(); if (o.line !== false) { g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke(); }
      },
      cone(x, y, z, r, h, col) {
        const c = rgb(col), [bx, by] = P(x, y, z), [ax, ay] = P(x, y + h, z), rx = r * u * 1.22, ry = r * u * 0.61;
        const gr = g.createLinearGradient(bx - rx, 0, bx + rx, 0); gr.addColorStop(0, css(shade(c, -0.35))); gr.addColorStop(0.55, css(shade(c, 0.15))); gr.addColorStop(1, css(shade(c, -0.1)));
        g.beginPath(); g.moveTo(bx - rx, by); g.ellipse(bx, by, rx, ry, 0, Math.PI, 0, true); g.lineTo(ax, ay); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
      },
      roof(x, y, z, w, h, col) { // 四角錐（瓦屋根）。手前2面だけ描く
        const c = rgb(col), s = w / 2, A = P(x, y + h, z);
        poly([P(x + s, y, z - s), P(x + s, y, z + s), A], css(shade(c, -0.05)), OUT, 0.8);
        poly([P(x - s, y, z + s), P(x + s, y, z + s), A], css(shade(c, -0.3)), OUT, 0.8);
      },
      ball(x, y, z, r, col, glow) {
        const c = rgb(col), [px, py] = P(x, y, z), R = r * u;
        const gr = g.createRadialGradient(px - R * 0.35, py - R * 0.35, R * 0.1, px, py, R); gr.addColorStop(0, css(shade(c, 0.5))); gr.addColorStop(1, css(shade(c, -0.25)));
        if (glow) { g.save(); g.shadowColor = css(c, 0.9); g.shadowBlur = R * 2; }
        g.beginPath(); g.arc(px, py, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); if (glow) g.restore();
      },
      rod(a, b, w, col) { const p = P(...a), q = P(...b); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.strokeStyle = col; g.lineWidth = Math.max(1, w * u); g.lineCap = 'round'; g.stroke(); },
      ring(x, y, z, r, col, lw = 2, a0 = 0, a1 = Math.PI * 2, tilt = 1) { const [px, py] = P(x, y, z); g.beginPath(); g.ellipse(px, py, r * u * 1.22, r * u * 0.61 * tilt, 0, a0, a1); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); },
      glyph(text, x, y, z, size, col, glow = true) { const [px, py] = P(x, y, z); g.save(); g.font = `900 ${size * u}px "Zen Kaku Gothic New","Hiragino Sans",serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; if (glow) { g.shadowColor = col; g.shadowBlur = 8; } g.fillStyle = col; g.fillText(text, px, py); g.restore(); },
      gem(x, y, z, r, col, rot = 0) { // 回る多面体（六角の宝石）
        const c = rgb(col), [px, py] = P(x, y, z), R = r * u, pts = [];
        for (let k = 0; k < 6; k++) { const a = rot + (k / 6) * Math.PI * 2; pts.push([px + Math.cos(a) * R, py + Math.sin(a) * R * 0.9]); }
        for (let k = 0; k < 6; k++) poly([[px, py], pts[k], pts[(k + 1) % 6]], css(shade(c, Math.cos(rot + k) * 0.3)), OUT, 0.6);
      },
    };
    return d;
  }

  /* ---------- 建物（仮の絵）：科目ごと・スキンごと ---------- */
  const SKIN = {
    skin_ja_std(d, C, t) {
      for (let i = 0; i < 5; i++) { const w = 1.4 - i * 0.14; d.box(0, i * 0.32, 0, w, 0.3, w * 0.72, i % 2 ? C.acc : C.body); d.box(0.03, i * 0.32 + 0.04, 0.02, w * 0.94, 0.22, w * 0.68, C.page, { line: false }); }
      const y = 1.95 + Math.sin(t * 1.4) * 0.06; d.poly([d.P(-0.55, y, 0.1), d.P(0, y - 0.12, 0.1), d.P(0, y - 0.12, 0.55), d.P(-0.55, y, 0.55)], css(rgb(C.page))); d.poly([d.P(0.55, y, 0.1), d.P(0, y - 0.12, 0.1), d.P(0, y - 0.12, 0.55), d.P(0.55, y, 0.55)], css(shade(rgb(C.page), -0.12)));
      d.rod([0.9, 2.0, 0.3], [1.3, 0.3, 0.3], 0.07, css(rgb(C.body))); d.rod([1.3, 0.3, 0.3], [1.36, 0.08, 0.3], 0.08, C.acc);
      ['文', '語', '詩'].forEach((ch, k) => { const a = t * 0.45 + k * 2.1; d.glyph(ch, Math.cos(a) * 1.5, 2.0 + Math.sin(t + k) * 0.1, Math.sin(a) * 1.5, 0.42, '#ffffff'); });
    },
    skin_ja_shoin(d, C) { d.box(0, 0, 0, 1.6, 0.22, 1.6, C.page); [[1.2, 0.55], [0.95, 0.5], [0.7, 0.45]].forEach(([w, h], k) => { const y = 0.22 + k * 0.85; d.box(0, y, 0, w, h, w, C.page); d.roof(0, y + h, 0, w * 1.35, 0.38, C.acc); }); d.rod([0, 2.8, 0], [0, 3.3, 0], 0.04, C.acc); },
    skin_ja_goju(d, C) { d.box(0, 0, 0, 1.3, 0.18, 1.3, C.page); for (let k = 0; k < 5; k++) { const w = 0.85 - k * 0.1, y = 0.18 + k * 0.5; d.box(0, y, 0, w, 0.32, w, C.body); d.roof(0, y + 0.32, 0, w * 1.45, 0.22, C.acc); } d.rod([0, 2.7, 0], [0, 3.5, 0], 0.035, C.acc); for (let k = 0; k < 6; k++) d.ring(0, 2.85 + k * 0.1, 0, 0.07, C.acc, 1.4); },
    skin_ja_library(d, C, t) {
      const sh = []; for (let k = 0; k < 6; k++) { const a = t * 0.35 + (k / 6) * Math.PI * 2; sh.push({ a, x: Math.cos(a) * 1.2, z: Math.sin(a) * 1.2, y: 1.1 + Math.sin(t + k) * 0.12 }); }
      const draw = (s) => { d.box(s.x, s.y, s.z, 0.5, 0.48, 0.5, C.body); for (let j = 0; j < 4; j++) d.box(s.x - 0.15 + j * 0.1, s.y + 0.08, s.z + 0.26, 0.07, 0.32, 0.02, j % 2 ? C.acc : C.page, { line: false }); };
      sh.filter((s) => s.x + s.z < 0).forEach(draw); d.cyl(0, 0, 0, 0.32, 2.3, C.page); sh.filter((s) => s.x + s.z >= 0).forEach(draw);
    },
    skin_ma_std(d, C, t) {
      [0.9, 0.7, 0.5].forEach((r, i) => d.cyl(0, i * 0.18, 0, r, 0.18, C.body)); const y = 1.75 + Math.sin(t * 1.3) * 0.08;
      d.gem(0, y, 0, 0.55, C.acc, t * 0.8); const [px, py] = d.P(0, y, 0); d.g.save(); d.g.translate(px, py); d.g.rotate(-t * 0.35); d.g.strokeStyle = C.acc; d.g.lineWidth = 1.2; d.g.strokeRect(-0.75 * d.u, -0.75 * d.u, 1.5 * d.u, 1.5 * d.u); d.g.restore();
      ['π', '∑', '√'].forEach((ch, k) => { const a = -t * 0.35 + k * 2.1; d.glyph(ch, Math.cos(a) * 1.7, 2.4, Math.sin(a) * 1.7, 0.4, '#ffffff'); });
      [0.3, 0.55, 0.85, 1.2].forEach((h, k) => d.box(0.75 + k * 0.24, 0, 0.85, 0.18, h, 0.18, k === 3 ? C.acc : C.page));
    },
    skin_ma_crystal(d, C, t) { [[-0.45, -0.4, 1.8, 0.28], [0.5, -0.3, 1.6, 0.26], [0, 0, 2.6, 0.38], [0.25, 0.55, 1.3, 0.22], [-0.35, 0.4, 1.1, 0.2]].forEach(([x, z, h, r], k) => d.cone(x, 0, z, r, h, k % 2 ? C.acc : C.page)); for (let k = 0; k < 8; k++) { const a = t * 0.6 + (k / 8) * Math.PI * 2; d.gem(Math.cos(a) * 1.35, 1.6 + Math.sin(a * 2) * 0.15, Math.sin(a) * 1.35, 0.1, C.acc, t * 2); } },
    skin_ma_mobius(d, C, t) {
      d.cyl(0, 0, 0, 0.4, 0.5, C.body); const g = d.g, pts = [];
      for (let k = 0; k <= 120; k++) { const s = (k / 120) * Math.PI * 2, r = 0.75 + 0.18 * Math.cos(3 * s), a = 2 * s + t * 0.5; pts.push(d.P(Math.cos(a) * r, 1.75 + 0.3 * Math.sin(3 * s), Math.sin(a) * r)); }
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.lineWidth = 0.32 * d.u; g.strokeStyle = css(rgb(C.page)); g.lineJoin = 'round'; g.stroke(); g.lineWidth = 0.08 * d.u; g.strokeStyle = C.acc; g.stroke();
    },
    skin_ma_stairs(d, C, t) { const steps = []; for (let k = 0; k < 18; k++) { const a = k * 0.55 + t * 0.25; steps.push({ x: Math.cos(a) * 0.45, z: Math.sin(a) * 0.45, y: 0.15 + k * 0.15, k }); } steps.filter((s) => s.x + s.z < 0).forEach((s) => d.box(s.x, s.y, s.z, 0.32, 0.06, 0.32, s.k % 4 === 3 ? C.acc : C.page)); d.cyl(0, 0, 0, 0.12, 2.9, C.body); steps.filter((s) => s.x + s.z >= 0).forEach((s) => d.box(s.x, s.y, s.z, 0.32, 0.06, 0.32, s.k % 4 === 3 ? C.acc : C.page)); },
    skin_en_std(d, C, t) {
      d.box(-0.7, 0, -0.45, 0.6, 2.4, 0.6, C.body); d.box(-0.7, 1.8, -0.45, 0.68, 0.12, 0.68, C.acc); d.roof(-0.7, 2.4, -0.45, 0.9, 0.8, C.acc);
      const [fx, fy] = d.P(-0.7, 2.1, -0.13); d.g.beginPath(); d.g.arc(fx, fy, 0.2 * d.u, 0, Math.PI * 2); d.g.fillStyle = css(rgb(C.page)); d.g.fill(); d.g.strokeStyle = C.acc; d.g.lineWidth = 1.5; d.g.beginPath(); d.g.moveTo(fx, fy); d.g.lineTo(fx + Math.cos(t) * 0.15 * d.u, fy + Math.sin(t) * 0.15 * d.u); d.g.stroke();
      d.cyl(0.65, 0, 0.35, 0.18, 0.7, C.body); d.ball(0.65, 1.35, 0.35, 0.6, C.body); for (let k = 0; k < 3; k++) { const [gx, gy] = d.P(0.65, 1.35, 0.35); d.g.beginPath(); d.g.ellipse(gx, gy, Math.abs(Math.cos(t * 0.5 + k)) * 0.6 * d.u, 0.6 * d.u, 0, 0, Math.PI * 2); d.g.strokeStyle = 'rgba(255,255,255,.35)'; d.g.lineWidth = 1; d.g.stroke(); }
      d.ring(0.65, 1.35, 0.35, 0.85, C.acc, 2.2, 0, Math.PI * 2, 0.45);
      ['A', 'B', 'C'].forEach((ch, k) => { const a = t * 0.5 + k * 2.1; d.glyph(ch, Math.cos(a) * 1.7, 2.2, Math.sin(a) * 1.7, 0.4, '#ffffff'); });
    },
    skin_en_castle(d, C, t) { [[-1, -1], [1, -1]].forEach(([x, z]) => { d.cyl(x * 0.72, 0, z * 0.72, 0.24, 1.9, C.body); d.cone(x * 0.72, 1.9, z * 0.72, 0.3, 0.55, C.acc); }); d.box(0, 0, 0, 1.0, 1.4, 1.0, C.page); for (let k = 0; k < 4; k++) { d.box(-0.36 + k * 0.24, 1.4, 0.42, 0.14, 0.16, 0.14, C.page); d.box(0.42, 1.4, -0.36 + k * 0.24, 0.14, 0.16, 0.14, C.page); } [[-1, 1], [1, 1]].forEach(([x, z]) => { d.cyl(x * 0.72, 0, z * 0.72, 0.24, 1.9, C.body); d.cone(x * 0.72, 1.9, z * 0.72, 0.3, 0.55, C.acc); }); d.rod([0, 1.4, 0], [0, 2.3, 0], 0.03, css(rgb(C.body))); const w = Math.sin(t * 3) * 0.08; d.poly([d.P(0, 2.3, 0), d.P(0.45, 2.22 + w, 0), d.P(0, 2.05, 0)], C.acc); },
    skin_en_bridge(d, C) { d.box(-0.85, 0, -0.1, 0.42, 2.2, 0.42, C.page); d.roof(-0.85, 2.2, -0.1, 0.6, 0.5, C.acc); d.box(0, 0.9, 0, 1.3, 0.12, 0.5, C.body); d.box(0, 1.85, 0, 1.3, 0.08, 0.12, C.acc); d.rod([-0.85, 2.0, 0.15], [0, 1.0, 0.25], 0.02, C.acc); d.rod([0.85, 2.0, 0.15], [0, 1.0, 0.25], 0.02, C.acc); d.box(0.85, 0, 0.1, 0.42, 2.2, 0.42, C.page); d.roof(0.85, 2.2, 0.1, 0.6, 0.5, C.acc); },
    skin_en_torch(d, C, t) { d.box(0, 0, 0, 0.9, 0.5, 0.9, C.page); d.box(0, 0.5, 0, 0.65, 0.4, 0.65, C.body); d.cyl(0, 0.9, 0, 0.3, 1.2, C.page); d.ball(0, 2.3, 0, 0.18, C.page); d.rod([0.12, 1.95, 0], [0.38, 2.75, 0], 0.08, css(rgb(C.page))); d.cyl(0.4, 2.7, 0, 0.08, 0.2, C.acc); const f = 1 + Math.sin(t * 13) * 0.15; d.g.save(); d.g.shadowColor = C.acc; d.g.shadowBlur = 16; d.cone(0.4, 2.9, 0, 0.12 * f, 0.4 * f, C.acc); d.g.restore(); d.box(-0.28, 1.6, 0.18, 0.24, 0.3, 0.06, C.acc); },
    skin_sc_std(d, C, t) {
      d.cyl(0, 0, 0, 0.22, 0.95, C.body); const y = 1.85 + Math.sin(t * 1.2) * 0.07;
      [0, 1.05, 2.1].forEach((r, k) => { const [px, py] = d.P(0, y, 0); d.g.beginPath(); d.g.ellipse(px, py, 0.85 * d.u, 0.3 * d.u, r + t * 0.3, 0, Math.PI * 2); d.g.strokeStyle = css(rgb(C.page), 0.8); d.g.lineWidth = 1.4; d.g.stroke(); const a = t * (1.6 + k * 0.5); d.g.beginPath(); const ex = Math.cos(a) * 0.85 * d.u, ey = Math.sin(a) * 0.3 * d.u, rr = r + t * 0.3; d.g.arc(px + ex * Math.cos(rr) - ey * Math.sin(rr), py + ex * Math.sin(rr) + ey * Math.cos(rr), 0.07 * d.u, 0, Math.PI * 2); d.g.fillStyle = C.acc; d.g.fill(); });
      [[0, 0], [0.1, 0.06], [-0.08, 0.08], [0.03, -0.09]].forEach(([dx, dy], k) => d.ball(dx, y + dy, 0, 0.12, k % 2 ? C.acc : C.page));
      const [fx, fy] = d.P(-0.95, 0, 0.55); d.g.beginPath(); d.g.moveTo(fx - 0.45 * d.u, fy); d.g.lineTo(fx - 0.15 * d.u, fy - 0.75 * d.u); d.g.lineTo(fx - 0.15 * d.u, fy - 1.05 * d.u); d.g.lineTo(fx + 0.15 * d.u, fy - 1.05 * d.u); d.g.lineTo(fx + 0.15 * d.u, fy - 0.75 * d.u); d.g.lineTo(fx + 0.45 * d.u, fy); d.g.closePath(); d.g.fillStyle = 'rgba(220,235,255,.35)'; d.g.fill(); d.g.strokeStyle = 'rgba(255,255,255,.7)'; d.g.stroke();
      d.g.beginPath(); d.g.moveTo(fx - 0.4 * d.u, fy - 0.02 * d.u); d.g.lineTo(fx - 0.3 * d.u, fy - (0.3 + Math.sin(t * 2.4) * 0.03) * d.u); d.g.lineTo(fx + 0.3 * d.u, fy - (0.3 + Math.sin(t * 2.4) * 0.03) * d.u); d.g.lineTo(fx + 0.4 * d.u, fy - 0.02 * d.u); d.g.closePath(); d.g.fillStyle = css(rgb(C.acc), 0.85); d.g.fill();
      for (let k = 0; k < 14; k++) { const a = k * 0.55 + t * 0.9; d.ball(1.0 + Math.cos(a) * 0.3, 0.2 + k * 0.16, -0.45 + Math.sin(a) * 0.3, 0.06, C.acc); d.ball(1.0 - Math.cos(a) * 0.3, 0.2 + k * 0.16, -0.45 - Math.sin(a) * 0.3, 0.06, C.page); }
    },
    skin_sc_obs(d, C, t) { d.cyl(0, 0, 0, 0.85, 0.9, C.page); const [px, py] = d.P(0, 0.9, 0), R = 0.85 * d.u * 1.22; const gr = d.g.createRadialGradient(px - R * 0.3, py - R * 0.6, 4, px, py, R); gr.addColorStop(0, css(shade(rgb(C.body), 0.4))); gr.addColorStop(1, css(shade(rgb(C.body), -0.2))); d.g.beginPath(); d.g.ellipse(px, py, R, R * 0.85, 0, Math.PI, 0); d.g.fillStyle = gr; d.g.fill(); const sx = Math.sin(t * 0.25) * R * 0.5; d.g.fillStyle = C.acc; d.g.fillRect(px + sx - 0.1 * d.u, py - R * 0.82, 0.2 * d.u, R * 0.8); d.rod([Math.sin(t * 0.25) * 0.4, 1.5, 0.3], [Math.sin(t * 0.25) * 0.4 + 0.5, 2.3, 0.6], 0.12, C.acc); d.cyl(1.05, 0, -0.6, 0.05, 0.9, C.body); const [dx, dy] = d.P(1.05, 1.1, -0.6); d.g.beginPath(); d.g.ellipse(dx, dy, 0.4 * d.u, 0.25 * d.u, Math.sin(t * 0.5) * 0.6, 0, Math.PI * 2); d.g.fillStyle = css(rgb(C.page)); d.g.fill(); d.g.strokeStyle = 'rgba(5,8,15,.5)'; d.g.stroke(); },
    skin_sc_tesla(d, C, t) { d.cyl(0, 0, 0, 0.7, 0.4, C.body); d.cyl(0, 0.4, 0, 0.16, 1.6, C.page); for (let k = 0; k < 7; k++) d.ring(0, 0.55 + k * 0.2, 0, 0.3, C.acc, 2.4); d.cyl(0, 2.0, 0, 0.6, 0.22, C.page); d.ball(0, 2.35, 0, 0.14, C.acc, true); const g = d.g; g.save(); g.shadowColor = C.acc; g.shadowBlur = 12; for (let k = 0; k < 4; k++) { if (Math.sin(t * 17 + k * 3.1) < 0.3) continue; const a = t * 3 + k * 1.6; let p = d.P(0, 2.35, 0); g.beginPath(); g.moveTo(p[0], p[1]); for (let s = 1; s <= 5; s++) { const q = d.P(Math.cos(a) * 0.25 * s, 2.35 - s * 0.12 + (Math.random() - 0.5) * 0.2, Math.sin(a) * 0.25 * s); g.lineTo(q[0], q[1]); } g.strokeStyle = C.acc; g.lineWidth = 1.6; g.stroke(); } g.restore(); },
    skin_sc_rocket(d, C, t) { for (let k = 0; k < 6; k++) { d.rod([-0.85, k * 0.45, -0.15], [-0.85, k * 0.45 + 0.45, 0.15], 0.02, css(rgb(C.body))); d.rod([-0.85, k * 0.45, 0.15], [-0.85, k * 0.45 + 0.45, -0.15], 0.02, css(rgb(C.body))); } d.rod([-0.85, 0, 0], [-0.85, 2.8, 0], 0.04, css(rgb(C.body))); const y = Math.sin(t * 1.2) * 0.05, f = 1 + Math.sin(t * 15) * 0.25; d.g.save(); d.g.shadowColor = C.acc; d.g.shadowBlur = 14; const [bx, by] = d.P(0, 0.35 + y, 0); d.g.beginPath(); d.g.moveTo(bx - 0.2 * d.u, by); d.g.lineTo(bx, by + 0.6 * d.u * f); d.g.lineTo(bx + 0.2 * d.u, by); d.g.fillStyle = css(rgb(C.acc), 0.8); d.g.fill(); d.g.restore(); [-1, 1].forEach((s) => d.poly([d.P(s * 0.3, 0.35 + y, 0.1), d.P(s * 0.55, 0.3 + y, 0.1), d.P(s * 0.3, 0.9 + y, 0.1)], C.acc)); d.cyl(0, 0.35 + y, 0, 0.3, 1.8, C.page); d.cyl(0, 1.5 + y, 0, 0.305, 0.1, C.acc); d.cone(0, 2.15 + y, 0, 0.3, 0.65, C.acc); },
    skin_so_std(d, C) { [1.5, 1.2, 0.9, 0.6].forEach((w, k) => d.box(0.15, k * 0.32, -0.25, w, 0.32, w, k % 2 ? C.body : C.page)); d.box(0.15, 1.28, -0.25, 0.34, 0.34, 0.34, C.acc); d.box(1.0, 0, -0.85, 0.18, 1.7, 0.18, C.body); d.cone(1.0, 1.7, -0.85, 0.13, 0.28, C.acc); d.box(-1.0, 0, 0.55, 1.0, 0.1, 0.7, C.page); [-0.38, -0.13, 0.13, 0.38].forEach((x) => d.cyl(-1.0 + x, 0.1, 0.8, 0.05, 0.62, C.page)); d.box(-1.0, 0.72, 0.55, 1.0, 0.08, 0.7, C.page); d.roof(-1.0, 0.8, 0.55, 1.0, 0.25, C.acc); [-0.36, 0.36].forEach((x) => d.cyl(1.05 + x * 0.9, 0, 0.6 + x * 0.4, 0.06, 1.0, C.acc)); d.box(1.05, 1.0, 0.6, 1.1, 0.09, 0.14, C.acc); },
    skin_so_tenshu(d, C) { const g = d.g; d.poly([d.P(-1.1, 0, -1.1), d.P(1.1, 0, -1.1), d.P(1.1, 0, 1.1), d.P(-1.1, 0, 1.1)], null); d.box(0, 0, 0, 1.8, 0.6, 1.8, C.body); [[1.0, 0.45], [0.8, 0.42], [0.6, 0.4]].forEach(([w, h], k) => { const y = 0.6 + k * 0.72; d.box(0, y, 0, w, h, w * 0.85, C.page); d.roof(0, y + h, 0, w * 1.4, 0.3, C.acc); }); d.ball(-0.15, 2.85, 0, 0.06, C.acc); d.ball(0.15, 2.85, 0, 0.06, C.acc); g.globalAlpha = 1; },
    skin_so_arch(d, C) { d.box(-0.6, 0, 0, 0.5, 1.6, 0.6, C.page); d.box(0.6, 0, 0, 0.5, 1.6, 0.6, C.page); d.box(0, 1.6, 0, 1.7, 0.55, 0.62, C.page); d.box(0, 1.55, 0, 1.75, 0.1, 0.66, C.acc); d.ring(0, 1.25, 0.31, 0.35, C.acc, 3, Math.PI, 0); d.box(0, 2.15, 0, 0.4, 0.3, 0.3, C.body); d.ball(0, 2.6, 0, 0.12, C.acc); },
    skin_so_light(d, C, t) { for (let k = 0; k < 5; k++) d.cyl(0, k * 0.45, 0, 0.38 - k * 0.04, 0.45, k % 2 ? C.acc : C.page); d.cyl(0, 2.25, 0, 0.22, 0.32, '#dfe8ff'); d.cone(0, 2.57, 0, 0.28, 0.3, C.body); const [px, py] = d.P(0, 2.41, 0), a = t * 1.2, L = 2.6 * d.u; const gr = d.g.createLinearGradient(px, py, px + Math.cos(a) * L, py + Math.sin(a) * L * 0.5); gr.addColorStop(0, css(rgb(C.acc), 0.7)); gr.addColorStop(1, css(rgb(C.acc), 0)); d.g.beginPath(); d.g.moveTo(px, py); d.g.lineTo(px + Math.cos(a - 0.15) * L, py + Math.sin(a - 0.15) * L * 0.5); d.g.lineTo(px + Math.cos(a + 0.15) * L, py + Math.sin(a + 0.15) * L * 0.5); d.g.closePath(); d.g.fillStyle = gr; d.g.fill(); },
  };
  const DEFAULT_SKIN = { 国語: 'skin_ja_std', 数学: 'skin_ma_std', 英語: 'skin_en_std', 理科: 'skin_sc_std', 社会: 'skin_so_std' };

  /* ---------- 台座 ---------- */
  function hexPts(d, R, y) { const p = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; p.push([Math.cos(a) * R, Math.sin(a) * R]); } return p.map(([x, z]) => d.P(x, y, z)); }
  const BASES = {
    base_std: { top: '#232e52', side: '#18213c', pylon: 'box' }, base_garden: { top: '#2a4a3a', side: '#1f3a2e', pylon: null, garden: true },
    base_neon: { top: '#111833', side: '#0b0f1e', pylon: 'neon', rim2: true }, base_marble: { top: '#e4e8f2', side: '#bfc6d6', pylon: 'column' },
    base_float: { top: '#5a6070', side: '#3e4352', pylon: null, float: true }, base_snow: { top: '#f4f8ff', side: '#dfe8f4', pylon: 'box', snow: true },
    base_desert: { top: '#e0c48a', side: '#c9a86a', pylon: null, ruins: true }, base_water: { top: '#232e52', side: '#18213c', pylon: 'box', water: true },
  };
  function drawBase(d, b, team, t, C, front) {
    const g = d.g;
    if (!front) {
      const bart = b.art ? img(b.art) : null;
      if (bart) {
        // 絵の中身の範囲に合わせて、横幅を台座の幅にそろえ、上面の中心（中身の上から約38%）を陣地の中心に置く
        const K = keyed(bart), B = K.box, cw = B.x1 - B.x0, ch = B.y1 - B.y0, k = (d.u * 4.3) / cw;
        const [cx0, cy0] = d.P(0, 0, 0), x0 = cx0 - ((B.x0 + B.x1) / 2) * k, y0 = cy0 - (B.y0 + ch * 0.38) * k;
        drawArt(g, bart, null, x0, y0, bart.naturalWidth * k, bart.naturalHeight * k, team, b.art);
        return;
      }
      if (b.water) { const [px, py] = d.P(0, -0.05, 0); g.beginPath(); g.ellipse(px, py, 3.0 * d.u * 1.22, 3.0 * d.u * 0.61, 0, 0, Math.PI * 2); const gr = g.createRadialGradient(px, py, 1, px, py, 3 * d.u * 1.22); gr.addColorStop(0, 'rgba(60,120,180,.0)'); gr.addColorStop(0.5, 'rgba(60,120,180,.55)'); gr.addColorStop(1, 'rgba(60,120,180,0)'); g.fillStyle = gr; g.fill(); const k = (t * 0.4) % 1; d.ring(0, -0.05, 0, 2.0 + k * 0.9, `rgba(190,224,255,${0.5 * (1 - k)})`, 1.2); }
      if (b.float) { const top = hexPts(d, 1.7, -0.3); const [ax, ay] = d.P(0, -2.3, 0); g.beginPath(); g.moveTo(top[2][0], top[2][1]); g.lineTo(top[3][0], top[3][1]); g.lineTo(top[4][0], top[4][1]); g.lineTo(top[5][0], top[5][1]); g.lineTo(ax, ay); g.closePath(); g.fillStyle = '#3e4352'; g.fill(); g.beginPath(); g.moveTo(top[0][0], top[0][1]); g.lineTo(top[1][0], top[1][1]); g.lineTo(top[2][0], top[2][1]); g.lineTo(ax, ay); g.closePath(); g.fillStyle = '#2c303c'; g.fill(); for (let k = 0; k < 4; k++) { const a = t * 0.2 + (k / 4) * Math.PI * 2; d.gem(Math.cos(a) * 2.4, -0.6 + k * 0.2, Math.sin(a) * 2.4, 0.16, '#5a6070', a); } }

      // 側面（手前3面）と上面
      const top = hexPts(d, 1.8, 0.0), bot = hexPts(d, 1.95, -0.42);
      if (!bart) {
      [[0, 1], [1, 2], [5, 0]].forEach(([i, j], k) => d.poly([top[i], top[j], bot[j], bot[i]], css(shade(rgb(b.side), -0.1 * k)), 'rgba(5,8,15,.6)', 0.8));
      d.poly(top, b.top, 'rgba(5,8,15,.6)', 0.8);
      d.poly(hexPts(d, 1.5, 0.12), css(shade(rgb(b.top), 0.08)));
      }
      g.save(); g.shadowColor = team; g.shadowBlur = 10; d.poly(hexPts(d, 1.74, 0.02), null, team, 2.2); g.restore();
      if (b.rim2) { g.save(); g.shadowColor = team; g.shadowBlur = 14; d.poly(hexPts(d, 1.95, -0.2), null, team, 1.6); g.restore(); }
      if (b.snow) for (let k = 0; k < 7; k++) { const a = k * 0.9, [px, py] = d.P(Math.cos(a) * 1.35, 0.12, Math.sin(a) * 1.35); g.beginPath(); g.ellipse(px, py, 0.3 * d.u, 0.12 * d.u, 0, Math.PI, 0); g.fillStyle = '#ffffff'; g.fill(); }
      if (b.garden) { const [px, py] = d.P(1.0, 0.13, 0.65); g.beginPath(); g.ellipse(px, py, 0.5 * d.u, 0.25 * d.u, 0, 0, Math.PI * 2); g.fillStyle = '#3a6ea8'; g.fill(); }
    }
    if (b.art && img(b.art)) return; // 本物の絵がある台座は、柱や縁もその絵に任せる
    // 角の柱（奥側は front=false、手前側は front=true で描く）
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 1.72, z = Math.sin(a) * 1.72, isFront = x + z > 0;
      if (isFront !== !!front) continue;
      if (b.pylon === 'box' || b.pylon === 'neon') { d.box(x, 0, z, 0.1, b.pylon === 'neon' ? 0.9 : 0.6, 0.1, b.pylon === 'neon' ? team : C.body, { line: false }); d.ball(x, b.pylon === 'neon' ? 1.0 : 0.72, z, 0.07, team, true); }
      if (b.pylon === 'column') d.cyl(x, 0, z, 0.08, 0.75, '#f2f4f8');
      if (b.garden) { d.rod([x, 0, z], [x, 0.3, z], 0.05, '#5a4030'); d.cone(x, 0.25, z, 0.2, 0.5, '#2f7a52'); }
      if (b.ruins && k % 2) d.cyl(x * 0.8, 0, z * 0.8, 0.1, 0.3 + (k % 3) * 0.15, '#e8d5a8');
    }
  }

  /* ---------- 庭 ---------- */
  const SLOTS = [[-0.95, 0.85], [1.15, 0.7], [0.15, -1.2]];
  function drawGarden(d, p, x, z, t, it) {
    const g = d.g;
    const gart = it && it.art ? img(it.art) : null;
    if (gart) { // 中身の範囲を検出して、幅0.95u・高さ1.25u以内に収め、下端を接地点に合わせる
      const K = keyed(gart), B = K.box, k = Math.min((d.u * 0.95) / (B.x1 - B.x0), (d.u * 1.25) / (B.y1 - B.y0)), [px, py] = d.P(x, 0, z);
      drawArt(g, gart, null, px - ((B.x0 + B.x1) / 2) * k, py - B.y1 * k, gart.naturalWidth * k, gart.naturalHeight * k, d.team || '#ffffff', it.id); return;
    }
    switch (p.type) {
      case 'tree': d.rod([x, 0, z], [x, 0.5, z], 0.07, hex(p.trunk)); if (p.shape === 'pine') [0.32, 0.26, 0.18].forEach((r, k) => d.cone(x, 0.4 + k * 0.2, z, r, 0.35, p.leaf)); else [[0, 0.62, 0, 0.3], [0.16, 0.52, 0.1, 0.22], [-0.15, 0.55, -0.05, 0.22]].forEach(([dx, y, dz, r]) => d.ball(x + dx, y, z + dz, r, p.leaf)); break;
      case 'bamboo': for (let k = 0; k < 4; k++) { const dx = (k % 2) * 0.14 - 0.07, dz = k > 1 ? 0.1 : -0.1, h = 0.9 + k * 0.12; d.rod([x + dx, 0, z + dz], [x + dx, h, z + dz], 0.05, '#5fa860'); } break;
      case 'palm': d.rod([x, 0, z], [x + 0.12, 1.0, z], 0.08, '#8a6a48'); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; d.rod([x + 0.12, 1.0, z], [x + 0.12 + Math.cos(a) * 0.45, 0.8, z + Math.sin(a) * 0.45], 0.06, '#3f9a5a'); } break;
      case 'stonelamp': d.cyl(x, 0, z, 0.1, 0.35, '#9aa0aa'); g.save(); g.shadowColor = '#ffd28a'; g.shadowBlur = 10; d.box(x, 0.35, z, 0.26, 0.2, 0.26, '#ffd28a', { line: false }); g.restore(); d.roof(x, 0.55, z, 0.42, 0.16, '#9aa0aa'); break;
      case 'rock': d.ball(x, 0.12, z, 0.24, '#7a808c'); d.ball(x + 0.25, 0.06, z + 0.1, 0.13, '#8a909c'); break;
      case 'torii': [-0.22, 0.22].forEach((dx) => d.rod([x + dx, 0, z], [x + dx, 0.6, z], 0.06, '#d8483a')); d.box(x, 0.6, z, 0.62, 0.06, 0.08, '#d8483a', { line: false }); d.box(x, 0.48, z, 0.5, 0.04, 0.05, '#d8483a', { line: false }); break;
      case 'fountain': d.cyl(x, 0, z, 0.32, 0.14, '#dfe4ee'); d.cyl(x, 0.14, z, 0.06, 0.4, '#dfe4ee'); for (let k = 0; k < 14; k++) { const ph = (t * 0.8 + k / 14) % 1, a = k * 2.4; d.ball(x + Math.cos(a) * ph * 0.28, 0.55 + ph * 0.5 - ph * ph * 0.9, z + Math.sin(a) * ph * 0.28, 0.03, '#bfe8ff'); } break;
      case 'shelf': d.box(x, 0, z, 0.5, 0.7, 0.18, '#6a4a3a'); { const cols = ['#d8483a', '#3a6ea8', '#e6c36a', '#4a9a6a', '#eeeeee']; for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) d.box(x - 0.17 + k * 0.085, 0.08 + r * 0.3, z + 0.1, 0.07, 0.22, 0.02, cols[(k + r) % 5], { line: false }); } break;
      case 'board': d.rod([x - 0.3, 0, z], [x - 0.3, 0.4, z], 0.03, '#6a4a3a'); d.rod([x + 0.3, 0, z], [x + 0.3, 0.4, z], 0.03, '#6a4a3a'); d.box(x, 0.38, z, 0.7, 0.45, 0.04, '#1f3a2e'); d.glyph(p.text || '∫', x, 0.6, z + 0.03, 0.18, '#f4f4f0', false); break;
      case 'globe': d.cyl(x, 0, z, 0.12, 0.3, '#6a4a3a'); d.ball(x, 0.5, z, 0.2, '#3a7ab8'); d.ring(x, 0.5, z, 0.24, '#c9a86a', 1.2, 0, Math.PI * 2, 1.6); break;
      case 'server': d.box(x, 0, z, 0.34, 0.9, 0.3, '#1b1f2a'); for (let k = 0; k < 6; k++) if (Math.sin(t * 6 + k * 2.3) > -0.3) d.box(x, 0.15 + k * 0.13, z + 0.155, 0.2, 0.025, 0.01, '#8fe8ff', { line: false }); break;
      case 'suzuri': d.box(x, 0, z, 0.5, 0.1, 0.32, '#2a2d36'); d.box(x - 0.05, 0.1, z, 0.3, 0.02, 0.2, '#101218', { line: false }); d.rod([x + 0.12, 0.1, z + 0.05], [x + 0.32, 0.7, z - 0.05], 0.05, '#6a4a3a'); d.rod([x + 0.12, 0.1, z + 0.05], [x + 0.15, 0.2, z + 0.03], 0.07, '#111'); break;
      case 'scroll': d.box(x, 0, z, 0.55, 0.3, 0.3, '#6a4a3a'); d.box(x, 0.3, z, 0.6, 0.02, 0.34, '#f2ead8'); d.cyl(x - 0.3, 0.32, z, 0.04, 0.05, '#8a2a2a'); d.cyl(x + 0.3, 0.32, z, 0.04, 0.05, '#8a2a2a'); d.glyph('文', x, 0.36, z + 0.05, 0.14, '#222', false); break;
      case 'tanzaku': d.rod([x, 0, z], [x, 1.1, z], 0.05, '#5fa860'); { const cols = ['#e8584a', '#f0c040', '#4a8ad8', '#e8e8e8', '#7ac060']; for (let k = 0; k < 5; k++) { const yy = 0.45 + k * 0.13, xx = x + (k % 2 ? 0.14 : -0.14), sw = Math.sin(t * 2 + k) * 0.03; d.box(xx + sw, yy, z, 0.06, 0.18, 0.01, cols[k], { line: false }); } } break;
      case 'compass': d.rod([x, 0.75, z], [x - 0.2, 0, z], 0.04, '#c9d2ec'); d.rod([x, 0.75, z], [x + 0.2, 0, z], 0.04, '#c9d2ec'); d.ball(x, 0.78, z, 0.05, '#e6c36a'); d.poly([d.P(x + 0.25, 0, z + 0.2), d.P(x + 0.55, 0, z + 0.2), d.P(x + 0.25, 0.45, z + 0.2)], 'rgba(200,230,255,.55)', 'rgba(5,8,15,.5)'); break;
      case 'abacus': d.box(x, 0, z, 0.6, 0.42, 0.06, '#6a4a3a'); for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) d.ball(x - 0.22 + k * 0.09, 0.08 + r * 0.09, z + 0.04, 0.03, r === 1 ? '#c9a86a' : '#3a2a20'); break;
      case 'solids': d.box(x - 0.2, 0, z + 0.05, 0.22, 0.22, 0.22, '#eef2ff'); d.cone(x + 0.15, 0, z - 0.05, 0.14, 0.35, '#c9d2ec'); d.ball(x + 0.05, 0.12, z + 0.25, 0.12, '#dfe4ee'); break;
      case 'mailbox': d.cyl(x, 0, z, 0.06, 0.25, '#3a3f4c'); d.cyl(x, 0.25, z, 0.18, 0.5, '#c8302a'); d.ball(x, 0.78, z, 0.18, '#c8302a'); d.box(x, 0.6, z + 0.17, 0.16, 0.03, 0.02, '#111', { line: false }); break;
      case 'dict': ['#2a4a7a', '#7a2a2a', '#2a6a4a', '#5a4a2a'].forEach((c, k) => d.box(x + (k % 2) * 0.04, k * 0.14, z, 0.42, 0.13, 0.3, c)); break;
      case 'sign': d.rod([x, 0, z], [x, 1.0, z], 0.05, '#6a4a3a'); [[0.85, 1], [0.68, -1], [0.51, 1]].forEach(([yy, dir]) => d.poly([d.P(x, yy, z), d.P(x + 0.4 * dir, yy, z), d.P(x + 0.48 * dir, yy - 0.06, z), d.P(x + 0.4 * dir, yy - 0.12, z), d.P(x, yy - 0.12, z)], '#e8dcc0', 'rgba(5,8,15,.6)')); break;
      case 'microscope': d.box(x, 0, z, 0.36, 0.06, 0.28, '#3a3f4c'); d.rod([x - 0.1, 0.06, z], [x - 0.1, 0.5, z], 0.06, '#dfe4ee'); d.rod([x - 0.1, 0.5, z], [x + 0.08, 0.72, z], 0.1, '#eef2ff'); d.box(x + 0.02, 0.18, z, 0.2, 0.03, 0.18, '#3a3f4c'); break;
      case 'tubes': d.box(x, 0, z, 0.5, 0.18, 0.14, '#c9d2ec'); ['#4ad890', '#e8584a', '#4a8ad8', '#f0c040'].forEach((c, k) => { const xx = x - 0.18 + k * 0.12; d.cyl(xx, 0.08, z, 0.04, 0.42, 'rgba(220,235,255,.6)'); d.cyl(xx, 0.08, z, 0.035, 0.2, c, { line: false }); }); break;
      case 'fossil': d.ball(x, 0.15, z, 0.3, '#8a8478'); { const [px, py] = d.P(x, 0.2, z + 0.25); g.beginPath(); for (let k = 0; k < 40; k++) { const a = k * 0.35, r = 0.015 * d.u * k * 0.5; g.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.9); } g.strokeStyle = '#d8cfb8'; g.lineWidth = 2; g.stroke(); } break;
      case 'maptable': [-0.22, 0.22].forEach((dx) => d.rod([x + dx, 0, z], [x + dx, 0.38, z], 0.04, '#6a4a3a')); d.box(x, 0.38, z, 0.62, 0.05, 0.4, '#6a4a3a'); d.box(x, 0.43, z, 0.56, 0.01, 0.34, '#e8dcb0', { line: false }); d.glyph('⌖', x, 0.46, z, 0.16, '#8a5a2a', false); break;
      case 'armor': d.box(x, 0, z, 0.36, 0.12, 0.3, '#2a2d36'); d.box(x, 0.12, z, 0.3, 0.4, 0.2, '#3a2a2a'); d.box(x, 0.18, z + 0.11, 0.26, 0.28, 0.02, '#8a2a2a', { line: false }); d.ball(x, 0.65, z, 0.13, '#2a2d36'); d.poly([d.P(x - 0.18, 0.72, z), d.P(x, 0.95, z), d.P(x + 0.18, 0.72, z)], '#c9a86a', 'rgba(5,8,15,.6)'); break;
      case 'cannon': [-0.16, 0.16].forEach((dz) => d.ring(x - 0.05, 0.14, z + dz, 0.14, '#5a4030', 3, 0, Math.PI * 2, 1.6)); d.rod([x - 0.25, 0.22, z], [x + 0.4, 0.4, z], 0.16, '#8a6a3a'); d.ball(x - 0.27, 0.21, z, 0.07, '#6a4a2a'); break;
      case 'telescope': [0, 2.1, 4.2].forEach((a) => d.rod([x, 0.45, z], [x + Math.cos(a) * 0.2, 0, z + Math.sin(a) * 0.2], 0.025, '#dfe4ee')); d.rod([x - 0.15, 0.4, z], [x + 0.3, 0.75, z], 0.1, '#3a3f4c'); break;
    }
  }

  /* ---------- 周回物 ---------- */
  function drawOrbiter(d, shape, x, y, z, t, k, team) {
    const g = d.g;
    switch (shape) {
      case 'lantern': g.save(); g.shadowColor = '#ffd28a'; g.shadowBlur = 10; d.cyl(x, y, z, 0.1, 0.24, '#ffd28a', { line: false }); g.restore(); d.cone(x, y + 0.24, z, 0.13, 0.1, team); break;
      case 'book': { const p = d.P(x, y, z), w = 0.22 * d.u; d.poly([[p[0], p[1]], [p[0] - w, p[1] - w * 0.3], [p[0] - w, p[1] + w * 0.5], [p[0], p[1] + w * 0.8]], '#eef2ff', 'rgba(5,8,15,.5)'); d.poly([[p[0], p[1]], [p[0] + w, p[1] - w * 0.3], [p[0] + w, p[1] + w * 0.5], [p[0], p[1] + w * 0.8]], '#d6dcf0', 'rgba(5,8,15,.5)'); break; }
      case 'planet': { const hue = (k * 67) % 360; d.ball(x, y, z, 0.17, `hsl(${hue},45%,62%)`); if (k % 2) d.ring(x, y, z, 0.28, team, 1.4, 0, Math.PI * 2, 0.5); break; }
      case 'dice': d.box(x, y - 0.1, z, 0.2, 0.2, 0.2, '#eef2ff'); break;
      case 'gear': { const [px, py] = d.P(x, y, z), R = 0.17 * d.u; g.save(); g.translate(px, py); g.rotate(t * 1.5 + k); g.beginPath(); for (let s = 0; s < 16; s++) { const a = (s / 16) * Math.PI * 2, r = s % 2 ? R : R * 1.3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fillStyle = '#c9d2ec'; g.fill(); g.beginPath(); g.arc(0, 0, R * 0.4, 0, Math.PI * 2); g.fillStyle = team; g.fill(); g.restore(); break; }
      case 'crane': { const [px, py] = d.P(x, y, z), w = 0.3 * d.u, f = Math.sin(t * 6 + k) * 0.3; d.poly([[px, py], [px - w, py - w * f], [px - w * 0.2, py + w * 0.1]], '#ffffff', 'rgba(5,8,15,.4)'); d.poly([[px, py], [px + w, py - w * f], [px + w * 0.2, py + w * 0.1]], '#f0f0f0', 'rgba(5,8,15,.4)'); break; }
      case 'crystal': d.gem(x, y, z, 0.12, team, t * 2 + k); break;
      case 'drone': d.box(x, y, z, 0.22, 0.06, 0.22, '#3a3f4c'); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => d.ring(x + a * 0.15, y + 0.07, z + b * 0.15, 0.07, team, 1.2)); break;
    }
  }

  /* ---------- 旗 ---------- */
  const FLAGTEX = {};
  function flagCanvas(p, text) {
    const k = JSON.stringify(p) + text; if (FLAGTEX[k]) return FLAGTEX[k];
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const g = c.getContext('2d');
    g.fillStyle = p.bg; g.fillRect(0, 0, 128, 80); g.fillStyle = p.alt; g.strokeStyle = p.alt;
    if (p.pattern === 'stripe') { g.fillRect(0, 0, 128, 20); g.fillRect(0, 60, 128, 20); }
    if (p.pattern === 'diag') { g.beginPath(); g.moveTo(0, 60); g.lineTo(70, 0); g.lineTo(100, 0); g.lineTo(30, 80); g.lineTo(0, 80); g.fill(); }
    if (p.pattern === 'check') for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16);
    if (p.pattern === 'star') for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 53) % 128, (i * 37) % 80, 1.5 + (i % 3), 0, Math.PI * 2); g.fill(); }
    if (p.pattern === 'wave') { g.lineWidth = 2; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) for (let r = 5; r < 18; r += 5) { g.beginPath(); g.arc(x * 26 + (y % 2) * 13, y * 18 + 12, r, Math.PI, 0); g.stroke(); } }
    if (p.pattern === 'circuit') { g.lineWidth = 2; for (let i = 0; i < 7; i++) { const y = 6 + i * 11; g.beginPath(); g.moveTo(0, y); g.lineTo(30 + (i * 11) % 40, y); g.lineTo(45 + (i * 11) % 40, y + 8); g.lineTo(128, y + 8); g.stroke(); } }
    if (text) { g.globalAlpha = 0.8; g.fillStyle = p.bg; g.fillRect(16, 22, 96, 38); g.globalAlpha = 1; g.fillStyle = p.fg; g.font = '900 30px "Zen Kaku Gothic New","Hiragino Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 4), 64, 42); }
    return (FLAGTEX[k] = c);
  }
  function drawFlag(d, id, text, t, team) {
    const it = item(id); if (!it || !it.p) return;
    const base = d.P(-1.35, 0, -0.9), top = d.P(-1.35, 2.2, -0.9), g = d.g;
    g.beginPath(); g.moveTo(base[0], base[1]); g.lineTo(top[0], top[1]); g.strokeStyle = '#c9d2ec'; g.lineWidth = Math.max(1.2, 0.05 * d.u); g.stroke();
    d.ball(-1.35, 2.25, -0.9, 0.05, team);
    const c = flagCanvas(it.p, text), w = 0.8 * d.u, h = 0.5 * d.u, N = 8;
    for (let i = 0; i < N; i++) { const s0 = i / N, x0 = top[0] + s0 * w, wy = Math.sin(t * 4 + s0 * 6) * 0.06 * d.u * s0; g.drawImage(c, (i * c.width) / N, 0, c.width / N + 1, c.height, x0, top[1] + 0.02 * d.u + wy, w / N + 1, h); }
  }

  /* ---------- パーティクル（エフェクト） ---------- */
  function makeAmbient(id) {
    const it = item(id); if (!it || !it.p) return null;
    const p = it.p, n = p.glyphs ? p.n : p.n, parts = [];
    for (let k = 0; k < n; k++) parts.push({ a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 2.1, h: Math.random() * 3.6, s: 0.3 + Math.random() * 0.5, c: p.colors ? p.colors[k % p.colors.length] : null, gl: p.glyphs ? p.glyphs[k % p.glyphs.length] : null });
    return { p, parts };
  }
  function drawAmbient(d, A, t, front) {
    if (!A) return; const p = A.p, H = 3.6, sp = p.speed || 1, g = d.g;
    A.parts.forEach((q, k) => {
      let x = Math.cos(q.a + t * 0.25) * q.r, z = Math.sin(q.a + t * 0.25) * q.r, y;
      if ((x + z > 0) !== front) return;
      if (p.motion === 'fall') y = H - ((t * q.s * sp + q.h) % H);
      else if (p.motion === 'rise') y = 0.3 + ((t * q.s * sp + q.h) % H);
      else if (p.motion === 'float') y = 0.6 + (q.h / H) * 2.2 + Math.sin(t * q.s * 2 + k) * 0.3;
      else y = 0.6 + (q.h / H) * 3.2;
      const fade = Math.min(1, Math.min(y, H - y + 0.5) * 1.2);
      if (q.gl) { g.globalAlpha = fade; d.glyph(q.gl, x, y, z, 0.3, '#ffffff'); g.globalAlpha = 1; return; }
      const [px, py] = d.P(x, y, z), tw = p.blink || p.motion === 'twinkle' ? 0.55 + Math.sin(t * 5 + k) * 0.45 : 1;
      g.globalAlpha = fade * tw; g.fillStyle = hex(q.c); g.beginPath(); g.arc(px, py, p.size * d.u * 0.6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    });
  }

  /* =============== 本体 =============== */
  let live = null;
  const keyOf = (order, colors, look) => order.join() + colors.me + colors.op + JSON.stringify(look || {});
  function create(order, colors, look) {
    look = look || {};
    const canvas = document.createElement('canvas'); canvas.className = 't3d-canvas';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '陣地マップ');
    const g = canvas.getContext('2d'); if (!g) return null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ac = new AbortController(), sig = { signal: ac.signal };
    let W = 300, H = 200, DPR = 1, raf = 0, alive = true, focusI = null, introT = 0, panX = 0, drag = null, first = true;
    const cam = { x: 0, y: 0, z: 1 }, camT = { x: 0, y: 0, z: 1 };
    const n = order.length;
    /* 科目ごとの見た目：look.per[科目] があればそれを、なければ共通の値を使う（旧形式もそのまま読める） */
    const lookFor = (subject) => Object.assign({}, look, (look.per && look.per[subject]) || {});
    const sites = order.map((subject, i) => {
      const L = lookFor(subject), material = item(L.material), baseItem = item(L.base);
      return {
        subject, i, state: 'pending', col: rgb(NEUTRAL), target: rgb(NEUTRAL), pop: 0, dim: 0, L,
        skin: (look.skins && look.skins[subject]) || DEFAULT_SKIN[subject],
        MP: (material && material.p) || { body: 0xc9d2ec, page: 0xeef2ff },
        base: Object.assign({}, BASES[L.base] || BASES.base_std, baseItem && baseItem.art ? { art: baseItem.art } : {}),
        amb: makeAmbient(L.fx), mark: false,
      };
    });
    const fx = [];
    const stars = Array.from({ length: 60 }, () => [Math.random(), Math.random() * 0.6, Math.random()]);

    function layout() {
      const u = Math.min(W / 19, H / 6.2);
      sites.forEach((s) => {
        const tt = n > 1 ? s.i / (n - 1) - 0.5 : 0, depth = 1 - Math.abs(tt) * 2;
        s.cx = W * 0.5 + tt * (W - u * 4.4); s.cy = H * 0.66 - depth * H * 0.07; s.u = u * (1 - depth * 0.1);
      });
      sites.sort((a, b) => a.cy - b.cy);
    }
    function resize() {
      const host = canvas.parentElement; if (!host) return;
      DPR = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth || 300; H = host.clientHeight || 200;
      canvas.width = W * DPR; canvas.height = H * DPR; layout();
    }
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, p: panX }; canvas.setPointerCapture(e.pointerId); }, sig);
    canvas.addEventListener('pointermove', (e) => { if (drag) panX = Math.max(-W * 0.35, Math.min(W * 0.35, drag.p + (e.clientX - drag.x))); }, sig);
    const endDrag = () => { drag = null; }; canvas.addEventListener('pointerup', endDrag, sig); canvas.addEventListener('pointercancel', endDrag, sig);

    function setState(states, focusInfo) {
      const byI = {}; sites.forEach((s) => (byI[s.i] = s));
      order.forEach((sub, i) => {
        const s = byI[i], st = states[i] || 'pending';
        if (st !== s.state && (st === 'me' || st === 'op')) s.pop = 1;
        s.state = st; s.target = rgb(st === 'me' || st === 'own' ? colors.me : st === 'op' ? colors.op : st === 'active' ? '#ffffff' : NEUTRAL);
        s.dim = st === 'none' ? 1 : 0; s.mark = !!focusInfo && focusInfo.me === sub;
      });
    }
    const siteOf = (i) => sites.find((s) => s.i === i);
    function intro() { if (reduce) return; introT = 1; first = false; cam.z = 0.55; cam.x = W / 2; cam.y = H * 0.2; }
    function focus(i) { focusI = i; }

    function burst(x, y, color, count, speed, up) {
      const ps = []; for (let k = 0; k < count; k++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random()); ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - up * Math.random() }); }
      let life = 0;
      fx.push({ draw(dt) { life += dt; g.fillStyle = color; ps.forEach((p) => { p.vy += 900 * dt * 0.4; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = Math.max(0, 1 - life / 1.2); g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }); g.globalAlpha = 1; return life < 1.2; } });
    }
    function clash(i, e) {
      const s = siteOf(i); if (!s) return;
      const u = s.u, px = s.cx + Math.max(-1.2, Math.min(1.2, (e.gauge / 100) * 1.2)) * u, py = s.cy - 1.6 * u;
      const sMe = [s.cx - 6.5 * u, s.cy - 3.2 * u], sOp = [s.cx + 6.5 * u, s.cy - 3.2 * u];
      const wMe = 2 + Math.min(1, e.a / 100) * 0.22 * u, wOp = 2 + Math.min(1, e.b / 100) * 0.22 * u;
      let life = 0; const L = reduce ? 0.6 : 1.0;
      fx.push({ draw(dt) {
        life += dt; const k = Math.min(1, life / 0.22), fade = Math.max(0, 1 - Math.max(0, life - L * 0.6) / (L * 0.4));
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = fade; g.lineCap = 'round';
        [[sMe, colors.me, wMe], [sOp, colors.op, wOp]].forEach(([src, col, w]) => { g.shadowColor = col; g.shadowBlur = 16; g.strokeStyle = col; g.lineWidth = w * (1 + Math.sin(life * 40) * 0.15); g.beginPath(); g.moveTo(src[0], src[1]); g.lineTo(src[0] + (px - src[0]) * k, src[1] + (py - src[1]) * k); g.stroke(); });
        const R = k * u * (0.35 + Math.abs(e.a - e.b) / 200) * (1 + Math.sin(life * 30) * 0.2); const gr = g.createRadialGradient(px, py, 0, px, py, R * 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, R * 2, 0, Math.PI * 2); g.fill();
        g.restore(); return life < L;
      } });
      if (!reduce) burst(px, py, e.a >= e.b ? colors.me : colors.op, 40, u * 4, u * 2);
    }
    function capture(i, side) {
      const s = siteOf(i); if (!s) return; s.pop = 1;
      const col = side === 'me' ? colors.me : colors.op, u = s.u; let life = 0;
      fx.push({ draw(dt) {
        life += dt; const k = life / 1.3; g.save(); g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.max(0, 0.9 * (1 - k)); g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.ellipse(s.cx, s.cy, u * (1.2 + k * 5) * 1.22, u * (1.2 + k * 5) * 0.61, 0, 0, Math.PI * 2); g.stroke();
        const pw = u * 1.6 * (1 - k * 0.7), gr = g.createLinearGradient(s.cx - pw, 0, s.cx + pw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = Math.max(0, 0.6 * (1 - k)); g.fillStyle = gr; g.fillRect(s.cx - pw, s.cy - u * 9, pw * 2, u * 9);
        g.restore(); return life < 1.3;
      } });
      if (!reduce) burst(s.cx, s.cy - 1.2 * u, col, 110, u * 5, u * 5);
    }

    function drawSite(s, t, dt) {
      s.col = mix(s.col, s.target, 0.08);
      const team = css(s.col), owned = s.state === 'me' || s.state === 'op' || s.state === 'own', active = s.state === 'active', calm = s.state === 'own';
      const d = makeDraw(g, s.cx, s.cy, s.u); d.team = team;
      const C = { body: hex(s.MP.body), page: hex(s.MP.page), acc: team }, L = s.L, base = s.base;
      g.save(); if (s.dim) g.globalAlpha = 0.42;
      // 光の柱（奥）
      const beam = calm ? 0 : owned ? 0.3 : active ? 0.2 + Math.sin(t * 6) * 0.12 : 0;
      if (beam > 0) { const bw = s.u * 0.5, gr = g.createLinearGradient(0, s.cy - s.u * 9, 0, s.cy); gr.addColorStop(0, css(s.col, 0)); gr.addColorStop(1, css(s.col, beam)); g.fillStyle = gr; g.fillRect(s.cx - bw, s.cy - s.u * 9, bw * 2, s.u * 9); }
      drawBase(d, base, team, t, C, false);
      const back = (z, x) => x + z < 0;
      (L.garden || []).slice(0, 3).forEach((id, k) => { const it = item(id); if (it && back(SLOTS[k][1], SLOTS[k][0])) drawGarden(d, it.p, SLOTS[k][0], SLOTS[k][1], t, it); });
      if (look.flag && look.flag !== 'flag_none') drawFlag(d, look.flag, look.flagText, t, team);
      drawAmbient(d, s.amb, t, false);
      // 周回物（奥半分）
      const orb = item(L.orbit), op = orb && orb.p;
      const orbPos = (k) => { const a = t * 0.35 + (k / op.n) * Math.PI * 2; return [Math.cos(a) * op.r, 1.5 + Math.sin(t * 1.4 + k) * 0.2, Math.sin(a) * op.r]; };
      if (op && op.shape !== 'halo') for (let k = 0; k < op.n; k++) { const [x, y, z] = orbPos(k); if (x + z < 0) drawOrbiter(d, op.shape, x, y, z, t, k, team); }
      // 建物（本番の絵があれば絵、なければ仮の絵）
      const sk = item(s.skin), art = sk && sk.art ? img(sk.art) : null;
      const sc = 1 + Math.sin(s.pop * Math.PI) * 0.25;
      g.save(); g.translate(s.cx, s.cy); g.scale(sc, sc); g.translate(-s.cx, -s.cy);
      if (art) {
        // 絵の中身の範囲を検出し、横幅・高さが台座に収まるよう拡縮して、足元を台座の中心に合わせる
        const K = keyed(art), B = K.box, cw = B.x1 - B.x0, ch = B.y1 - B.y0;
        const k = Math.min((s.u * 3.1) / cw, (s.u * 5.4) / ch), w = art.naturalWidth * k, h = art.naturalHeight * k;
        const x0 = s.cx - ((B.x0 + B.x1) / 2) * k, y0 = s.cy + s.u * 0.55 - B.y1 * k;
        const m = sk.artTeam ? img(sk.artTeam) : null; drawArt(g, art, m, x0, y0, w, h, team, sk.id);
      }
      else (SKIN[s.skin] || SKIN[DEFAULT_SKIN[s.subject]])(d, C, t + s.i);
      g.restore();
      drawBase(d, base, team, t, C, true);
      (L.garden || []).slice(0, 3).forEach((id, k) => { const it = item(id); if (it && !back(SLOTS[k][1], SLOTS[k][0])) drawGarden(d, it.p, SLOTS[k][0], SLOTS[k][1], t, it); });
      if (op && op.shape !== 'halo') for (let k = 0; k < op.n; k++) { const [x, y, z] = orbPos(k); if (x + z >= 0) drawOrbiter(d, op.shape, x, y, z, t, k, team); }
      if (op && op.shape === 'halo') { g.save(); g.shadowColor = team; g.shadowBlur = 12; d.ring(0, 3.05 + Math.sin(t) * 0.08, 0, 1.5, team, 3); d.ring(0, 3.05 + Math.sin(t) * 0.08, 0, 1.2, team, 1.4); g.restore(); }
      drawAmbient(d, s.amb, t, true);
      // ラベル・主戦場マーカー
      if (focusI !== s.i) {
        const [lx, ly] = d.P(0, 3.9, 0); g.font = `900 ${Math.max(10, s.u * 0.42)}px "Zen Kaku Gothic New","Hiragino Sans",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tw = g.measureText(s.subject).width + s.u * 0.5; g.fillStyle = 'rgba(6,10,20,.78)'; g.fillRect(lx - tw / 2, ly - s.u * 0.3, tw, s.u * 0.6); g.fillStyle = '#fff'; g.fillText(s.subject, lx, ly + 1);
      }
      if (s.mark) { const [mx, my] = d.P(0, 3.35 + Math.sin(t * 2) * 0.08, 0), r = s.u * 0.16; g.fillStyle = colors.me; g.beginPath(); g.moveTo(mx, my - r * 1.4); g.lineTo(mx + r, my); g.lineTo(mx, my + r * 1.4); g.lineTo(mx - r, my); g.closePath(); g.fill(); }
      g.restore();
      s.pop = Math.max(0, s.pop - dt * 1.4);
    }

    let last = performance.now(), T0 = last;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!canvas.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      const t = reduce ? 0 : (now - T0) / 1000;
      // カメラ
      const fs = focusI == null ? null : siteOf(focusI);
      if (fs) { camT.z = Math.max(1.4, Math.min(2.5, (W * 0.55) / (fs.u * 5.2), (H * 0.8) / (fs.u * 6.2))); camT.x = fs.cx; camT.y = fs.cy - fs.u * 1.7; }
      else { camT.z = 1; camT.x = W / 2 - panX; camT.y = H / 2; }
      if (first) { Object.assign(cam, camT); first = false; }
      if (introT > 0) introT = Math.max(0, introT - dt * 0.6);
      const ease = reduce ? 1 : introT > 0 ? 0.035 : 0.08;
      cam.x += (camT.x - cam.x) * ease; cam.y += (camT.y - cam.y) * ease; cam.z += (camT.z - cam.z) * ease;

      g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      // 背景：星と地面のグリッド
      g.fillStyle = 'rgba(255,255,255,.5)'; stars.forEach(([x, y, k]) => { g.globalAlpha = 0.3 + Math.sin(t * 2 + k * 9) * 0.25; g.fillRect(((x * W - panX * 0.2) % W + W) % W, y * H, 1.2, 1.2); }); g.globalAlpha = 1;
      g.save(); g.translate(W / 2, H / 2); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y);
      g.strokeStyle = 'rgba(60,80,130,.28)'; g.lineWidth = 1 / cam.z; const gu = Math.min(W / 19, H / 6.2) * 1.4, gy = H * 0.66;
      for (let k = -14; k <= 14; k++) { g.beginPath(); g.moveTo(W / 2 + k * gu * ISO_X * 2 - 20 * gu * ISO_X, gy - 20 * gu * ISO_Y + gu * 2); g.lineTo(W / 2 + k * gu * ISO_X * 2 + 20 * gu * ISO_X, gy + 20 * gu * ISO_Y + gu * 2); g.stroke(); g.beginPath(); g.moveTo(W / 2 + k * gu * ISO_X * 2 + 20 * gu * ISO_X, gy - 20 * gu * ISO_Y + gu * 2); g.lineTo(W / 2 + k * gu * ISO_X * 2 - 20 * gu * ISO_X, gy + 20 * gu * ISO_Y + gu * 2); g.stroke(); }
      sites.forEach((s) => drawSite(s, t, dt));
      for (let k = fx.length - 1; k >= 0; k--) if (!fx[k].draw(dt)) fx.splice(k, 1);
      g.restore();
    }
    raf = requestAnimationFrame(frame);

    function destroy() { alive = false; cancelAnimationFrame(raf); ac.abort(); canvas.remove(); if (live === api) live = null; }
    const api = { canvas, resize, setState, destroy, intro, focus, clash, capture, key: keyOf(order, colors, look) };
    if (live && live !== api) live.destroy();
    live = api;
    return api;
  }

  window.Terrain2D = { create, keyOf, SKIN };
  window.Terrain = window.Terrain2D;
})();
