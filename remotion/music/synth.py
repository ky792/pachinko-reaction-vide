"""ナギバク研究所 BGM 用の小さなシンセエンジン（numpy / scipy だけで動く）

- 帯域制限オシレーター（polyBLEP の saw / square）、スーパーソウ、FM（エレピ・ベル）
- 時間変化するフィルター（ブロックごとに係数を更新するバイクアッド）
- ドラム（キック・スネア・クラップ・ハット・クラッシュ・シェイカー・タム）
- リバーブ（合成IRの畳み込み）、ピンポンディレイ、コンプ、サイドチェイン、EQ、ソフトクリップ
曲の中身（音符）は bgm_shinkai.py 側に書く。
"""
import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


# ---------------- オシレーター ----------------
def _blep(t, dt):
    out = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a]
    out[a] = x + x - x * x - 1
    b = t > 1 - dt
    x = (t[b] - 1) / dt[b]
    out[b] = x * x + x + x + 1
    return out


def phase_of(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    return ph, dt


def saw(freq, n, phase0=None):
    ph, dt = phase_of(freq, n, RNG.random() if phase0 is None else phase0)
    return (2 * ph - 1) - _blep(ph, dt)


def square(freq, n, pw=0.5, phase0=None):
    ph, dt = phase_of(freq, n, RNG.random() if phase0 is None else phase0)
    v = np.where(ph < pw, 1.0, -1.0)
    v += _blep(ph, dt)
    v -= _blep((ph - pw) % 1.0, dt)
    return v


def sine(freq, n, phase0=0.0):
    ph, _ = phase_of(freq, n, phase0)
    return np.sin(2 * np.pi * ph)


def supersaw(freq, n, voices=7, detune=0.18, spread=0.9):
    """左右に広がるスーパーソウ（L, R）"""
    L = np.zeros(n)
    R = np.zeros(n)
    offs = np.linspace(-1, 1, voices)
    for o in offs:
        cents = o * detune * 100 * (1 + 0.15 * abs(o))
        v = saw(np.asarray(freq) * 2 ** (cents / 1200), n)
        pan = 0.5 + 0.5 * o * spread
        g = 1.0 if o == 0 else 0.75
        L += v * g * np.cos(pan * np.pi / 2)
        R += v * g * np.sin(pan * np.pi / 2)
    return L / voices * 1.6, R / voices * 1.6


def fm(freq, n, ratio=1.0, index=2.0, index_env=None, fb=0.0):
    t = np.arange(n) / SR
    idx = index * (index_env if index_env is not None else 1.0)
    mod = np.sin(2 * np.pi * freq * ratio * t)
    return np.sin(2 * np.pi * freq * t + idx * mod)


def noise(n):
    return RNG.standard_normal(n)


# ---------------- エンベロープ ----------------
def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    """n サンプルのうち hold 秒鳴らして離す。r ぶんは n に含める"""
    hold = (n / SR - r) if hold is None else hold
    t = np.arange(n) / SR
    env = np.empty(n)
    a = max(a, 1e-4)
    env = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = t > hold
    if rel.any():
        lvl = env[np.argmax(rel)] if rel.any() else s
        env[rel] = lvl * np.exp(-(t[rel] - hold) / max(r / 4, 1e-4))
    return env


def expdec(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


# ---------------- フィルター ----------------
def biquad(kind, f0, q=0.707, gain_db=0.0):
    f0 = float(np.clip(f0, 20, SR * 0.45))
    w = 2 * np.pi * f0 / SR
    cw, sw = np.cos(w), np.sin(w)
    al = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.707, gain_db=0.0):
    b, a = biquad(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x)


def sweep(x, kind, f0_curve, q=0.707, block=128):
    """カットオフが時間で動くフィルター（f0_curve はサンプルごとの配列）"""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    f0_curve = np.broadcast_to(f0_curve, x.shape)
    for i in range(0, len(x), block):
        b, a = biquad(kind, f0_curve[i], q)
        seg, zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
        y[i:i + block] = seg
    return y


def lp24(x, f0_curve, q=0.8):
    return sweep(sweep(x, 'lp', f0_curve, q), 'lp', f0_curve, 0.6)


# ---------------- ドラム ----------------
def kick(vel=1.0, tone=1.0, length=0.45, punch=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 44 * tone + (150 * tone) * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.22 * length / 0.45))
    click = filt(noise(n), 'hp', 2500) * np.exp(-t / 0.004) * 0.35 * punch
    x = np.tanh((body + click) * 1.6) * vel
    return x


