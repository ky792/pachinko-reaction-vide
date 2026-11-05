"""台本（ナギ:/バク: 形式）と音声wavから、Remotion用の lines.json を作る。

使い方: python scripts/build_lines.py <台本.txt> <wavフォルダ(public内)> <出力.json> [tempo]
- 《表記|読み》は表記だけを字幕に使う
- 音声の大きさ（30fps・tempo反映）を env に入れて、喋っているキャラの動きに使う
"""
import json, re, sys, wave
from pathlib import Path
import numpy as np

FPS = 30
script, wavdir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
tempo = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
prefix = script.stem.split('_', 1)[1] if script.stem.startswith('news') else script.stem

lines, show, n = [], None, 0
for raw in script.read_text(encoding='utf-8').splitlines():
    s = raw.strip()
    if s.startswith('@show'):
        show = s.split(None, 1)[1]
        continue
    m = re.match(r'^(ナギ|バク|所長)[:：]\s*(.+)$', s)
    if not m:
        continue
    n += 1
    wid = f'{prefix}-{n:03d}'
    text = re.sub(r'《([^|》]+)\|[^》]+》', r'\1', m.group(2))
    w = wave.open(str(wavdir / f'{wid}.wav'))
    sr, ch = w.getframerate(), w.getnchannels()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    a = a.reshape(-1, ch).mean(1) / 32768
    dur = len(a) / sr / tempo
    frames = int(np.ceil(dur * FPS))
    env = []
    for f in range(frames):
        i0 = int(f / FPS * tempo * sr)
        i1 = int((f + 1) / FPS * tempo * sr)
        seg = a[i0:i1]
        env.append(float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0)
    peak = max(env) or 1
    env = [round(min(1, e / peak * 1.3), 2) for e in env]
    lines.append({'id': wid, 'speaker': m.group(1), 'text': text, 'show': show,
                  'frames': frames, 'env': env})

out.write_text(json.dumps({'tempo': tempo, 'lines': lines}, ensure_ascii=False), encoding='utf-8')
print(len(lines), 'lines', round(sum(l['frames'] for l in lines) / FPS, 1), 's')
