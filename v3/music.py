"""章ごとに曲調を変える番組オリジナルBGM（numpy で合成。既存曲・既存機種の音は使わない）

  data.json の "music": {"<章の名前>": "<スタイル>", ...}   章の名前は @… chapter= の値。冒頭（章の前）は "OPENING"
  スタイル：lab / retro / ocean / epic / gold / battle / idol / speed / calm / edm / future / warm

  ・章の切り替わりで前の曲を0.5秒でフェードアウト → 章タイトルのあいだは無音 → 新しい曲を頭拍から
  ・セリフの間はBGMを自動で下げる（ダッキング）。声が無い所では少し上がる
  ・数字の「溜め」の間はドラムを止める（従来どおり）
"""
import numpy as np

SR = 44100
f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]

# 16分の並び：x＝鳴らす、o＝弱く
STYLES = {
    "lab":    dict(bpm=118, root=60, mode=MAJOR, prog=[0, 5, 3, 4], kick="x...x...x...x...", snare="....x.......x...",
                   hat="..x...x...x...x.", bass="x.x.x.x.x.x.x.x.", bass_w="square", pad="sine", arp="bell", arp_pat="...x...x...x...x",
                   lead=[4, None, 2, None, 0, None, 2, 4, 5, None, 4, None, 2, None, None, None], lead_w="square", lv=1.0),
    "retro":  dict(bpm=126, root=65, mode=MAJOR, prog=[0, 3, 4, 0], kick="x.....x.x.......", snare="....x.......x..o",
                   hat="x.x.x.x.x.x.x.x.", bass="x...x.x.x...x.x.", bass_w="tri", pad=None, arp="square", arp_pat="xxxxxxxxxxxxxxxx",
                   lead=[0, 2, 4, 7, 4, 2, 0, None, 1, 3, 5, 8, 5, 3, 1, None], lead_w="square", lv=0.9),
    "ocean":  dict(bpm=96, root=58, mode=MAJOR, prog=[0, 5, 1, 4], kick="x.........x.....", snare="....x.......x...",
                   hat="..o...o...o...o.", bass="x.....x...x.....", bass_w="sine", pad="organ", arp="bell", arp_pat="x..x..x...x..x..",
                   lead=[4, None, None, 5, 4, None, 2, None, 0, None, None, 2, 4, None, None, None], lead_w="sine", lv=1.0),
    "epic":   dict(bpm=132, root=50, mode=MINOR, prog=[0, 5, 2, 6], kick="x..x..x.x..x..x.", snare="....x.......x...",
                   hat="x.x.x.x.x.x.x.x.", bass="xxxxxxxxxxxxxxxx", bass_w="saw", pad="saw", arp="saw", arp_pat="x..x..x...x..x..",
                   lead=[7, None, None, 6, 7, None, 4, None, 5, None, None, 4, 2, None, None, None], lead_w="brass", tom=True, lv=1.0),
    "gold":   dict(bpm=124, root=52, mode=MINOR, prog=[0, 3, 5, 4], kick="x...x...x...x...", snare="....x.......x...",
                   hat="..x...x...x...x.", bass="x..x..x.x..x..x.", bass_w="saw", pad="saw", arp="bell", arp_pat="x.x.x.x.x.x.x.x.",
                   lead=[0, None, 4, None, 7, None, 6, 7, 9, None, 7, None, 4, None, None, None], lead_w="brass", lv=1.0),
    "battle": dict(bpm=144, root=57, mode=MINOR, prog=[0, 0, 5, 6], kick="x.x...x.x.x...x.", snare="....x.......x.x.",
                   hat="xxxxxxxxxxxxxxxx", bass="x.xxx.xxx.xxx.xx", bass_w="dist", pad="saw", arp=None, arp_pat="",
                   lead=[0, None, 0, 2, 3, None, 2, 0, 5, None, 3, None, 2, None, None, None], lead_w="dist", tom=True, lv=0.9),
    "idol":   dict(bpm=150, root=62, mode=MAJOR, prog=[3, 4, 2, 5], kick="x...x...x...x...", snare="....x.......x...",
                   hat="..x...x...x...x.", clap="....x.......x...", bass="x.xxx.xxx.xxx.xx", bass_w="square", pad="saw", arp="square",
                   arp_pat="x.x.x.x.x.x.x.x.", lead=[4, 4, 5, 4, 2, None, 0, 2, 4, None, 7, None, 5, 4, None, None], lead_w="square", lv=0.9),
    "speed":  dict(bpm=174, root=55, mode=MINOR, prog=[0, 5, 3, 4], kick="x.........x.....", snare="....x.......x...",
                   hat="xxxxxxxxxxxxxxxx", bass="x.x.x.x.x.x.x.x.", bass_w="saw", pad="sine", arp="square", arp_pat="xxxxxxxxxxxxxxxx",
                   lead=[0, None, 3, None, 4, None, 7, None, 6, None, 4, None, 3, None, None, None], lead_w="square", lv=0.85),
    "calm":   dict(bpm=88, root=57, mode=MINOR, prog=[0, 5, 3, 6], kick="x.......x.......", snare="........x.......",
                   hat="....o.......o...", bass="x.......x.......", bass_w="sine", pad="organ", arp="bell", arp_pat="x...x...x...x...",
                   lead=[4, None, None, None, 2, None, None, None, 3, None, None, None, 0, None, None, None], lead_w="sine", lv=1.0),
    "edm":    dict(bpm=128, root=53, mode=MINOR, prog=[0, 5, 2, 6], kick="x...x...x...x...", snare="....x.......x...",
                   hat="..x...x...x...x.", clap="....x.......x...", bass="..x...x...x...x.", bass_w="saw", pad="saw", arp="pluck",
                   arp_pat="x.xx.x.xx.x.x.xx", lead=None, lead_w="square", side=True, lv=0.95),
    "future": dict(bpm=136, root=56, mode=MINOR, prog=[0, 3, 5, 4], kick="x...x...x...x...", snare="....x.......x...",
                   hat="xxxxxxxxxxxxxxxx", clap="....x.......x...", bass="x.xx.xx.x.xx.xx.", bass_w="saw", pad="saw", arp="pluck",
                   arp_pat="xxxxxxxxxxxxxxxx", lead=[7, None, 6, None, 4, None, 3, None, 4, None, None, 6, 7, None, None, None],
                   lead_w="square", side=True, lv=0.85),
    "warm":   dict(bpm=104, root=60, mode=MAJOR, prog=[3, 4, 2, 5], kick="x.......x.......", snare="....x.......x...",
                   hat="..x...x...x...x.", bass="x...x...x...x...", bass_w="sine", pad="organ", arp="bell", arp_pat="x..x..x..x..x...",
                   lead=[4, None, 5, None, 7, None, None, 4, 5, None, 4, None, 2, None, None, None], lead_w="bell", lv=1.0),
}


