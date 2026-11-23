/* マイ陣地アイテムの3D表現（Three.js）。data/cosmetics.js のパラメータを読んで組み立てる。
 * terrain3d.js から呼ばれる。持ち主の色は M.accent / M.accentSoft / M.wire（terrain3d が毎フレーム塗る）を使い、
 * それ以外は素材（M.body / M.page）か固定色。強さには関係しない。 */
(function () {
  const T = window.THREE; if (!T) return;
  const CAT = () => window.COSMETICS || { items: [] };
  const get = (id) => CAT().items.find((x) => x.id === id);
  const UP = new T.Vector3(0, 1, 0);
  const place = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const std = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o));
  const basic = (color, o = {}) => new T.MeshBasicMaterial(Object.assign({ color }, o));
  function rod(a, b, r, m) { const d = new T.Vector3().subVectors(b, a), o = new T.Mesh(new T.CylinderGeometry(r, r, 1, 6), m); o.position.copy(a).addScaledVector(d, 0.5); o.scale.y = d.length(); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o; }
  const roofCone = (w, h, m) => { const r = new T.Mesh(new T.ConeGeometry(w, h, 4, 1, true), m); r.rotation.y = Math.PI / 4; return r; };
  function textTex(text, { w = 128, h = 128, size = 88, color = '#fff', bg = null, glow = true } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.font = `900 ${size}px "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = 'rgba(255,255,255,.85)'; g.shadowBlur = 14; }
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4); return new T.CanvasTexture(c);
  }

  /* =============== 建物 =============== */
  const SKINS = {
    skin_ja_shoin(g, anim, M) {
      const at = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };
      at(new T.Mesh(new T.BoxGeometry(1.6, 0.25, 1.6), M.page), 0, 0.12, 0);
      [[1.2, 0.55], [0.95, 0.5], [0.7, 0.45]].forEach(([w, h], k) => { const y = 0.25 + k * 0.85; at(new T.Mesh(new T.BoxGeometry(w, h, w), M.page), 0, y + h / 2, 0); at(roofCone(w * 0.95, 0.38, M.accentD), 0, y + h + 0.17, 0); });
      at(new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.6, 6), M.accent), 0, 3.0, 0);
      const book = new T.Group(); book.position.set(1.1, 1.0, 0.6); g.add(book);
      [-1, 1].forEach((sd) => { const p = new T.Mesh(new T.BoxGeometry(0.4, 0.03, 0.55), M.page); p.position.x = sd * 0.2; p.rotation.z = -sd * 0.3; book.add(p); });
      anim.push((t) => { book.position.y = 1.0 + Math.sin(t * 1.5) * 0.1; book.rotation.y = t * 0.4; });
    },
    skin_ja_goju(g, anim, M) {
      const at = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };
      at(new T.Mesh(new T.BoxGeometry(1.3, 0.2, 1.3), M.page), 0, 0.1, 0);
      for (let k = 0; k < 5; k++) { const w = 0.85 - k * 0.1, y = 0.2 + k * 0.5; at(new T.Mesh(new T.BoxGeometry(w, 0.32, w), M.body), 0, y + 0.16, 0); at(roofCone(w * 1.05, 0.22, M.accentD), 0, y + 0.42, 0); }
      at(new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.9, 6), M.accent), 0, 3.15, 0);
      for (let k = 0; k < 7; k++) at(new T.Mesh(new T.TorusGeometry(0.07, 0.015, 4, 12), M.accent), 0, 2.85 + k * 0.08, 0).rotation.x = Math.PI / 2;
    },
    skin_ja_library(g, anim, M) {
      g.add(place(new T.Mesh(new T.CylinderGeometry(0.28, 0.4, 2.2, 12), M.page), 0, 1.1, 0));
      const ring = new T.Group(); ring.position.y = 1.3; g.add(ring);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2, sh = new T.Group(); sh.position.set(Math.cos(a) * 1.15, Math.sin(k) * 0.2, Math.sin(a) * 1.15); sh.rotation.y = -a + Math.PI / 2;
        sh.add(new T.Mesh(new T.BoxGeometry(0.6, 0.5, 0.18), M.body));
        for (let j = 0; j < 5; j++) { const bk = new T.Mesh(new T.BoxGeometry(0.08, 0.34, 0.14), j % 2 ? M.accent : M.page); bk.position.set(-0.22 + j * 0.11, 0.0, 0.03); sh.add(bk); }
        ring.add(sh);
      }
      anim.push((t, dt) => { ring.rotation.y += dt * 0.35; ring.position.y = 1.3 + Math.sin(t) * 0.08; });
    },
    skin_ma_crystal(g, anim, M) {
      const cl = new T.Group(); g.add(cl);
      [[0, 0, 2.6, 0.38], [0.5, 0.3, 1.6, 0.26], [-0.45, 0.4, 1.8, 0.28], [0.25, -0.55, 1.3, 0.22], [-0.35, -0.4, 1.1, 0.2], [0.7, -0.15, 0.9, 0.16]].forEach(([x, z, h, r], k) => {
        const c = new T.Mesh(new T.CylinderGeometry(0, r, h, 6), k % 2 ? M.accent : M.page); c.position.set(x, h / 2, z); c.rotation.set(z * 0.35, 0, -x * 0.35); cl.add(c);
      });
      const ring = new T.Group(); ring.position.y = 1.6; g.add(ring);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, o = new T.Mesh(new T.OctahedronGeometry(0.1), M.accent); o.position.set(Math.cos(a) * 1.35, Math.sin(a * 2) * 0.15, Math.sin(a) * 1.35); ring.add(o); }
      anim.push((t, dt) => { ring.rotation.y += dt * 0.6; });
    },
    skin_ma_mobius(g, anim, M) {
      g.add(place(new T.Mesh(new T.CylinderGeometry(0.15, 0.4, 0.6, 8), M.body), 0, 0.3, 0));
      const k = new T.Mesh(new T.TorusKnotGeometry(0.72, 0.16, 140, 14, 2, 3), M.page); k.position.y = 1.75; g.add(k);
      const w = new T.Mesh(new T.TorusKnotGeometry(0.72, 0.17, 70, 6, 2, 3), M.wire); w.position.y = 1.75; g.add(w);
      anim.push((t, dt) => { k.rotation.y += dt * 0.5; k.rotation.x = Math.sin(t * 0.4) * 0.4; w.rotation.copy(k.rotation); });
    },
    skin_ma_stairs(g, anim, M) {
      g.add(place(new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 2.8, 8), M.body), 0, 1.4, 0));
      const sp = new T.Group(); g.add(sp);
      for (let k = 0; k < 18; k++) { const a = k * 0.55, st = new T.Mesh(new T.BoxGeometry(0.55, 0.06, 0.24), k % 4 === 3 ? M.accent : M.page); st.position.set(Math.cos(a) * 0.42, 0.15 + k * 0.15, Math.sin(a) * 0.42); st.rotation.y = -a; sp.add(st); }
      anim.push((t, dt) => { sp.rotation.y += dt * 0.25; });
    },
    skin_en_castle(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      at(new T.BoxGeometry(1.0, 1.4, 1.0), M.page, 0, 0.7, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; at(new T.BoxGeometry(0.16, 0.16, 0.16), M.page, Math.round(Math.cos(a)) * 0.42, 1.48, Math.round(Math.sin(a)) * 0.42); }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => { at(new T.CylinderGeometry(0.22, 0.25, 1.9, 12), M.body, x * 0.72, 0.95, z * 0.72); at(new T.ConeGeometry(0.3, 0.55, 12), M.accent, x * 0.72, 2.18, z * 0.72); });
      at(new T.CylinderGeometry(0.02, 0.02, 0.9, 6), M.body, 0, 1.9, 0);
      const fl = at(new T.PlaneGeometry(0.5, 0.3), M.accentSoft, 0.25, 2.2, 0); anim.push((t) => { fl.rotation.y = Math.sin(t * 3) * 0.35; });
    },
    skin_en_bridge(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      [-0.85, 0.85].forEach((x) => { at(new T.BoxGeometry(0.42, 2.2, 0.42), M.page, x, 1.1, 0); at(new T.ConeGeometry(0.32, 0.5, 4), M.accent, x, 2.45, 0).rotation.y = Math.PI / 4; at(new T.BoxGeometry(0.46, 0.08, 0.46), M.accent, x, 1.6, 0); });
      at(new T.BoxGeometry(1.3, 0.12, 0.5), M.body, 0, 0.95, 0);
      at(new T.BoxGeometry(1.3, 0.08, 0.1), M.accent, 0, 1.9, 0);
      [[-0.85, 2.0, 0.2, -0.1], [0.85, 2.0, 0.2, 0.1]].forEach(([x, y, z, ex]) => { g.add(rod(new T.Vector3(x, y, z), new T.Vector3(ex, 1.0, z), 0.015, M.accent)); g.add(rod(new T.Vector3(x, y, -z), new T.Vector3(ex, 1.0, -z), 0.015, M.accent)); });
    },
    skin_en_torch(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      at(new T.BoxGeometry(0.9, 0.5, 0.9), M.page, 0, 0.25, 0); at(new T.BoxGeometry(0.65, 0.4, 0.65), M.body, 0, 0.7, 0);
      at(new T.CylinderGeometry(0.2, 0.32, 1.2, 12), M.page, 0, 1.5, 0); at(new T.SphereGeometry(0.17, 14, 10), M.page, 0, 2.25, 0);
      g.add(rod(new T.Vector3(0.12, 1.95, 0), new T.Vector3(0.38, 2.75, 0), 0.05, M.page));
      at(new T.CylinderGeometry(0.08, 0.04, 0.25, 8), M.accent, 0.4, 2.85, 0);
      const flame = at(new T.ConeGeometry(0.12, 0.38, 10), M.accentSoft, 0.4, 3.13, 0);
      at(new T.BoxGeometry(0.22, 0.28, 0.06), M.accent, -0.26, 1.7, 0.12);
      anim.push((t) => { flame.scale.set(1 + Math.sin(t * 13) * 0.12, 1 + Math.sin(t * 9) * 0.2, 1); });
    },
    skin_sc_obs(g, anim, M) {
      g.add(place(new T.Mesh(new T.CylinderGeometry(0.85, 0.9, 0.9, 24), M.page), 0, 0.45, 0));
      const dome = new T.Group(); dome.position.y = 0.9; g.add(dome);
      dome.add(new T.Mesh(new T.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.body));
      const scope = new T.Mesh(new T.CylinderGeometry(0.08, 0.12, 1.3, 12), M.accent); scope.position.set(0, 0.7, 0.55); scope.rotation.x = 0.8; dome.add(scope);
      anim.push((t) => { dome.rotation.y = t * 0.25; });
      const dish = new T.Group(); dish.position.set(1.05, 0, -0.6); g.add(dish);
      dish.add(place(new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 0.9, 8), M.body), 0, 0.45, 0));
      const bowl = new T.Mesh(new T.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), M.page); bowl.position.y = 1.0; bowl.rotation.x = Math.PI * 0.75; dish.add(bowl);
      anim.push((t) => { dish.rotation.y = Math.sin(t * 0.5) * 0.8; });
    },
    skin_sc_tesla(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      at(new T.CylinderGeometry(0.6, 0.75, 0.4, 16), M.body, 0, 0.2, 0); at(new T.CylinderGeometry(0.14, 0.18, 1.6, 12), M.page, 0, 1.2, 0);
      for (let k = 0; k < 7; k++) at(new T.TorusGeometry(0.3 - k * 0.012, 0.035, 6, 24), M.accentD, 0, 0.5 + k * 0.2, 0).rotation.x = Math.PI / 2;
      at(new T.TorusGeometry(0.5, 0.16, 12, 32), M.page, 0, 2.15, 0).rotation.x = Math.PI / 2;
      const top = at(new T.SphereGeometry(0.14, 12, 10), M.accent, 0, 2.35, 0);
      const bolts = []; for (let k = 0; k < 5; k++) { const b = rod(new T.Vector3(0, 2.2, 0), new T.Vector3(1, 2.2, 0), 0.012, M.accentSoft); g.add(b); bolts.push(b); }
      anim.push((t) => { top.scale.setScalar(1 + Math.sin(t * 20) * 0.1); bolts.forEach((b, k) => { const on = Math.sin(t * 17 + k * 3.1) > 0.3; b.visible = on; if (on) { const a = t * 3 + k * 1.3, end = new T.Vector3(Math.cos(a) * 1.2, 1.6 + Math.sin(t * 7 + k) * 0.5, Math.sin(a) * 1.2), st = new T.Vector3(0, 2.15, 0), d = end.clone().sub(st); b.position.copy(st).addScaledVector(d, 0.5); b.scale.y = d.length(); b.quaternion.setFromUnitVectors(UP, d.normalize()); } }); });
    },
    skin_sc_rocket(g, anim, M) {
      const at = (geo, m, x, y, z, p = g) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
      at(new T.BoxGeometry(0.3, 2.8, 0.3), M.wire, -0.75, 1.4, 0); at(new T.BoxGeometry(0.6, 0.06, 0.08), M.body, -0.45, 2.1, 0); at(new T.BoxGeometry(0.6, 0.06, 0.08), M.body, -0.45, 1.2, 0);
      const r = new T.Group(); g.add(r);
      at(new T.CylinderGeometry(0.28, 0.3, 1.8, 16), M.page, 0, 1.25, 0, r); at(new T.ConeGeometry(0.28, 0.6, 16), M.accent, 0, 2.45, 0, r);
      at(new T.CylinderGeometry(0.29, 0.29, 0.1, 16), M.accent, 0, 1.6, 0, r);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, f = at(new T.BoxGeometry(0.04, 0.45, 0.3), M.accent, Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3, r); f.rotation.y = -a; }
      const fl = at(new T.ConeGeometry(0.2, 0.6, 12), M.accentSoft, 0, 0.1, 0, r); fl.rotation.x = Math.PI;
      anim.push((t) => { r.position.y = Math.sin(t * 1.2) * 0.05; fl.scale.set(1 + Math.sin(t * 15) * 0.15, 1 + Math.sin(t * 11) * 0.3, 1 + Math.sin(t * 15) * 0.15); });
    },
    skin_so_tenshu(g, anim, M) {
      const at = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };
      at(new T.Mesh(new T.CylinderGeometry(0.9, 1.25, 0.6, 4), M.body), 0, 0.3, 0).rotation.y = Math.PI / 4;
      [[1.0, 0.45], [0.8, 0.42], [0.6, 0.4]].forEach(([w, h], k) => { const y = 0.6 + k * 0.72; at(new T.Mesh(new T.BoxGeometry(w, h, w * 0.85), M.page), 0, y + h / 2, 0); const rf = roofCone(w * 0.9, 0.3, M.accentD); rf.scale.z = 0.85; at(rf, 0, y + h + 0.12, 0); });
      [-0.18, 0.18].forEach((x) => at(new T.Mesh(new T.SphereGeometry(0.06, 8, 6), M.accent), x, 2.85, 0));
    },
    skin_so_arch(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      [-0.6, 0.6].forEach((x) => at(new T.BoxGeometry(0.5, 1.6, 0.6), M.page, x, 0.8, 0));
      at(new T.BoxGeometry(1.7, 0.55, 0.62), M.page, 0, 1.87, 0); at(new T.BoxGeometry(1.75, 0.1, 0.66), M.accent, 0, 1.6, 0);
      at(new T.TorusGeometry(0.35, 0.06, 6, 20, Math.PI), M.accent, 0, 1.25, 0.31);
      at(new T.BoxGeometry(0.4, 0.3, 0.3), M.body, 0, 2.3, 0); at(new T.SphereGeometry(0.12, 10, 8), M.accent, 0, 2.55, 0);
    },
    skin_so_light(g, anim, M) {
      const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
      for (let k = 0; k < 5; k++) at(new T.CylinderGeometry(0.38 - k * 0.04 - 0.04, 0.38 - k * 0.04, 0.45, 16), k % 2 ? M.accent : M.page, 0, 0.22 + k * 0.45, 0);
      at(new T.CylinderGeometry(0.22, 0.22, 0.32, 12), M.glass, 0, 2.45, 0); at(new T.ConeGeometry(0.28, 0.3, 12), M.body, 0, 2.76, 0);
      const beam = at(new T.ConeGeometry(0.35, 2.4, 16, 1, true), M.accentSoft, 0, 2.45, 0); beam.rotation.z = Math.PI / 2; beam.position.x = 1.2;
      const piv = new T.Group(); piv.position.y = 2.45; g.add(piv); g.remove(beam); beam.position.set(1.2, 0, 0); piv.add(beam);
      anim.push((t, dt) => { piv.rotation.y += dt * 1.2; });
    },
  };

  /* =============== 素材 =============== */
  function material(M, id) {
    const it = get(id), p = (it && it.p) || { body: 0xc9d2ec, page: 0xeef2ff, metal: 0.45, rough: 0.32 };
    [M.body, M.page].forEach((m, k) => {
      m.metalness = p.metal; m.roughness = p.rough;
      if (p.opacity) { m.transparent = true; m.opacity = k ? Math.min(1, p.opacity + 0.15) : p.opacity; m.depthWrite = p.opacity > 0.6; }
    });
    return { body: new T.Color(p.body), page: new T.Color(p.page), holo: !!p.holo };
  }

  /* =============== 台座 =============== */
  function base(root, M, id, anim) {
    const out = { base: 0x18213c, tier: 0x232e52, pylons: 'box', metal: 0.65 };
    if (id === 'base_garden') {
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 1.68, z = Math.sin(a) * 1.68; root.add(place(new T.Mesh(new T.ConeGeometry(0.2, 0.5, 8), std(0x2f7a52, { emissive: 0x0a2a18 })), x, 0.6, z)); }
      const pond = new T.Mesh(new T.CircleGeometry(0.42, 24), std(0x3a6ea8, { metalness: 0.6, roughness: 0.1 })); pond.rotation.x = -Math.PI / 2; pond.position.set(1.0, 0.32, 0.65); root.add(pond);
      return Object.assign(out, { base: 0x1f3a2e, tier: 0x2a4a3a, pylons: null });
    }
    if (id === 'base_neon') { const r2 = new T.Mesh(new T.RingGeometry(1.9, 1.96, 6), M.edgeExtra); r2.rotation.set(-Math.PI / 2, 0, Math.PI / 6); root.add(r2); return Object.assign(out, { base: 0x0b0f1e, tier: 0x111833, pylons: 'neon' }); }
    if (id === 'base_marble') return Object.assign(out, { base: 0xbfc6d6, tier: 0xe4e8f2, pylons: 'column', metal: 0.12 });
    if (id === 'base_float') {
      const rock = new T.Mesh(new T.ConeGeometry(1.8, 2.4, 7), std(0x4a4f5e, { roughness: 0.95, flatShading: true })); rock.rotation.x = Math.PI; rock.position.y = -1.45; root.add(rock);
      const bits = new T.Group(); root.add(bits);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2, b = new T.Mesh(new T.DodecahedronGeometry(0.18 + k * 0.03), std(0x5a6070, { flatShading: true })); b.position.set(Math.cos(a) * 2.4, -0.6 + k * 0.2, Math.sin(a) * 2.4); bits.add(b); }
      anim.push((t, dt) => { bits.rotation.y += dt * 0.2; root.position.y = Math.sin(t * 0.8) * 0.12 + 0.3; });
      return Object.assign(out, { base: 0x3e4352, tier: 0x5a6070, pylons: null });
    }
    if (id === 'base_snow') {
      for (let k = 0; k < 7; k++) { const a = k * 0.9, m = new T.Mesh(new T.SphereGeometry(0.28, 12, 8), std(0xf4f8ff, { roughness: 0.9 })); m.scale.y = 0.35; m.position.set(Math.cos(a) * 1.35, 0.32, Math.sin(a) * 1.35); root.add(m); }
      return Object.assign(out, { base: 0xdfe8f4, tier: 0xf4f8ff, pylons: 'box', metal: 0.05 });
    }
    if (id === 'base_desert') {
      [[1.3, 0.4, 0.5], [-1.2, 0.8, 0.35], [0.4, -1.35, 0.6]].forEach(([x, z, h]) => root.add(place(new T.Mesh(new T.CylinderGeometry(0.1, 0.12, h, 10), std(0xe8d5a8)), x, 0.31 + h / 2, z)));
      return Object.assign(out, { base: 0xc9a86a, tier: 0xe0c48a, pylons: null, metal: 0.05 });
    }
    if (id === 'base_water') {
      const w = new T.Mesh(new T.RingGeometry(2.0, 3.0, 48), std(0x2a5a8a, { metalness: 0.8, roughness: 0.08, transparent: true, opacity: 0.85, side: T.DoubleSide })); w.rotation.x = -Math.PI / 2; w.position.y = -0.1; root.add(w);
      const rip = new T.Mesh(new T.RingGeometry(2.0, 2.06, 48), basic(0xbfe0ff, { transparent: true, opacity: 0.5, side: T.DoubleSide })); rip.rotation.x = -Math.PI / 2; rip.position.y = -0.08; root.add(rip);
      anim.push((t) => { const k = (t * 0.4) % 1; rip.scale.setScalar(1 + k * 0.45); rip.material.opacity = 0.5 * (1 - k); });
      return out;
    }
    return out;
  }

  /* =============== 庭（3つまで） =============== */
  const SLOTS = [[-0.95, 0.85], [1.15, 0.7], [0.15, -1.2]];
  function gardenItem(p, anim) {
    const g = new T.Group();
    const at = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    switch (p.type) {
      case 'tree': {
        at(new T.CylinderGeometry(0.05, 0.07, 0.5, 6), std(p.trunk), 0, 0.25, 0);
        if (p.shape === 'pine') [0.32, 0.26, 0.18].forEach((r, k) => at(new T.ConeGeometry(r, 0.32, 8), std(p.leaf, { flatShading: true }), 0, 0.5 + k * 0.2, 0));
        else [[0, 0.65, 0, 0.28], [0.15, 0.55, 0.1, 0.2], [-0.14, 0.58, -0.06, 0.2]].forEach(([x, y, z, r]) => at(new T.IcosahedronGeometry(r, 1), std(p.leaf, { flatShading: true }), x, y, z));
        break;
      }
      case 'bamboo': for (let k = 0; k < 4; k++) { const x = (k % 2) * 0.14 - 0.07, z = (k > 1 ? 0.1 : -0.1), h = 0.9 + k * 0.12; at(new T.CylinderGeometry(0.03, 0.03, h, 6), std(0x5fa860), x, h / 2, z); for (let j = 1; j < 4; j++) at(new T.TorusGeometry(0.032, 0.008, 4, 8), std(0x3d7a40), x, (h / 4) * j, z).rotation.x = Math.PI / 2; } break;
      case 'palm': { for (let k = 0; k < 5; k++) at(new T.CylinderGeometry(0.045, 0.055, 0.2, 6), std(0x8a6a48), k * 0.03, 0.1 + k * 0.19, 0); for (let k = 0; k < 5; k++) { const lf = at(new T.ConeGeometry(0.08, 0.6, 4), std(0x3f9a5a, { flatShading: true }), 0.12, 1.0, 0); lf.rotation.set(0, (k / 5) * Math.PI * 2, 1.9); } break; }
      case 'stonelamp': { const s = std(0x9aa0aa, { roughness: 0.9 }); at(new T.CylinderGeometry(0.08, 0.12, 0.35, 6), s, 0, 0.18, 0); at(new T.BoxGeometry(0.26, 0.2, 0.26), basic(0xffd28a), 0, 0.46, 0); at(new T.ConeGeometry(0.24, 0.16, 4), s, 0, 0.64, 0).rotation.y = Math.PI / 4; break; }
      case 'rock': at(new T.DodecahedronGeometry(0.24), std(0x7a808c, { flatShading: true, roughness: 0.95 }), 0, 0.15, 0).scale.set(1.3, 0.7, 1); at(new T.DodecahedronGeometry(0.14), std(0x8a909c, { flatShading: true }), 0.25, 0.08, 0.1); break;
      case 'torii': { const r = std(0xd8483a); [-0.22, 0.22].forEach((x) => at(new T.CylinderGeometry(0.035, 0.04, 0.6, 8), r, x, 0.3, 0)); at(new T.BoxGeometry(0.62, 0.06, 0.08), r, 0, 0.62, 0); at(new T.BoxGeometry(0.5, 0.04, 0.05), r, 0, 0.5, 0); break; }
      case 'fountain': {
        at(new T.CylinderGeometry(0.3, 0.34, 0.14, 16), std(0xdfe4ee), 0, 0.07, 0); at(new T.CylinderGeometry(0.05, 0.07, 0.4, 8), std(0xdfe4ee), 0, 0.3, 0);
        const n = 30, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        g.add(new T.Points(geo, new T.PointsMaterial({ color: 0xbfe8ff, size: 0.05, transparent: true, opacity: 0.9 })));
        anim.push((t) => { for (let i = 0; i < n; i++) { const ph = (t * 0.8 + i / n) % 1, a = i * 2.4; pos[i * 3] = Math.cos(a) * ph * 0.25; pos[i * 3 + 1] = 0.5 + ph * 0.5 - ph * ph * 0.9; pos[i * 3 + 2] = Math.sin(a) * ph * 0.25; } geo.attributes.position.needsUpdate = true; });
        break;
      }
      case 'shelf': { at(new T.BoxGeometry(0.5, 0.7, 0.18), std(0x6a4a3a), 0, 0.35, 0); const cols = [0xd8483a, 0x3a6ea8, 0xe6c36a, 0x4a9a6a, 0xeeeeee]; for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) at(new T.BoxGeometry(0.07, 0.22, 0.12), std(cols[(k + r) % 5]), -0.17 + k * 0.085, 0.2 + r * 0.3, 0.02); break; }
      case 'board': { at(new T.BoxGeometry(0.7, 0.45, 0.04), new T.MeshBasicMaterial({ map: textTex(p.text || '∫', { w: 256, h: 160, size: 64, bg: '#1f3a2e', color: '#f4f4f0', glow: false }) }), 0, 0.6, 0); [-0.3, 0.3].forEach((x) => at(new T.CylinderGeometry(0.02, 0.02, 0.4, 6), std(0x6a4a3a), x, 0.2, 0)); break; }
      case 'globe': { at(new T.CylinderGeometry(0.04, 0.12, 0.3, 8), std(0x6a4a3a), 0, 0.15, 0); const gl = at(new T.SphereGeometry(0.2, 16, 12), std(0x3a7ab8, { roughness: 0.4 }), 0, 0.5, 0); at(new T.TorusGeometry(0.24, 0.012, 4, 24), std(0xc9a86a, { metalness: 0.8 }), 0, 0.5, 0).rotation.y = Math.PI / 2; anim.push((t, dt) => { gl.rotation.y += dt * 0.8; }); break; }
      case 'server': { at(new T.BoxGeometry(0.34, 0.9, 0.3), std(0x1b1f2a, { metalness: 0.7 }), 0, 0.45, 0); const lights = []; for (let k = 0; k < 6; k++) lights.push(at(new T.BoxGeometry(0.2, 0.025, 0.01), basic(0x8fe8ff), 0, 0.15 + k * 0.13, 0.155)); anim.push((t) => lights.forEach((l, k) => { l.visible = Math.sin(t * 6 + k * 2.3) > -0.3; })); break; }
      case 'telescope': { const s = std(0xdfe4ee, { metalness: 0.6 }); [0, 2.1, 4.2].forEach((a) => { const leg = at(new T.CylinderGeometry(0.015, 0.015, 0.5, 4), s, Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1); leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }); const tube = at(new T.CylinderGeometry(0.05, 0.07, 0.55, 12), std(0x3a3f4c, { metalness: 0.7 }), 0.05, 0.55, 0); tube.rotation.z = -0.9; break; }
    }
    return g;
  }
  function garden(root, ids, anim) {
    (ids || []).slice(0, 3).forEach((id, k) => { const it = get(id); if (!it) return; const g = gardenItem(it.p, anim); g.position.set(SLOTS[k][0], 0.31, SLOTS[k][1]); g.rotation.y = k * 1.3; root.add(g); });
  }

  /* =============== エフェクト =============== */
  function fx(root, id, anim) {
    const it = get(id); if (!it || !it.p) return;
    const p = it.p, H = 3.6, R = 2.2;
    if (p.glyphs) {
      const sprites = [];
      for (let k = 0; k < p.n; k++) { const s = new T.Sprite(new T.SpriteMaterial({ map: textTex(p.glyphs[k % p.glyphs.length], { size: 80 }), transparent: true, depthWrite: false })); s.scale.set(0.32, 0.32, 1); s.userData = { a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 1.6, h: Math.random() * H, sp: 0.25 + Math.random() * 0.35 }; root.add(s); sprites.push(s); }
      anim.push((t) => sprites.forEach((s) => { const u = s.userData, ph = (t * u.sp + u.h) % H; s.position.set(Math.cos(u.a + t * 0.2) * u.r, p.motion === 'rise' ? 0.4 + ph : H + 0.4 - ph, Math.sin(u.a + t * 0.2) * u.r); s.material.opacity = Math.min(1, Math.min(ph, H - ph) * 1.5); }));
      return;
    }
    const n = p.n, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = [];
    for (let k = 0; k < n; k++) { const c = new T.Color(p.colors[k % p.colors.length]); col.set([c.r, c.g, c.b], k * 3); seed.push([Math.random() * Math.PI * 2, 0.3 + Math.random() * R, Math.random() * H, 0.3 + Math.random() * 0.5]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.PointsMaterial({ size: p.size, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: p.blink || p.motion === 'twinkle' ? T.AdditiveBlending : T.NormalBlending });
    root.add(new T.Points(geo, mat));
    const sp = p.speed || 1, sway = p.sway || 0.2;
    anim.push((t) => {
      seed.forEach(([a, r, h, s], k) => {
        let x = Math.cos(a + t * 0.25) * r, z = Math.sin(a + t * 0.25) * r, y;
        if (p.motion === 'fall') { y = H - ((t * s * sp + h) % H); x += Math.sin(t * 2 + k) * sway * 0.3; }
        else if (p.motion === 'rise') y = 0.3 + ((t * s * sp + h) % H);
        else if (p.motion === 'float') { y = 0.6 + (h / H) * 2.2 + Math.sin(t * s * 2 + k) * 0.3; x += Math.sin(t * 0.7 + k) * 0.3; }
        else y = 0.6 + (h / H) * 3.2;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      });
      geo.attributes.position.needsUpdate = true;
      if (p.blink || p.motion === 'twinkle') mat.opacity = 0.65 + Math.sin(t * 5) * 0.3;
    });
  }

  /* =============== 周回物 =============== */
  function orbitShape(shape, M) {
    const g = new T.Group(), at = (geo, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    switch (shape) {
      case 'lantern': at(new T.CylinderGeometry(0.1, 0.12, 0.26, 8), basic(0xffd28a)); at(new T.ConeGeometry(0.14, 0.1, 8), M.accent, 0, 0.18, 0); break;
      case 'book': [-1, 1].forEach((sd) => { const p = at(new T.BoxGeometry(0.2, 0.02, 0.28), M.page, sd * 0.1, 0, 0); p.rotation.z = -sd * 0.35; }); at(new T.BoxGeometry(0.03, 0.03, 0.28), M.accent); break;
      case 'planet': { const k = Math.random(); at(new T.SphereGeometry(0.16 + k * 0.08, 16, 12), std(new T.Color().setHSL(k, 0.4, 0.6))); if (k > 0.4) at(new T.TorusGeometry(0.3, 0.015, 4, 32), M.accent).rotation.x = 1.2; break; }
      case 'dice': at(new T.BoxGeometry(0.2, 0.2, 0.2), M.page); [[0, 0, 0.101], [0.101, 0.05, 0.05], [0.101, -0.05, -0.05]].forEach(([x, y, z]) => at(new T.SphereGeometry(0.02, 6, 4), basic(0x05080f), x, y, z)); break;
      case 'gear': at(new T.CylinderGeometry(0.16, 0.16, 0.06, 16), M.body).rotation.x = Math.PI / 2; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; at(new T.BoxGeometry(0.06, 0.06, 0.06), M.accent, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0); } break;
      case 'crane': { const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(0.28, 0.06); sh.lineTo(0.06, 0.02); sh.lineTo(0, 0.22); sh.lineTo(-0.06, 0.02); sh.lineTo(-0.28, 0.06); sh.lineTo(0, 0); const m = at(new T.ShapeGeometry(sh), new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, emissive: 0x222222 })); m.rotation.x = -Math.PI / 2.4; g.userData.flap = m; break; }
      case 'crystal': at(new T.OctahedronGeometry(0.12), M.accent).scale.y = 1.8; break;
      case 'drone': { at(new T.BoxGeometry(0.22, 0.06, 0.22), M.body); const rot = []; [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => rot.push(at(new T.BoxGeometry(0.16, 0.01, 0.03), M.accent, x * 0.14, 0.05, z * 0.14))); at(new T.SphereGeometry(0.03, 8, 6), basic(0xff5050), 0, -0.04, 0.1); g.userData.rotors = rot; break; }
    }
    return g;
  }
  function orbit(root, M, id, anim) {
    const it = get(id); if (!it || !it.p) return;
    const p = it.p;
    if (p.shape === 'halo') {
      const r1 = new T.Mesh(new T.TorusGeometry(1.5, 0.05, 8, 64), M.accent), r2 = new T.Mesh(new T.TorusGeometry(1.2, 0.02, 6, 64), M.accent);
      [r1, r2].forEach((r) => { r.rotation.x = Math.PI / 2; r.position.y = 3.05; root.add(r); });
      anim.push((t) => { r1.rotation.z = t * 0.5; r2.rotation.z = -t * 0.8; r1.position.y = r2.position.y = 3.05 + Math.sin(t) * 0.08; });
      return;
    }
    const og = new T.Group(); og.position.y = 1.5; root.add(og);
    for (let k = 0; k < p.n; k++) { const a = (k / p.n) * Math.PI * 2, o = orbitShape(p.shape, M); o.position.set(Math.cos(a) * p.r, 0, Math.sin(a) * p.r); o.rotation.y = -a; og.add(o); }
    anim.push((t, dt) => {
      og.rotation.y += dt * 0.35;
      og.children.forEach((o, k) => {
        o.position.y = Math.sin(t * 1.4 + k) * 0.2;
        if (p.shape === 'dice' || p.shape === 'gear' || p.shape === 'crystal') { o.rotation.x += dt * 1.2; o.rotation.z += dt * 0.8; }
        if (o.userData.flap) o.userData.flap.rotation.z = Math.sin(t * 6 + k) * 0.25;
        if (o.userData.rotors) o.userData.rotors.forEach((r) => { r.rotation.y += dt * 30; });
      });
    });
  }

  /* =============== 旗 =============== */
  function flagTexture(p, text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d');
    g.fillStyle = p.bg; g.fillRect(0, 0, 256, 160);
    g.fillStyle = p.alt;
    if (p.pattern === 'stripe') { g.fillRect(0, 0, 256, 40); g.fillRect(0, 120, 256, 40); }
    if (p.pattern === 'diag') { g.beginPath(); g.moveTo(0, 120); g.lineTo(140, 0); g.lineTo(200, 0); g.lineTo(60, 160); g.lineTo(0, 160); g.fill(); }
    if (p.pattern === 'check') for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32);
    if (p.pattern === 'star') for (let k = 0; k < 18; k++) { g.beginPath(); g.arc((k * 53) % 256, (k * 37) % 160, 2 + (k % 3), 0, Math.PI * 2); g.fill(); }
    if (p.pattern === 'wave') { g.strokeStyle = p.alt; g.lineWidth = 3; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) for (let r = 8; r < 30; r += 7) { g.beginPath(); g.arc(x * 48 + (y % 2) * 24, y * 30 + 20, r, Math.PI, 0); g.stroke(); } }
    if (p.pattern === 'circuit') { g.strokeStyle = p.alt; g.lineWidth = 3; for (let k = 0; k < 9; k++) { g.beginPath(); const y = 10 + k * 17; g.moveTo(0, y); g.lineTo(60 + (k * 23) % 80, y); g.lineTo(90 + (k * 23) % 80, y + 14); g.lineTo(256, y + 14); g.stroke(); g.beginPath(); g.arc(60 + (k * 23) % 80, y, 4, 0, Math.PI * 2); g.fillStyle = p.alt; g.fill(); } }
    if (text) { g.fillStyle = p.bg; g.globalAlpha = 0.75; g.fillRect(36, 44, 184, 76); g.globalAlpha = 1; g.fillStyle = p.fg; g.font = '900 60px "Zen Kaku Gothic New","Hiragino Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 4), 128, 84); }
    return new T.CanvasTexture(c);
  }
  function flag(root, M, id, text, anim) {
    const it = get(id); if (!it || !it.p) return;
    const pole = new T.Mesh(new T.CylinderGeometry(0.025, 0.03, 2.0, 8), M.body); pole.position.set(-1.35, 1.2, -0.9); root.add(pole);
    const cloth = new T.Mesh(new T.PlaneGeometry(0.75, 0.47, 10, 1), new T.MeshBasicMaterial({ map: flagTexture(it.p, text), side: T.DoubleSide })); cloth.position.set(-0.97, 1.95, -0.9); root.add(cloth);
    root.add(place(new T.Mesh(new T.SphereGeometry(0.05, 8, 6), M.accent), -1.35, 2.22, -0.9));
    const pos = cloth.geometry.attributes.position, b0 = Float32Array.from(pos.array);
    anim.push((t) => { for (let i = 0; i < pos.count; i++) { const x = b0[i * 3]; pos.array[i * 3 + 2] = b0[i * 3 + 2] + Math.sin(t * 4 + x * 6) * 0.06 * (x + 0.375); } pos.needsUpdate = true; });
  }

  window.Cos3D = { SKINS, material, base, garden, fx, orbit, flag };
})();
