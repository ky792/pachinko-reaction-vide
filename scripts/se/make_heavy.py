import sys, os
import numpy as np
from scipy.io import wavfile
sys.argv = ["x", "/home/claude/se/out"]
sys.path.insert(0, "/home/claude/se")
import make_holo_se as m

SR = m.SR
OUT = "/home/claude/se/out"


def body_thump(d=0.25, f0=180, f1=70):
    s, _ = m.sweep(f0, f1, d)
    return s * m.env_ad(len(s), 0.002, 7)


def appear_b_heavy(level):
    # level 1 = やや重, 2 = かなり重
    d = 1.6 if level == 1 else 2.0
    tt = m.t(d)
    base = 990 if level == 1 else 740  # ベルの音程を下げる（元は1320）
    ratios = [1, 2.76, 5.4, 8.93]
    y = sum(np.sin(2 * np.pi * base * r * tt) * np.exp(-tt * (2.2 + i * 1.8)) / (i + 1)
            for i, r in enumerate(ratios))
    n = len(tt)
    sub = m.pad(m.low_bwom(1.1 if level == 1 else 1.5, 70 if level == 1 else 60, 40 if level == 1 else 32), n)
    thump = m.pad(body_thump(0.25 if level == 1 else 0.35), n)
    sh = m.shimmer(d, 4500, 10000, 10, 6)
    return (0.55 * y + (0.75 if level == 1 else 0.95) * sub
            + (0.45 if level == 1 else 0.6) * thump + 0.3 * sh)


m.files["04b_appear_B_heavy1"] = m.save("04b_appear_B_heavy1", appear_b_heavy(1), 0.4)
m.files["04c_appear_B_heavy2"] = m.save("04c_appear_B_heavy2", appear_b_heavy(2), 0.45)
m.demo("01_charge_A_hyuin", "04b_appear_B_heavy1", "06_data_A_pipi", "10_disappear_B_shu", "00_demo_B2_yaya_omome")
m.demo("01_charge_A_hyuin", "04c_appear_B_heavy2", "06_data_A_pipi", "10_disappear_B_shu", "00_demo_B3_kanari_omome")
print("heavy ok")
