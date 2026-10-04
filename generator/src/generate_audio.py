"""VOICEVOX で台詞を音声化する（本文ハッシュでキャッシュ）。

- 話者ID・読み上げ速度は config.json の voice.speakers で設定
- 同じ (エンジン, 話者, 速度, 本文) の音声は audio/generated/<hash>.wav を再利用
- VOICEVOX に接続できない場合:
    voice.fallback_when_unavailable = "estimate" → 文字数から尺を推定（無音）して続行
    "error" → 原因を表示して停止
"""
import hashlib, json, os, re, wave, urllib.request, urllib.parse, urllib.error
from .common import AUDIO_CACHE, PipelineError, log


def tts_text(text):
    t = text.replace("↓", "、").replace("\n", "、")
    t = re.sub(r"、+", "、", t).strip("、 ")
    return t


def wav_duration(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


class VoiceGenerator:
    def __init__(self, cfg, force_estimate=False):
        self.cfg = cfg
        self.vcfg = cfg["voice"]
        self.url = os.environ.get("VOICEVOX_URL", "http://127.0.0.1:50021").rstrip("/")
        self.available = False
        self.mode = "estimate"
        if self.vcfg.get("enabled", True) and not force_estimate:
            self.available = self._ping()
            if self.available:
                self.mode = "voicevox"
            elif self.vcfg.get("fallback_when_unavailable", "estimate") == "error":
                raise PipelineError(
                    f"VOICEVOX ENGINE に接続できません: {self.url}\n"
                    "  → VOICEVOX を起動するか、.env の VOICEVOX_URL を確認してください\n"
                    "  → 音声なしで続けるには --no-voice を付けるか config の fallback を estimate に")
        if self.mode == "estimate":
            log(f"[音声] VOICEVOX 未接続のため、文字数から尺を推定します（音声なし）: {self.url}")
        else:
            log(f"[音声] VOICEVOX 接続OK: {self.url}")
        self.hits = self.made = 0

    def _ping(self):
        try:
            with urllib.request.urlopen(self.url + "/version", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    def _key(self, spk, text):
        s = self.vcfg["speakers"][spk]
        raw = json.dumps(["voicevox", s["speaker_id"], s["speed"], tts_text(text)], ensure_ascii=False)
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

    def estimate(self, spk, text):
        s = self.vcfg["speakers"][spk]
        n = len(re.sub(r"\s", "", tts_text(text)))
        return 0.25 + n / (self.vcfg.get("chars_per_second", 7.5) * s["speed"])

    def get(self, spk, text):
        """戻り値: (wavパス or None, 秒数)"""
        if spk not in self.vcfg["speakers"]:
            raise PipelineError(f"config.json voice.speakers に話者 '{spk}' がありません")
        if not tts_text(text):
            return None, 0.0
        if self.mode != "voicevox":
            return None, self.estimate(spk, text)
        p = AUDIO_CACHE / f"{self._key(spk, text)}.wav"
        if p.exists():
            self.hits += 1
            return p, wav_duration(p)
        s = self.vcfg["speakers"][spk]
        try:
            q = urllib.parse.urlencode({"text": tts_text(text), "speaker": s["speaker_id"]})
            req = urllib.request.Request(f"{self.url}/audio_query?{q}", method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                query = json.loads(r.read())
            query["speedScale"] = s["speed"]
            body = json.dumps(query).encode("utf-8")
            req = urllib.request.Request(f"{self.url}/synthesis?speaker={s['speaker_id']}", data=body,
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            raise PipelineError(f"VOICEVOX がエラーを返しました（話者ID {s['speaker_id']} / 本文「{text[:20]}」）: {e.code} {e.reason}\n"
                                "  → 話者IDが存在するか config.json を確認してください")
        except Exception as e:
            raise PipelineError(f"VOICEVOX との通信に失敗: {e}")
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data); tmp.replace(p)
        self.made += 1
        return p, wav_duration(p)

    def summary(self):
        if self.mode == "voicevox":
            log(f"[音声] 新規生成 {self.made} / キャッシュ再利用 {self.hits}")