# ---------------------------------------------------------------- 楽器
def _osc(w, fr, t):
    ph = 2 * np.pi * fr * t
    if w == "sine":
        return np.sin(ph)
    if w == "square":
        return np.sign(np.sin(ph)) * 0.7
    if w == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if w == "saw":
        return sum(np.sin(ph * k) / k for k in range(1, 7)) * 0.6
    if w == "dist":
        return np.tanh(3 * (np.sin(ph) + 0.5 * np.sin(2 * ph))) * 0.6
    if w == "brass":
        return (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.33 * np.sin(3 * ph) + 0.2 * np.sin(4 * ph)) * 0.5
    if w == "organ":
        return (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(4 * ph)) * 0.6
    if w in ("bell", "pluck"):
        return np.sin(ph) + 0.4 * np.sin(2.76 * ph) * np.exp(-t * 12)
    return np.sin(ph)


def _note(w, m, dur, amp, attack=0.005, decay=None):
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    x = _osc(w, f(m), t)
    env = np.minimum(1, t / attack)
    if decay:
        env = env * np.exp(-t / decay)
    else:
        env = env * np.minimum(1, (dur - t) / 0.03).clip(0, 1)
    return (x * env * amp).astype(np.float32)


def _kick():
    n = int(0.32 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(50 + 110 * np.exp(-t * 30)) / SR) * np.exp(-t * 9)).astype(np.float32)


def _snare(rng):
    n = int(0.2 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(6) / 6, "same")
    return (hp * np.exp(-t * 20) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.5).astype(np.float32)


def _hat(rng, open_=False):
    n = int((0.18 if open_ else 0.05) * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(3) / 3, "same")
    return (hp * np.exp(-t * (14 if open_ else 60)) * 0.5).astype(np.float32)


def _clap(rng):
    n = int(0.22 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    env = sum(np.exp(-np.maximum(0, t - d) * 60) * (t >= d) for d in (0, 0.012, 0.024)) + np.exp(-t * 14) * 0.4
    return (noise * env * 0.35).astype(np.float32)


def _tom(m):
    n = int(0.4 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(f(m) * (1 + 0.6 * np.exp(-t * 20))) / SR) * np.exp(-t * 7)).astype(np.float32)


