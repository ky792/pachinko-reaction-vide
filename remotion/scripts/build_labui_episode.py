"""研究所UI（LAB OS）の回を組む：台本フォルダ＋ui.json＋声 → Remotion用のJSON

使い方:
  python scripts/build_labui_episode.py episodes/shanfro public/ep/shanfro src/labui/ep/shanfro.json

台本の書式（lab と同じ。セリフの行IDも同じ付け方＝<ファイル名>-001…）
  ナギ: セリフ / バク!: ツッコミ          《表記|読み》は表記だけを字幕に使う
  @skit on|off                           寸劇（いまは通常の画面のまま）
  @title                                 OP：OP曲＋キャラ紹介×2＋新台解説ロゴ＋タイトル
  @chapter <番号> <タイトル>              章カード
  @show <種類>:<キー>                     data / donut / bar / versus / ren / sim / reel / verdict / result（中身は ui.json）
  @clear                                 パネルを消す
  @keyword <語>                          キーワード（次の2セリフのあいだ）
  @note <文>                             ナギの補足ノート（次のセリフのあいだ）
  @fx alert | @fx tsukkomi | @fx jack <大きい字>|<下の字>   次のセリフに割り込み（そのセリフの字幕は出さない）
  @pause <秒> / @shutter
声：<回>/voices/<行ID>.wav（finalize_lines.py 済み）を tempo 倍速にして public/…/v/ に置く。無ければ字数から長さを見積もる
"""
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

FPS = 30
epdir, pubdir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
conf = json.loads((epdir / 'ui.json').read_text(encoding='utf-8'))
TEMPO = conf.get('voice_tempo', 1.1)
GAP = conf.get('gap', 0.12)
pub_rel = pubdir.relative_to('public').as_posix()
(pubdir / 'v').mkdir(parents=True, exist_ok=True)

LINE = re.compile(r'^(ナギ|バク)(!?)[:：]\s*(.+)$')
WHO = {'ナギ': 'nagi', 'バク': 'baku'}


def display(s):
    return re.sub(r'《([^|》]+)\|[^》]+》', r'\1', s)


def wav_len(p):
    w = wave.open(str(p))
    n = w.getnframes() / w.getframerate()
    w.close()
    return n


def voice(lid, text):
    src = epdir / 'voices' / f'{lid}.wav'
    dst = pubdir / 'v' / f'{lid}.wav'
    if src.exists():
        if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', f'atempo={TEMPO}', '-ar', '48000', '-ac', '1', str(dst)], check=True)
        return wav_len(dst), f'{pub_rel}/v/{lid}.wav'
    return max(1.2, len(display(text)) / (8.5 * TEMPO)), None


F = lambda s: int(round(s * FPS))
PER_LINE = 18
HARD = 22


def split_subs(text):
    """字幕を作る：句読点（、。！？）の後ろで区切った塊を、1行18字・1枚2行に詰める。
    塊が18字を超えるときだけ、その中で切る"""
    toks = [x for x in re.split(r'(?<=[、。！？])', text) if x]
    pieces = []
    for tk in toks:   # 22字までの塊は切らない（字幕のほうで文字を少し小さくする）
        while len(tk) > HARD:
            pieces.append(tk[:PER_LINE]); tk = tk[PER_LINE:]
        pieces.append(tk)
    rows, cur = [], ''
    for pc in pieces:
        if cur and len(cur) + len(pc) > PER_LINE:
            rows.append(cur); cur = pc
        else:
            cur += pc
    if cur:
        rows.append(cur)
    return ['\n'.join(rows[i:i + 2]) for i in range(0, len(rows), 2)]

lines, events, subs = [], [], []
t = 0.6
cur_show = None
pending_fx = None
keyword = None
note = None
bgm_from = None


def close_show(at):
    global cur_show
    if cur_show:
        cur_show['to'] = F(at)
        cur_show = None


def sfx(at, se, vol=0.6):
    events.append({'type': 'sfx', 'from': F(at), 'to': F(at) + 1, 'se': se, 'seVol': vol})


