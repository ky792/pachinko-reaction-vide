/* 陣地の3Dモデルとバトル演出（Three.js r128）。外部モデルは使わず、基本図形の組み合わせで作る。
 *  国語：本の塔・開いた本・筆・漂う漢字      数学：周回する多面体・分度器・棒グラフ・数式記号
 *  英語：時計塔・地球儀・アーチ・漂う文字    理科：原子（電子が周回）・フラスコ・DNA の二重らせん
 *  社会：階段ピラミッド・神殿・鳥居・オベリスク
 *  色：自分＝テーマ色 / 相手＝相手ナビの色 / 交戦中＝白 / 未決＝ニュートラル。
 *
 *  API: const t = Terrain3D.create(order, { me, op })
 *    t.canvas / t.resize() / t.setState(states, { me: focusSubject }) / t.destroy()
 *    演出: t.intro() 上空から降下 / t.focus(i|null) カメラを陣地へ寄せる・全景へ戻す
 *          t.clash(i, { a, b, gauge }) 両者のエネルギーが押し合う / t.capture(i, 'me'|'op') 陥落の衝撃波
 *  WebGL が使えない環境では create が null を返す（呼び出し側は2D表示のみで続行）。 */
(function () {
  const T = window.THREE;
  const NEUTRAL = '#3C4870';
  const SPACING = 4.4;

  /* ---------- 文字スプライト ---------- */
  function textSprite(text, { size = 54, bg = true, w = 256, h = 112, scale = [1.9, 0.84] } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = 'rgba(6,10,20,.75)'; g.beginPath(); if (g.roundRect) g.roundRect(24, 12, w - 48, h - 24, 14); else g.rect(24, 12, w - 48, h - 24); g.fill(); }
    g.font = `900 ${size}px "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!bg) { g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 18; }
    g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2 + 3);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(scale[0], scale[1], 1); return s;
  }

  /* ---------- 科目ごとの建造物 ---------- */
  function structure(subject, M, skin) {
    const g = new T.Group(), anim = [];
    if (SKINS[skin]) { SKINS[skin](g, anim, M); return { group: g, anim }; }
    const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, m || M.body); o.position.set(x, y, z); g.add(o); return o; };
    const orbit = (objs, radius, y, speed, tilt = 0) => {
      const og = new T.Group(); og.position.y = y; og.rotation.x = tilt; g.add(og);
      objs.forEach((o, i) => { const a = (i / objs.length) * Math.PI * 2; o.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); og.add(o); });
      anim.push((t, dt) => { og.rotation.y += speed * dt; });
      return og;
    };
    const glyphs = (chars) => chars.map((ch) => textSprite(ch, { bg: false, size: 92, w: 128, h: 128, scale: [0.62, 0.62] }));

    switch (subject) {
      case '国語': {
        for (let i = 0; i < 6; i++) {
          const w = 1.5 - i * 0.12, y = 0.15 + i * 0.32;
          const b = mesh(new T.BoxGeometry(w, 0.3, w * 0.7), i % 2 ? M.accent : M.body, 0, y, 0); b.rotation.y = i * 0.32;
          const pg = mesh(new T.BoxGeometry(w * 0.96, 0.22, w * 0.66), M.page, 0.03, y, 0); pg.rotation.y = i * 0.32;
        }
        const top = new T.Group(); top.position.y = 2.15; g.add(top);
        [-1, 1].forEach((sd) => { const p = new T.Mesh(new T.BoxGeometry(0.62, 0.04, 0.82), M.page); p.position.x = sd * 0.3; p.rotation.z = -sd * 0.28; top.add(p); });
        anim.push((t) => { top.rotation.y = Math.sin(t * 0.6) * 0.25; top.position.y = 2.15 + Math.sin(t * 1.4) * 0.06; });
        const pen = mesh(new T.CylinderGeometry(0.07, 0.04, 2.0, 10), M.body, 0.95, 1.2, 0.35); pen.rotation.z = -0.42;
        const tip = mesh(new T.ConeGeometry(0.08, 0.3, 10), M.accent, 1.36, 0.28, 0.35); tip.rotation.z = Math.PI - 0.42;
        [-1, 1].forEach((sd) => mesh(new T.PlaneGeometry(0.34, 1.3), M.accentSoft, sd * 1.15, 1.0, -0.55));
        mesh(new T.BoxGeometry(2.6, 0.06, 0.06), M.body, 0, 1.68, -0.55);
        orbit(glyphs(['文', '詩', '語', '書']), 1.55, 1.9, 0.45);
        break;
      }
      case '数学': {
        [0.9, 0.7, 0.5].forEach((r, i) => mesh(new T.CylinderGeometry(r, r + 0.08, 0.18, 6), M.body, 0, 0.09 + i * 0.18, 0));
        const core = mesh(new T.IcosahedronGeometry(0.55, 0), M.accent, 0, 1.75, 0);
        const cage = mesh(new T.IcosahedronGeometry(0.9, 0), M.wire, 0, 1.75, 0);
        anim.push((t, dt) => { core.rotation.x += 0.6 * dt; core.rotation.y += 0.9 * dt; cage.rotation.y -= 0.35 * dt; cage.rotation.z += 0.2 * dt; core.position.y = cage.position.y = 1.75 + Math.sin(t * 1.3) * 0.08; });
        const sat = [new T.OctahedronGeometry(0.2), new T.TetrahedronGeometry(0.22), new T.BoxGeometry(0.26, 0.26, 0.26), new T.DodecahedronGeometry(0.18)].map((geo) => new T.Mesh(geo, M.body));
        const og = orbit(sat, 1.35, 1.75, 0.8, 0.35);
        anim.push((t, dt) => og.children.forEach((o) => { o.rotation.x += dt * 1.5; o.rotation.y += dt; }));
        mesh(new T.TorusGeometry(1.2, 0.035, 6, 48, Math.PI), M.accent, 0, 1.0, -1.0);
        for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI, tick = mesh(new T.BoxGeometry(0.03, k % 3 ? 0.12 : 0.22, 0.03), M.page, Math.cos(a) * 1.2, 1.0 + Math.sin(a) * 1.2, -1.0); tick.rotation.z = a - Math.PI / 2; }
        [0.3, 0.55, 0.85, 1.2].forEach((h, k) => mesh(new T.BoxGeometry(0.2, h, 0.2), k === 3 ? M.accent : M.body, 0.75 + k * 0.26, h / 2, 0.85));
        orbit(glyphs(['π', '∑', '√', '∞']), 1.9, 2.5, -0.35);
        break;
      }
      case '英語': {
        const tw = new T.Group(); tw.position.set(-0.75, 0, -0.45); g.add(tw);
        const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); tw.add(o); return o; };
        add(new T.BoxGeometry(0.6, 2.4, 0.6), M.body, 0, 1.2, 0);
        add(new T.BoxGeometry(0.68, 0.12, 0.68), M.accent, 0, 1.85, 0);
        add(new T.ConeGeometry(0.5, 0.9, 4), M.accent, 0, 2.85, 0).rotation.y = Math.PI / 4;
        add(new T.CylinderGeometry(0.24, 0.24, 0.04, 24), M.page, 0, 2.15, 0.32).rotation.x = Math.PI / 2;
        const hand = add(new T.BoxGeometry(0.03, 0.18, 0.02), M.accent, 0, 2.15, 0.35);
        anim.push((t) => { hand.rotation.z = -t * 0.8; });
        const gl = new T.Group(); gl.position.set(0.65, 0, 0.35); g.add(gl);
        const gadd = (geo, m, y) => { const o = new T.Mesh(geo, m); o.position.y = y; gl.add(o); return o; };
        gadd(new T.CylinderGeometry(0.08, 0.3, 0.7, 10), M.body, 0.35);
        const globe = gadd(new T.SphereGeometry(0.62, 24, 16), M.body, 1.35);
        const lines = gadd(new T.SphereGeometry(0.64, 12, 8), M.wire, 1.35);
        const ring = gadd(new T.TorusGeometry(0.9, 0.04, 8, 64), M.accent, 1.35); ring.rotation.x = 1.15;
        anim.push((t, dt) => { globe.rotation.y += dt * 0.5; lines.rotation.y += dt * 0.5; ring.rotation.z += dt * 0.4; });
        mesh(new T.TorusGeometry(0.55, 0.08, 8, 24, Math.PI), M.accent, 0.1, 0.0, 1.15).rotation.y = 0.3;
        orbit(glyphs(['A', 'B', 'C', 'E']), 1.7, 2.2, 0.5);
        break;
      }
      case '理科': {
        const at = new T.Group(); at.position.set(0, 1.85, 0); g.add(at);
        [[0, 0, 0], [0.14, 0.08, 0], [-0.1, 0.12, 0.08], [0.02, -0.12, 0.1], [-0.06, -0.04, -0.13]].forEach(([x, y, z], k) => { const nn = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), k % 2 ? M.accent : M.page); nn.position.set(x, y, z); at.add(nn); });
        [0, 1.05, 2.1].forEach((r, k) => {
          const og = new T.Group(); og.rotation.set(1.2, r, 0); at.add(og);
          og.add(new T.Mesh(new T.TorusGeometry(0.85, 0.022, 6, 64), M.body));
          const e = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), M.accent); og.add(e);
          anim.push((t) => { const a = t * (1.6 + k * 0.5); e.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0); });
        });
        anim.push((t) => { at.rotation.y = t * 0.3; at.position.y = 1.85 + Math.sin(t * 1.2) * 0.07; });
        mesh(new T.CylinderGeometry(0.06, 0.25, 0.95, 10), M.body, 0, 0.48, 0);
        const prof = [[0, 0], [0.45, 0], [0.5, 0.08], [0.48, 0.35], [0.2, 0.75], [0.14, 0.95], [0.16, 1.05], [0, 1.05]].map(([x, y]) => new T.Vector2(x, y));
        const liq = mesh(new T.LatheGeometry([[0, 0.02], [0.42, 0.02], [0.44, 0.3], [0.3, 0.5], [0, 0.5]].map(([x, y]) => new T.Vector2(x, y)), 20), M.accent, -0.95, 0, 0.55);
        mesh(new T.LatheGeometry(prof, 24), M.glass, -0.95, 0, 0.55).renderOrder = 2;
        anim.push((t) => { liq.scale.y = 1 + Math.sin(t * 2.4) * 0.06; });
        const dna = new T.Group(); dna.position.set(1.0, 0.2, -0.45); g.add(dna);
        for (let k = 0; k < 16; k++) {
          const y = k * 0.16, a = k * 0.55;
          const s1 = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), M.accent); s1.position.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3); dna.add(s1);
          const s2 = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), M.page); s2.position.set(-Math.cos(a) * 0.3, y, -Math.sin(a) * 0.3); dna.add(s2);
          if (k % 2 === 0) { const rung = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.6, 4), M.body); rung.position.y = y; rung.rotation.set(0, -a, Math.PI / 2); dna.add(rung); }
        }
        anim.push((t, dt) => { dna.rotation.y += dt * 0.9; });
        break;
      }
      default: { // 社会
        [1.5, 1.2, 0.9, 0.6].forEach((w, k) => mesh(new T.BoxGeometry(w, 0.32, w), k % 2 ? M.body : M.page, 0.15, 0.16 + k * 0.32, -0.25));
        mesh(new T.BoxGeometry(0.34, 0.34, 0.34), M.accent, 0.15, 1.45, -0.25);
        const tp = new T.Group(); tp.position.set(-1.0, 0, 0.55); tp.rotation.y = 0.5; g.add(tp);
        const tadd = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); tp.add(o); return o; };
        tadd(new T.BoxGeometry(1.0, 0.1, 0.7), M.page, 0, 0.05, 0);
        [-0.38, -0.13, 0.13, 0.38].forEach((x) => [-0.25, 0.25].forEach((z) => tadd(new T.CylinderGeometry(0.05, 0.05, 0.62, 10), M.page, x, 0.41, z)));
        tadd(new T.BoxGeometry(1.0, 0.08, 0.7), M.page, 0, 0.76, 0);
        const ped = tadd(new T.CylinderGeometry(0.42, 0.42, 1.0, 3), M.accent, 0, 0.92, 0); ped.rotation.set(0, Math.PI / 2, Math.PI / 2); ped.scale.set(0.45, 1, 1);
        const to = new T.Group(); to.position.set(1.05, 0, 0.6); to.rotation.y = -0.4; g.add(to);
        const oadd = (geo, x, y) => { const o = new T.Mesh(geo, M.accent); o.position.set(x, y, 0); to.add(o); return o; };
        [-0.36, 0.36].forEach((x) => oadd(new T.CylinderGeometry(0.06, 0.07, 1.0, 10), x, 0.5));
        oadd(new T.BoxGeometry(1.1, 0.09, 0.14), 0, 1.02);
        oadd(new T.BoxGeometry(0.86, 0.06, 0.08), 0, 0.82);
        mesh(new T.BoxGeometry(0.18, 1.7, 0.18), M.body, 1.0, 0.85, -0.85);
        mesh(new T.ConeGeometry(0.13, 0.28, 4), M.accent, 1.0, 1.84, -0.85).rotation.y = Math.PI / 4;
      }
    }
    return { group: g, anim };
  }

  /* ---------- 特別版の建物（マイ陣地のカスタマイズ。見た目だけ） ---------- */
  const roof = (w, h) => { const r = new T.Mesh(new T.ConeGeometry(w, h, 4, 1, true), null); r.rotation.y = Math.PI / 4; return r; };
  const SKINS = {
    skin_ja_shoin(g, anim, M) { // 書院の塔：三層の屋根
      const at = (o, x, y, z, m) => { o.material = m || M.body; o.position.set(x, y, z); g.add(o); return o; };
      at(new T.Mesh(new T.BoxGeometry(1.6, 0.25, 1.6)), 0, 0.12, 0, M.page);
      [[1.2, 0.55], [0.95, 0.5], [0.7, 0.45]].forEach(([w, h], k) => {
        const y = 0.25 + k * 0.85;
        at(new T.Mesh(new T.BoxGeometry(w, h, w)), 0, y + h / 2, 0, M.page);
        const r = roof(w * 0.95, 0.38); at(r, 0, y + h + 0.17, 0, M.accent); r.material.side = T.DoubleSide;
      });
      at(new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.6, 6)), 0, 3.0, 0, M.accent);
      [0, 1, 2, 3].forEach((k) => at(new T.Mesh(new T.SphereGeometry(0.05, 8, 6)), 0, 2.75 + k * 0.08, 0, M.accent));
      const book = new T.Group(); book.position.set(1.1, 1.0, 0.6); g.add(book);
      [-1, 1].forEach((sd) => { const p = new T.Mesh(new T.BoxGeometry(0.4, 0.03, 0.55), M.page); p.position.x = sd * 0.2; p.rotation.z = -sd * 0.3; book.add(p); });
      anim.push((t) => { book.position.y = 1.0 + Math.sin(t * 1.5) * 0.1; book.rotation.y = t * 0.4; });
    },
    skin_ma_crystal(g, anim, M) { // 結晶の尖塔
      const cl = new T.Group(); g.add(cl);
      [[0, 0, 2.6, 0.38], [0.5, 0.3, 1.6, 0.26], [-0.45, 0.4, 1.8, 0.28], [0.25, -0.55, 1.3, 0.22], [-0.35, -0.4, 1.1, 0.2], [0.7, -0.15, 0.9, 0.16]].forEach(([x, z, h, r], k) => {
        const c = new T.Mesh(new T.CylinderGeometry(0, r, h, 6), k % 2 ? M.accent : M.glass2 || M.body);
        c.position.set(x, h / 2, z); c.rotation.set(z * 0.35, 0, -x * 0.35); cl.add(c);
      });
      const ring = new T.Group(); ring.position.y = 1.6; g.add(ring);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, o = new T.Mesh(new T.OctahedronGeometry(0.1), M.accent); o.position.set(Math.cos(a) * 1.35, Math.sin(a * 2) * 0.15, Math.sin(a) * 1.35); ring.add(o); }
      anim.push((t, dt) => { ring.rotation.y += dt * 0.6; ring.children.forEach((o) => { o.rotation.y += dt * 2; }); cl.rotation.y = Math.sin(t * 0.3) * 0.15; });
    },
    skin_en_castle(g, anim, M) { // 古城
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      at(new T.BoxGeometry(1.0, 1.4, 1.0), M.page, 0, 0.7, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; at(new T.BoxGeometry(0.16, 0.16, 0.16), M.page, Math.round(Math.cos(a)) * 0.42, 1.48, Math.round(Math.sin(a)) * 0.42); }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
        at(new T.CylinderGeometry(0.22, 0.25, 1.9, 12), M.body, x * 0.72, 0.95, z * 0.72);
        at(new T.ConeGeometry(0.3, 0.55, 12), M.accent, x * 0.72, 2.18, z * 0.72);
      });
      at(new T.CylinderGeometry(0.02, 0.02, 0.9, 6), M.body, 0, 1.9, 0);
      const fl = at(new T.PlaneGeometry(0.5, 0.3), M.accentSoft, 0.25, 2.2, 0);
      anim.push((t) => { fl.rotation.y = Math.sin(t * 3) * 0.35; });
      at(new T.TorusGeometry(0.2, 0.05, 6, 16, Math.PI), M.accent, 0, 0.0, 0.52);
    },
    skin_sc_obs(g, anim, M) { // 天文台
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      at(new T.CylinderGeometry(0.85, 0.9, 0.9, 24), M.page, 0, 0.45, 0);
      const dome = new T.Group(); dome.position.y = 0.9; g.add(dome);
      dome.add(new T.Mesh(new T.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.body));
      const slit = new T.Mesh(new T.BoxGeometry(0.22, 0.9, 0.05), M.accent); slit.position.set(0, 0.45, 0.8); slit.rotation.x = -0.5; dome.add(slit);
      const scope = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 1.3, 12), M.accent); scope.position.set(0, 0.7, 0.55); scope.rotation.x = 0.8; dome.add(scope);
      anim.push((t) => { dome.rotation.y = t * 0.25; });
      const dish = new T.Group(); dish.position.set(1.05, 0, -0.6); g.add(dish);
      const pole = new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 0.9, 8), M.body); pole.position.y = 0.45; dish.add(pole);
      const bowl = new T.Mesh(new T.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), M.page); bowl.material = M.page; bowl.position.y = 1.0; bowl.rotation.x = Math.PI * 0.75; dish.add(bowl);
      anim.push((t) => { dish.rotation.y = Math.sin(t * 0.5) * 0.8; });
      const st = new T.Group(); st.position.y = 2.3; g.add(st);
      for (let k = 0; k < 5; k++) { const o = new T.Mesh(new T.OctahedronGeometry(0.06), M.accent); const a = (k / 5) * Math.PI * 2; o.position.set(Math.cos(a) * 1.1, Math.sin(a * 3) * 0.2, Math.sin(a) * 1.1); st.add(o); }
      anim.push((t, dt) => { st.rotation.y -= dt * 0.3; });
    },
    skin_so_tenshu(g, anim, M) { // 天守閣
      const at = (o, m, x, y, z) => { o.material = m; o.position.set(x, y, z); g.add(o); return o; };
      const wall = at(new T.Mesh(new T.CylinderGeometry(0.9, 1.25, 0.6, 4)), M.body, 0, 0.3, 0); wall.rotation.y = Math.PI / 4;
      [[1.0, 0.45], [0.8, 0.42], [0.6, 0.4]].forEach(([w, h], k) => {
        const y = 0.6 + k * 0.72;
        at(new T.Mesh(new T.BoxGeometry(w, h, w * 0.85)), M.page, 0, y + h / 2, 0);
        const r = roof(w * 0.9, 0.3); at(r, M.accent, 0, y + h + 0.12, 0); r.material.side = T.DoubleSide; r.scale.z = 0.85;
      });
      [-0.18, 0.18].forEach((x) => at(new T.Mesh(new T.SphereGeometry(0.06, 8, 6)), M.accent, x, 2.85, 0));
      at(new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.05)), M.accent, 0, 2.8, 0);
    },
  };

  /* ---------- 台座と装飾（カスタマイズ） ---------- */
  function buildBase(root, M, baseId, C) {
    const deco = { anim: [] };
    if (baseId === 'base_garden') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 1.68, z = Math.sin(a) * 1.68;
        const tr = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.3, 6), new T.MeshStandardMaterial({ color: 0x5a4030 })); tr.position.set(x, 0.38, z); root.add(tr);
        const lf = new T.Mesh(new T.ConeGeometry(0.2, 0.5, 8), new T.MeshStandardMaterial({ color: 0x2f7a52, emissive: 0x0a2a18, roughness: 0.8 })); lf.position.set(x, 0.75, z); root.add(lf);
      }
      const pond = new T.Mesh(new T.CircleGeometry(0.42, 24), new T.MeshStandardMaterial({ color: 0x3a6ea8, metalness: 0.6, roughness: 0.1, emissive: 0x0a1a30 }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(1.0, 0.32, 0.65); root.add(pond);
      return { base: 0x1f3a2e, tier: 0x2a4a3a, pylons: false, deco };
    }
    if (baseId === 'base_neon') {
      const ring2 = new T.Mesh(new T.RingGeometry(1.9, 1.96, 6), M.edgeExtra); ring2.rotation.set(-Math.PI / 2, 0, Math.PI / 6); ring2.position.y = 0.0; root.add(ring2);
      return { base: 0x0b0f1e, tier: 0x111833, pylons: 'neon', deco };
    }
    if (baseId === 'base_marble') return { base: 0xbfc6d6, tier: 0xe4e8f2, pylons: 'column', deco };
    return { base: 0x18213c, tier: 0x232e52, pylons: true, deco };
  }
  function flagTexture(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 160;
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#05080F'; g.font = '900 64px "Zen Kaku Gothic New","Hiragino Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((text || '').slice(0, 4), 128, 84);
    return new T.CanvasTexture(c);
  }
  function buildDecos(root, M, decos, flagText, anim, scene) {
    (decos || []).forEach((id) => {
      if (id === 'deco_flag' && flagText) {
        const pole = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, 2.0, 8), M.body); pole.position.set(-1.35, 1.2, -0.9); root.add(pole);
        const cloth = new T.Mesh(new T.PlaneGeometry(0.75, 0.47, 8, 1), new T.MeshBasicMaterial({ map: flagTexture(flagText), side: T.DoubleSide }));
        cloth.position.set(-0.97, 1.95, -0.9); root.add(cloth);
        const tip = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), M.accent); tip.position.set(-1.35, 2.22, -0.9); root.add(tip);
        const pos = cloth.geometry.attributes.position, base = Float32Array.from(pos.array);
        anim.push((t) => { for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 4 + x * 6) * 0.06 * (x + 0.375); } pos.needsUpdate = true; });
      }
      if (id === 'deco_lantern') {
        const og = new T.Group(); og.position.y = 1.4; root.add(og);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2, l = new T.Group(); l.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2);
          const body = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 0.26, 8), new T.MeshBasicMaterial({ color: 0xffd28a })); l.add(body);
          const cap = new T.Mesh(new T.ConeGeometry(0.14, 0.1, 8), M.accent); cap.position.y = 0.18; l.add(cap);
          og.add(l);
        }
        anim.push((t, dt) => { og.rotation.y += dt * 0.3; og.children.forEach((l, k) => { l.position.y = Math.sin(t * 1.5 + k) * 0.18; }); });
      }
      if (id === 'deco_petals') {
        const n = 70, pos = new Float32Array(n * 3), seed = [];
        for (let k = 0; k < n; k++) { seed.push([Math.random() * Math.PI * 2, 0.6 + Math.random() * 1.8, Math.random() * 4, 0.3 + Math.random() * 0.5]); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        const pts = new T.Points(geo, new T.PointsMaterial({ color: 0xffb7d0, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false })); root.add(pts);
        anim.push((t) => { seed.forEach(([a, r, h, sp], k) => { const y = 4 - ((t * sp + h) % 4); pos[k * 3] = Math.cos(a + t * 0.3) * r; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Math.sin(a + t * 0.3) * r; }); geo.attributes.position.needsUpdate = true; });
      }
      if (id === 'deco_halo') {
        const ring = new T.Mesh(new T.TorusGeometry(1.5, 0.05, 8, 64), M.accent); ring.position.y = 3.05; ring.rotation.x = Math.PI / 2; root.add(ring);
        const ring2 = new T.Mesh(new T.TorusGeometry(1.2, 0.02, 6, 64), M.accent); ring2.position.y = 3.05; ring2.rotation.x = Math.PI / 2; root.add(ring2);
        anim.push((t) => { ring.rotation.z = t * 0.5; ring2.rotation.z = -t * 0.8; ring.position.y = ring2.position.y = 3.05 + Math.sin(t) * 0.08; });
      }
    });
  }

  /* ---------- 粒子・光線などの一時エフェクト ---------- */
  function burst(scene, origin, color, n, speed, up) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * Math.PI * 0.6, s = speed * (0.4 + Math.random() * 0.8);
      vel.push(new T.Vector3(Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + up * Math.random(), Math.sin(a) * Math.cos(e) * s));
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({ color, size: 0.14, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false });
    const pts = new T.Points(geo, mat); scene.add(pts);
    let life = 0;
    return {
      update(dt) {
        life += dt; const p = geo.attributes.position.array;
        vel.forEach((v, i) => { v.y -= 3.2 * dt; p[i * 3] += v.x * dt; p[i * 3 + 1] += v.y * dt; p[i * 3 + 2] += v.z * dt; });
        geo.attributes.position.needsUpdate = true; mat.opacity = Math.max(0, 1 - life / 1.3);
        return life < 1.3;
      },
      dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
    };
  }
  const UP = new T.Vector3(0, 1, 0);
  function stretch(mesh, a, b) {
    const d = new T.Vector3().subVectors(b, a), len = Math.max(0.001, d.length());
    mesh.position.copy(a).addScaledVector(d, 0.5); mesh.scale.y = len;
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  }

  /* ---------- 本体 ---------- */
  function create(order, colors, look) {
    look = look || {};
    if (!T) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement; canvas.className = 't3d-canvas';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '陣地の3Dマップ');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new T.Scene();
    scene.fog = new T.Fog(0x060a14, 18, 44);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 120);
    scene.add(new T.HemisphereLight(0x9fb0e0, 0x0a1020, 0.65));
    const sun = new T.DirectionalLight(0xffffff, 0.85); sun.position.set(6, 12, 8); scene.add(sun);
    const grid = new T.GridHelper(60, 60, 0x2c3a61, 0x141d36); grid.position.y = -0.25; scene.add(grid);

    const C = { me: new T.Color(colors.me), op: new T.Color(colors.op), neutral: new T.Color(NEUTRAL), white: new T.Color('#ffffff') };
    const n = order.length;
    const placeOf = (i) => { const t = n > 1 ? i / (n - 1) - 0.5 : 0; return new T.Vector3(t * SPACING * (n - 1), 0, -Math.abs(t) * 3.4 + 0.8); };

    const sites = order.map((subject, i) => {
      const root = new T.Group(); root.position.copy(placeOf(i));
      const M = {
        body: new T.MeshStandardMaterial({ color: 0xc9d2ec, metalness: 0.45, roughness: 0.32, emissive: C.neutral.clone(), emissiveIntensity: 0.12 }),
        page: new T.MeshStandardMaterial({ color: 0xeef2ff, metalness: 0.1, roughness: 0.6, emissive: C.neutral.clone(), emissiveIntensity: 0.06 }),
        accent: new T.MeshStandardMaterial({ color: C.neutral.clone(), metalness: 0.3, roughness: 0.3, emissive: C.neutral.clone(), emissiveIntensity: 0.8 }),
        accentSoft: new T.MeshBasicMaterial({ color: C.neutral.clone(), transparent: true, opacity: 0.55, side: T.DoubleSide }),
        wire: new T.MeshBasicMaterial({ color: C.neutral.clone(), wireframe: true, transparent: true, opacity: 0.8 }),
        glass: new T.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.28 }),
        glass2: new T.MeshStandardMaterial({ color: 0xe8f0ff, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.6 }),
        edgeExtra: new T.MeshBasicMaterial({ color: C.neutral.clone(), side: T.DoubleSide }),
      };
      const bs = buildBase(root, M, look.base, C);
      const base = new T.Mesh(new T.CylinderGeometry(1.75, 1.98, 0.42, 6), new T.MeshStandardMaterial({ color: bs.base, metalness: look.base === 'base_marble' ? 0.15 : 0.65, roughness: 0.45 }));
      base.position.y = -0.04; root.add(base);
      const tier = new T.Mesh(new T.CylinderGeometry(1.5, 1.58, 0.14, 6), new T.MeshStandardMaterial({ color: bs.tier, metalness: look.base === 'base_marble' ? 0.1 : 0.6, roughness: 0.4 }));
      tier.position.y = 0.24; root.add(tier);
      const edgeMat = new T.MeshBasicMaterial({ color: C.neutral.clone() });
      const edge = new T.Mesh(new T.RingGeometry(1.66, 1.82, 6), edgeMat); edge.rotation.set(-Math.PI / 2, 0, Math.PI / 6); edge.position.y = 0.18; root.add(edge);
      if (bs.pylons) for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 1.72, z = Math.sin(a) * 1.72;
        const py = bs.pylons === 'column' ? new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.75, 10), M.page) : new T.Mesh(new T.BoxGeometry(0.1, bs.pylons === 'neon' ? 0.9 : 0.6, 0.1), bs.pylons === 'neon' ? M.accent : M.body);
        py.position.set(x, bs.pylons === 'neon' ? 0.6 : 0.45, z); root.add(py);
        const lamp = new T.Mesh(new T.OctahedronGeometry(0.08), M.accent); lamp.position.set(x, bs.pylons === 'neon' ? 1.1 : 0.82, z); root.add(lamp);
      }
      const haloMat = new T.MeshBasicMaterial({ color: C.neutral.clone(), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const halo = new T.Mesh(new T.RingGeometry(2.05, 2.12, 64, 1, 0, Math.PI * 1.6), haloMat); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; root.add(halo);
      const st = structure(subject, M, look.skins && look.skins[subject]); st.group.position.y = 0.31; root.add(st.group);
      buildDecos(root, M, look.decos, look.flag, st.anim, scene);
      const beamMat = new T.MeshBasicMaterial({ color: C.neutral.clone(), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const beam = new T.Mesh(new T.CylinderGeometry(0.16, 0.5, 9, 20, 1, true), beamMat); beam.position.y = 4.8; root.add(beam);
      const light = new T.PointLight(C.neutral.getHex(), 0.6, 6); light.position.y = 2.0; root.add(light);
      const tag = textSprite(subject); tag.position.y = 3.8; root.add(tag);
      const mark = new T.Mesh(new T.OctahedronGeometry(0.2, 0), new T.MeshBasicMaterial({ color: C.me.clone() })); mark.position.y = 3.25; mark.visible = false; root.add(mark);
      scene.add(root);
      return { subject, root, M, edgeMat, haloMat, halo, beamMat, light, st, mark, tag, target: C.neutral.clone(), cur: C.neutral.clone(), state: 'pending', pop: 0, dim: 0 };
    });

    let az = 0, drag = null, raf = 0, alive = true, focusI = null, introT = 0;
    const camPos = new T.Vector3(0, 14, 26), camLook = new T.Vector3(0, 1, -0.8);
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, az }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag) az = Math.max(-0.9, Math.min(0.9, drag.az - (e.clientX - drag.x) / 220)); });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

    function resize() {
      const host = canvas.parentElement; if (!host) return;
      const w = host.clientWidth || 300, h = host.clientHeight || 200;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function setState(states, focusInfo) {
      sites.forEach((s, i) => {
        const st = states[i] || 'pending';
        if (st !== s.state && (st === 'me' || st === 'op')) s.pop = 1;
        s.state = st;
        s.target.copy(st === 'me' || st === 'own' ? C.me : st === 'op' ? C.op : st === 'active' ? C.white : C.neutral);
        s.dim = st === 'none' ? 1 : 0;
        s.mark.visible = !!focusInfo && focusInfo.me === s.subject;
      });
    }

    /* ---------- 演出 ---------- */
    const fx = [];
    function intro() { if (reduce) return; introT = 1; camPos.set(0, 36, 24); }
    function focus(i) { focusI = i; }
    function clash(i, e) {
      const s = sites[i]; if (!s) return;
      const o = s.root.position, p = new T.Vector3(o.x + Math.max(-1.3, Math.min(1.3, (e.gauge / 100) * 1.3)), 1.9, o.z + 1.2);
      const srcMe = new T.Vector3(o.x - 5.5, 3.4, o.z + 3.2), srcOp = new T.Vector3(o.x + 5.5, 3.4, o.z + 3.2);
      const mk = (col) => new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      const bm = mk(C.me), bo = mk(C.op);
      const rMe = 0.04 + Math.min(1, e.a / 100) * 0.16, rOp = 0.04 + Math.min(1, e.b / 100) * 0.16;
      const orb = new T.Mesh(new T.SphereGeometry(0.35, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }));
      orb.position.copy(p); scene.add(bm, bo, orb);
      let life = 0; const L = reduce ? 0.6 : 1.0;
      const hMe = new T.Vector3(), hOp = new T.Vector3();
      fx.push({
        update(dt) {
          life += dt; const k = Math.min(1, life / 0.22);
          stretch(bm, srcMe, hMe.lerpVectors(srcMe, p, k)); bm.scale.x = bm.scale.z = rMe * (1 + Math.sin(life * 40) * 0.15);
          stretch(bo, srcOp, hOp.lerpVectors(srcOp, p, k)); bo.scale.x = bo.scale.z = rOp * (1 + Math.cos(life * 40) * 0.15);
          orb.scale.setScalar(Math.max(0.01, k * (1 + Math.sin(life * 30) * 0.2) * (0.6 + Math.abs(e.a - e.b) / 60)));
          const fade = Math.max(0, 1 - Math.max(0, life - L * 0.6) / (L * 0.4));
          bm.material.opacity = bo.material.opacity = 0.9 * fade; orb.material.opacity = 0.95 * fade;
          return life < L;
        },
        dispose() { [bm, bo, orb].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); },
      });
      if (!reduce) fx.push(burst(scene, p, e.a >= e.b ? C.me : C.op, 46, 3.2, 1.2));
    }
    function capture(i, side) {
      const s = sites[i]; if (!s) return;
      const col = side === 'me' ? C.me : C.op;
      s.pop = 1;
      const ring = new T.Mesh(new T.RingGeometry(0.9, 1.05, 64), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.root.position.x, 0.35, s.root.position.z); scene.add(ring);
      const pillar = new T.Mesh(new T.CylinderGeometry(1.4, 1.6, 12, 24, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      pillar.position.set(s.root.position.x, 6, s.root.position.z); scene.add(pillar);
      let life = 0;
      fx.push({
        update(dt) { life += dt; const k = life / 1.3; ring.scale.setScalar(1 + k * 6); ring.material.opacity = Math.max(0, 0.9 * (1 - k)); pillar.scale.set(Math.max(0.05, 1 - k * 0.7), 1, Math.max(0.05, 1 - k * 0.7)); pillar.material.opacity = Math.max(0, 0.5 * (1 - k)); return life < 1.3; },
        dispose() { [ring, pillar].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); },
      });
      if (!reduce) fx.push(burst(scene, new T.Vector3(s.root.position.x, 1.5, s.root.position.z), col, 120, 4.2, 4));
    }

    const clock = new T.Clock(), tmpP = new T.Vector3(), tmpL = new T.Vector3();
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, clock.getDelta() || 0.016), t = clock.elapsedTime;
      if (!canvas.isConnected) return;
      const aspect = camera.aspect || 1.6, sway = reduce ? 0 : Math.sin(t * 0.16) * 0.12, a = az + sway;
      if (focusI == null || !sites[focusI]) {
        const R = Math.min(30, 17 * Math.max(1, 1.55 / aspect));
        tmpP.set(Math.sin(a) * R, 6.5 + R * 0.3, Math.cos(a) * R); tmpL.set(0, 1.0, -0.8);
      } else {
        const o = sites[focusI].root.position, R = Math.min(14, 8.2 * Math.max(1, 1.3 / aspect));
        tmpP.set(o.x + Math.sin(a * 0.6) * R, 3.4 + R * 0.25, o.z + Math.cos(a * 0.6) * R); tmpL.set(o.x, 1.6, o.z);
      }
      if (introT > 0) introT = Math.max(0, introT - dt * 0.45);
      const ease = reduce ? 1 : introT > 0 ? 0.03 : 0.07;
      camPos.lerp(tmpP, ease); camLook.lerp(tmpL, ease);
      camera.position.copy(camPos); camera.lookAt(camLook);

      sites.forEach((s, i) => {
        s.cur.lerp(s.target, 0.08);
        const active = s.state === 'active', calm = s.state === 'own', owned = calm || s.state === 'me' || s.state === 'op', M = s.M;
        s.edgeMat.color.copy(s.cur); s.haloMat.color.copy(s.cur);
        M.accent.color.copy(s.cur); M.accent.emissive.copy(s.cur); M.accent.emissiveIntensity = owned ? 1.0 : active ? 0.7 : 0.35;
        M.accentSoft.color.copy(s.cur); M.wire.color.copy(s.cur); M.edgeExtra.color.copy(s.cur);
        M.body.emissive.copy(s.cur); M.body.emissiveIntensity = owned ? 0.22 : 0.1;
        M.page.emissive.copy(s.cur);
        M.body.color.setScalar(s.dim ? 0.3 : 0.8); M.page.color.setScalar(s.dim ? 0.35 : 0.95);
        s.light.color.copy(s.cur); s.light.intensity = owned ? 1.8 : active ? 1.2 + Math.sin(t * 6) * 0.5 : 0.4;
        s.beamMat.color.copy(s.cur); s.beamMat.opacity = calm ? 0.05 : owned ? 0.32 : active ? 0.22 + Math.sin(t * 6) * 0.12 : 0;
        s.haloMat.opacity = owned ? 0.6 : active ? 0.5 : 0.18;
        s.tag.visible = focusI !== i;
        s.pop = Math.max(0, s.pop - dt * 1.4);
        s.st.group.scale.setScalar(1 + Math.sin(s.pop * Math.PI) * 0.25);
        if (!reduce) {
          s.halo.rotation.z += dt * (active ? 1.6 : 0.4);
          s.st.anim.forEach((f) => f(t + i, dt));
          s.mark.rotation.y += dt * 2; s.mark.position.y = 3.25 + Math.sin(t * 2) * 0.08;
        }
      });
      for (let k = fx.length - 1; k >= 0; k--) if (!fx[k].update(dt)) { fx[k].dispose(); fx.splice(k, 1); }
      renderer.render(scene, camera);
    }
    frame();

    function destroy() {
      alive = false; cancelAnimationFrame(raf);
      fx.forEach((f) => f.dispose()); fx.length = 0;
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
      canvas.remove();
    }
    return { canvas, resize, setState, destroy, intro, focus, clash, capture, key: keyOf(order, colors, look) };
  }

  const keyOf = (order, colors, look) => order.join() + colors.me + colors.op + JSON.stringify(look || {});
  window.Terrain3D = { create, keyOf };
})();
