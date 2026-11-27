"""検査済み（voice_gate 合格）の声だけを Remotion に取り込む

  python scripts/sync_voices.py <声の回フォルダ（feat/kyu001-voice の episodes/kyu001v2）> public/kyu001 [--tempo 1.1]

- <回>/reading/gate.json が合格で、各 wav の sha1 が gate.json と一致するものだけ取り込む（1行でも合わなければ止まる）
- 取り込むときは話速だけ変える（atempo。声の中身は足さない・変えない）
- --max-pause を付けると、文中の長い無音だけをその秒数まで詰める（ニュース回#03・尺を12分以内にするため。話速は上げない）
- public/<回>/_verified.json に、取り込んだ wav の sha1 を書く。build_kyu.py はこれと一致しない wav があると止まる
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('dst')
ap.add_argument('--tempo', type=float, default=1.1)
ap.add_argument('--max-pause', type=float, default=0, help='文中の無音をこの秒数までに詰める（無音だけを削る。声は足さない・変えない）。0なら詰めない')
a = ap.parse_args()
src, dst = Path(a.src), Path(a.dst)
gate = json.loads((src / 'reading' / 'gate.json').read_text(encoding='utf-8'))
if not gate.get('ok'):
    sys.exit(f'関門が不合格の行がある：{gate.get("failed")}（{src}/reading/gate.md）')
bad = [k for k, v in gate['lines'].items() if not v.get('ok') or sha1(src / 'voices' / f'{k}.wav') != v.get('sha1')]
if bad:
    sys.exit(f'検査のあとで声が変わっている、または不合格：{bad}。voice-check（trim: true）を回し直す')
dst.mkdir(parents=True, exist_ok=True)
verified = {}
for k in sorted(gate['lines']):
    out = dst / f'{k}.wav'
    af = f'atempo={a.tempo}' if a.tempo != 1.0 else 'anull'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src / 'voices' / f'{k}.wav'), '-af', af, '-ar', '44100', '-ac', '1', str(out)], check=True)
    if a.max_pause > 0:
        import wave
        import numpy as np
        w = wave.open(str(out)); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16); w.close()
        hop = int(sr * 0.01); n = len(x) // hop
        e = np.array([np.sqrt((x[i * hop:(i + 1) * hop].astype(float) ** 2).mean()) for i in range(n)])
        quiet = e < np.sqrt((x.astype(float) ** 2).mean()) * 10 ** (-28 / 20)
        keep = np.ones(len(x), bool); i = 0
        while i < n:
            if quiet[i]:
                j = i
                while j < n and quiet[j]:
                    j += 1
                L = (j - i) * hop
                if i > 0 and j < n and L > a.max_pause * sr:   # 文中の無音だけ。真ん中を削って前後の余韻は残す
                    cut = L - int(a.max_pause * sr); st = i * hop + (L - cut) // 2
                    keep[st:st + cut] = False
                i = j
            else:
                i += 1
        y = x[keep]
        with wave.open(str(out), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes())
    verified[k] = sha1(out)
(dst / '_verified.json').write_text(json.dumps({'source': str(src), 'tempo': a.tempo, 'max_pause': a.max_pause, 'files': verified}, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(verified)} 行を取り込んだ → {dst}')
