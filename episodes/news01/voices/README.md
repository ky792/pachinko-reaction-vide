# news01 の声
- ナギ（奇数行など）：AivisSpeech コハク「ねむたい」。GitHub Actions（voice-ab-aivis.yml の action=lines）で生成 → voice_ab/aivis_lines から 24kHz に変換して置いた
- バク：Gemini gemini-3.8-flash-tts・Fenrir（熱血な兄貴分の指示。2026-10-15 に Zephyr から変更）。22行を1リクエストで作り、scripts/voice_ab/split_lines.py で1行ずつに切った（--expect に Zephyr 版の各行の長さを渡して切れ目を合わせた）
- どちらも頭と末尾の無音を詰め、音量をそろえてある（RMS 3000）
