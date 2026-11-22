"""休憩室回：台本＋演出表＋音声wav から Remotion 用の JSON を作る（タイミングもここで全部決める）
  python scripts/build_kyu.py   （remotion/ で実行）
"""
import json, re, wave
from pathlib import Path
import numpy as np

FPS = 30
ROOT = Path(__file__).resolve().parent.parent
EP, WAV, OUT = ROOT / 'episodes/kyu001', ROOT / 'public/kyu001', ROOT / 'src/data/kyu001.json'
GAP, TITLE_LEN, EYE_LEN, TAIL, END_CARD = 5, 250, 46, 30, 120   # TITLE_LEN＝オープニング（ロゴ→キャラ紹介→回タイトル。src/Opening.tsx の OP_LEN と同じ）

lines = []
for raw in (EP / 'k01.txt').read_text(encoding='utf-8').splitlines():
    m = re.match(r'^(ナギ|バク)[:：]\s*(.+)$', raw.strip())
    if m:
        lines.append({'who': 'nagi' if m.group(1) == 'ナギ' else 'baku', 'text': re.sub(r'《([^|》]+)\|[^》]+》', r'\1', m.group(2))})
assert len(lines) == 109
# 字幕の改行は手で整えた版（reaction 版 episodes/kyu001v2）を使う
_rj = json.loads((ROOT / 'episodes/kyu001/telop.json').read_text(encoding='utf-8'))
for i, ln in enumerate(lines, 1):
    ln['text'] = _rj[str(i)]

# 表情（素材名）
FACE = """1 normal;2 surprised;3 normal;4 normal;5 surprised;6 smug;7 excited;8 excited;9 surprised;10 excited;11 confused;12 happy;13 smug;14 smug;15 angry;16 confused;17 happy;18 surprised;
19 happy;20 happy;21 happy;22 happy;23 smug;24 smug;25 surprised;26 confused;27 excited;28 excited;29 confused;30 smug;31 normal;32 angry;33 sweat;34 confused;35 surprised;36 confused;37 sweat;38 normal;39 smug;40 smug;
41 confused;42 smug;43 happy;44 happy;45 confused;46 excited;47 excited;48 confused;49 angry;50 smug;51 confused;52 happy;53 excited;54 happy;55 normal;56 smug;
57 happy;58 excited;59 happy;60 excited;61 excited;62 normal;63 normal;64 excited;65 smug;66 normal;67 happy;
68 confused;69 smug;70 excited;71 normal;72 happy;73 happy;74 excited;75 excited;76 happy;77 smug;78 normal;79 confused;80 happy;81 angry;82 angry;83 happy;84 smug;85 happy;
86 surprised;87 smug;88 surprised;89 confused;90 normal;91 smug;
92 happy;93 excited;94 happy;95 sweat;96 confused;97 excited;98 happy;99 excited;100 surprised;101 normal;102 sweat;103 smug;104 smug;105 happy;106 sweat;107 excited;108 happy;109 excited"""
FACE = {int(a): b for a, b in (p.split() for p in FACE.replace('\n', '').split(';'))}
# 強調（赤枠・揺れ）
PUNCH = {2, 5, 15, 18, 27, 32, 35, 42, 49, 86, 88, 106}
# 前の間（フレーム）
PRE = {3: 6, 9: 4, 15: 10, 31: 8, 37: 10, 49: 10, 50: 10, 65: 16, 66: 16, 80: 12, 89: 10, 98: 12, 100: 14, 101: 8, 103: 8, 105: 12, 107: 14}
# カメラの寄り（キャラ, 倍率）
FOCUS = {15: ('baku', 1.35), 31: ('nagi', 1.3), 32: ('baku', 1.45), 49: ('baku', 1.5), 50: ('nagi', 1.3), 65: ('baku', 1.3),
         95: ('baku', 1.3), 100: ('nagi', 1.4), 106: ('baku', 1.5), 3: ('nagi', 1.25), 56: ('nagi', 1.25)}
# 画面効果
FX = {7: 'lines', 8: 'lines', 10: 'lines', 27: 'lines', 46: 'lines', 47: 'lines', 58: 'lines', 61: 'lines', 64: 'lines', 74: 'lines', 75: 'lines',
      106: 'gloom', 81: 'dark', 82: 'dark'}
# 色付きのキーワード（字幕の中で強調）
KEY = {14: ['お金を入れ続ける'], 24: ['探偵'], 27: ['就活'], 32: ['圧迫面接'], 35: ['参加賞'], 46: ['試用期間'], 47: ['正社員'], 49: ['即クビ'],
       50: ['労働基準監督署'], 56: ['燃えるタイプ'], 40: ['両立'], 65: ['保留4個'], 84: ['ジャグラー'], 1: ['機械の修理'], 99: ['朝イチから'], 101: ['機械の修理'], 103: ['そんな日はない'], 104: ['立派な研究'], 105: ['所長']}
