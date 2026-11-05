"""ニュース回の台本フォルダ＋data_patch.json＋音声wav から、Remotion用のエピソードJSONを作る。

使い方:
  python scripts/build_episode.py episodes/news02 public/news02 src/data/news02.json

台本の書式（既存の lab と同じ）
  ナギ: セリフ / バク!: ツッコミ（強調）   《表記|読み》は表記だけを字幕に使う
  @chapter <id>          章（data_patch.json の chapters）
  @show <type>:<key>     モニターのパネル（flow / keyword / analysis / spec_table / versus）
  @clear                 パネルを消す
  @dir focus=baku zoom=1.6 pre=0.3   次のセリフでキャラに寄る・前に間をあける
  @hl 3 / @hl -          表の3番目（0始まり）を注目させる／解除

※ 音声は public/<回>/ に、話速を反映済みのwavを置く（ファイル名＝<台本名>-<連番>.wav）
"""
import json
import re
import sys
import wave
from pathlib import Path

import numpy as np

FPS = 30
epdir, wavdir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
patch = json.loads((epdir / 'data_patch.json').read_text(encoding='utf-8'))
HEADLINE_LINES = 2  # 最初の章の頭2セリフは「今回のニュース」見出し

LINE = re.compile(r'^(ナギ|バク|所長)(!?)[:：]\s*(.+)$')


def envelope(path: Path):
    w = wave.open(str(path))
    sr, ch = w.getframerate(), w.getnchannels()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    a = a.reshape(-1, ch).mean(1) / 32768
    frames = int(np.ceil(len(a) / sr * FPS))
    env = []
    for f in range(frames):
        seg = a[int(f / FPS * sr):int((f + 1) / FPS * sr)]
        env.append(float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0)
    peak = max(env) or 1
    return frames, [round(min(1, e / peak * 1.3), 2) for e in env]


lines = []
for script in sorted((epdir / 'script').glob('*.txt')):
    chapter, show, hl, pending_dir, n = None, None, None, {}, 0
    for raw in script.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith('@chapter'):
            chapter, show, hl = s.split()[1], None, None
            continue
        if s.startswith('@show'):
            show, hl = s.split(None, 1)[1], None
            continue
        if s.startswith('@clear'):
            show, hl = None, None
            continue
        if s.startswith('@hl'):
            v = s.split()[1]
            hl = None if v == '-' else int(v.split(',')[0].split('@')[0])
            continue
        if s.startswith('@dir'):
            for kv in s.split()[1:]:
                k, v = kv.split('=', 1)
                pending_dir[k] = v
            continue
        if s.startswith('@'):
            continue
        m = LINE.match(s)
        if not m:
            continue
        n += 1
        wid = f'{script.stem}-{n:03d}'
        frames, env = envelope(wavdir / f'{wid}.wav')
        text = re.sub(r'《([^|》]+)\|[^》]+》', r'\1', m.group(3))
        cur_show = show
        if not lines and n <= HEADLINE_LINES:
            cur_show = 'headline'
        elif chapter == 'gaiyou' and n <= HEADLINE_LINES:
            cur_show = 'headline'
        lines.append({
            'id': wid, 'chapter': chapter, 'speaker': m.group(1), 'tsukkomi': m.group(2) == '!',
            'text': text, 'show': cur_show, 'hl': hl,
            'focus': pending_dir.get('focus'), 'zoom': float(pending_dir.get('zoom', 1.0)),
            'pre': float(pending_dir['pre']) if 'pre' in pending_dir else None,
            'frames': frames, 'env': env,
        })
        pending_dir = {}

data = {'title': patch['title'], 'chapters': patch['chapters'],
        'panels': {k: patch.get(k, {}) for k in ('flow', 'keyword', 'analysis', 'spec_table', 'versus')},
        'lines': lines}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
total = sum(l['frames'] for l in lines) / FPS
print(f'{len(lines)} lines, voice {total:.1f}s')
