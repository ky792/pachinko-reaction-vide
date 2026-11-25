"""「ナギの45秒解析」の共通効果音を作る（numpy だけ・著作権のない自作音）

  python shorts/scripts/make_series_se.py
→ shorts/public/series/nagi45/ に timer_start / timer_beep30 / timer_count / complete、
  shorts/public/se/ に boom / boing / kira / whoosh / thump / zoom
"""
import wave
from pathlib import Path
import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parents[1] / 'public'


def save(path, x, gain=0.8):
    x = np.asarray(x, np.float64)
    x = x / (np.abs(x).max() + 1e-9) * gain
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.005, r=0.1):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(f, d, kind='sq', a=0.004, r=0.06, vib=0):
    tt = t(d)
    ph = 2 * np.pi * np.cumsum(np.full(len(tt), f) * (1 + vib * np.sin(2 * np.pi * 7 * tt))) / SR
    x = np.sign(np.sin(ph)) * 0.6 + np.sin(ph) * 0.4 if kind == 'sq' else np.sin(ph)
    return x * env(len(tt), a, r)


def cat(*xs, gap=0.0):
    out = []
    for x in xs:
        out.append(x); out.append(np.zeros(int(SR * gap)))
    return np.concatenate(out)


def lowpass(x, k=40):
    return np.convolve(x, np.ones(k) / k, mode='same')


S = ROOT / 'series' / 'nagi45'
# 解析開始：上がっていく電子音＋シュワッ
up = cat(*[tone(f, 0.06, r=0.02) for f in (660, 880, 1100, 1320, 1760)], gap=0.01)
sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(300, 2400, int(SR * 0.5))) / SR) * np.linspace(1, 0, int(SR * 0.5)) * 0.5
x = np.zeros(int(SR * 0.9)); x[:len(up)] += up; x[int(SR * 0.35):int(SR * 0.35) + len(sweep)] += sweep
save(S / 'timer_start.wav', x)
# 残り30秒：短いピピッ
save(S / 'timer_beep30.wav', cat(tone(1800, 0.06, 'sin'), tone(1800, 0.06, 'sin'), gap=0.05), 0.6)
# 残り5秒からのカウント音
save(S / 'timer_count.wav', tone(1320, 0.09, 'sq', r=0.05), 0.55)
# 解析完了ジングル：ド・ミ・ソ・ド＋キラッ
notes = [1046.5, 1318.5, 1568.0]
j = cat(*[tone(f, 0.11, 'sq', r=0.04) for f in notes], gap=0.015)
fin = tone(2093, 0.6, 'sq', r=0.45) + tone(1568, 0.6, 'sin', r=0.45) * 0.6
save(S / 'complete.wav', np.concatenate([j, fin]), 0.75)

E = ROOT / 'se'
rng = np.random.default_rng(7)
# 爆発：ノイズ＋低音の落ち
n = int(SR * 1.3)
noise = lowpass(rng.standard_normal(n), 30) * np.exp(-t(1.3) * 3.2)
low = np.sin(2 * np.pi * np.cumsum(np.linspace(110, 35, n)) / SR) * np.exp(-t(1.3) * 2.5)
save(E / 'boom.wav', noise * 0.9 + low * 1.2, 0.95)
# ボヨーン：ビブラートで下がる
n = int(SR * 0.55)
f = np.linspace(520, 180, n) * (1 + 0.18 * np.sin(2 * np.pi * 14 * t(0.55)))
save(E / 'boing.wav', np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.005, 0.2), 0.7)
# キラーン：高い鈴の上昇
k = sum(tone(fq, 0.5, 'sin', r=0.4) * 0.5 for fq in (2637, 3136, 3951))
k2 = np.sin(2 * np.pi * np.cumsum(np.linspace(2000, 5000, int(SR * 0.25))) / SR) * np.linspace(1, 0, int(SR * 0.25)) * 0.4
x = np.zeros(int(SR * 0.7)); x[:len(k2)] += k2; x[int(SR * 0.08):int(SR * 0.08) + len(k)] += k
save(E / 'kira.wav', x, 0.6)
# シュッ（ズーム）
n = int(SR * 0.3)
w = rng.standard_normal(n) * np.sin(np.linspace(0, np.pi, n)) ** 2
w = w - lowpass(w, 6)
save(E / 'whoosh.wav', w, 0.55)
# ドンッ（顔面ズームのヒット）
n = int(SR * 0.35)
save(E / 'thump.wav', np.sin(2 * np.pi * np.cumsum(np.linspace(150, 45, n)) / SR) * np.exp(-t(0.35) * 9), 0.95)
print('ok')

# ───────── 45秒解析の時計UI（機械式）
C = S / 'clock'


def click(f0=3200, d=0.018, decay=320):
    tt = t(d)
    return (np.sin(2 * np.pi * f0 * tt) * 0.6 + rng.standard_normal(len(tt)) * 0.5) * np.exp(-tt * decay)


def place(buf, x, at):
    i = int(SR * at)
    buf[i:i + len(x)] += x[:max(0, len(buf) - i)]


# 秒針のカチッ（2段の金属音）
x = np.zeros(int(SR * 0.08)); place(x, click(3600), 0); place(x, click(2400, decay=260) * 0.6, 0.012)
save(C / 'tick.wav', x, 0.7)
# 起動：ゼンマイを巻くラチェット（だんだん速く）→ 起動のうなり → キンッ
n = int(SR * 1.3); x = np.zeros(n)
at = 0.0
for k in range(12):
    place(x, click(2800 + k * 60, decay=380) * 0.7, at); at += 0.075 - k * 0.0035
hum = np.sin(2 * np.pi * np.cumsum(np.linspace(60, 140, int(SR * 0.7))) / SR) * np.linspace(0, 1, int(SR * 0.7)) ** 2 * 0.5
place(x, hum, 0.55)
place(x, tone(2637, 0.45, 'sin', r=0.4) * 0.5 + tone(3951, 0.45, 'sin', r=0.4) * 0.25, 0.85)
save(C / 'boot.wav', x, 0.8)
# 歯車の微かな駆動音（ループ用・46秒）：低いうなり＋細かい歯の音
n = int(SR * 46); tt = np.arange(n) / SR
whir = lowpass(rng.standard_normal(n), 60) * 0.35 + np.sin(2 * np.pi * 52 * tt) * 0.08
teeth = np.zeros(n)
for k in np.arange(0, 46, 0.125):
    place(teeth, click(1800, d=0.01, decay=500) * 0.12, k)
save(C / 'gears_loop.wav', whir * (0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * tt)) + teeth, 0.5)
# 停止：ガチャン（低い金属音）→ ゼンマイがほどけて止まる
n = int(SR * 1.1); x = np.zeros(n)
clunk = (np.sin(2 * np.pi * np.cumsum(np.linspace(220, 90, int(SR * 0.25))) / SR) + lowpass(rng.standard_normal(int(SR * 0.25)), 8) * 0.6) * np.exp(-t(0.25) * 14)
place(x, clunk, 0)
at = 0.18
for k in range(9):
    place(x, click(2200 - k * 120, decay=300) * (0.6 - k * 0.05), at); at += 0.05 + k * 0.018
save(C / 'stop.wav', x, 0.85)
print('clock se ok')

# 警告音（ビーッ・ビーッ：2音を交互に）
al = []
for k in range(6):
    al.append(tone(1046 if k % 2 == 0 else 784, 0.16, 'sq', a=0.003, r=0.02))
    al.append(np.zeros(int(SR * 0.03)))
save(E / 'alarm.wav', np.concatenate(al), 0.6)
print('alarm ok')
