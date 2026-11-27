/* ==========================================================
 * 外部素材マニフェスト
 * ----------------------------------------------------------
 * 画像生成AIなどで作った素材は assets/img/ に置き、下の表に
 * パスを書くだけで差し替わります（null の間はプログラム描画）。
 * 素材の仕様（サイズ・ポーズ・向き）は docs/ASSETS.md を参照。
 * ========================================================== */
(function (MK) {
  'use strict';

  MK.ASSET_MANIFEST = {
    images: {
      // 背景（960x540 推奨）
      'bg.normal': null,        // 例: 'assets/img/bg_normal.png'
      'bg.cz': null,
      'bg.at': null,
      'bg.upper': null,
      // 魔王城（各Lv 640x480・透過PNG・下端中央が接地点）
      'castle.1': null, 'castle.2': null, 'castle.3': null, 'castle.4': null, 'castle.5': null,
      // 魔物（256x256・透過PNG・右向き・足元が下端中央）
      'monster.slime': null, 'monster.goblin': null, 'monster.skeleton': null,
      'monster.imp': null, 'monster.dragon': null,
      // 勇者パーティー（256x256・透過PNG・左向き）
      'hero.hero': null, 'hero.warrior': null, 'hero.mage': null, 'hero.priest': null,
      // 魔王カットイン（800x800・透過PNG・バストアップ）表情別
      'maou.grin': null, 'maou.laugh': null, 'maou.angry': null, 'maou.shock': null,
      // リール図柄（240x160・透過PNG）
      'sym.SEVEN': null, 'sym.BAR': null, 'sym.COIN': null, 'sym.REPLAY': null,
      'sym.SLIME': null, 'sym.SKULL': null, 'sym.CHEST': null,
      // ロゴ（1200x360・透過PNG）
      'logo.main': null, 'logo.rush': null, 'logo.upper': null,
    },
    // 効果音・BGM（mp3/ogg）。null の間は内蔵シンセ音
    sounds: {
      lever: null, start: null, stop: null, pay: null, rare: null, fanfare: null,
      hit: null, explode: null, levelup: null, alarm: null, win: null, lose: null,
      'bgm.normal': null, 'bgm.cz': null, 'bgm.at': null, 'bgm.upper': null,
    },
  };

  const imgs = {};
  const sounds = {};
  MK.Assets = {
    img(key) { return imgs[key] || null; },
    sound(key) { return sounds[key] || null; },
    load() {
      const m = MK.ASSET_MANIFEST;
      const jobs = [];
      Object.entries(m.images).forEach(([k, src]) => {
        if (!src) return;
        jobs.push(new Promise((res) => {
          const im = new Image();
          im.onload = () => { imgs[k] = im; res(); };
          im.onerror = () => { console.warn('[assets] 画像なし', src); res(); };
          im.src = src;
        }));
      });
      Object.entries(m.sounds).forEach(([k, src]) => {
        if (!src) return;
        const a = new Audio();
        a.src = src;
        a.preload = 'auto';
        sounds[k] = a;
      });
      return Promise.all(jobs);
    },
    // 画像があれば描いて true を返す（足元基準）
    drawIfAny(ctx, key, x, y, w, h, flip) {
      const im = imgs[key];
      if (!im) return false;
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -h, w, h);
      ctx.restore();
      return true;
    },
  };
})(window.MK);
