"""ナギの45秒解析：1本ぶんのタイムラインを作る（45秒タイマーに声を収める）

  python shorts/scripts/build45.py n45_001 [--estimate]

- 声：<voice_episode>/voices/<行ID>.wav のうち、voice_gate に合格して sha1 が一致するものだけ使う（1行でも違えば止まる）
- 話速：全体は tempo（既定1.1）。45秒の解析区間に入りきらないときだけ、その区間の行を max_tempo まで上げる（不自然な早口にしない）
- 余った時間は、hold を付けた行のあとに配って「間」にする（数字のドンのあと・リアクションのあと）
- タイマーは「解析開始」の声が終わった瞬間から 45秒×30fps＝1350フレームで、動画のフレームから計算するので音声とずれない
- fx（演出）は events（絶対フレーム）に直して Remotion に渡す
"""
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SH = ROOT / 'shorts'
FPS = 30
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import script_lines, envelope, last_pause  # noqa: E402


def sha1(p):
    return hashlib.sha1(Path(p).read_bytes()).hexdigest()


def wav_dur(p):
    w = wave.open(str(p))
    return w.getnframes() / w.getframerate()


def read(p):
    w = wave.open(str(p))
    a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return a, w.getframerate()


def main(eid, estimate=False):
    ep = json.loads((SH / 'episodes' / eid / 'episode.json').read_text(encoding='utf-8'))
    vep = ROOT / ep['voice_episode']
    script = {l['id']: l for l in script_lines(vep / 'script' / f"{ep['script']}.txt")}
    order = [d['id'] for d in ep['lines']]
    if set(script) != set(order):
        sys.exit(f'台本と演出の行が合わない：台本だけ {sorted(set(script) - set(order))}／演出だけ {sorted(set(order) - set(script))}')
    raw = {}
    if not estimate:
        gate = json.loads((vep / 'reading' / 'gate.json').read_text(encoding='utf-8'))
        if not gate.get('ok'):
            sys.exit(f'関門が不合格：{gate.get("failed")}')
        for k in order:
            src = vep / 'voices' / f'{k}.wav'
            if sha1(src) != gate['lines'][k]['sha1']:
                sys.exit(f'{k} は検査のあとで声が変わっている（voice-check を回し直す）')
            raw[k] = wav_dur(src)
    else:
        raw = {k: len(script[k]['text']) / 6.0 for k in order}

    tm = ep['timer']
    base = ep.get('tempo', 1.1)
    gap = ep.get('gap', 0.2)
    win = order[order.index(tm['first']):order.index(tm['last']) + 1]

    def gap_of(i, d):
        if i == 0:
            return 0.0
        return d.get('pre', d.get('gap', gap))

    # 解析区間に入るか：入らなければ区間の行だけ速くする
    need_fixed = tm.get('lead', 0.5) + tm.get('tail', 0.6) + sum(gap_of(order.index(k), ep['lines'][order.index(k)]) for k in win[1:])
    talk = sum(raw[k] for k in win)
    win_tempo = base
    room = tm['seconds'] - need_fixed
    if talk / base > room:
        win_tempo = talk / room
        if win_tempo > tm.get('max_tempo', 1.2):
            sys.exit(f'45秒に入らない：話速 {win_tempo:.3f} が必要（上限 {tm.get("max_tempo", 1.2)}）。台本の間（gap）を詰めるか、行を見直す')
    tempo = {k: (win_tempo if k in win else base) for k in order}
    print(f'話速：通常 {base}／解析区間 {win_tempo:.3f}（区間の声 {talk / win_tempo:.2f}秒）')

    # 声をそろえる（話速だけ変える。中身は足さない）
    vdir = SH / 'public' / eid / 'voice'
    vdir.mkdir(parents=True, exist_ok=True)
    dur, env = {}, {}
    for k in order:
        out = vdir / f'{k}.wav'
        if estimate:
            dur[k], env[k] = raw[k] / tempo[k], [0.5] * 600
            continue
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(vep / 'voices' / f'{k}.wav'), '-af', f'atempo={tempo[k]:.4f}', '-ar', '44100', '-ac', '1',
                        str(out)], check=True)
        a, sr = read(out)
        dur[k], env[k] = len(a) / sr, envelope(a, sr)

    lines, t = [], 0.0
    T0 = T1 = None
    for i, d in enumerate(ep['lines']):
        k = d['id']
        if k == tm['first']:
            t = T0 / FPS + tm.get('lead', 0.5)
        elif T1 is not None and order.index(k) == order.index(tm['last']) + 1:
            t = T1 / FPS + d.get('pre', 1.3)
        else:
            t += gap_of(i, d)
        start = round(t * FPS)
        end = start + int(np.ceil(dur[k] * FPS))
        t = end / FPS
        L = {**d, **script[k], 'start': start, 'end': end, 'audio': f'{eid}/voice/{k}.wav', 'env': env[k], 'tempo': round(tempo[k], 4)}
        lines.append(L)
        if k == tm['start_after']:
            T0 = end + 2
            T1 = T0 + tm['seconds'] * FPS
        if k == tm['last']:
            # 余りを hold に配る（区間内の hold 行のあとに間を足し、後ろの行をずらす）
            slack = T1 - round(tm.get('tail', 0.6) * FPS) - end
            wl = [x for x in lines if x['id'] in win]
            weights = [x.get('hold', 0) for x in wl]
            if slack > 0 and sum(weights) > 0:
                acc, shift = 0, {}
                for x, w in zip(wl, weights):
                    shift[x['id']] = acc
                    acc += round(slack * w / sum(weights))
                # hold は「その行のあと」に足すので、次の行から後ろにずらす
                moved, run = {}, 0
                for x, w in zip(wl, weights):
                    moved[x['id']] = run
                    run += round(slack * w / sum(weights))
                for x in wl:
                    x['start'] += moved[x['id']]
                    x['end'] += moved[x['id']]
                t = lines[-1]['end'] / FPS
            print(f'解析区間：{(T0) / FPS:.2f}〜{T1 / FPS:.2f}秒、最後の声の終わり {lines[-1]["end"] / FPS:.2f}秒（余り {slack / FPS:.2f}秒を間に配った）')
    if lines[-1]['end'] <= T1:
        sys.exit('オチの行が解析完了より前にある')

    # 大きい数字・リアクション
    for L in lines:
        m = L.get('monitor')
        if m and 'big' in m:
            if m.get('big_at') == 'start' or m.get('big_at_start'):
                m['big_at'] = L['start'] + 2
            else:
                g = last_pause(L['env'])
                m['big_at'] = L['start'] + g if g is not None else L['end'] - round(m.get('big_at_end', 1.0) * FPS)
        if 'react' in L:
            r = L['react']
            r['at'] = L['start'] + round(r.get('at_start', 0) * FPS) if 'at_start' in r else L['end'] - round(r.get('at_end', 0.5) * FPS)

    # fx → events
    events = []
    by = {L['id']: L for L in lines}
    for L in lines:
        for fx in L.get('fx', []):
            at = fx.get('at', 0)
            f0 = L['end'] + round(fx.get('after_end', 0) * FPS) if at == 'end' else L['start'] + round(at * FPS)
            if fx.get('dur') == 'line':
                f1 = L['end'] + round(fx.get('extra', 0) * FPS)
            else:
                f1 = f0 + round(fx.get('dur', 1.0) * FPS)
            if fx.get('until'):
                f1 = by[fx['until']]['end'] + round(fx.get('extra', 0) * FPS)
            events.append({**fx, 'f0': f0, 'f1': max(f1, f0 + 1)})
    for fx in ep.get('timer_end_fx', []):
        f0 = T1 + round(fx.get('at', 0) * FPS)
        events.append({**fx, 'f0': f0, 'f1': f0 + round(fx.get('dur', 1.0) * FPS)})

    end_at = lines[-1]['end'] + round(ep.get('black_after', 0.05) * FPS)
    total = end_at + round(ep.get('black_hold', 0.8) * FPS)

    # BGM：リズムが入るところから、ループ区間を回して全編ぶん。オチの最後（暗転）で止める
    bgm = dict(ep['bgm'])
    bed = SH / 'public' / eid / 'bgm_bed.wav'
    a0, a1 = bgm.get('start', 0.0), bgm.get('loop_end')
    src = SH / 'public' / bgm['file']
    seg = SH / 'public' / eid / '_bgm_seg.wav'
    trim = f"atrim={a0}:{a1}," if a1 else f"atrim=start={a0},"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', trim + 'asetpts=N/SR/TB,afade=t=in:d=0.02', '-ar', '48000', '-ac', '2', str(seg)], check=True)
    T, stop = total / FPS, end_at / FPS
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-stream_loop', '-1', '-i', str(seg), '-t', f'{T:.3f}', '-af',
                    f"volume={bgm['gain']},volume='if(lt(t,{stop:.3f}),1,0)':eval=frame", '-ar', '48000', '-ac', '2', str(bed)], check=True)
    seg.unlink()
    bgm['bed'] = f'{eid}/bgm_bed.wav'
    bgm['cut_at'] = end_at

    data = {'estimate': estimate, 'id': eid, 'no': ep['no'], 'title': ep['title'], 'theme': [ep['title']], 'note': ep.get('note'), 'fps': FPS, 'total': total,
            'cta_start': total + 9999, 'end_at': end_at, 'timer': {'start': T0, 'end': T1, 'seconds': tm['seconds']}, 'bgm': bgm, 'cta': {},
            'events': events, 'lines': lines}
    (SH / 'src' / 'data' / f'{eid}.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    print(f'{eid}: {total} フレーム（{total / FPS:.2f}秒）')
    for L in lines:
        mark = '  ←解析' if L['id'] in win else ''
        print(f"  {L['start'] / FPS:6.2f}-{L['end'] / FPS:6.2f} x{L['tempo']:.3f} {L['who']:4} {L['text']}{mark}")


if __name__ == '__main__':
    main(sys.argv[1], '--estimate' in sys.argv)
