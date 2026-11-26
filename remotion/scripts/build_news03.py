"""ニュース回#03（YOUTOPYA・研究所ステージ）：演出入り台本＋検査済み音声 → Remotion 用 JSON

  python scripts/build_news03.py      （remotion/ で実行）

台本：episodes/news03/script/*.txt（セリフ行は声の台本 feat/news03-voice と1文字も違わない）
  @chapter <印> <題>        章（左上のチップ）
  @show <パネル> [段]       モニターの表示を切り替える（段＝最初に出しておく段階）
  @step <段> [quiet]        いまのパネルを次の段階へ（quiet＝効果音なし：お金・依存の話の場面）
  @clear                    モニターを待機画面に戻す
  @title                    ニュースタイトル演出（この位置に約3秒）
  @silent <フレーム> [nagi=表情] [baku=表情] [look=…] [duck=1] [slow=1]   声のない間（字幕も声も出さない）
  @dir face=… look=… pre=… flat=1 duck=1   次のセリフの表情・視線・前の間
  @bgm ed                   ここからエンディングBGM
  @front                    バクがカメラの正面へ移動（次のセリフから）
  @bow                      最後のセリフのあと：お辞儀→ナギが見つめる→暗転
声は public/news03/<章>-<連番>.wav（scripts/sync_voices.py で検査済みのものだけ）。_verified.json と sha1 が合わないと止まる
"""
import hashlib, json, re, wave
from pathlib import Path
import numpy as np

FPS = 30
ROOT = Path(__file__).resolve().parent.parent
EP, WAV, OUT = ROOT / 'episodes/news03', ROOT / 'public/news03', ROOT / 'src/data/news03.json'
GAP = 7            # セリフ間（約0.23秒）
CH_GAP = 18        # 章の変わり目の間
TITLE_LEN = 100    # ニュースタイトル演出
SHOW_PAUSE = 8     # パネルが切り替わる行は少し待ってから話す
BOW_LEN = 150      # お辞儀→見つめる→暗転
HEAD = 12

verified = json.loads((WAV / '_verified.json').read_text(encoding='utf-8'))['files']


def envelope(path):
    w = wave.open(str(path)); sr = w.getframerate(); ch = w.getnchannels()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float).reshape(-1, ch).mean(1) / 32768
    frames = int(np.ceil(len(a) / sr * FPS))
    env = []
    for f in range(frames):
        seg = a[int(f / FPS * sr):int((f + 1) / FPS * sr)]
        env.append(float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0)
    peak = max(env) or 1
    return frames, [round(min(1, e / peak * 1.3), 2) for e in env]


def kv(tokens):
    d = {}
    for t in tokens:
        if '=' in t:
            k, v = t.split('=', 1); d[k] = v
        else:
            d[t] = '1'
    return d


cur = HEAD
lines, panels, steps, chapters, silents = [], [], [], [], []
title_at = None
bgm_ed = None
front_at = None
bow = None
panel = None          # {'key','from','step0'}
pending, pending_title, pending_show = {}, False, False

for script in sorted((EP / 'script').glob('*.txt')):
    n = 0
    first_in_file = True
    for raw in script.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith('@'):
            parts = s[1:].split()
            cmd, args = parts[0], parts[1:]
            if cmd == 'chapter':
                if lines:
                    cur += CH_GAP
                chapters.append({'at': cur, 'mark': args[0], 'title': ' '.join(args[1:])})
            elif cmd == 'show':
                if panel:
                    panel['to'] = cur
                panel = {'key': args[0], 'from': cur, 'to': None, 'step0': int(args[1]) if len(args) > 1 else 0}
                panels.append(panel); pending_show = True
            elif cmd == 'clear':
                if panel:
                    panel['to'] = cur
                panel = None
            elif cmd == 'step':
                steps.append({'key': panel['key'], 'panel': len(panels) - 1, 'v': int(args[0]), 'at': None, 'quiet': 'quiet' in args})
            elif cmd == 'title':
                title_at = cur; cur += TITLE_LEN
            elif cmd == 'silent':
                d = kv(args[1:])
                silents.append({'at': cur + 4, 'len': int(args[0]), **d})
                cur += 4 + int(args[0])
            elif cmd == 'dir':
                pending = kv(args)
            elif cmd == 'bgm' and args[0] == 'ed':
                bgm_ed = cur
            elif cmd == 'front':
                front_at = cur
            elif cmd == 'bow':
                bow = {'at': cur + 6, 'len': BOW_LEN}
                cur += 6 + BOW_LEN
            continue
        m = re.match(r'^(ナギ|バク)[:：]\s*(.+)$', s)
        if not m:
            raise SystemExit(f'{script.name}: 読めない行 {raw}')
        n += 1
        wid = f'{script.stem}-{n:03d}'
        wp = WAV / f'{wid}.wav'
        if verified.get(wid) != hashlib.sha1(wp.read_bytes()).hexdigest():
            raise SystemExit(f'{wid}: 検査済みの声と一致しない（sync_voices.py を通していない）')
        frames, env = envelope(wp)
        pre = int(float(pending.get('pre', 0)))
        if pending_show:
            pre = max(pre, SHOW_PAUSE); pending_show = False
        start = cur + pre
        for st in steps:
            if st['at'] is None:
                st['at'] = start
        text = re.sub(r'《([^|》]+)\|[^》]+》', r'\1', m.group(2))
        # 長いセリフは「。」で字幕を分ける（1枚は最大2〜3行）。表示の切り替えは文字数の比で
        sents = [x for x in re.split(r'(?<=[。？！])(?![」』）])', text) if x]
        parts, buf = [], ''
        for x in sents:
            if buf and len(buf) + len(x) > 34:
                parts.append(buf); buf = x
            else:
                buf += x
        if buf:
            parts.append(buf)
        tot = sum(len(x) for x in parts); acc = 0; pp = []
        for x in parts:
            pp.append({'text': x, 'at': start + round(frames * acc / tot)}); acc += len(x)
        lines.append({'parts': pp, 'id': wid, 'who': 'nagi' if m.group(1) == 'ナギ' else 'baku', 'text': text,
                      'face': pending.get('face', 'normal'), 'look': pending.get('look'), 'flat': pending.get('flat') == '1',
                      'duck': pending.get('duck') == '1', 'start': start, 'end': start + frames, 'env': env})
        pending = {}
        cur = start + frames + GAP

total = cur + 12
if panel and panel['to'] is None:
    panel['to'] = bow['at'] if bow else total
for p in panels:
    if p['to'] is None:
        p['to'] = total
data = {'total': total, 'title_at': title_at, 'bgm_ed': bgm_ed, 'front_at': front_at, 'bow': bow,
        'lines': lines, 'panels': panels, 'steps': [s for s in steps if s['at'] is not None], 'chapters': chapters, 'silents': silents}
OUT.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
# 確認用の静止画：タイトル・各パネルの最終段・無言の間・お辞儀
st = [lines[0]['start'] + 20, title_at + 60]
for i, p in enumerate(panels):
    st.append(max(p['from'] + 20, p['to'] - 15))
st += [s['at'] + s['len'] // 2 for s in silents]
if bow:
    st += [bow['at'] + 40]
(ROOT / 'src/data/news03_stills.json').write_text(json.dumps(sorted(set(st))), encoding='utf-8')
print(f'{len(lines)} 行 / {total} フレーム = {total / FPS / 60:.2f} 分 → {OUT}')
