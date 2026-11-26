import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile
import os, sys

SR = 48000
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def filt(x, kind, f):
    sos = butter(4, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


def env_ad(n, a, d_curve=4.0):
    e = np.ones(n)
    na = max(1, int(SR * a))
    e[:na] = np.linspace(0, 1, na)
    rest = n - na
    if rest > 0:
        e[na:] = np.exp(-d_curve * np.linspace(0, 1, rest))
    return e


def sweep(f0, f1, d, exp=True):
    tt = t(d)
    if exp:
        f = f0 * (f1 / f0) ** (tt / d)
    else:
        f = f0 + (f1 - f0) * tt / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f


def reverb(x, wet=0.3, length=1.2):
    n = int(SR * length)
    ir = rng.standard_normal(n) * np.exp(-5 * np.linspace(0, 1, n))
    ir = filt(ir, "lowpass", 7000)
    y = np.convolve(x, ir)[: len(x) + n]
    y = np.concatenate([y, np.zeros(len(x) + n - len(y))])
    y = y / (np.max(np.abs(y)) + 1e-9)
    xx = np.concatenate([x, np.zeros(n)])
    return (1 - wet) * xx + wet * y * np.max(np.abs(x))


def stereo(x, width=0.004):
    d = int(SR * width)
    l = x
    r = np.concatenate([np.zeros(d), x[:-d]]) if d > 0 else x
    return np.stack([l, r], axis=1)


def shimmer(d, lo=3000, hi=9000, n=14, decay=5.0):
    tt = t(d)
    y = np.zeros_like(tt)
    for _ in range(n):
        f = rng.uniform(lo, hi)
        ph = rng.uniform(0, 2 * np.pi)
        start = rng.uniform(0, d * 0.25)
        e = np.where(tt >= start, np.exp(-decay * (tt - start) / d * rng.uniform(0.6, 1.4)), 0)
        y += np.sin(2 * np.pi * f * tt + ph) * e * rng.uniform(0.4, 1.0)
    return y / n


def save(name, x, rev=0.25, width=0.004):
    if rev > 0:
        x = reverb(x, rev)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    fade = int(SR * 0.01)
    x[-fade:] *= np.linspace(1, 0, fade)
    s = stereo(x, width) if x.ndim == 1 else x
    path = os.path.join(OUT, name + ".wav")
    wavfile.write(path, SR, (s * 32767).astype(np.int16))
    return x


# ---------- 1. charge ----------
def charge_a(d=0.3):
    s, _ = sweep(400, 2400, d)
    s2, _ = sweep(800, 4800, d)
    nz = filt(rng.standard_normal(len(s)), "highpass", 3000)
    e = np.linspace(0, 1, len(s)) ** 2
    return (0.6 * s + 0.25 * s2 + 0.15 * nz) * e


def charge_b(d=0.35):
    tt = t(d)
    f = 250 * (6) ** (tt / d)
    mod = np.sin(2 * np.pi * 30 * tt)  # tremolo
    car = np.sin(2 * np.pi * np.cumsum(f) / SR + 1.5 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR))
    e = (np.linspace(0, 1, len(tt)) ** 1.5) * (0.7 + 0.3 * mod)
    return car * e * 0.8


# ---------- 2. appear ----------
def low_bwom(d=0.8, f0=95, f1=55):
    s, _ = sweep(f0, f1, d)
    saw = filt(np.sign(s) * 0.5 + s, "lowpass", 400)
    return saw * env_ad(len(s), 0.005, 4.5)


def click(d=0.02):
    n = int(SR * d)
    return filt(rng.standard_normal(n), "highpass", 2000) * np.exp(-np.linspace(0, 12, n))


def pad(x, n):
    return np.concatenate([x, np.zeros(max(0, n - len(x)))])[:n]


def appear_a(d=1.0):  # シャリーン＋ブォン（基本形）
    n = int(SR * d)
    hi = shimmer(d, 3500, 9500, 18, 4.5)
    lo = pad(low_bwom(0.8), n)
    cl = pad(click(), n)
    return 0.55 * hi + 0.7 * lo + 0.5 * cl


def appear_b(d=1.2):  # ガラスのベル系（上品）
    tt = t(d)
    base = 1320
    ratios = [1, 2.76, 5.4, 8.93]
    y = sum(np.sin(2 * np.pi * base * r * tt) * np.exp(-tt * (3 + i * 2)) / (i + 1)
            for i, r in enumerate(ratios))
    sub = pad(low_bwom(0.7, 80, 50), len(tt))
    sh = shimmer(d, 5000, 11000, 10, 6)
    return 0.6 * y + 0.5 * sub + 0.35 * sh


