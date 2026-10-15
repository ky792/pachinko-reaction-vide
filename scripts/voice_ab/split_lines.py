#!/usr/bin/env python3
"""まとめて作った音声を1行ずつに切り分ける

  python scripts/voice_ab/split_lines.py <まとめた.wav> <出力フォルダ> <行ID1> <行ID2> ... --texts <テキスト1>|<テキスト2>|...

- 無音の区間（0.2秒以上）を切れ目の候補にして、「各行の長さ ≒ 文字数（--expect があればその長さ）に比例」と「切れ目の無音が長い」が
  両方いちばん合う組み合わせを動的計画法で選ぶ（文中の「？」「。」の間で切れてしまうのを防ぐ）
"""
import argparse, wave
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav"); ap.add_argument("out"); ap.add_argument("ids", nargs="+")
    ap.add_argument("--texts", required=True)
    ap.add_argument("--expect", help="各行の長さの目安（秒、| 区切り）。同じ台本を別の声で切った長さなど。文字数より正確")
    a = ap.parse_args()
    texts = a.texts.split("|"); n = len(a.ids); assert len(texts) == n
    w = wave.open(a.wav); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    fr = int(sr * 0.01)
    e = np.array([np.sqrt(np.mean(x[i:i + fr].astype(float) ** 2)) for i in range(0, len(x) - fr, fr)])
    on = e > e.max() * 0.02
    idx = np.where(on)[0]; first, last = idx[0], idx[-1] + 1
    runs, st = [], None
    for i in range(first, last):
        if not on[i] and st is None: st = i
        if on[i] and st is not None:
            if i - st >= 20: runs.append((st, i))
            st = None
    cand = [(s + t) // 2 for s, t in runs]; gap = [t - s for s, t in runs]
    L = np.array([float(v) for v in a.expect.split("|")] if a.expect else [len(t) for t in texts], float)
    speech = (last - first) - sum(gap) * (n - 1) / max(len(gap), 1)
    rate = speech / L.sum()                           # 1文字あたりのフレーム数（目安）
    m = len(cand); INF = 1e18
    pts = [first] + cand + [last]                     # 0..m+1
    # dp[k][j]：k 行目までを pts[j] で切ったときの最小コスト
    dp = np.full((n + 1, m + 2), INF); bk = np.zeros((n + 1, m + 2), int); dp[0][0] = 0
    for k in range(1, n + 1):
        exp = L[k - 1] * rate
        js = [m + 1] if k == n else range(1, m + 1)
        for j in js:
            for i in range(0, j):
                if dp[k - 1][i] >= INF: continue
                dur = pts[j] - pts[i]
                c = dp[k - 1][i] + ((dur - exp) / exp) ** 2 - (0 if j == m + 1 else 0.02 * gap[j - 1])
                if c < dp[k][j]: dp[k][j], bk[k][j] = c, i
    cuts, j = [], m + 1
    for k in range(n, 0, -1):
        i = bk[k][j]; cuts.append((pts[i], pts[j])); j = i
    cuts.reverse()
    for (s, t), iid, txt in zip(cuts, a.ids, texts):
        seg = x[s * fr:t * fr]; z = np.abs(seg.astype(float)); nz = np.where(z > z.max() * 0.03)[0]
        seg = seg[max(nz[0] - int(sr * 0.03), 0):nz[-1] + int(sr * 0.06)]
        with wave.open(f"{a.out}/{iid}.wav", "wb") as o:
            o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(seg.tobytes())
        print(iid, f"{len(seg) / sr:.2f}s", f"{len(txt)}字", txt)


if __name__ == "__main__":
    main()