def snare(vel=1.0, length=0.28, tone=190):
    n = int(length * SR)
    t = np.arange(n) / SR
    body = (np.sin(2 * np.pi * tone * t) + 0.5 * np.sin(2 * np.pi * tone * 1.73 * t)) * np.exp(-t / 0.045)
    nz = filt(filt(noise(n), 'hp', 1800), 'lp', 9000) * np.exp(-t / 0.09)
    return np.tanh((0.55 * body + 0.8 * nz) * 1.3) * vel


def clap(vel=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022, 0.031]):
        m = t >= d
        env[m] += np.exp(-(t[m] - d) / (0.007 if k < 3 else 0.11))
    nz = filt(noise(n), 'bp', 1400, 1.2)
    return nz * env * vel * 0.9


_HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(vel=1.0, open_=False):
    length = 0.42 if open_ else 0.06
    n = int(length * SR)
    t = np.arange(n) / SR
    met = sum(square(f * 1.2, n, phase0=0.0) for f in _HAT_F) / 6
    x = filt(filt(filt(met * 0.6 + noise(n) * 0.5, 'hp', 7000), 'hp', 7000), 'hp', 6000)
    x = filt(x, 'peak', 10000, 1.0, 4)
    return x * np.exp(-t / (0.16 if open_ else 0.018)) * vel


def shaker(vel=1.0):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.03)
    return filt(noise(n), 'hp', 6000) * env * vel


def crash(vel=1.0, length=2.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    met = sum(square(f * 2.7, n) for f in _HAT_F) / 6
    x = filt(filt(noise(n) * 0.7 + met * 0.4, 'hp', 4000), 'hp', 4000)
    return x * np.exp(-t / (length / 4)) * vel


def tom(freq=110, vel=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t / 0.04))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.14) * vel


# ---------------- 楽器 ----------------
def epiano(notes, dur, vel=0.8):
    """FM エレピ（ローズ風）。notes は MIDI 番号のリスト → mono"""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f = mtof(m)
        ienv = 1.8 * np.exp(-t / 0.35) + 0.3
        tine = 0.25 * np.exp(-t / 0.05) * np.sin(2 * np.pi * f * 14 * t)
        v = np.sin(2 * np.pi * f * t + ienv * np.sin(2 * np.pi * f * t) + tine)
        env = adsr(n, 0.002, 0.9, 0.35, 0.25, hold=dur)
        out += v * env * (0.9 if m < 60 else 1.0)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 5.2 * t)
    return out * trem * vel / max(1, len(notes)) ** 0.6


def bell(m, dur, vel=0.7):
    """FM ベル／ヴィブラフォン風"""
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    ienv = 2.4 * np.exp(-t / 0.25)
    v = np.sin(2 * np.pi * f * t + ienv * np.sin(2 * np.pi * f * 3.5 * t))
    v += 0.3 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.15)
    env = adsr(n, 0.002, 0.6, 0.25, 0.5, hold=dur)
    vib = 1 + 0.12 * np.sin(2 * np.pi * 6 * t) * (t > 0.15)
    return v * env * vib * vel


