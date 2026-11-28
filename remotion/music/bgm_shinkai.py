"""ナギバク研究所 新台解説シリーズ専用BGM（2026-11-29）

  python3 remotion/music/bgm_shinkai.py            # 2曲とも書き出す
  python3 remotion/music/bgm_shinkai.py op         # オープニングだけ
  python3 remotion/music/bgm_shinkai.py loop       # 解説中BGMだけ

① shinkai_op.wav   … オープニング（145BPM・約14.6秒）：研究装置の起動 → 疾走 → ロゴに合わせた締め
② shinkai_loop.wav … 解説中BGM（115BPM・32小節・約66.8秒）：エレクトロファンク×近未来ジャズ、継ぎ目なしでループ

2曲は同じメロディモチーフ（MOTIF）を使う。テンポ・調・楽器・音量はこのファイルの上のほうの定数を変えるだけで作り直せる。
音は synth.py（numpy / scipy だけの自作シンセ）で作っている。
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import synth as S  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / 'public' / 'music'

# ---- 共通モチーフ（Dドリアン）：(16分の位置, MIDI, 長さ16分) の2小節 ----
MOTIF = [(0, 74, 2), (3, 77, 1), (4, 79, 2), (6, 81, 2), (10, 84, 2), (12, 81, 2), (14, 79, 1),
         (16, 81, 3), (19, 79, 1), (20, 77, 2), (22, 76, 2), (24, 74, 6)]
# 後半の答え（OPの4〜5小節目・BGMの返し）
ANSWER = [(0, 77, 2), (3, 79, 1), (4, 81, 2), (6, 84, 2), (10, 86, 2), (12, 84, 1), (13, 86, 1), (14, 88, 2),
          (16, 86, 3), (19, 84, 1), (20, 81, 2), (22, 79, 2), (24, 81, 8)]


def grid(bpm):
    s16 = 60 / bpm / 4
    return s16, s16 * 16


# =====================================================================
# ① オープニング
# =====================================================================
OP_BPM = 145
OP_TAIL = 3.0        # 一撃のあとの余韻（秒）


def make_op(boot_bars=2, groove_bars=4, name='shinkai_op.wav', tail=OP_TAIL):
    """boot_bars＝起動の小節数、groove_bars＝本編の小節数（4＝モチーフ＋答え、2＝モチーフだけ）。
    そのあと1小節のビルド → 一撃。動画のOPの長さに合わせて小節数を変えられる"""
    s16, bar = grid(OP_BPM)
    B0 = boot_bars
    BUILD = B0 + groove_bars
    hit = (BUILD + 1) * bar                  # ロゴの一撃
    OP_TAIL_ = tail
    total = hit + OP_TAIL_
    n = int(total * S.SR) + S.SR
    T = {k: S.Track(n, k) for k in ['drums', 'bass', 'lead', 'chords', 'fx', 'sub']}
    chords = {0: ([62, 65, 69, 72], 38), 1: ([62, 65, 70, 74], 46), 2: ([64, 67, 72, 76], 48), 3: ([61, 64, 69, 73], 45)}

    # --- 0〜2小節：起動（サブの立ち上がり・起動音のアルペジオ・ライザー） ---
    bl = B0 * bar
    T['sub'].add(0.0, S.impact(0.5, bl) * np.linspace(0.2, 1, int(bl * S.SR)), 0.5)
    arp = [50, 57, 62, 65, 69, 74, 77, 81]
    k = 0
    t = 0.15
    while t < bl - s16:
        acc = 1 - 0.55 * (t / bl)           # だんだん速く
        T['fx'].add(t, S.blip(arp[k % len(arp)] + 12 * ((k // 8) % 2), 0.35 + 0.3 * t / bl), 0.5, pan=0.6 * np.sin(k))
        k += 1
        t += s16 * 2 * acc
    T['fx'].add(0.0, S.riser(bl, 150, 8000, 0.5), 0.6)
    # パワーアップのうなり（ピッチが上がる saw）
    nn = int(bl * S.SR)
    tt = np.arange(nn) / S.SR
    up = S.saw(55 * 2 ** (tt / bl * 3), nn)
    up = S.lp24(up, 300 + 4000 * (tt / bl) ** 2) * (tt / bl) ** 1.5
    T['fx'].add(0.0, (up * 0.35, up * 0.35))
    # 2小節目後半：スネアのフィル
    for i in range(8):
        T['drums'].add(bl - 8 * s16 + i * s16, S.snare(0.25 + 0.09 * i), 0.8)
    T['drums'].add(bl - s16 * 2, S.tom(140, 0.8), 0.7, pan=-0.3)
    T['drums'].add(bl - s16, S.tom(100, 0.9), 0.7, pan=0.3)

    # --- 2〜6小節：本編（4つ打ち・リースベース・リード） ---
    kicks = []
    for b in range(B0, BUILD):
        t0 = b * bar
        ch, root = chords[(b - B0) % 4]
        if b == B0:
            T['drums'].add(t0, S.crash(0.7, 2.0), 0.55)
        for q in range(4):
            T['drums'].add(t0 + q * 4 * s16, S.kick(1.0, 1.0, 0.4), 1.0)
            kicks.append(t0 + q * 4 * s16)
            T['drums'].add(t0 + q * 4 * s16 + 2 * s16, S.hat(0.55, open_=True), 0.35, pan=0.2)
        for q in (1, 3):
            T['drums'].add(t0 + q * 4 * s16, S.snare(0.9), 0.75)
            T['drums'].add(t0 + q * 4 * s16, S.clap(0.8), 0.45)
        for i in range(16):
            if i % 4 != 2:
                T['drums'].add(t0 + i * s16, S.hat(0.35 + 0.25 * (i % 2 == 0)), 0.4, pan=-0.25)
        # ベース：8分で刻む、拍裏でオクターブ
        for i in range(8):
            m = root + (12 if i % 2 else 0)
            T['bass'].add(t0 + i * 2 * s16, S.reese(m, s16 * 1.8, 0.9, 500 if i % 2 else 380), 0.9)
        # コードのスタブ（拍裏）
        for q in range(4):
            T['chords'].add(t0 + q * 4 * s16 + 2 * s16, S.pad(ch, s16 * 1.2, 0.5, 3500), 0.55)
    # リード：2〜3小節＝モチーフ、4〜5小節＝答え（1オクターブ上がった気分で）
    for phrase, b0 in ((MOTIF, B0), (ANSWER, B0 + 2))[:max(1, groove_bars // 2)]:
        prev = None
        for st, m, ln in phrase:
            T['lead'].add(b0 * bar + st * s16, S.lead(m, ln * s16 * 0.95, 0.75, 5000, glide_from=prev if prev and abs(prev - m) <= 2 and ln >= 2 else None), 0.6)
            prev = m

    # --- 6小節目：ビルド（スネアロール・ライザー・ベースが上がる） ---
    t0 = BUILD * bar
    for i in range(16):
        v = 0.25 + 0.6 * i / 15
        T['drums'].add(t0 + i * s16, S.snare(v), 0.7)
        if i % 4 == 0:
            T['drums'].add(t0 + i * s16, S.kick(0.9), 0.9)
            kicks.append(t0 + i * s16)
    T['fx'].add(t0, S.riser(bar, 400, 12000, 0.7), 0.7)
    for i, m in enumerate([38, 41, 43, 45, 46, 48, 50, 53]):
        T['bass'].add(t0 + i * 2 * s16, S.reese(m, s16 * 1.8, 0.95, 600 + 80 * i), 0.9)
    T['lead'].add(t0, S.lead(86, bar * 0.9, 0.6, 2500), 0.55)
    T['lead'].add(t0 + bar * 0.5, S.lead(88, bar * 0.45, 0.6, 6000, glide_from=86), 0.5)

    # --- 7小節目の頭：ロゴの一撃 ---
    T['sub'].add(hit, S.impact(1.0, 2.8), 0.95)
    T['drums'].add(hit, S.kick(1.0, 0.9, 0.6, 1.4), 1.0)
    T['drums'].add(hit, S.crash(1.0, 3.0), 0.75)
    T['drums'].add(hit, S.clap(1.0), 0.6)
    T['chords'].add(hit, S.pad([50, 57, 62, 64, 69, 74], 1.6, 0.9, 5000), 0.9)
    T['bass'].add(hit, S.reese(38, 1.6, 1.0, 600), 0.95)
    T['lead'].add(hit, S.lead(86, 1.4, 0.85, 7000), 0.65)
    T['lead'].add(hit, S.lead(81, 1.4, 0.6, 7000), 0.45)

    # --- ミックス ---
    duck = S.duck_curve(n, kicks, 0.55, 0.14)
    for k_ in ('bass', 'chords', 'lead'):
        T[k_].L *= duck; T[k_].R *= duck
    T['bass'].apply(lambda x: S.filt(x, 'hp', 32))
    T['chords'].apply(lambda x: S.filt(x, 'hp', 220))
    T['lead'].apply(lambda x: S.filt(S.filt(x, 'hp', 300), 'peak', 3000, 0.9, 2.0))
    T['sub'].apply(lambda x: S.filt(x, 'hp', 30))
    gains = {'drums': 0.85, 'bass': 0.8, 'lead': 0.75, 'chords': 0.55, 'fx': 0.6, 'sub': 0.45}
    L = sum(T[k_].L * g for k_, g in gains.items())
    R = sum(T[k_].R * g for k_, g in gains.items())
    # リードにディレイ、全体に部屋鳴り
    dl, dr = S.pingpong(T['lead'].L, T['lead'].R, s16 * 3, 0.35, 0.22)
    ir = S.make_ir(2.4, 1.6, 250, 8000)
    wl, wr = S.reverb(L + dl, R + dr, ir, 0.16)
    L, R = L + dl + wl, R + dr + wr
    L, R = S.compress(L, R, -16, 2.5, 0.01, 0.15, 3.0)
    L, R = S.limiter(L, R, -1.0)
    m = int(total * S.SR)
    fade = np.ones(m)
    fade[-int(0.6 * S.SR):] = np.linspace(1, 0, int(0.6 * S.SR)) ** 2
    L, R = L[:m] * fade, R[:m] * fade
    OUT.mkdir(parents=True, exist_ok=True)
    S.write_wav(OUT / name, L, R)
    print(f'{name}  {total:.2f}秒  ロゴの一撃 {hit:.2f}秒')
    return hit


# =====================================================================
# ② 解説中BGM（ループ）
# =====================================================================
LOOP_BPM = 115
SWING = 0.12          # 裏の16分を後ろにずらす量（16分の何割か）
# 32小節のコード（鍵盤のボイシング, ベースのルート）
DM9 = ([53, 57, 60, 64], 38); G13 = ([53, 59, 64, 69], 43); BBM9 = ([57, 60, 62, 65], 46); A7S9 = ([55, 61, 64, 72], 45)
GM9 = ([58, 62, 65, 69], 43); C13 = ([58, 62, 64, 69], 48); FM9 = ([57, 60, 64, 67], 41); EM7B5 = ([55, 58, 62, 64], 40)
A7B9 = ([55, 61, 64, 70], 45)
SEC_A = [DM9, DM9, G13, G13, DM9, DM9, BBM9, A7S9]
SEC_B = [GM9, C13, FM9, BBM9, EM7B5, A7B9, DM9, A7S9]
FORM = SEC_A + SEC_A + SEC_B + SEC_A           # A A' B A''
# ベース（16分の位置, ルートからの半音, 長さ16分, 強さ）
BASS_PAT = [(0, 0, 2, 1.0), (3, 0, 1, 0.55), (4, 12, 1, 0.8), (6, 0, 2, 0.85), (8, 7, 1, 0.8),
            (10, 0, 1, 0.55), (11, 12, 1, 0.8), (13, 10, 1, 0.7), (14, 7, 2, 0.9)]
BASS_FILL = [(0, 0, 2, 1.0), (3, 0, 1, 0.55), (4, 12, 1, 0.8), (6, 10, 1, 0.8), (7, 12, 1, 0.8), (8, 7, 1, 0.8),
             (10, 5, 1, 0.75), (11, 7, 1, 0.8), (12, 10, 1, 0.8), (13, 12, 1, 0.85), (14, 15, 2, 0.9)]
COMP = [[(2, 2), (6, 1), (10, 2), (14, 1)], [(0, 3), (6, 1), (9, 1), (12, 2)],
        [(2, 1), (5, 2), (10, 1), (14, 2)], [(2, 2), (7, 1), (10, 2), (13, 1)]]


def make_loop():
    s16, bar = grid(LOOP_BPM)
    bars = len(FORM)
    L_sec = bars * bar
    tail = 3.5
    n = int((L_sec + tail) * S.SR)
    T = {k: S.Track(n, k) for k in ['kick', 'drums', 'bass', 'keys', 'bell', 'pad', 'fx']}
    rng = np.random.default_rng(11)

    def at(b, st):
        sw = SWING * s16 if st % 2 == 1 else 0.0
        return b * bar + st * s16 + sw

    kicks = []
    for b, (ch, root) in enumerate(FORM):
        sec = 'B' if 16 <= b < 24 else 'A'
        # ---- ドラム ----
        kpat = [0, 10] + ([7] if b % 2 else [14]) if sec == 'A' else [0, 11]
        for st in kpat:
            T['kick'].add(at(b, st), S.kick(0.9 if st == 0 else 0.7, 1.05, 0.35), 1.0)
            kicks.append(at(b, st))
        for st in (4, 12):
            T['drums'].add(at(b, st), S.snare(0.8 if sec == 'A' else 0.6, 0.25, 205), 0.7, pan=0.05)
        for st in ([7, 9, 15] if b % 2 == 0 else [3, 9, 14]):
            T['drums'].add(at(b, st), S.snare(0.12 + 0.05 * rng.random(), 0.12, 210), 0.6, pan=0.05)
        for st in range(16):
            if sec == 'B' and st % 2:
                continue
            v = 0.42 if st % 4 == 0 else (0.3 if st % 2 == 0 else 0.18)
            T['drums'].add(at(b, st), S.hat(v * (0.9 + 0.2 * rng.random())), 0.45, pan=-0.3)
        if b % 2 == 1 and sec == 'A':
            T['drums'].add(at(b, 14), S.hat(0.35, open_=True), 0.35, pan=-0.3)
        for st in range(1, 16, 2):
            T['drums'].add(at(b, st), S.shaker(0.18), 0.4, pan=0.45)
        if b % 8 == 7:   # 8小節ごとのフィル
            for i, f in enumerate([180, 150, 120, 95]):
                T['drums'].add(at(b, 12 + i), S.tom(f, 0.6), 0.55, pan=0.4 - 0.25 * i)
        # ---- ベース ----
        pat = BASS_FILL if b % 4 == 3 else BASS_PAT
        prev = None
        for st, off, ln, v in pat:
            m = root + off
            T['bass'].add(at(b, st), S.pluck_bass(m, ln * s16 * 0.85, v, 800, glide_from=prev if off == 12 and prev is not None else None), 0.9)
            prev = m
        # ---- 鍵盤（エレピのカッティング） ----
        comp = COMP[(b + (1 if sec == 'B' else 0)) % 4]
        for st, ln in comp:
            vel = 0.55 + 0.15 * rng.random()
            T['keys'].add(at(b, st), S.epiano(ch, ln * s16 * 0.8, vel), 0.8, pan=-0.15)
        # ---- パッド（B だけ、うっすら） ----
        if sec == 'B':
            T['pad'].add(b * bar, S.pad([x + 12 for x in ch[:3]], bar * 0.95, 0.35, 1400), 0.5)
    # ---- ベル：共通モチーフ（1オクターブ下・控えめ） ----
    for b0, ph in ((8, MOTIF), (12, ANSWER), (24, MOTIF), (28, MOTIF)):
        for st, m, ln in ph:
            bb = b0 + st // 16
            T['bell'].add(at(bb, st % 16), S.bell(m - 12, ln * s16, 0.55), 0.55, pan=0.25)
    # B の終わり：ベルの短い返し
    for i, m in enumerate([69, 72, 74, 77, 76, 74]):
        T['bell'].add(at(22, 8 + i), S.bell(m - 12, s16 * 0.8, 0.4), 0.45, pan=-0.25)
    # ---- ちょっとコミカルな合いの手 ----
    for b in (7, 23, 31):
        T['fx'].add(at(b, 15), S.boing(74, 0.5), 0.45, pan=0.35)
    for i, m in enumerate([74, 77, 81, 84]):
        T['fx'].add(at(15, 12 + i), S.blip(m, 0.25, 0.07), 0.35, pan=-0.4 + 0.25 * i)

    # ---- ミックス ----
    duck = S.duck_curve(n, kicks, 0.3, 0.12)
    for k in ('bass', 'keys', 'pad'):
        T[k].L *= duck; T[k].R *= duck
    T['bass'].apply(lambda x: S.filt(S.filt(S.filt(x, 'hp', 38), 'lp', 2500), 'lowshelf', 70, 0.7, -2.0))
    # ナレーションの帯域（1〜4kHz）をあける
    voice_hole = lambda x: S.filt(S.filt(S.filt(x, 'peak', 2500, 0.8, -5.0), 'peak', 1200, 1.0, -2.5), 'highshelf', 6000, 0.7, -2.0)
    T['keys'].apply(lambda x: voice_hole(S.filt(x, 'hp', 160)))
    T['bell'].apply(lambda x: voice_hole(S.filt(x, 'hp', 250)))
    T['pad'].apply(lambda x: voice_hole(S.filt(x, 'hp', 200)))
    T['drums'].apply(lambda x: S.filt(x, 'peak', 3000, 0.8, -3.0))
    gains = {'kick': 0.72, 'drums': 0.75, 'bass': 0.7, 'keys': 0.6, 'bell': 0.5, 'pad': 0.35, 'fx': 0.4}
    L = sum(T[k].L * g for k, g in gains.items())
    R = sum(T[k].R * g for k, g in gains.items())
    ir = S.make_ir(2.0, 1.2, 250, 6000)
    sendL = T['keys'].L * 0.5 + T['bell'].L * 0.8 + T['drums'].L * 0.15
    sendR = T['keys'].R * 0.5 + T['bell'].R * 0.8 + T['drums'].R * 0.15
    wl, wr = S.reverb(sendL, sendR, ir, 0.35)
    dl, dr = S.pingpong(T['bell'].L, T['bell'].R, s16 * 3, 0.3, 0.2, 3000)
    L, R = L + wl + dl, R + wr + dr
    # 継ぎ目なし：L_sec より後ろ（余韻）を頭に重ねて切る
    m = int(round(L_sec * S.SR))
    L[:n - m] += L[m:]
    R[:n - m] += R[m:]
    L, R = L[:m], R[:m]
    L, R = S.compress(L, R, -20, 2.0, 0.015, 0.2, 2.0)
    L, R = S.limiter(L, R, -1.5)
    OUT.mkdir(parents=True, exist_ok=True)
    S.write_wav(OUT / 'shinkai_loop.wav', L, R)
    print(f'shinkai_loop.wav  {L_sec:.2f}秒（{bars}小節・継ぎ目なしループ）')


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if which in ('all', 'op'):
        make_op()
        # 動画のOP用の短い版：起動1小節＋モチーフ2小節＋ビルド1小節 → 4小節目の頭（6.62秒）で一撃、タイトル表示ぶんの余韻
        make_op(1, 2, 'shinkai_op_short.wav', tail=3.7)
    if which in ('all', 'loop'):
        make_loop()
