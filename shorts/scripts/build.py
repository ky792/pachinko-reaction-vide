"""Shorts 1本ぶんのタイムラインを作る（声の長さから全部のタイミングが決まる）

  python shorts/scripts/build.py s001

読むもの
  shorts/episodes/<id>/episode.json   … 顔・モニター・間・効果音（演出）
  <voice_episode>/script/<script>.txt … セリフの文字（字幕）。台本が正
  shorts/public/<id>/voice/*.wav      … sync_voices.py で取り込んだ検査済みの声
書くもの
  shorts/src/data/<id>.json           … Remotion が読むタイムライン
"""
import hashlib
import json
import re
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SH = ROOT / 'shorts'
FPS = 30
RUBY = re.compile(r'《([^|》]+)\|([^》]*)》')
WHO = {'ナギ': 'nagi', 'バク': 'baku'}


def script_lines(path):
    out, n = [], 0
    for raw in path.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#') or s.startswith('@'):
            continue
        m = re.match(r'^(ナギ|バク)!?[:：]\s*(.+)$', s)
        if not m:
            sys.exit(f'読めない行: {raw}')
        n += 1
        out.append({'id': f'{path.stem}-{n:03d}', 'who': WHO[m.group(1)], 'text': RUBY.sub(r'\1', m.group(2))})
    return out


def read_wav(p):
    w = wave.open(str(p))
    sr, n = w.getframerate(), w.getnframes()
    a = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    if w.getnchannels() == 2:
        a = a.reshape(-1, 2).mean(1)
    return a, sr


def envelope(a, sr):
    hop = sr // FPS
    n = int(np.ceil(len(a) / hop))
    e = np.array([np.sqrt((a[i * hop:(i + 1) * hop] ** 2).mean() + 1e-12) for i in range(n)])
    e = e / (np.percentile(e, 95) + 1e-9)
    return [round(float(min(1.0, x)), 3) for x in e]


def main(eid, estimate=False):
    ep = json.loads((SH / 'episodes' / eid / 'episode.json').read_text(encoding='utf-8'))
    lines = {l['id']: l for l in script_lines(ROOT / ep['voice_episode'] / 'script' / f"{ep['script']}.txt")}
    vdir = SH / 'public' / eid / 'voice'
    ver = {} if estimate else json.loads((vdir / '_verified.json').read_text(encoding='utf-8'))['files']
    t, out = 0.0, []
    for i, d in enumerate(ep['lines']):
        sc = lines.get(d['id'])
        if not sc:
            sys.exit(f"台本に {d['id']} がない")
        wav = vdir / f"{d['id']}.wav"
        if estimate:   # 声ができる前の画面確認用（文字数から長さを推定。書き出しには使わない）
            dur, env = len(sc['text']) / 7.0, [0.5] * 400
        else:
            if hashlib.sha1(wav.read_bytes()).hexdigest() != ver.get(d['id']):
                sys.exit(f'{wav} は検査済みの声と一致しない（sync_voices.py で取り込み直す）')
            a, sr = read_wav(wav)
            dur, env = len(a) / sr, envelope(a, sr)
        t += d.get('pre', 0 if i == 0 else d.get('gap', ep['gap']))
        start = round(t * FPS)
        end = start + int(np.ceil(dur * FPS))
        t = end / FPS
        L = {**d, **sc, 'start': start, 'end': end, 'audio': f'{eid}/voice/{d["id"]}.wav', 'env': env}
        mon = L.get('monitor')
        if mon and 'big_at_end' in mon:
            mon['big_at'] = end - round(mon['big_at_end'] * FPS)
        if 'react' in L:
            L['react']['at'] = end - round(L['react']['at_end'] * FPS)
        out.append(L)
    if set(lines) - {l['id'] for l in out}:
        sys.exit(f'演出がない台本の行: {sorted(set(lines) - {l["id"] for l in out})}')
    voice_end = out[-1]['end']
    cta_start = voice_end + round(ep['tail'] * FPS)
    total = cta_start + round(ep['cta']['dur'] * FPS)
    bgm = dict(ep['bgm'])
    cut = next(l for l in out if l['id'] == bgm['cut_before'])
    prev = out[out.index(cut) - 1]
    bgm['cut_at'] = prev['end'] + 2
    data = {'estimate': estimate, 'id': eid, 'no': ep['no'], 'theme': ep['theme'], 'fps': FPS, 'total': total, 'cta_start': cta_start,
            'bgm': bgm, 'cta': ep['cta'], 'lines': out}
    dst = SH / 'src' / 'data' / f'{eid}.json'
    dst.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    print(f'{dst}  {total} フレーム（{total / FPS:.2f}秒）')
    for l in out:
        print(f"  {l['start'] / FPS:6.2f}-{l['end'] / FPS:6.2f} {l['who']:4} {l['text']}")


if __name__ == '__main__':
    main(sys.argv[1], '--estimate' in sys.argv)
