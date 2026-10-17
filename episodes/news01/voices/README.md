# news01 の声
- ナギ：AivisSpeech コハク「ねむたい」速さ0.86・抑揚0.65、生成後に響きごと−1.5半音（asetrate）。GitHub Actions（voice-ab-aivis.yml の action=lines）で生成 → voice_ab/aivis_lines から 24kHz に変換して置いた
- バク：Irodori-TTS v4.1-Small-MF（2026-10-17 に Gemini Fenrir から変更。バクは関西弁の女の子設定）。見本＝AivisSpeech まお「からかい」、演技指示は voice/casting_c.json の baku.caption。CI（voice-ab-irodori.yml）で1行ずつ作り、前後の無音を切って文中の長い無音を0.2秒に詰めた
- どちらも頭と末尾の無音を詰め、音量をそろえてある（RMS 3000）
