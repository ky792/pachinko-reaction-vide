"""決め技アニメ（緑背景の GIF / 動画から書き出したコマ）を、ゲーム用のスプライトに変換する。

使い方: python3 tools/cut_anim.py 入力.gif キー(ja|ma|en|sc|so)
出力: assets/mechs/anim/{key}.webp   … コマを横一列に並べた本体（緑を抜いた透過）
      assets/mechs/anim/{key}_m.webp … マゼンタ部分（コア・技の光）のマスク。ゲーム側でチーム色を乗せる
      data/mech-anim.js             … コマ数・1 コマの大きさ・長さ
全コマで同じ切り抜き範囲（全コマの機体とエフェクトが入る最小の四角）を使うので、位置がぶれない。
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'mechs' / 'anim'


def key_green(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    d = g - np.maximum(r, b)
    alpha = 1 - np.clip((d - 30) / 80, 0, 1)
    out = rgb.copy(); out[..., 1] = np.where(d > 0, np.maximum(r, b), g)  # 緑かぶりを消す
    return out, alpha


def main():
    src, key = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    frames, durs = [], []
    for f in ImageSequence.Iterator(im):
        frames.append(np.asarray(f.convert('RGB'))); durs.append(f.info.get('duration', 100) or 100)
    keyed = [key_green(f) for f in frames]
    any_a = np.zeros(frames[0].shape[:2], bool)
    for _, a in keyed: any_a |= a > 0.15
    ys, xs = np.where(any_a)
    y0, y1, x0, x1 = max(0, ys.min() - 2), min(any_a.shape[0], ys.max() + 3), max(0, xs.min() - 2), min(any_a.shape[1], xs.max() + 3)
    w, h, n = x1 - x0, y1 - y0, len(frames)
    body = Image.new('RGBA', (w * n, h)); mask = Image.new('RGBA', (w * n, h))
    for i, (rgb, a) in enumerate(keyed):
        rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
        r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
        mag = np.clip((np.minimum(r, b) - g - 25) / 60, 0, 1) * (np.abs(r - b) < 110)  # コア・技のピンクの光
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        base = rgb.astype(float)
        for k in range(3): base[..., k] = base[..., k] * (1 - mag) + np.clip(lum * 0.5 + 128, 0, 255) * mag
        body.paste(Image.fromarray(np.dstack([base.astype(np.uint8), (a * 255).astype(np.uint8)]), 'RGBA'), (i * w, 0))
        m = (mag * a * 255).astype(np.uint8)
        mask.paste(Image.fromarray(np.dstack([np.full_like(m, 255)] * 3 + [m]), 'RGBA'), (i * w, 0))
    OUT.mkdir(parents=True, exist_ok=True)
    body.save(OUT / f'{key}.webp', quality=86, method=6); mask.save(OUT / f'{key}_m.webp', quality=80, method=6)
    man_path = OUT / 'manifest.json'
    man = json.loads(man_path.read_text()) if man_path.exists() else {}
    man[key] = {'w': int(w), 'h': int(h), 'n': n, 'ms': int(sum(durs))}
    man_path.write_text(json.dumps(man, indent=1))
    (ROOT / 'data' / 'mech-anim.js').write_text('/* tools/cut_anim.py が生成。決め技アニメのスプライト（無い機体は今の絵で演出） */\nwindow.MECH_ANIM = ' + json.dumps(man) + ';\n', encoding='utf-8')
    print(key, f'{w}x{h}', n, 'frames', sum(durs), 'ms')


if __name__ == '__main__':
    main()