def pluck_bass(m, dur, vel=1.0, cutoff=900, glide_from=None):
    """ファンクのシンセベース（saw+square、フィルターエンベロープ）"""
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    f = mtof(m) * np.ones(n)
    if glide_from is not None:
        f = mtof(m) + (mtof(glide_from) - mtof(m)) * np.exp(-t / 0.03)
    x = 0.65 * saw(f, n) + 0.45 * square(f, n, 0.42) + 0.6 * sine(f, n)
    fc = 120 + cutoff * vel * np.exp(-t / 0.09) + 80
    y = lp24(x, fc, 1.1)
    env = adsr(n, 0.002, 0.18, 0.6, 0.05, hold=dur)
    return np.tanh(y * env * 2.2) * vel * 0.6


def reese(m, dur, vel=1.0, cutoff=700):
    """重いリースベース（OP 用）"""
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    x = saw(f * 2 ** (-0.12 / 12), n) + saw(f * 2 ** (0.12 / 12), n) + 0.8 * sine(f / 2, n)
    y = lp24(x, cutoff + 600 * np.exp(-t / 0.12), 1.0)
    env = adsr(n, 0.003, 0.2, 0.85, 0.04, hold=dur)
    return np.tanh(y * env * 2.5) * vel * 0.55


def lead(m, dur, vel=0.8, bright=4500, glide_from=None):
    """スーパーソウ＋矩形のリード（L, R）"""
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.18) / 0.2, 0, 1))
    if glide_from is not None:
        f = f + (mtof(glide_from) - mtof(m)) * np.exp(-t / 0.035)
    L, R = supersaw(f, n, 7, 0.16)
    sq = 0.5 * square(f * 2, n, 0.3)
    fc = 1200 + bright * np.exp(-t / 0.4)
    L = lp24(L + sq, fc, 0.9)
    R = lp24(R + sq, fc, 0.9)
    env = adsr(n, 0.004, 0.35, 0.75, 0.25, hold=dur)
    return L * env * vel, R * env * vel


def pad(notes, dur, vel=0.5, cutoff=1800):
    n = int((dur + 1.0) * SR)
    L = np.zeros(n); R = np.zeros(n)
    for m in notes:
        l, r = supersaw(mtof(m), n, 5, 0.12, 1.0)
        L += l; R += r
    env = adsr(n, 0.6, 0.5, 0.85, 0.9, hold=dur)
    L = lp24(L, cutoff, 0.7) * env; R = lp24(R, cutoff, 0.7) * env
    k = vel / max(1, len(notes)) ** 0.7
    return L * k, R * k


def boing(m, vel=0.5):
    """ちょっとコミカルな「ぽよん」（ピッチが落ちる丸い音）"""
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.9 * np.exp(-t / 0.05)) * (1 - 0.35 * (t / 0.45))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR + 1.2 * np.sin(2 * np.pi * np.cumsum(f) / SR))
    return v * np.exp(-t / 0.12) * vel


def blip(m, vel=0.5, length=0.09):
    n = int(length * SR)
    t = np.arange(n) / SR
    return square(mtof(m), n, 0.25) * np.exp(-t / (length / 3)) * vel