def appear_c(d=0.9):  # デジタル・グリッチ系（SFっぽい）
    n = int(SR * d)
    tt = t(d)
    chord = sum(np.sin(2 * np.pi * f * tt) for f in [880, 1108.7, 1318.5, 1760])
    chord *= env_ad(n, 0.003, 5)
    # bitcrush
    steps = 12
    chord = np.round(chord * steps) / steps
    hold = 6
    chord = np.repeat(chord[::hold], hold)[:n]
    # glitch gating first 0.15s
    gate = np.ones(n)
    g = int(SR * 0.15)
    pattern = (rng.random(g // 400 + 1) > 0.35).astype(float)
    gate[:g] = np.repeat(pattern, 400)[:g]
    lo = pad(low_bwom(0.6, 110, 60), n)
    return 0.45 * chord * gate + 0.7 * lo + 0.4 * pad(click(), n)


# ---------- 3. data ----------
def data_blips(count=10, gap=0.07, seed=1):
    r = np.random.default_rng(seed)
    n = int(SR * (count * gap + 0.2))
    y = np.zeros(n)
    for i in range(count):
        f = r.choice([1760, 2093, 2349, 2637, 3136, 3520])
        bd = 0.035
        tt = t(bd)
        b = np.sin(2 * np.pi * f * tt) * np.exp(-tt / bd * 3)
        s = int(SR * i * gap)
        y[s:s + len(b)] += b * r.uniform(0.6, 1.0)
    return y


def data_ticks(count=16, gap=0.045):
    n = int(SR * (count * gap + 0.2))
    y = np.zeros(n)
    for i in range(count):
        c = click(0.012) * 1.0
        tone = np.sin(2 * np.pi * 4200 * t(0.012)) * np.exp(-np.linspace(0, 8, len(c)))
        s = int(SR * i * gap)
        y[s:s + len(c)] += 0.6 * c + 0.4 * tone
    return y


# ---------- 4. hum loop ----------
def hum(d=4.0):
    tt = t(d)
    f = 120  # integer cycles in 4s → seamless loop
    y = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt)
         + 0.15 * np.sin(2 * np.pi * 3 * f * tt) + 0.05 * np.sin(2 * np.pi * 15 * f * tt))
    y *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.5 * tt)  # 2 slow wobbles per loop
    return y


# ---------- 5. disappear ----------
def disappear_a(d=0.45):  # 吸い込まれる（逆再生シャリーン）
    sh = shimmer(d, 3000, 8000, 14, 5)[::-1]
    s, _ = sweep(1800, 200, d)
    e = np.linspace(1, 0, len(s)) ** 1.5
    return 0.6 * sh + 0.4 * s * e


def disappear_b(d=0.3):  # シュッと消える（短い）
    nz = rng.standard_normal(int(SR * d))
    tt = t(d)
    out = np.zeros_like(nz)
    # moving bandpass approximation: crossfade high→low
    hi = filt(nz, "highpass", 4000)
    lo = filt(nz, "bandpass", [500, 2000])
    k = tt / d
    out = hi * (1 - k) + lo * k
    return out * np.sin(np.pi * k) ** 2


files = {}
files["01_charge_A_hyuin"] = save("01_charge_A_hyuin", charge_a(), 0.15)
files["02_charge_B_buzz"] = save("02_charge_B_buzz", charge_b(), 0.15)
files["03_appear_A_shalin_bwom"] = save("03_appear_A_shalin_bwom", appear_a(), 0.3)
files["04_appear_B_glass"] = save("04_appear_B_glass", appear_b(), 0.35)
files["05_appear_C_digital"] = save("05_appear_C_digital", appear_c(), 0.2)
files["06_data_A_pipi"] = save("06_data_A_pipi", data_blips(), 0.15)
files["07_data_B_kakaka"] = save("07_data_B_kakaka", data_ticks(), 0.1)
h = hum()
h = h / np.max(np.abs(h)) * 0.89
wavfile.write(os.path.join(OUT, "08_hum_loop_4s.wav"), SR, (stereo(h, 0) * 32767).astype(np.int16))
files["09_disappear_A_suikomi"] = save("09_disappear_A_suikomi", disappear_a(), 0.25)
files["10_disappear_B_shu"] = save("10_disappear_B_shu", disappear_b(), 0.1)


# ---------- demo sequences ----------
def seq(parts, total):
    y = np.zeros(int(SR * total))
    for start, x, g in parts:
        s = int(SR * start)
        e = min(len(y), s + len(x))
        y[s:e] += x[: e - s] * g
    return y


def demo(charge, appear, data, disappear, name):
    hum_part = np.tile(h, 1)[: int(SR * 2.2)]
    hum_part = hum_part * np.minimum(1, np.linspace(0, 6, len(hum_part)))  # fade in
    hum_part[-int(SR * 0.3):] *= np.linspace(1, 0, int(SR * 0.3))
    y = seq([
        (0.0, files[charge], 0.8),
        (0.3, files[appear], 1.0),
        (0.5, hum_part, 0.12),
        (0.75, files[data], 0.45),
        (2.7, files[disappear], 0.8),
    ], 3.8)
    y = y / np.max(np.abs(y)) * 0.89
    wavfile.write(os.path.join(OUT, name + ".wav"), SR, (stereo(y, 0.003) * 32767).astype(np.int16))


demo("01_charge_A_hyuin", "03_appear_A_shalin_bwom", "06_data_A_pipi", "09_disappear_A_suikomi", "00_demo_A_kihon")
demo("01_charge_A_hyuin", "04_appear_B_glass", "06_data_A_pipi", "10_disappear_B_shu", "00_demo_B_jouhin")
demo("02_charge_B_buzz", "05_appear_C_digital", "07_data_B_kakaka", "10_disappear_B_shu", "00_demo_C_SF")
print("ok")
