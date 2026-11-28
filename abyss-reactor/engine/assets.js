/*
 * 素材管理
 *  - 機種ごとの manifest（machines/<id>/assets.js）を読み込み
 *  - 画像 / 動画 / スプライトシートを ID で参照
 *  - 未配置の素材は「仮素材（プロシージャル描画）」へ自動フォールバック
 *  - 表示位置・拡大率・再生時間は manifest 側で変更可能
 */
(function (NB) {
  'use strict';

  class AssetManager {
    constructor(manifest, opts = {}) {
      this.manifest = manifest || { items: [] };
      this.base = opts.base || '';
      this.items = new Map();
      for (const it of this.manifest.items) this.items.set(it.id, Object.assign({ status: 'pending', el: null }, it));
      this.fallbacks = new Map(); // id -> canvas（プロシージャル生成物）
    }

    load(onProgress) {
      if (typeof document === 'undefined') return Promise.resolve();
      const list = [...this.items.values()];
      let done = 0;
      return Promise.all(list.map((it) => new Promise((res) => {
        const fin = (ok) => { it.status = ok ? 'loaded' : 'missing'; done++; onProgress && onProgress(done / list.length); res(); };
        if (!it.src) return fin(false);
        if (it.type === 'video') {
          const v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = !!it.loop;
          v.oncanplaythrough = () => { v.oncanplaythrough = null; it.el = v; fin(true); };
          v.onerror = () => fin(false);
          setTimeout(() => { if (it.status === 'pending') fin(false); }, 4000);
          v.src = this.base + it.src;
        } else {
          const img = new Image();
          img.onload = () => { it.el = img; fin(true); };
          img.onerror = () => fin(false);
          img.src = this.base + it.src;
        }
      })));
    }

    /** 外部素材があれば返す。無ければ null（呼び出し側がフォールバック描画） */
    get(id) { const it = this.items.get(id); return it && it.status === 'loaded' ? it.el : null; }
    info(id) { return this.items.get(id); }
    has(id) { return !!this.get(id); }

    /** 仮素材を登録（スプライト生成器が作った canvas） */
    setFallback(id, canvas) { this.fallbacks.set(id, canvas); }
    /** 外部素材 or 仮素材 */
    image(id) { return this.get(id) || this.fallbacks.get(id) || null; }

    /** manifest 定義の配置で描画（x,y,w,h,scale,anchor） */
    draw(ctx, id, override = {}) {
      const it = this.items.get(id); const img = this.image(id); if (!img) return false;
      const p = Object.assign({}, it || {}, override);
      const s = p.scale ?? 1;
      const w = (p.w ?? img.width) * s, h = (p.h ?? img.height) * s;
      const ax = p.anchor ? p.anchor[0] : 0, ay = p.anchor ? p.anchor[1] : 0;
      ctx.drawImage(img, (p.x ?? 0) - w * ax, (p.y ?? 0) - h * ay, w, h);
      return true;
    }

    /** スプライトシートの 1 フレーム描画 */
    drawFrame(ctx, id, frame, x, y, w, h) {
      const it = this.items.get(id); const img = this.get(id); if (!img || !it.frames) return false;
      const cols = it.cols || it.frames, fw = img.width / cols, fh = img.height / Math.ceil(it.frames / cols);
      const f = frame % it.frames;
      ctx.drawImage(img, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, x, y, w, h);
      return true;
    }

    report() {
      const out = { loaded: [], missing: [] };
      for (const it of this.items.values()) (it.status === 'loaded' ? out.loaded : out.missing).push(it.id);
      return out;
    }
  }

  NB.AssetManager = AssetManager;
})(globalThis.NB);