# 資料パネル：key → (最初の行, 最後の行)
PANELS = [('terms1', 7, 9), ('terms2', 10, 11), ('flow_intro', 19, 26), ('pixel_job', 27, 35), ('flow_at', 41, 44), ('pixel_job2', 45, 50),
          ('yuuri', 51, 54), ('flow_moments', 70, 72), ('flow_gyakuten', 73, 76), ('neq', 82, 83), ('peka', 84, 85)]
# パネル内の段階（その行から何段目まで出すか）。st=段階の開始行
STEP = {'job': {27: 0, 28: 3, 31: 3.5, 33: 4, 35: 5}, 'job2': {46: 1, 47: 2, 49: 3},
        'yuuri': {52: 1, 53: 2}}
CHAPTERS = [(1, '①', 'ふとした疑問'), (19, '②', '当てるまでが長い'), (41, '③', '当たってからも複雑'), (57, '④', 'パチンコは単純だから強い'),
            (68, '⑤', '複雑さは正義？'), (86, '⑥', '勉強と遊び'), (92, '⑦', '結局、勝ってるの？')]
SILENT_AFTER = {94: [('baku', 34, 'sweat'), ('nagi', 30, 'normal')], 100: [('baku', 40, 'sweat')]}


def envelope(path):
    w = wave.open(str(path)); sr = w.getframerate(); ch = w.getnchannels()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float).reshape(-1, ch).mean(1) / 32768
    n = int(np.ceil(len(a) / sr * FPS))
    env = [float(np.sqrt((a[int(f / FPS * sr):int((f + 1) / FPS * sr)] ** 2).mean() or 0)) for f in range(n)]
    pk = max(env) or 1
    return n, [round(min(1, e / pk * 1.3), 2) for e in env]


# 関門：検査済み（scripts/sync_voices.py で取り込んだ）声だけを使う。台本にない声が混ざった wav は使わない
import hashlib
_ver = json.loads((WAV / '_verified.json').read_text(encoding='utf-8'))['files'] if (WAV / '_verified.json').exists() else {}
_bad = [f'k01-{i:03d}' for i in range(1, len(lines) + 1)
        if _ver.get(f'k01-{i:03d}') != hashlib.sha1((WAV / f'k01-{i:03d}.wav').read_bytes()).hexdigest()]
if _bad:
    raise SystemExit(f'検査していない声がある：{_bad}。voice-check（trim: true）→ scripts/sync_voices.py で取り込み直す')

t = 12
out, chapters, title_at, bgm_cut, bgm_resume = [], [], None, None, None
ch_start = {c[0]: c for c in CHAPTERS}
for i, ln in enumerate(lines, 1):
    if i in ch_start and i != 1:
        no, mark, name = ch_start[i][0], ch_start[i][1], ch_start[i][2]
        chapters.append({'at': t, 'mark': mark, 'title': name}); t += EYE_LEN
    elif i == 1:
        chapters.append({'at': 0, 'mark': '①', 'title': 'ふとした疑問', 'noeye': True})
    t += PRE.get(i, 0)
    n, env = envelope(WAV / f'k01-{i:03d}.wav')
    item = {'id': f'k01-{i:03d}', 'n': i, 'who': ln['who'], 'text': ln['text'], 'face': FACE[i], 'start': t, 'end': t + n, 'env': env}
    if i in PUNCH: item['punch'] = True
    if i in FOCUS: item['focus'] = {'who': FOCUS[i][0], 'zoom': FOCUS[i][1]}
    if i in FX: item['fx'] = FX[i]
    if i in KEY: item['key'] = KEY[i]
    if i == 100: item['ochi'] = True      # オチの入口：バクの口すべりに「……朝から、ずっと？」
    if i == 107: bgm_resume = t
    out.append(item)
    t += n + GAP
    if i == 2:
        title_at = t; t += TITLE_LEN
    for who, d, face in SILENT_AFTER.get(i, []):
        if bgm_cut is None: bgm_cut = t
        out.append({'id': None, 'n': i + 0.5, 'who': who, 'text': '……', 'face': face, 'start': t, 'end': t + d, 'env': [], 'silent': True})
        t += d + GAP
end_card = t + 10
total = end_card + END_CARD + TAIL

by_n = {o['n']: o for o in out}
panels = []
for key, a, b in PANELS:
    seg = {'key': key, 'from': by_n[a]['start'] - 4, 'to': by_n[b]['end'] + 6, 'steps': []}
    for ln_no, st in sorted(STEP.get(key, {}).items()):
        seg['steps'].append({'at': by_n[ln_no]['start'], 'end': by_n[ln_no]['end'], 'v': st})
    if key in ('terms1', 'terms2', 'pachi'):
        seg['reveal'] = [by_n[a]['start'], by_n[a if key != 'terms1' else a + 1]['end']]
    panels.append(seg)

data = {'fps': FPS, 'total': total, 'title_at': title_at, 'end_card': end_card, 'bgm_cut': bgm_cut, 'bgm_resume': bgm_resume,
        'lines': out, 'chapters': chapters, 'panels': panels}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
print('total', total / FPS, 's', 'lines', len(out), 'title', title_at, 'cut', bgm_cut, 'resume', bgm_resume)