def riser(length, f0=200, f1=9000, vel=0.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    curve = f0 * (f1 / f0) ** (t / length)
    x = sweep(noise(n), 'bp', curve, 1.4)
    return x * (t / length) ** 2 * vel


def impact(vel=1.0, length=2.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(38 + 80 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.9)
    nz = filt(noise(n), 'lp', 3000) * np.exp(-t / 0.25)
    return np.tanh((sub * 1.2 + nz * 0.4) * 1.5) * vel


# ---------------- ミックス ----------------
class Track:
    def __init__(self, n, name):
        self.L = np.zeros(n)
        self.R = np.zeros(n)
        self.name = name

    def add(self, t_sec, x, gain=1.0, pan=0.0):
        """x は mono 配列か (L, R)"""
        i = int(round(t_sec * SR))
        if isinstance(x, tuple):
            l, r = x
        else:
            l = r = x
        p = (pan + 1) / 2
        gl, gr = np.cos(p * np.pi / 2) * 1.414, np.sin(p * np.pi / 2) * 1.414
        if i < 0:
            l, r = l[-i:], r[-i:]
            i = 0
        m = min(len(l), len(self.L) - i)
        if m <= 0:
            return
        self.L[i:i + m] += l[:m] * gain * gl
        self.R[i:i + m] += r[:m] * gain * gr

    def apply(self, fn):
        self.L = fn(self.L)
        self.R = fn(self.R)


def make_ir(length=2.2, decay=0.7, hp=200, lp=7000, predelay=0.012):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = []
    for _ in range(2):
        x = noise(n) * np.exp(-t / (decay / 3)) * (1 - np.exp(-t / 0.004))
        x = filt(filt(x, 'hp', hp), 'lp', lp)
        x = np.concatenate([np.zeros(int(predelay * SR)), x])
        out.append(x / np.sqrt(np.sum(x ** 2)))
    return out


def reverb(L, R, ir, mix=0.2):
    wl = signal.fftconvolve(L, ir[0])[:len(L)]
    wr = signal.fftconvolve(R, ir[1])[:len(R)]
    return wl * mix, wr * mix


def pingpong(L, R, delay, fb=0.35, mix=0.25, lp=4000):
    d = int(delay * SR)
    n = len(L)
    oL = np.zeros(n); oR = np.zeros(n)
    srcL = filt(L + R, 'lp', lp) * 0.5
    g = 1.0
    for k in range(1, 7):
        sh = d * k
        if sh >= n:
            break
        tgt = oL if k % 2 else oR
        tgt[sh:] += srcL[:n - sh] * g
        g *= fb
    return oL * mix, oR * mix


def compress(L, R, thresh_db=-18, ratio=3.0, attack=0.005, release=0.12, makeup_db=0.0, block=64):
    x = np.maximum(np.abs(L), np.abs(R))
    nb = len(x) // block + 1
    pad_ = np.pad(x, (0, nb * block - len(x)))
    lvl = np.sqrt(np.mean(pad_.reshape(nb, block) ** 2, axis=1)) * 1.414 + 1e-9
    db = 20 * np.log10(lvl)
    gr = np.minimum(0, (thresh_db - db) * (1 - 1 / ratio))
    # attack / release の平滑化
    out = np.zeros(nb)
    ca = np.exp(-block / (attack * SR)); cr = np.exp(-block / (release * SR))
    g = 0.0
    for i in range(nb):
        c = ca if gr[i] < g else cr
        g = c * g + (1 - c) * gr[i]
        out[i] = g
    gain = 10 ** ((np.repeat(out, block)[:len(x)] + makeup_db) / 20)
    return L * gain, R * gain


def duck_curve(n, hits_sec, depth=0.6, release=0.18):
    """キックに合わせたサイドチェイン（音量カーブ）"""
    g = np.ones(n)
    t = np.arange(n) / SR
    for h in hits_sec:
        i = int(h * SR)
        if i >= n:
            continue
        seg = t[i:] - h
        g[i:] = np.minimum(g[i:], 1 - depth * np.exp(-seg / release) * np.clip(seg / 0.004, 0, 1))
    return g


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def limiter(L, R, ceiling_db=-1.0):
    c = 10 ** (ceiling_db / 20)
    L, R = compress(L, R, thresh_db=ceiling_db - 4, ratio=8, attack=0.001, release=0.08, block=32)
    pk = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-9)
    if pk > c:
        L, R = soft_clip(L / pk * c * 1.05, 1.2) * c, soft_clip(R / pk * c * 1.05, 1.2) * c
    return L, R


def write_wav(path, L, R):
    from scipy.io import wavfile
    x = np.stack([L, R], axis=1)
    x = np.clip(x, -1, 1)
    wavfile.write(path, SR, (x * 32767).astype(np.int16))
