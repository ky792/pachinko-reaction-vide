"""検査済み（voice_gate 合格）の声だけを Remotion に取り込む

  python scripts/sync_voices.py <声の回フォルダ（feat/kyu001-voice の episodes/kyu001v2）> public/kyu001 [--tempo 1.1]

- <回>/reading/gate.json が合格で、各 wav の sha1 が gate.json と一致するものだけ取り込む（1行でも合わなければ止まる）
- 取り込むときは話速だけ変える（atempo。声の中身は足さない・変えない）
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
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src / 'voices' / f'{k}.wav'), '-af', f'atempo={a.tempo}', '-ar', '44100', '-ac', '1', str(out)], check=True)
    verified[k] = sha1(out)
(dst / '_verified.json').write_text(json.dumps({'source': str(src), 'tempo': a.tempo, 'files': verified}, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{len(verified)} 行を取り込んだ → {dst}')