for sc in sorted((epdir / 'script').glob('*.txt')):
    n = 0
    for raw in sc.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith('@'):
            cmd, _, arg = s[1:].partition(' ')
            arg = arg.strip()
            if cmd == 'title':
                close_show(t)
                op = conf['op']
                events.append({'type': 'song', 'from': F(t)})
                song_from = t
                for who in ('nagi', 'baku'):
                    events.append({'type': 'intro', 'who': who, 'from': F(t), 'to': F(t + op['intro'])})
                    sfx(t + 0.05, 'slash', 0.5)
                    t += op['intro']
                events.append({'type': 'logotitle', 'from': F(t), 'logoTo': F(t + op['logo']), 'to': F(t + op['logo'] + op['title'])})
                sfx(t + 0.1, 'slam', 0.8)
                sfx(t + op['logo'], 'slash', 0.6)
                t += op['logo'] + op['title'] + 0.3
                bgm_from = t
                conf['_song_from'] = song_from
            elif cmd == 'chapter':
                close_show(t)
                no, _, title = arg.partition(' ')
                if not title:
                    no, title = '', no
                events.append({'type': 'chapter', 'no': no, 'title': title, 'from': F(t), 'to': F(t + conf.get('chapter_dur', 2.6))})
                sfx(t, 'whoosh', 0.5)
                sfx(t + 0.25, 'slam', 0.45)
                t += conf.get('chapter_dur', 2.6) + 0.2
            elif cmd == 'show':
                close_show(t)
                kind = arg.split(':')[0]
                cur_show = {'type': 'show', 'kind': arg, 'from': F(t), 'to': None}
                events.append(cur_show)
                se = {'data': 'unfold', 'donut': 'unfold', 'bar': 'unfold', 'versus': 'unfold', 'ren': 'boot', 'sim': 'scan', 'reel': 'scan', 'verdict': 'slam', 'result': 'slam'}[kind]
                sfx(t + {'ren': 1.5, 'verdict': 0.25, 'result': 0.2}.get(kind, 0), se, 0.6)
                if kind == 'reel':
                    sfx(t + 2.1, 'slam', 0.8)
                if kind == 'sim':
                    sfx(t + 2.4, 'confirm', 0.7)
                if kind == 'ren':
                    sfx(t + 0.6, 'slam', 0.4)
                    sfx(t + 5.0, 'scan', 0.45)
                    sfx(t + 6.1, 'confirm', 0.7)
                    sfx(t + 8.7, 'slam', 0.85)
            elif cmd == 'clear':
                close_show(t)
            elif cmd == 'keyword':
                keyword = {'type': 'keyword', 'word': arg, 'from': F(t), 'left': 2}
                events.append(keyword)
                sfx(t, 'tick', 0.5)
            elif cmd == 'note':
                note = {'type': 'note', 'text': arg.replace('\\n', '\n'), 'from': F(t), 'left': 1}
                events.append(note)
            elif cmd == 'fx':
                kind, _, rest = arg.partition(' ')
                pending_fx = {'kind': kind, 'rest': rest}
            elif cmd == 'pause':
                t += float(arg)
            elif cmd == 'shutter':
                events.append({'type': 'shutter', 'from': F(t + 0.35), 'to': F(t + 0.7)})
                sfx(t, 'whoosh', 0.5)
                t += 0.8
            # skit / その他は今は何もしない
            continue
        m = LINE.match(s)
        if not m:
            raise SystemExit(f'{sc.name}: 読めない行 → {raw}')
        n += 1
        lid = f'{sc.stem}-{n:03d}'
        text = display(m.group(3))
        dur, src = voice(lid, m.group(3))
        ln = {'id': lid, 'who': WHO[m.group(1)], 'text': text, 'from': F(t), 'to': F(t + dur), 'src': src}
        if pending_fx:
            k = pending_fx['kind']
            ev = {'type': 'fx', 'kind': k, 'from': F(t - 0.12), 'to': F(t + dur + 0.5)}
            if k == 'jack':
                word, _, sub = pending_fx['rest'].partition('|')
                ev.update(word=word, sub=sub or text)
                sfx(t - 0.12, 'slash', 0.75)
            else:
                ev.update(text=text, face='surprised' if k == 'alert' else 'angry')
                if k == 'alert':
                    sfx(t - 0.12, 'alarm', 0.5)
                sfx(t, 'slash', 0.7)
            events.append(ev)
            ln['hide'] = True
            t += 0.5
            pending_fx = None
        lines.append(ln)
        parts = split_subs(text)
        total = sum(len(x) for x in parts)
        a = ln['from']
        for i, ptxt in enumerate(parts):
            b = ln['to'] if i == len(parts) - 1 else a + int((ln['to'] - ln['from']) * len(ptxt) / total)
            subs.append({'who': ln['who'], 'text': ptxt, 'from': a, 'to': b, 'cont': i > 0, 'last': i == len(parts) - 1, 'hide': ln.get('hide', False)})
            a = b
        t += dur + GAP
        for holder in ('keyword', 'note'):
            h = globals()[holder]
            if h:
                h['left'] -= 1
                if h['left'] <= 0:
                    h['to'] = F(t)
                    h.pop('left')
                    globals()[holder] = None

close_show(t + 0.4)
t += 1.2
for e in events:
    e.pop('left', None)
    if e.get('to') is None:
        e['to'] = F(t)
data = {
    'frames': F(t),
    'base': pub_rel,
    'song': {'src': conf['op']['song'], 'gain': conf['op'].get('song_gain', 0.6), 'from': F(conf.get('_song_from', 0))},
    'bgm': {'src': conf['bgm'], 'gain': conf.get('bgm_gain', 0.16), 'from': F(bgm_from or 0), 'to': F(t)},
    'lines': lines,
    'subs': subs,
    'events': events,
    'ui': conf['ui'],
    'intro': conf['intro'],
    'title': conf['title'],
}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
have = sum(1 for l in lines if l['src'])
print(f'{out}: {t:.1f}秒 / セリフ {len(lines)}（声あり {have}）/ 演出 {len(events)}')
