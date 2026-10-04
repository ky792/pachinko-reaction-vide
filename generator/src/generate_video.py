"""タイムラインから映像を描画し、ffmpeg(H.264)へ直接流し込む。

速度のため:
- 背景・ヘッダー・吹き出しは事前に1回だけ描画してキャッシュ
- 動きのある最初の数フレームだけ毎フレーム合成し、あとは静止画にキャラの揺れだけ重ねる
- キャラの揺れは3フレームごとに更新し、間のフレームは同じ画像を再送する
"""
import json, math, subprocess
from PIL import Image, ImageDraw
from .common import asset_path, font, PipelineError, log, ASSETS
from . import render_text as R

FACES = ("normal", "cry", "shock", "smug", "angry", "jito")


class Renderer:
    def __init__(self, cfg, script, cues=None):
        self.cfg = cfg
        self.cues = cues or []
        self._img_cache = {}
        self.corner = ""
        IC = cfg.get("images", {})
        self.img_dir = ASSETS / IC.get("dir", "machines")
        lp = ASSETS / IC.get("labels", "machines/machines.json")
        self.machine_labels = json.loads(lp.read_text(encoding="utf-8")) if lp.exists() else {}
        found = sum(1 for c in self.cues for f in c["files"] if (self.img_dir / f).exists())
        total_f = sum(len(c["files"]) for c in self.cues)
        if self.cues:
            log(f"  画像: {total_f} 枚中 {found} 枚あり（無いものは機種名ラベルのみ表示して続行）")
        v = cfg["video"]
        self.W, self.H, self.fps = v["width"], v["height"], v["fps"]
        self.title = script.get("title", "")
        A = cfg["assets"]
        bg = Image.open(asset_path(A["background"])).convert("RGB").resize((self.W, self.H))
        self.BG = Image.blend(bg, Image.new("RGB", (self.W, self.H), (8, 6, 18)), A.get("background_dim", 0.58))
        self.BG_DARK = Image.blend(self.BG, Image.new("RGB", (self.W, self.H), (10, 5, 20)), 0.5)
        self.BG_SILENT = Image.blend(self.BG, Image.new("RGB", (self.W, self.H), (10, 5, 20)), 0.72)
        self.chars = {}
        for key, c in A["characters"].items():
            for f in FACES:
                p = asset_path(f"{c['dir']}/{f}.png")
                im = Image.open(p).convert("RGBA")
                if c.get("flip"):
                    im = im.transpose(Image.FLIP_LEFT_RIGHT)
                small = im.resize((int(im.width * 300 / im.height), 300), Image.LANCZOS)
                big = im.resize((int(im.width * 480 / im.height), 480), Image.LANCZOS)
                self.chars[(key, f, "s")] = small
                self.chars[(key, f, "b")] = big
                self.chars[(key, f, "bd")] = R.dim(big, 0.7)
        self._hdr = {}
        L = cfg["layout"]
        self.area_top = L["area_top"]
        self.area_h = self.H - self.area_top - L["area_bottom_margin"]
        self.left = L["res_left"]

    # ---------- 共通パーツ ----------
    def header_overlay(self, chapter, corner=""):
        key = (chapter or ("", ""), corner)
        if key not in self._hdr:
            lay = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
            R.header(self.cfg, lay, self.title, chapter)
            if corner:
                R.corner_label(self.cfg, lay, corner)
            self._hdr[key] = lay
        return self._hdr[key]

    # ---------- 画像差し込み ----------
    def _img(self, name, w, h):
        key = (name, w, h)
        if key not in self._img_cache:
            p = self.img_dir / name
            im = None
            if p.exists():
                try:
                    src = Image.open(p).convert("RGB")
                    s = max(w / src.width, h / src.height) * (1 + self.cfg["images"].get("zoom", 0.06))
                    im = src.resize((int(src.width * s) + 1, int(src.height * s) + 1), Image.LANCZOS)
                except Exception as e:
                    log(f"  [警告] 画像を読めません {p.name}: {e}")
            self._img_cache[key] = im
        return self._img_cache[key]

    def active_cue(self, t):
        for c in self.cues:
            if c["time"] <= t < c["time"] + c["duration"]:
                return c
        return None

    def overlay_cue(self, im, c, t):
        p = (t - c["time"]) / max(c["duration"], 0.01)
        z = self.cfg["images"].get("zoom", 0.06)
        fade = min(1.0, (t - c["time"]) / 0.25, (c["time"] + c["duration"] - t) / 0.25)
        files = list(c["files"])
        if c["layout"] == "sequence" and files:
            idx = min(len(files) - 1, int(p * len(files)))
            p = p * len(files) - idx
            fade = min(fade, 1.0) if idx == 0 else min(1.0, (c["time"] + c["duration"] - t) / 0.25, p * c["duration"] / len(files) / 0.15 + 0.3)
            files = [files[idx]]
        if c["layout"] == "row":
            pw, ph = 520, 293
            x0 = (self.W - (pw * 3 + 40 * 2)) // 2
            y0 = 360
            shown = 0
            for k, f in enumerate(files[:3]):
                src = self._img(f, pw, ph)
                if src is not None:
                    R.image_panel(im, src, x0 + k * (pw + 40), y0, pw, ph, p, z, fade, self.machine_labels.get(f, ""), self.cfg)
                    shown += 1
            if c.get("telop"):
                R.telop(self.cfg, im, c["telop"], y0 - 130 if shown else 440, fade)
            return
        label = c.get("label") or (self.machine_labels.get(files[0], "") if files else "")
        P = self.cfg["images"]["panel"]
        pw, ph = P["w"], P["h"]
        x0, y0 = self.W - P["right"] - pw, self.H - P["bottom"] - ph
        src = self._img(files[0], pw, ph) if files else None
        if src is not None:
            R.image_panel(im, src, x0, y0, pw, ph, p, z, fade, label, self.cfg)
        elif label and not c.get("label"):
            # 画像なし：機種名だけ右上に出す（画面端ラベルがある場合はそちらが常時出ている）
            R.corner_label(self.cfg, im, label, alpha=fade, y=196)
        if c.get("telop"):
            R.telop(self.cfg, im, c["telop"], 440, fade)

    def put_small_chars(self, im, face, t):
        for key, x, ph in (("rabbit", self.W - 480, 0.0), ("cat", self.W - 270, 1.7)):
            c = self.chars[(key, face, "s")]
            im.paste(c, (x, self.H - 310 + int(6 * math.sin(t * 4 + ph))), c)

    # ---------- 書き出し ----------
    def render(self, events, total, out_path, limit=None):
        v = self.cfg["video"]
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{self.W}x{self.H}", "-r", str(self.fps), "-i", "-",
               "-c:v", "libx264", "-preset", v.get("preset", "veryfast"), "-crf", str(v.get("crf", 20)),
               "-pix_fmt", "yuv420p", str(out_path)]
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        except FileNotFoundError:
            raise PipelineError("ffmpeg が見つかりません。ffmpeg をインストールして PATH を通してください。")
        self.proc, self.total = proc, total
        end_frame = int(round((limit if limit else total) * self.fps))
        self.frame = 0
        self.stack, self.offset = [], 0.0
        self.talk_faces = {"rabbit": "normal", "cat": "normal"}
        self.silent = False
        self.chapter = None
        self.res_face = "normal"
        last_pct = -1
        try:
            for e in events:
                f0 = int(round(e["start"] * self.fps)); f1 = int(round((e["start"] + e["dur"]) * self.fps))
                if f0 >= end_frame:
                    break
                n = min(f1, end_frame) - f0
                getattr(self, "ev_" + e["kind"])(e, n, f0)
                pct = int(100 * min(f1, end_frame) / end_frame)
                if pct // 10 != last_pct // 10:
                    log(f"  映像 {pct}%"); last_pct = pct
        except BrokenPipeError:
            raise PipelineError("ffmpeg が途中で終了しました（ディスク容量やコーデックを確認してください）")
        proc.stdin.close()
        if proc.wait() != 0:
            raise PipelineError("ffmpeg の映像エンコードに失敗しました")
        return end_frame / self.fps

    def emit(self, im):
        self.proc.stdin.write(im.tobytes())
        self.frame += 1

    def run_frames(self, n, f0, anim_frames, make_anim, make_static, add_dynamic):
        """anim_frames までは毎フレーム合成、以降は静止画+キャラ揺れ(3フレームごと)。"""
        static, last = None, None
        for k in range(n):
            t = (f0 + k) / self.fps
            cue = self.active_cue(t) if self.cues else None
            if cue is not None:   # 画像表示中は毎フレーム合成（ズーム）
                if k < anim_frames:
                    im = make_anim(k)
                else:
                    if static is None:
                        static = make_static()
                    im = static.copy()
                add_dynamic(im, t, k)
                self.overlay_cue(im, cue, t)
                R.progress(im, t / self.total)
                self.emit(im)
                last = None
                continue
            if k < anim_frames:
                im = make_anim(k)
                add_dynamic(im, t, k)
                R.progress(im, t / self.total)
                self.emit(im)
                continue
            if static is None:
                static = make_static()
            if last is None or k % 3 == 0:
                im = static.copy()
                add_dynamic(im, t, k)
                R.progress(im, t / self.total)
                last = im.tobytes()
            self.proc.stdin.write(last); self.frame += 1

    # ---------- レス ----------
    def _stack_layer(self, off, newest_scale=1.0, slide=0.0):
        lay = Image.new("RGBA", (self.W, self.area_h), (0, 0, 0, 0))
        for i, it in enumerate(self.stack):
            y = it["y"] - off
            if y + it["h"] < 0 or y > self.area_h:
                continue
            last = i == len(self.stack) - 1
            img = it["img"] if last else it["dim"]
            if last and (newest_scale != 1.0 or slide):
                w, h = img.size
                c = img.resize((max(1, int(w * newest_scale)), max(1, int(h * newest_scale))))
                lay.paste(c, (self.left + w // 2 - c.width // 2 + int(slide), int(y) + h // 2 - c.height // 2), c)
            else:
                lay.paste(img, (self.left, int(y)), img)
        return lay

    def ev_res(self, e, n, f0):
        if e["reset"]:
            self.stack, self.offset = [], 0.0
        self.chapter = e["chapter"]
        self.corner = e.get("corner", "")
        img = R.res_bubble(self.cfg, e["no"], e["text"], e["emphasis"])
        y = (self.stack[-1]["y"] + self.stack[-1]["h"] + 16) if self.stack else 0
        self.stack.append({"img": img, "dim": R.darken(img, 0.72), "y": y, "h": img.height})
        new_off = max(0.0, y + img.height - self.area_h)
        old_off = self.offset
        hdr = self.header_overlay(self.chapter, self.corner)
        face = e.get("face", "normal")
        A = 8

        def frame(off, sc, sl):
            im = self.BG.copy()
            lay = self._stack_layer(off, sc, sl)
            im.paste(lay, (0, self.area_top), lay)
            im.paste(hdr, (0, 0), hdr)
            return im

        def anim(k):
            p = (k + 1) / A
            ease = 1 - (1 - p) ** 3
            off = old_off + (new_off - old_off) * ease
            if e["emphasis"]:
                sc = 1.35 - 0.35 * ease
            else:
                sc = 0.75 + 0.33 * math.sin(p * math.pi * 0.62) / math.sin(math.pi * 0.62) if p < 0.62 else 1.08 - 0.08 * (p - 0.62) / 0.38
            return frame(off, sc, (1 - ease) * -60)

        self.run_frames(n, f0, A, anim, lambda: frame(new_off, 1.0, 0),
                        lambda im, t, k: self.put_small_chars(im, face, t))
        self.offset = new_off
        self.stack = [it for it in self.stack if it["y"] + it["h"] - self.offset > -10]

    # ---------- タイトル / 章 ----------
    def ev_title(self, e, n, f0):
        lay = R.title_layer(self.cfg, (self.W, self.H), e["lines"], e["subtitle"])
        hdr = self.header_overlay(None)
        def anim(k):
            a = (k + 1) / 9
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr)
            l2 = R.dim(lay, a)
            im.paste(l2, (0, int((1 - a) * 100)), l2)
            return im
        def static():
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr); im.paste(lay, (0, 0), lay); return im
        self.run_frames(n, f0, 9, anim, static, lambda im, t, k: self.put_small_chars(im, "smug", t))
        self.stack, self.offset = [], 0.0

    def ev_chapter(self, e, n, f0):
        self.stack, self.offset = [], 0.0
        self.chapter = (e["number"], e["name"])
        hdr = self.header_overlay(None)
        def mk(bx):
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr)
            R.chapter_banner(self.cfg, im, e["number"], e["name"], bx); return im
        self.run_frames(n, f0, 7, lambda k: mk(int(-self.W * (1 - (k + 1) / 7) ** 2)), lambda: mk(0),
                        lambda im, t, k: self.put_small_chars(im, "normal", t))

    # ---------- キャラ会話 ----------
    def _talk_base(self, silent):
        im = (self.BG_SILENT if silent else self.BG_DARK).copy()
        d = ImageDraw.Draw(im)
        d.rectangle([0, self.H - 130, self.W, self.H - 8], fill=(28, 22, 44))
        d.rectangle([0, self.H - 134, self.W, self.H - 128], fill=(70, 55, 100))
        hdr = self.header_overlay(None)  # 章ピルは出さず「ひとこと」ラベルだけ
        im.paste(hdr, (0, 0), hdr)
        fl = font(self.cfg, "black", 40)
        lab = "うさ＆ねこのひとこと"
        d.rounded_rectangle([30, 128, 30 + fl.getlength(lab) + 40, 186], 29, fill=(255, 120, 160))
        d.text((50, 132), lab, font=fl, fill=(255, 255, 255))
        return im

    def ev_talk(self, e, n, f0):
        if e["first"]:
            self.talk_faces = {"rabbit": "normal", "cat": "normal"}
            self.silent = False
        who = e["who"]
        self.talk_faces[who] = e["face"]
        if e.get("bgm_cut"):
            pass  # BGMはこの台詞の頭で止まる（compose側）。画面は次の間から暗くする
        if e.get("pause"):
            self.silent = True
        base = self._talk_base(self.silent)
        C = self.cfg["assets"]["characters"][who]
        sb = R.say_bubble(self.cfg, C["name"], C["color"], e["text"], who == "rabbit")
        cx = {"rabbit": 200, "cat": self.W - 200 - self.chars[("cat", "normal", "b")].width}
        faces = dict(self.talk_faces)
        active_jump = not e.get("pause")

        def dyn(im, t, k):
            for key in ("rabbit", "cat"):
                act = key == who
                c = self.chars[(key, faces[key], "b" if act else "bd")]
                jump = int(-30 * math.exp(-k / 4) * abs(math.sin(k * 0.9))) if act and active_jump else 0
                sh = int(10 * math.exp(-k / 4) * math.sin(k * 2.6)) if act and faces[key] in ("angry", "shock") else 0
                im.paste(c, (cx[key] + sh, self.H - 600 + jump + int(5 * math.sin(t * 3 + (0 if key == "rabbit" else 2)))), c)
            p = min(1, (k + 1) / 5)
            s2 = 0.78 + 0.22 * p
            c = sb if s2 >= 1 else sb.resize((int(sb.width * s2), int(sb.height * s2)))
            bx = 160 if who == "rabbit" else self.W - 160 - c.width
            im.paste(c, (bx, max(190, self.H - 560 - c.height)), c)

        self.run_frames(n, f0, 9, lambda k: base.copy(), lambda: base.copy(), dyn)
        if e.get("bgm_cut"):
            self.silent = True

    # ---------- エンディング ----------
    def ev_ending(self, e, n, f0):
        hdr = self.header_overlay(None)
        lay = R.ending_panel(self.cfg, (self.W, self.H), e["question"], e["choices"], e["lines"])
        def anim(k):
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr)
            l2 = R.dim(lay, (k + 1) / 10); im.paste(l2, (0, 0), l2); return im
        def static():
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr); im.paste(lay, (0, 0), lay); return im
        self.run_frames(n, f0, 10, anim, static, lambda im, t, k: self.put_small_chars(im, "smug", t))

    def ev_subscribe(self, e, n, f0):
        hdr = self.header_overlay(None)
        lay = R.subscribe_layer(self.cfg, (self.W, self.H))
        def anim(k):
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr)
            s = 0.8 + 0.2 * min(1, (k + 1) / 8)
            c = lay.resize((int(self.W * s), int(self.H * s)))
            im.paste(c, ((self.W - c.width) // 2, (self.H - c.height) // 2), c); return im
        def static():
            im = self.BG.copy(); im.paste(hdr, (0, 0), hdr); im.paste(lay, (0, 0), lay); return im
        self.run_frames(n, f0, 8, anim, static, lambda im, t, k: self.put_small_chars(im, "normal", t))
