/* 陣地の3Dモデル（Three.js）。外部モデルは使わず、基本図形の組み合わせで科目ごとの陣地を作る。
 *  国語：積み重ねた本と筆 / 数学：浮かぶ多面体 / 英語：地球儀と輪 / 理科：原子模型 / 社会：ピラミッドとオベリスク
 *  陣地の持ち主の色（自分＝テーマ色、相手＝相手ナビの色、未決＝ニュートラル）で光り、取ると色が切り替わる。
 *  使い方：const t = Terrain3D.create(order, { me, op }); host.appendChild(t.canvas); t.resize(); t.setState(states, focus)
 *  states は 'pending' | 'active' | 'me' | 'op' | 'none'。WebGL が使えない環境では create が null を返す（2D表示のみ）。 */
(function () {
  const T = window.THREE;
  const NEUTRAL = '#3C4870';

  function label(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,20,.72)'; g.beginPath();
    if (g.roundRect) g.roundRect(28, 14, 200, 84, 14); else g.rect(28, 14, 200, 84);
    g.fill();
    g.font = '900 54px "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(text, 128, 58);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(1.9, 0.84, 1); return s;
  }

  /* 科目ごとの建造物。spin に入れたものは毎フレーム回る */
  function structure(subject, mat, wire) {
    const g = new T.Group(), spin = [];
    const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m || mat); o.position.set(x, y, z); g.add(o); return o; };
    switch (subject) {
      case '国語': {
        [[1.05, 0.0, 0.1], [0.95, 0.3, -0.15], [0.85, 0.6, 0.25]].forEach(([w, y, r]) => { const b = add(new T.BoxGeometry(w, 0.26, 0.72), null, 0, 0.13 + y, 0); b.rotation.y = r; });
        const pen = add(new T.CylinderGeometry(0.05, 0.02, 1.3, 8), null, 0.32, 1.25, 0.05); pen.rotation.z = -0.35;
        const tip = add(new T.ConeGeometry(0.06, 0.18, 8), wire, 0.53, 0.66, 0.05); tip.rotation.z = Math.PI - 0.35;
        break;
      }
      case '数学': {
        const core = add(new T.IcosahedronGeometry(0.48, 0), null, 0, 1.15, 0); spin.push([core, 0.6, 0.9]);
        const cage = add(new T.IcosahedronGeometry(0.78, 0), wire, 0, 1.15, 0); spin.push([cage, -0.3, -0.4]);
        add(new T.CylinderGeometry(0.08, 0.2, 0.55, 6), null, 0, 0.28, 0);
        break;
      }
      case '英語': {
        add(new T.SphereGeometry(0.5, 20, 14), null, 0, 1.0, 0);
        const ring = add(new T.TorusGeometry(0.78, 0.035, 8, 48), wire, 0, 1.0, 0); ring.rotation.x = 1.2; spin.push([ring, 0, 0.5]);
        const lat = add(new T.TorusGeometry(0.52, 0.015, 6, 40), wire, 0, 1.0, 0); lat.rotation.x = Math.PI / 2;
        add(new T.CylinderGeometry(0.06, 0.22, 0.5, 8), null, 0, 0.25, 0);
        break;
      }
      case '理科': {
        add(new T.SphereGeometry(0.22, 16, 12), wire, 0, 1.05, 0);
        [0, 1.05, 2.1].forEach((r, i) => { const o = add(new T.TorusGeometry(0.62, 0.025, 6, 48), null, 0, 1.05, 0); o.rotation.set(1.2, r, 0); spin.push([o, 0, 0.7 + i * 0.25]); });
        add(new T.CylinderGeometry(0.05, 0.2, 0.62, 8), null, 0, 0.31, 0);
        break;
      }
      default: { // 社会
        const py = add(new T.ConeGeometry(0.75, 1.15, 4), null, -0.1, 0.58, -0.05); py.rotation.y = Math.PI / 4;
        add(new T.BoxGeometry(0.14, 1.0, 0.14), null, 0.6, 0.5, 0.42);
        add(new T.ConeGeometry(0.1, 0.18, 4), wire, 0.6, 1.09, 0.42);
      }
    }
    return { group: g, spin };
  }

  function create(order, colors) {
    if (!T) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement; canvas.className = 't3d-canvas';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '陣地の3Dマップ');

    const scene = new T.Scene();
    scene.fog = new T.Fog(0x060a14, 14, 30);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 100);
    scene.add(new T.AmbientLight(0x8090c0, 0.55));
    const sun = new T.DirectionalLight(0xffffff, 0.9); sun.position.set(4, 9, 6); scene.add(sun);
    const grid = new T.GridHelper(40, 40, 0x2c3a61, 0x182240); grid.position.y = -0.2; scene.add(grid);

    const C = { me: new T.Color(colors.me), op: new T.Color(colors.op), neutral: new T.Color(NEUTRAL), white: new T.Color('#ffffff') };
    const n = order.length;
    const sites = order.map((subject, i) => {
      const root = new T.Group();
      const t = n > 1 ? i / (n - 1) - 0.5 : 0;
      root.position.set(t * 2.7 * (n - 1), 0, -Math.abs(t) * 2.4 + 0.6);
      const base = new T.Mesh(new T.CylinderGeometry(1.1, 1.28, 0.34, 6), new T.MeshStandardMaterial({ color: 0x1a2340, metalness: 0.6, roughness: 0.45 }));
      base.position.y = -0.02; root.add(base);
      const edgeMat = new T.MeshBasicMaterial({ color: C.neutral.clone() });
      const edge = new T.Mesh(new T.RingGeometry(1.06, 1.2, 6), edgeMat); edge.rotation.x = -Math.PI / 2; edge.rotation.z = Math.PI / 6; edge.position.y = 0.16; root.add(edge);
      const mat = new T.MeshStandardMaterial({ color: 0xd4dcf2, metalness: 0.35, roughness: 0.35, emissive: C.neutral.clone(), emissiveIntensity: 0.25 });
      const wire = new T.MeshStandardMaterial({ color: C.neutral.clone(), emissive: C.neutral.clone(), emissiveIntensity: 0.9, wireframe: true });
      const st = structure(subject, mat, wire); st.group.position.y = 0.16; root.add(st.group);
      const beamMat = new T.MeshBasicMaterial({ color: C.neutral.clone(), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const beam = new T.Mesh(new T.CylinderGeometry(0.1, 0.32, 7, 16, 1, true), beamMat); beam.position.y = 3.6; root.add(beam);
      const light = new T.PointLight(C.neutral.getHex(), 0.6, 4.5); light.position.y = 1.4; root.add(light);
      const tag = label(subject); tag.position.y = 2.45; root.add(tag);
      const mark = new T.Mesh(new T.OctahedronGeometry(0.16, 0), new T.MeshBasicMaterial({ color: C.me.clone() })); mark.position.set(0, 1.95, 0); mark.visible = false; root.add(mark);
      scene.add(root);
      return { subject, root, edgeMat, mat, wire, beamMat, light, st, mark, target: C.neutral.clone(), cur: C.neutral.clone(), state: 'pending', pop: 0, dim: 0 };
    });

    let az = 0, drag = null, raf = 0, alive = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, az }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag) az = Math.max(-0.9, Math.min(0.9, drag.az - (e.clientX - drag.x) / 220)); });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

    function resize() {
      const host = canvas.parentElement; if (!host) return;
      const w = host.clientWidth || 300, h = host.clientHeight || 200;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = 38; camera.updateProjectionMatrix();
    }

    function setState(states, focus) {
      sites.forEach((s, i) => {
        const st = states[i] || 'pending';
        if (st !== s.state && (st === 'me' || st === 'op')) s.pop = 1;
        s.state = st;
        s.target.copy(st === 'me' ? C.me : st === 'op' ? C.op : st === 'active' ? C.white : C.neutral);
        s.dim = st === 'none' ? 1 : 0;
        s.mark.visible = !!focus && focus.me === s.subject;
      });
    }

    const clock = new T.Clock();
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!canvas.isConnected) return;
      const dt = Math.min(0.05, clock.getDelta() || 0.016), t = clock.elapsedTime;
      const sway = reduce ? 0 : Math.sin(t * 0.18) * 0.12;
      const aspect = camera.aspect || 1.6, R = Math.min(17, 10.8 * Math.max(1, 1.45 / aspect));
      camera.position.set(Math.sin(az + sway) * R, 5.2 + R * 0.28, Math.cos(az + sway) * R);
      camera.lookAt(0, 0.6, -0.6);
      sites.forEach((s, i) => {
        s.cur.lerp(s.target, 0.08);
        const active = s.state === 'active', owned = s.state === 'me' || s.state === 'op';
        s.edgeMat.color.copy(s.cur);
        s.mat.emissive.copy(s.cur); s.mat.emissiveIntensity = owned ? 0.45 : active ? 0.35 : 0.18;
        s.wire.color.copy(s.cur); s.wire.emissive.copy(s.cur);
        s.light.color.copy(s.cur); s.light.intensity = owned ? 1.4 : active ? 1.0 + Math.sin(t * 6) * 0.4 : 0.35;
        s.beamMat.color.copy(s.cur);
        s.beamMat.opacity = owned ? 0.35 : active ? 0.25 + Math.sin(t * 6) * 0.15 : 0;
        s.mat.color.setScalar(s.dim ? 0.35 : 0.85);
        s.pop = Math.max(0, s.pop - dt * 1.6);
        const sc = 1 + Math.sin(s.pop * Math.PI) * 0.28;
        s.st.group.scale.setScalar(sc);
        if (!reduce) {
          s.st.spin.forEach(([o, sx, sy]) => { o.rotation.x += sx * dt; o.rotation.y += sy * dt; });
          s.st.group.position.y = 0.16 + Math.sin(t * 1.2 + i) * 0.04;
          s.mark.rotation.y += dt * 2;
        }
      });
      renderer.render(scene, camera);
    }
    frame();

    function destroy() {
      alive = false; cancelAnimationFrame(raf);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
      canvas.remove();
    }
    return { canvas, resize, setState, destroy, key: order.join() + colors.me + colors.op };
  }

  window.Terrain3D = { create };
})();