def _add(buf, x, a):
    if a >= len(buf) or a < 0:
        return
    m = min(len(x), len(buf) - a)
    buf[a:a + m] += x[:m]


# ---------------------------------------------------------------- 1つのスタイルで区間を作る
def render_style(name, dur, drum_gate=None, seed=0):
    st = STYLES[name]
    rng = np.random.default_rng(seed + 11)
    n = int(dur * SR)
    mel, drm = np.zeros(n, np.float32), np.zeros(n, np.float32)
    beat = 60 / st["bpm"]
    s16 = beat / 4
    bar = beat * 4
    sc = st["mode"]
    deg = lambda d, base: base + sc[d % 7] + 12 * (d // 7)
    kick, snare, hat, ohat, clap = _kick(), _snare(rng), _hat(rng), _hat(rng, True), _clap(rng)
    nbar = int(np.ceil(dur / bar))
    for bi in range(nbar):
        b0 = bi * bar
        cd = st["prog"][bi % len(st["prog"])]
        root = st["root"]
        chord = [deg(cd, root), deg(cd + 2, root), deg(cd + 4, root)]
        intro = bi < 2                     # 最初の2小節はドラム控えめ・リード無し（曲の入り）
        # パッド
        if st.get("pad"):
            for m in chord:
                x = _note(st["pad"], m, bar, 0.035, attack=0.25)
                if st.get("side"):            # 4つ打ちに合わせて揺らす（サイドチェイン風）
                    tt = np.arange(len(x)) / SR
                    x = x * (0.35 + 0.65 * np.minimum(1, (tt % beat) / (beat * 0.6)))
                _add(mel, x, int(b0 * SR))
        for k in range(16):
            a = int((b0 + k * s16) * SR)
            if a >= n:
                break
            # ベース
            if st["bass"][k] == "x":
                m = chord[0] - 12 - (12 if st["bass_w"] in ("sine", "tri") else 0) + (12 if (k // 2) % 2 and st["bass_w"] == "square" else 0)
                _add(mel, _note(st["bass_w"], m, s16 * 1.8, 0.075, decay=0.18), a)
            # アルペジオ
            if st.get("arp") and st["arp_pat"] and st["arp_pat"][k] == "x":
                m = chord[k % 3] + 12
                _add(mel, _note(st["arp"], m, s16 * 2.5, 0.03 if st["arp"] != "bell" else 0.035, decay=0.12), a)
            # リード（2小節のモチーフ。4小節ごとに1段上げて変化）
            if st.get("lead") and not intro and k % 2 == 0:
                d = st["lead"][(k // 2) + 8 * (bi % 2)] if len(st["lead"]) == 16 else None
                if d is not None:
                    m = deg(d + (2 if bi % 8 >= 4 else 0), root + 12)
                    _add(mel, _note(st["lead_w"], m, s16 * 1.9, 0.045, decay=0.35), a)
            # ドラム
            g = 0.55 if intro else 1.0
            if st["kick"][k] == "x":
                _add(drm, kick * 0.55 * g, a)
            if st["snare"][k] in "xo":
                _add(drm, snare * (0.32 if st["snare"][k] == "x" else 0.15) * g, a)
            if st.get("clap") and st["clap"][k] == "x":
                _add(drm, clap * 0.3 * g, a)
            if st["hat"][k] in "xo":
                _add(drm, hat * (0.13 if st["hat"][k] == "x" else 0.07) * g, a)
            if k == 14 and bi % 4 == 3:
                _add(drm, ohat * 0.12, a)
        if st.get("tom") and bi % 4 == 3:          # 4小節目の終わりにタムのフィル
            for j, m in enumerate((50, 47, 43, 40)):
                _add(drm, _tom(m) * 0.25, int((b0 + bar - beat + j * beat / 4) * SR))
    if drum_gate is not None:
        drm *= drum_gate[:n]
    out = (mel + drm) * st.get("lv", 1.0)
    return out


def duck(bgm, voice, depth=0.5):
    """声がある所でBGMを下げる（アタック30ms・リリース350ms）"""
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    env = uniform_filter1d(np.abs(voice), int(0.03 * SR))
    env = maximum_filter1d(env, int(0.35 * SR))
    env = uniform_filter1d(env, int(0.12 * SR))
    k = np.clip(env / 0.04, 0, 1)
    return bgm * (1 - depth * k)
