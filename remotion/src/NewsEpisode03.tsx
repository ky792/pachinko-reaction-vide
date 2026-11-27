import React from 'react';
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Audio} from '@remotion/media';
import {NewsOpening03} from './NewsOpening03';
import {ENDING_BGM, ENDING_CARD_FRAMES, NagibakuEndCard, endingBgmTrimBefore} from './common/NagibakuEnding'; // 全動画共通のED（2026-11-28） // 2026-11-28 OP曲をユーザー提供の曲に差し替え
import episode from './data/news03s.json';

// ニュース回#03（YOUTOPYA）：前回のニュース回（News02）と同じ画面。台本・資料・音声だけ差し替え

// ───────────────────────── 色・共通
const BLUE = '#1f6bff';
const BLUE_DEEP = '#061a4a';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const INK = '#24324f';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

// ───────────────────────── 尺の決まり
const FPS = 30;
const OP_FRAMES = 450; // OP 15秒
const LEAD = 12; // OPのあと最初のセリフまで
const GAP = 4; // セリフ間（0.12秒）
const CH_GAP = 40; // 章の切り替え（アイキャッチ）
const ED_GAP = 18;
const TAIL = 130; // 最後のセリフのあと（お辞儀→ナギが見つめる→暗転）
const FOCUS_MAX = 66; // 大きく寄るカットは最長2.2秒で戻す

type Line = {
  id: string;
  chapter: string;
  speaker: 'ナギ' | 'バク' | '所長';
  tsukkomi: boolean;
  text: string;
  show: string | null;
  hl: number | null;
  focus: 'nagi' | 'baku' | null;
  zoom: number;
  pre: number | null;
  frames: number;
  env: number[];
};
type Timed = Line & {start: number; end: number; idx: number};
type Chapter = {no: number; title: string; year: string};

const CHAPTERS = episode.chapters as Record<string, Chapter>;
const TITLE = episode.title as Record<string, string>;
const PANELS = episode.panels as Record<string, Record<string, any>>;

// ───────────────────────── タイムライン（台本＋音声の長さから自動）
const buildTimeline = () => {
  const lines: Timed[] = [];
  const chapterStarts: {id: string; at: number}[] = [];
  let t = OP_FRAMES + LEAD;
  (episode.lines as Line[]).forEach((l, idx) => {
    const prev = lines[lines.length - 1];
    if (prev && prev.chapter !== l.chapter) {
      t += l.chapter === 'ed' ? ED_GAP : CH_GAP;
      chapterStarts.push({id: l.chapter, at: t});
    } else if (prev) {
      t += l.pre != null ? Math.round(l.pre * FPS) + 1 : GAP;
    } else {
      chapterStarts.push({id: l.chapter, at: t});
    }
    const show = l.show ?? (l.chapter === 'ed' ? 'ending' : null);
    lines.push({...l, show, start: t, end: t + l.frames, idx});
    t += l.frames;
  });
  return {lines, chapterStarts, end: t};
};

const {lines: LINES, chapterStarts: CHAPTER_STARTS, end: END} = buildTimeline();
const MAIN_END = END + TAIL; // 本編の終わり（暗転）→ ここから全動画共通のエンドカード
export const EPISODE03_FRAMES = MAIN_END + ENDING_CARD_FRAMES;

export const calculateNews03sMetadata: CalculateMetadataFunction<Record<string, unknown>> = () => ({
  durationInFrames: EPISODE03_FRAMES,
});

// パネルの区間（同じ @show が続く間）
type Segment = {show: string; from: number; to: number; lines: Timed[]};
const SEGMENTS: Segment[] = (() => {
  const segs: Segment[] = [];
  LINES.forEach((l) => {
    const last = segs[segs.length - 1];
    if (l.show && last && last.show === l.show && last.lines[last.lines.length - 1].idx === l.idx - 1) {
      last.lines.push(l);
    } else if (l.show) {
      segs.push({show: l.show, from: l.start, to: l.end, lines: [l]});
    }
  });
  segs.forEach((s) => {
    const lastLine = s.lines[s.lines.length - 1];
    const next = LINES[lastLine.idx + 1];
    s.to = next ? next.start : END + TAIL;
  });
  return segs;
})();

// セリフ単位の補足メモ（パネルの下に出す）
const NOTES: Record<string, string> = {
  '05_genjou-003': '参加人口は推計値（日本生産性本部『レジャー白書2026』）',
  '06_ip-009': 'IP ＝ 知的財産（キャラクター・物語・作品のブランド）',
  '06_ip-019': '【ナギバクの考察】コンテンツ全体の価値を高める動き？',
  '06_ip-021': 'ここまでの「狙い」は公開情報をもとにした考察',
  '07_muzu-005': '企業の知名度 ≠ キャラクターの人気',
  '07_muzu-010': '一般の配信者と企業公式では、求められる責任が違う',
  '07_muzu-012': '公式だからこそ作れる映像・メーカーの知識を生かした企画も',
};

const lineAt = (frame: number): Timed | null => {
  for (let i = LINES.length - 1; i >= 0; i--) {
    if (frame >= LINES[i].start) return LINES[i];
  }
  return null;
};

const chapterAt = (frame: number): string => {
  let id = CHAPTER_STARTS[0].id;
  for (const c of CHAPTER_STARTS) if (frame >= c.at - 10) id = c.id;
  return id;
};

// 寄りのカット（@dir focus=）
const focusAt = (frame: number): {who: 'nagi' | 'baku'; zoom: number; p: number} | null => {
  const l = lineAt(frame);
  if (!l || !l.focus || l.zoom <= 1) return null;
  const s = l.start - 2;
  const e = Math.min(l.end + 6, l.start + FOCUS_MAX);
  if (frame < s || frame >= e) return null;
  return {who: l.focus, zoom: l.zoom, p: (frame - s) / (e - s)};
};

// ───────────────────────── 番組の固定パーツ
const TopBug: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [OP_FRAMES, OP_FRAMES + 12], [0, 1], clamp);
  const ch = CHAPTERS[chapterAt(frame)];
  return (
    <div
      style={{
        position: 'absolute',
        left: 50,
        top: 40,
        display: 'flex',
        alignItems: 'stretch',
        opacity: o,
        translate: `${(1 - o) * -40}px 0px`,
        fontFamily: JP,
        fontWeight: 900,
        color: 'white',
        filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.3))',
      }}
    >
      <div style={{background: RED, padding: '6px 18px', fontSize: 28, letterSpacing: 3}}>NAGIBAKU NEWS</div>
      <div
        style={{
          background: 'rgba(6,26,74,0.9)',
          padding: '6px 20px',
          fontSize: 28,
          letterSpacing: 3,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <span style={{color: ORANGE, fontSize: 22}}>TOPIC</span>
        {ch ? ch.title : ''}
      </div>
    </div>
  );
};

const HeadlineBar: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [OP_FRAMES + 6, OP_FRAMES + 24], [0, 1], {...clamp, easing: OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 52,
        height: 74,
        display: 'flex',
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
      }}
    >
      <div
        style={{
          background: RED,
          color: 'white',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 34,
          padding: '0 30px',
          display: 'flex',
          alignItems: 'center',
          letterSpacing: 4,
        }}
      >
        ニュース
      </div>
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(90deg, #ffffff 0%, #eef4ff 100%)',
          color: BLUE_DEEP,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 44,
          padding: '0 30px',
          display: 'flex',
          alignItems: 'center',
          letterSpacing: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {TITLE.headline}　{TITLE.headline_sub}
      </div>
    </div>
  );
};

const Ticker: React.FC = () => {
  const frame = useCurrentFrame();
  const text = `　●　${TITLE.label}　●　業界ニュースをナギとバクが解説　●　${TITLE.ticker_body}`;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 52, background: BLUE_DEEP, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 1920 - (frame - OP_FRAMES) * 4,
          whiteSpace: 'nowrap',
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 30,
          color: 'white',
          letterSpacing: 2,
        }}
      >
        {text.repeat(40)}
      </div>
    </div>
  );
};

// ───────────────────────── キャスター
const CASTERS = {
  ナギ: {src: 'nagi.png', left: -10, height: 620, face: {x: 235, y: 760}},
  バク: {src: 'baku_stand.png', left: 1318, height: 620, face: {x: 1625, y: 750}}, // 2026-11-28 新しい立ち絵（両耳あり）
} as const;

// 無言の間（前のセリフの終わり〜このセリフの頭）に相手・パネルを見る。dir：-1＝左（ナギ・パネル側）／+1＝右（バク側）
const LOOKS: {id: string; who: 'ナギ' | 'バク'; dir: number; slow?: boolean; hold?: number}[] = [
  {id: '03_member-009', who: 'バク', dir: -1, hold: 10},   // 「……キャラ被っとるやん」のあと、不満そうにパネルを見る
  {id: '07_muzu-012', who: 'ナギ', dir: 1, hold: 4},       // 「文句言い放題やな」に、ナギは無言でバクを見る
  {id: '08_kiki-006', who: 'バク', dir: -1, slow: true, hold: 40}, // 「ナギナミ……」のあと、ゆっくりナギを見る
];
const lookOf = (who: 'ナギ' | 'バク', frame: number) => {
  for (const L of LOOKS) {
    if (L.who !== who) continue;
    const i = LINES.findIndex((l) => l.id === L.id);
    if (i <= 0) continue;
    const a = LINES[i - 1].end;
    const b = LINES[i].start + (L.hold ?? 0);
    if (frame < a || frame > b + 12) continue;
    const inP = interpolate(frame, [a, a + (L.slow ? 24 : 8)], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)});
    const outP = interpolate(frame, [b, b + 12], [1, 0], clamp);
    return L.dir * Math.min(inP, outP);
  }
  return 0;
};
// エンディング：最後のセリフの前の沈黙でバクがカメラの正面へ → セリフ → お辞儀
const LAST = LINES[LINES.length - 1];
const FRONT_FROM = LINES[LINES.length - 2].end + 12;
const FRONT_TO = LAST.start - 6;
const BOW_AT = LAST.end + 8;

const Caster: React.FC<{who: 'ナギ' | 'バク'}> = ({who}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = CASTERS[who];
  const look = lookOf(who, frame);
  const front = who === 'バク' ? interpolate(frame, [FRONT_FROM, FRONT_TO], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)}) : 0;
  const bow = who === 'バク' ? interpolate(frame, [BOW_AT, BOW_AT + 16, BOW_AT + 70, BOW_AT + 92], [0, 1, 1, 0.85], {...clamp, easing: Easing.inOut(Easing.quad)}) : 0;
  const stare = who === 'ナギ' ? interpolate(frame, [FRONT_FROM, FRONT_TO], [0, 1], clamp) : 0;
  const line = lineAt(frame);
  const speaking = !!line && line.speaker === who && frame < line.end;
  const env = speaking ? line!.env[frame - line!.start] ?? 0 : 0;
  const hop = speaking ? spring({frame: frame - line!.start, fps, config: {damping: 10, stiffness: 260}}) : 1;
  const hopY = speaking ? (1 - hop) * (line!.tsukkomi ? 50 : 26) : 0;
  const breathe = Math.sin(frame / 22 + (who === 'ナギ' ? 0 : 2)) * 3;
  const enter = spring({frame: frame - OP_FRAMES - (who === 'ナギ' ? 4 : 10), fps, config: {damping: 16}});
  return (
    <Img
      src={staticFile(c.src)}
      style={{
        position: 'absolute',
        left: c.left,
        top: 1090 - c.height,
        height: c.height,
        translate: `${(1 - enter) * (who === 'ナギ' ? -600 : 600) + look * 34 + stare * 30 + front * (960 - 1599)}px ${-env * 12 + hopY + breathe + bow * 40}px`,
        rotate: `${look * 5 + stare * 4}deg`,
        scale: `${(1 + env * 0.015) * (1 + front * 0.12) * (1 + bow * 0.04)} ${(1 + env * 0.015) * (1 + front * 0.12) * (1 - bow * 0.22)}`,
        transformOrigin: '50% 100%',
        filter: speaking
          ? 'drop-shadow(0 16px 30px rgba(0,20,80,0.45)) brightness(1.03)'
          : 'drop-shadow(0 16px 30px rgba(0,20,80,0.35)) brightness(0.86) saturate(0.85)',
      }}
    />
  );
};

// ───────────────────────── スタジオ（カメラ）
const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const f = focusAt(frame);
  let style: React.CSSProperties;
  if (f) {
    // 寄りのカット：顔を画面の少し上寄りに置き、ゆっくり押し込む
    const face = CASTERS[f.who === 'nagi' ? 'ナギ' : 'バク'].face;
    const z = f.zoom * (1 + 0.04 * f.p);
    const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - face.x * z));
    const ty = Math.min(0, Math.max(1080 - 1080 * z, 470 - face.y * z));
    style = {transformOrigin: '0 0', scale: z, translate: `${tx}px ${ty}px`};
  } else {
    const cam = interpolate(frame - OP_FRAMES, [0, 20], [1.12, 1.0], {...clamp, easing: Easing.inOut(Easing.cubic)});
    const drift = 1 + 0.02 * Math.sin((frame - OP_FRAMES) / 400);
    style = {scale: cam * drift};
  }
  return (
    <AbsoluteFill style={style}>
      <Img src={staticFile('studio.png')} style={{width: 1920, height: 1080}} />
      <Img src={staticFile('desk.png')} style={{position: 'absolute', width: 1920, height: 1080}} />
      <Caster who="ナギ" />
      <Caster who="バク" />
    </AbsoluteFill>
  );
};

// ───────────────────────── 字幕
const Telop: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line || frame > line.end + 40) return null;
  const local = frame - line.start;
  const p = interpolate(local, [0, 5], [0, 1], {...clamp, easing: OUT});
  const t = line.tsukkomi;
  const color = t ? RED : line.speaker === 'ナギ' ? BLUE : ORANGE;
  const shake = t ? Math.sin(local * 2.4) * interpolate(local, [0, 12], [10, 0], clamp) : 0;
  return (
    <div style={{position: 'absolute', left: 380, right: 380, bottom: 150, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 18,
          border: `${t ? 7 : 5}px solid ${color}`,
          padding: '22px 40px 20px',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: t ? 64 : 50,
          lineHeight: 1.35,
          color: t ? RED : BLUE_DEEP,
          textAlign: 'center',
          maxWidth: 1160,
          textWrap: 'balance',
          wordBreak: 'auto-phrase' as React.CSSProperties['wordBreak'],
          opacity: p,
          translate: `${shake}px ${(1 - p) * 14}px`,
          scale: t ? interpolate(local, [0, 6], [1.25, 1], {...clamp, easing: OUT}) : 1,
          boxShadow: '0 12px 30px rgba(0,20,80,0.3)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -26,
            left: line.speaker === 'ナギ' ? 24 : undefined,
            right: line.speaker !== 'ナギ' ? 24 : undefined,
            background: color,
            color: 'white',
            fontSize: 28,
            padding: '2px 18px',
            borderRadius: 10,
            letterSpacing: 4,
          }}
        >
          {line.speaker}
        </div>
        {line.text}
      </div>
    </div>
  );
};

// ───────────────────────── パネル共通
const PanelFrame: React.FC<{seg: Segment; tag: string; children: React.ReactNode}> = ({seg, tag, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - seg.from, fps, config: {damping: 18, stiffness: 160}});
  const out = interpolate(frame, [seg.to - 2, seg.to + 8], [0, 1], {...clamp, easing: OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: 400,
        top: 120,
        width: 1120,
        height: 560,
        borderRadius: 26,
        background: 'linear-gradient(160deg, #ffffff, #e8f1ff)',
        boxShadow: '0 30px 60px rgba(0,20,80,0.45), inset 0 0 0 3px rgba(255,255,255,0.8)',
        overflow: 'hidden',
        scale: interpolate(s, [0, 1], [0.86, 1]) * interpolate(out, [0, 1], [1, 0.94]),
        opacity: Math.min(s * 1.5, 1) * (1 - out),
        rotate: `${(1 - s) * -2}deg`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: 60,
          background: `linear-gradient(90deg, ${BLUE_DEEP}, ${BLUE})`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 30px',
          gap: 16,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 26,
          color: 'white',
          letterSpacing: 4,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{width: 12, height: 12, borderRadius: 6, background: ORANGE, flexShrink: 0}} />
        {tag}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 60, bottom: 0, fontFamily: JP}}>{children}</div>
    </div>
  );
};

// 公式画像のクレジット（©HEIWA）
const ImgCredit: React.FC<{text?: string}> = ({text}) => (
  <div style={{position: 'absolute', right: 26, top: -44, fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.88)', fontFamily: JP, letterSpacing: 1}}>{text ?? '画像：©HEIWA（キュインPORTAL）'}</div>
);

// 手描き風のマル
const HandCircle: React.FC<{at: number; x: number; y: number; w: number; h: number; color?: string}> = ({
  at: start,
  x,
  y,
  w,
  h,
  color = RED,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 16], [0, 1], {...clamp, easing: OUT});
  const rx = w / 2;
  const ry = h / 2;
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2.15 - 0.4;
    const k = 1 + 0.05 * Math.sin(i / 5);
    pts.push(`${rx + Math.cos(t) * rx * k},${ry + Math.sin(t) * ry * (k + i / 900)}`);
  }
  const len = 2.2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  return (
    <svg width={w + 20} height={h + 20} style={{position: 'absolute', left: x - 10, top: y - 10, overflow: 'visible'}}>
      <polyline
        points={pts.join(' ')}
        transform="translate(10 10)"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
        opacity={0.9}
      />
    </svg>
  );
};

// マーカー線
const Marker: React.FC<{at: number; color?: string}> = ({at: start, color = 'rgba(255,138,31,0.45)'}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 10], [0, 1], {...clamp, easing: OUT});
  return (
    <span
      style={{
        position: 'absolute',
        left: -8,
        bottom: 4,
        height: '42%',
        width: `calc(${p * 100}% + 16px)`,
        background: color,
        borderRadius: 6,
        zIndex: -1,
      }}
    />
  );
};

// 区間のセリフの中で、文字列が最初に出てくる時点（なければ null）
const mentionAt = (seg: Segment, needles: string[], frac = 0.15): number | null => {
  for (const l of seg.lines) {
    if (needles.some((n) => n && l.text.includes(n))) return l.start + Math.round(l.frames * frac);
  }
  return null;
};

// ───────────────────────── 各パネル
const HeadlinePanel: React.FC<{seg: Segment}> = ({seg}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [seg.from + 6, seg.from + 20], [0, 1], {...clamp, easing: OUT});
  const [l1, l2] = (TITLE.main || '').split('\n');
  const sub = (TITLE.sub || '').replace(/【[^】]*】/, '');
  return (
    <PanelFrame seg={seg} tag="今回のニュース">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          fontWeight: 900,
          color: BLUE_DEEP,
        }}
      >
        <div style={{fontSize: 34, color: BLUE, letterSpacing: 8, opacity: p}}>PACHINKO NEWS</div>
        <div style={{fontSize: 64, marginTop: 10, opacity: p}}>{l1}</div>
        <div
          style={{
            position: 'relative',
            fontSize: 104,
            color: RED,
            whiteSpace: 'nowrap',
            translate: `0px ${(1 - p) * 30}px`,
            opacity: p,
            isolation: 'isolate',
          }}
        >
          {l2}
          <Marker at={seg.from + 24} />
        </div>
        <div style={{fontSize: 38, marginTop: 22, opacity: p, color: '#3a4a6b'}}>{sub}</div>
      </div>
    </PanelFrame>
  );
};

const FlowPanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = data.steps as {t: string; s: string; key?: boolean}[];
  const X0 = 175;
  const STEP_W = (1120 - 2 * X0) / (steps.length - 1);
  const ons = steps.map((st) => mentionAt(seg, [st.t], st.key ? 0.55 : 0.05) ?? seg.from + 4);
  const sorted = [...ons].sort((a, b) => a - b);
  const lineP = interpolate(frame, sorted, sorted.map((_, i) => i / (sorted.length - 1)), {...clamp, easing: OUT});
  const keyIdx = steps.findIndex((s) => s.key);
  return (
    <PanelFrame seg={seg} tag={`${data.tag}｜${data.heading}`}>
      <div style={{position: 'absolute', left: X0, top: 196, width: STEP_W * (steps.length - 1), height: 8, background: '#d3dcef', borderRadius: 4}} />
      <div
        style={{
          position: 'absolute',
          left: X0,
          top: 196,
          width: STEP_W * (steps.length - 1) * lineP,
          height: 8,
          background: `linear-gradient(90deg, ${BLUE}, ${ORANGE})`,
          borderRadius: 4,
        }}
      />
      {steps.map((st, i) => {
        const on = frame >= ons[i];
        const s = spring({frame: frame - ons[i], fps, config: {damping: 12, stiffness: 200}});
        const x = X0 + i * STEP_W;
        const c = st.key ? RED : BLUE;
        return (
          <div key={i}>
            <div
              style={{
                position: 'absolute',
                left: x - 22,
                top: 178,
                width: 44,
                height: 44,
                borderRadius: 22,
                background: on ? c : '#d3dcef',
                border: '6px solid white',
                boxShadow: on ? `0 0 0 ${s * 10}px ${c}33` : 'none',
                scale: on ? interpolate(s, [0, 1], [0.6, 1]) : 0.8,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x - 130,
                width: 260,
                top: 90,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                fontWeight: 900,
                fontSize: st.key ? 36 : 31,
                color: on ? (st.key ? RED : BLUE_DEEP) : '#a9b4cc',
                translate: `0px ${on ? (1 - s) * 16 : 0}px`,
              }}
            >
              {st.t}
            </div>
            <div
              style={{
                position: 'absolute',
                left: x - 130,
                width: 260,
                top: 250,
                textAlign: 'center',
                fontWeight: 700,
                fontSize: 29,
                lineHeight: 1.3,
                color: on ? INK : '#b8c1d6',
                textWrap: 'balance',
                wordBreak: 'auto-phrase' as React.CSSProperties['wordBreak'],
              }}
            >
              {st.s}
            </div>
          </div>
        );
      })}
      {keyIdx >= 0 ? (
        <HandCircle at={ons[keyIdx] + 6} x={X0 + keyIdx * STEP_W - 135} y={78} w={270} h={80} />
      ) : null}
    </PanelFrame>
  );
};

const KeywordPanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const isQuestion = String(data.tag).includes('QUESTION');
  if (isQuestion) {
    const qs = String(data.word).split(/\s+/).filter(Boolean);
    const first = seg.lines[0];
    return (
      <PanelFrame seg={seg} tag={`${data.tag}｜今回見るのは${qs.length}つ`}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 150,
            gap: 50,
            fontWeight: 900,
          }}
        >
          {qs.map((q, i) => {
            const start = first.start + Math.round(first.frames * (0.3 + i * 0.32));
            const s = spring({frame: frame - start, fps, config: {damping: 13, stiffness: 180}});
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 26, opacity: Math.min(1, s * 1.4), translate: `${(1 - s) * 80}px 0px`}}>
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 20,
                    background: i % 2 ? ORANGE : BLUE,
                    color: 'white',
                    fontSize: 60,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{position: 'relative', fontSize: 84, color: BLUE_DEEP, isolation: 'isolate'}}>
                  {q}
                  <Marker at={start + 10} />
                </div>
              </div>
            );
          })}
        </div>
      </PanelFrame>
    );
  }
  const word = String(data.word);
  const size = word.length <= 6 ? 130 : word.length <= 9 ? 104 : 84;
  const s = spring({frame: frame - seg.from - 6, fps, config: {damping: 11, stiffness: 170}});
  if (data.img || data.imgs) {
    const wide = !!data.img;
    const im = spring({frame: frame - seg.from - 2, fps, config: {damping: 15, stiffness: 150}});
    return (
      <PanelFrame seg={seg} tag={data.tag}>
        {wide ? (
          <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, fontWeight: 900}}>
            <Img
              src={staticFile(`news03/img/${data.img}`)}
              style={{height: 300, borderRadius: 16, boxShadow: '0 12px 28px rgba(0,20,80,0.3)', opacity: Math.min(1, im * 1.4), scale: interpolate(im, [0, 1], [0.92, 1])}}
            />
            <div style={{fontSize: 78, color: BLUE_DEEP, marginTop: 10, opacity: Math.min(1, s * 1.4), letterSpacing: 4}}>{word}</div>
            <div style={{fontSize: 26, color: '#43506b', marginTop: 2, whiteSpace: 'nowrap'}}>{data.sub}</div>
          </div>
        ) : (
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', fontWeight: 900}}>
            <div style={{width: 520, height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 0, paddingBottom: 26}}>
              {(data.imgs as string[]).map((f, i) => {
                const sp = spring({frame: frame - seg.from - 2 - i * 6, fps, config: {damping: 15, stiffness: 150}});
                return (
                  <Img
                    key={f}
                    src={staticFile(`news03/img/${f}`)}
                    style={{height: 420, maxWidth: 260, objectFit: 'contain', opacity: Math.min(1, sp * 1.4), translate: `0px ${(1 - sp) * 40}px`, filter: 'drop-shadow(0 10px 14px rgba(0,20,80,0.25))'}}
                  />
                );
              })}
            </div>
            <div style={{flex: 1, paddingRight: 40}}>
              <div style={{fontSize: Math.min(size, 110, Math.floor(540 / word.length)), color: BLUE_DEEP, whiteSpace: 'nowrap', opacity: Math.min(1, s * 1.4), translate: `${(1 - s) * 40}px 0px`}}>{word}</div>
              <div style={{fontSize: 26, color: '#43506b', marginTop: 12, lineHeight: 1.5, whiteSpace: 'pre'}}>{data.sub}</div>
            </div>
          </div>
        )}
        <ImgCredit text={data.credit} />
      </PanelFrame>
    );
  }
  return (
    <PanelFrame seg={seg} tag={data.tag}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: 30,
          fontWeight: 900,
        }}
      >
        <div
          style={{
            position: 'relative',
            fontSize: size,
            color: BLUE_DEEP,
            whiteSpace: 'nowrap',
            isolation: 'isolate',
            scale: interpolate(s, [0, 1], [0.7, 1]),
            opacity: Math.min(1, s * 1.5),
          }}
        >
          {word}
          <Marker at={seg.from + 22} />
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 34,
            fontWeight: 700,
            color: INK,
            maxWidth: 940,
            textAlign: 'center',
            lineHeight: 1.45,
            textWrap: 'balance',
            wordBreak: 'auto-phrase' as React.CSSProperties['wordBreak'],
            opacity: interpolate(frame, [seg.from + 16, seg.from + 26], [0, 1], clamp),
          }}
        >
          {data.sub}
        </div>
      </div>
    </PanelFrame>
  );
};

const AnalysisPanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const bars = data.bars as {k: string; sub: string; value: number; key?: boolean}[];
  const MAX = (data.max as number) ?? 100;
  const TRACK = bars.length > 3 ? 400 : 560;
  const many = bars.length > 3;
  return (
    <PanelFrame seg={seg} tag={`DATA｜${data.heading}`}>
      <div style={{position: 'absolute', left: 70, right: 70, top: many ? 26 : 60, display: 'flex', flexDirection: 'column', gap: many ? 18 : 54}}>
        {bars.map((b, i) => {
          const on = mentionAt(seg, [String(b.value)], 0.35) ?? seg.from + 10 + i * 20;
          const p = interpolate(frame, [on, on + 28], [0, 1], {...clamp, easing: OUT});
          const c = b.key ? RED : BLUE;
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 26, opacity: frame >= on - 2 ? 1 : 0.25}}>
              <div style={{width: 250}}>
                <div style={{fontSize: many ? 34 : 40, fontWeight: 900, color: BLUE_DEEP}}>{b.k}</div>
                <div style={{fontSize: many ? 19 : 22, fontWeight: 700, color: '#6a7894', marginTop: 2, whiteSpace: 'nowrap'}}>{b.sub}</div>
              </div>
              <div style={{position: 'relative', width: TRACK, height: many ? 50 : 64, background: '#dfe7f6', borderRadius: 12, overflow: 'hidden'}}>
                <div
                  style={{
                    width: (TRACK * b.value * p) / MAX,
                    height: '100%',
                    background: b.key ? `linear-gradient(90deg, ${ORANGE}, ${RED})` : `linear-gradient(90deg, #7fb0ff, ${BLUE})`,
                    borderRadius: 12,
                  }}
                />
              </div>
              <div style={{fontSize: many ? 54 : 70, fontWeight: 900, color: c, width: many ? 250 : 190, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'}}>
                {(b.value * p).toFixed(data.decimals ?? (b.key ? 1 : 0))}
                <span style={{fontSize: many ? 30 : 36}}>{(data.unit as string) ?? '%'}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 70, right: 70, bottom: 36, display: 'flex', flexDirection: 'column', gap: 8}}>
        {((data.note as string[]) ?? []).map((n, i) => (
          <div key={i} style={{fontSize: 26, fontWeight: 700, color: INK, opacity: interpolate(frame, [seg.from + 30 + i * 10, seg.from + 40 + i * 10], [0, 1], clamp)}}>
            <span style={{color: ORANGE}}>●</span> {n}
          </div>
        ))}
      </div>
    </PanelFrame>
  );
};

const TablePanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rows = data.rows as {k: string; v: string; s: string; key?: boolean}[];
  const line = lineAt(frame);
  const hl = line && seg.lines.includes(line as Timed) ? line.hl : null;
  return (
    <PanelFrame seg={seg} tag={`${data.tag}｜${data.heading}`}>
      <div style={{position: 'absolute', left: 50, right: 50, top: 34, display: 'flex', flexDirection: 'column', gap: 16}}>
        {rows.map((r, i) => {
          const on =
            mentionAt(seg, [`${i + 1}つ目`], 0.05) ??
            mentionAt(seg, [r.v, r.v.split('・')[0], r.k.length > 1 ? r.k : ''], 0.1) ??
            seg.from + 8 + i * 8;
          const s = spring({frame: frame - on, fps, config: {damping: 15, stiffness: 190}});
          const lit = hl === i;
          const dim = hl != null && !lit;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 26,
                height: 100,
                padding: '0 28px',
                borderRadius: 16,
                background: lit ? '#fff4e8' : 'white',
                border: `3px solid ${lit ? ORANGE : '#dfe7f6'}`,
                boxShadow: lit ? `0 10px 30px ${ORANGE}55` : '0 4px 12px rgba(0,20,80,0.08)',
                opacity: (frame >= on ? Math.min(1, s * 1.4) : 0.18) * (dim ? 0.45 : 1),
                translate: `${frame >= on ? (1 - s) * 60 : 0}px 0px`,
                scale: lit ? 1.03 : 1,
              }}
            >
              <div
                style={{
                  minWidth: 74,
                  height: 64,
                  padding: '0 12px',
                  borderRadius: 12,
                  background: r.key || lit ? ORANGE : BLUE,
                  color: 'white',
                  fontSize: r.k.length > 1 ? 28 : 40,
                  fontWeight: 900,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.k}
              </div>
              <div style={{fontSize: 44, fontWeight: 900, color: r.key ? RED : BLUE_DEEP, whiteSpace: 'nowrap'}}>{r.v}</div>
              <div style={{flex: 1, textAlign: 'right', fontSize: 27, fontWeight: 700, color: '#5a6884', whiteSpace: 'nowrap'}}>{r.s}</div>
            </div>
          );
        })}
      </div>
    </PanelFrame>
  );
};

const VersusPanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const neutral = !!data.neutral;
  const Side: React.FC<{d: any; delay: number; bad: boolean}> = ({d, delay, bad}) => {
    const s = spring({frame: frame - seg.from - delay, fps, config: {damping: 14, stiffness: 170}});
    const c = neutral ? (bad ? ORANGE : BLUE) : bad ? RED : BLUE;
    return (
      <div
        style={{
          width: 450,
          height: d.imgs ? 400 : 330,
          borderRadius: 22,
          background: 'white',
          border: `5px solid ${c}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: d.imgs ? 6 : 14,
          opacity: Math.min(1, s * 1.4),
          translate: `0px ${(1 - s) * 50}px`,
          boxShadow: `0 16px 34px ${c}33`,
        }}
      >
        {d.imgs && (
          <div style={{display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: 190, marginBottom: -6}}>
            {(d.imgs as string[]).map((f) => (
              <Img key={f} src={staticFile(`news03/img/${f}`)} style={{height: 190, maxWidth: d.imgs.length > 2 ? 130 : 170, objectFit: 'contain'}} />
            ))}
          </div>
        )}
        <div style={{fontSize: 32, fontWeight: 900, color: BLUE_DEEP, whiteSpace: 'nowrap'}}>{d.k}</div>
        <div style={{fontSize: d.imgs ? 60 : String(d.v).length > 4 ? 70 : 88, fontWeight: 900, color: c, whiteSpace: 'nowrap', lineHeight: 1.05}}>{d.v}</div>
        <div
          style={{
            fontSize: 25,
            fontWeight: 900,
            color: 'white',
            background: c,
            whiteSpace: 'nowrap',
            padding: '6px 18px',
            borderRadius: 10,
          }}
        >
          {neutral ? '' : bad ? '✕ ' : '○ '}
          {d.s}
        </div>
      </div>
    );
  };
  const vs = spring({frame: frame - seg.from - 16, fps, config: {damping: 9, stiffness: 220}});
  return (
    <PanelFrame seg={seg} tag={`VS｜${data.heading}`}>
      <div style={{position: 'absolute', left: 0, right: 0, top: data.left.imgs ? 18 : 50, display: 'flex', justifyContent: 'center', gap: 100}}>
        <Side d={data.left} delay={4} bad={false} />
        <Side d={data.right} delay={12} bad />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 500,
          top: 160,
          width: 120,
          height: 120,
          borderRadius: 60,
          background: BLUE_DEEP,
          color: 'white',
          fontSize: 50,
          fontWeight: 900,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          scale: vs,
          border: `5px solid ${ORANGE}`,
        }}
      >
        VS
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: data.left.imgs ? 40 : 34, textAlign: 'center', fontSize: 24, fontWeight: 700, color: '#6a7894'}}>
        {data.note}
      </div>
      {data.left.imgs && <ImgCredit />}
    </PanelFrame>
  );
};

const GalleryPanel: React.FC<{seg: Segment; data: any}> = ({seg, data}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = data.items as {img: string; name: string; sub: string; color: string}[];
  const line = lineAt(frame);
  const hl = line && seg.lines.includes(line as Timed) ? line.hl : null;
  return (
    <PanelFrame seg={seg} tag={`${data.tag}｜${data.heading}`}>
      <div style={{position: 'absolute', left: 30, right: 30, top: 14, bottom: 34, display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end'}}>
        {items.map((it, i) => {
          const on = mentionAt(seg, [it.name.split('・')[0]], 0.02) ?? seg.from + 8 + i * 8;
          const sp = spring({frame: frame - on, fps, config: {damping: 14, stiffness: 160}});
          const lit = hl === i;
          const dim = hl != null && !lit;
          return (
            <div
              key={i}
              style={{
                width: 330,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: Math.min(1, sp * 1.4) * (dim ? 0.45 : 1),
                translate: `0px ${(1 - sp) * 40}px`,
                scale: lit ? 1.04 : 1,
                filter: dim ? 'grayscale(0.5)' : 'none',
              }}
            >
              <Img src={staticFile(`news03/img/${it.img}`)} style={{height: 330, maxWidth: 330, objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(0,20,80,0.25))'}} />
              <div style={{marginTop: 6, fontSize: 32, fontWeight: 900, color: BLUE_DEEP, whiteSpace: 'nowrap', borderBottom: `6px solid ${it.color}`, padding: '0 8px'}}>{it.name}</div>
              <div style={{marginTop: 6, fontSize: 24, fontWeight: 800, color: '#43506b', whiteSpace: 'nowrap'}}>{it.sub}</div>
            </div>
          );
        })}
      </div>
      <ImgCredit />
    </PanelFrame>
  );
};

const EndingPanel: React.FC<{seg: Segment}> = ({seg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - seg.from - 4, fps, config: {damping: 12}});
  const btn = spring({frame: frame - (seg.lines[2]?.start ?? seg.from + 60), fps, config: {damping: 9, stiffness: 200}});
  return (
    <PanelFrame seg={seg} tag="SEE YOU NEXT TIME">
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20}}>
        <Img src={staticFile('logo.png')} style={{width: 560, scale: interpolate(s, [0, 1], [0.7, 1]), opacity: Math.min(1, s * 1.5)}} />
        <div style={{display: 'flex', gap: 24, alignItems: 'center'}}>
          <div style={{fontSize: 30, fontWeight: 900, color: INK, whiteSpace: 'nowrap'}}>{TITLE.ending_ask}</div>
          <div
            style={{
              background: RED,
              color: 'white',
              fontSize: 32,
              fontWeight: 900,
              padding: '10px 26px',
              borderRadius: 40,
              whiteSpace: 'nowrap',
              scale: interpolate(btn, [0, 1], [0.6, 1]),
              opacity: Math.min(1, btn * 1.5),
            }}
          >
            チャンネル登録
          </div>
        </div>
      </div>
    </PanelFrame>
  );
};

const Panel: React.FC<{seg: Segment}> = ({seg}) => {
  const frame = useCurrentFrame();
  if (frame < seg.from - 1 || frame > seg.to + 10) return null;
  const [type, key] = seg.show.split(':');
  const data = key ? PANELS[type]?.[key] : null;
  switch (type) {
    case 'headline':
      return <HeadlinePanel seg={seg} />;
    case 'ending':
      return <EndingPanel seg={seg} />;
    case 'flow':
      return <FlowPanel seg={seg} data={data} />;
    case 'keyword':
      return <KeywordPanel seg={seg} data={data} />;
    case 'analysis':
      return <AnalysisPanel seg={seg} data={data} />;
    case 'spec_table':
      return <TablePanel seg={seg} data={data} />;
    case 'versus':
      return <VersusPanel seg={seg} data={data} />;
    case 'gallery':
      return <GalleryPanel seg={seg} data={data} />;
    default:
      return null;
  }
};

// 寄りのカット中はパネルを隠す
const Panels: React.FC = () => {
  const frame = useCurrentFrame();
  const hidden = !!focusAt(frame);
  const away = interpolate(frame, [FRONT_FROM - 10, FRONT_FROM + 8], [1, 0], clamp); // バクが正面に出る前にパネルを下げる
  return (
    <AbsoluteFill style={{opacity: hidden ? 0 : away}}>
      {SEGMENTS.map((seg, i) => (
        <Panel key={i} seg={seg} />
      ))}
    </AbsoluteFill>
  );
};

// セリフに合わせた補足メモ
const NoteChip: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line || !NOTES[line.id] || focusAt(frame)) return null;
  const p = interpolate(frame, [line.start, line.start + 8, line.end + 2, line.end + 8], [0, 1, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 588, display: 'flex', justifyContent: 'center', opacity: p, translate: `0px ${(1 - p) * 12}px`}}>
      <div
        style={{
          background: BLUE_DEEP,
          color: 'white',
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 32,
          padding: '12px 30px',
          borderRadius: 12,
          borderLeft: `8px solid ${ORANGE}`,
          boxShadow: '0 10px 24px rgba(0,20,80,0.35)',
        }}
      >
        {NOTES[line.id]}
      </div>
    </div>
  );
};

// ───────────────────────── 章のアイキャッチ
const Eyecatch: React.FC<{at: number; id: string}> = ({at: a, id}) => {
  const frame = useCurrentFrame();
  const ch = CHAPTERS[id];
  const s = a - CH_GAP;
  const local = frame - s;
  if (local < 0 || local > CH_GAP + 2) return null;
  const inP = interpolate(local, [0, 10], [0, 1], {...clamp, easing: OUT});
  const outP = interpolate(local, [CH_GAP - 10, CH_GAP], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  const text = interpolate(local, [6, 16], [0, 1], {...clamp, easing: OUT});
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(120deg, ${BLUE_DEEP} 0%, #0e3aa8 60%, ${BLUE} 100%)`,
          clipPath: `polygon(${(1 - inP) * 160 - 20 + outP * 160}% 0, ${(1 - inP) * 160 + 140 + outP * 160}% 0, ${(1 - inP) * 160 + 120 + outP * 160}% 100%, ${(1 - inP) * 160 - 40 + outP * 160}% 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: JP,
          fontWeight: 900,
          color: 'white',
          opacity: text * (1 - outP),
          translate: `${(1 - text) * 120 - outP * 200}px 0px`,
        }}
      >
        <div style={{fontSize: 40, color: ORANGE, letterSpacing: 12}}>CHAPTER {ch.no}</div>
        <div style={{fontSize: 110, marginTop: 10, letterSpacing: 6}}>{ch.title}</div>
        <div
          style={{
            marginTop: 26,
            fontSize: 40,
            padding: '8px 30px',
            border: '3px solid rgba(255,255,255,0.7)',
            borderRadius: 40,
          }}
        >
          {ch.year}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Flash: React.FC<{at: number; len?: number}> = ({at: a, len = 10}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [a - 1, a, a + len], [0, 1, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{background: 'white', opacity: o}} />;
};

const EndFade: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [MAIN_END - 30, MAIN_END], [0, 1], clamp);
  return <AbsoluteFill style={{background: '#020816', opacity: o}} />;
};

// ───────────────────────── BGM
// 本編：既存のニュース用BGM（news_bed）。「資金力以外は」の前と、⑦ナギの無言の間は止める。
// 「それじゃあ、また次回」のあと全動画共通のED曲（common/ending_bgm.wav）に切り替え、本編の暗転後に共通エンドカード
const BED_LEN = 1107; // news_bed.wav のフレーム数（36.92秒）
const ED_BGM_AT = (() => {
  const i = LINES.findIndex((l) => l.id === '09_ed-005');
  return i >= 0 ? LINES[i].end + 8 : END;
})();
const DUCKS: [number, number][] = ['04_chigai-017', '07_muzu-012'].map((id) => {
  const i = LINES.findIndex((l) => l.id === id);
  return [LINES[i - 1].end - 4, LINES[i].start + 2] as [number, number];
});
const bgmVolume = (abs: number) => {
  const base = 0.24;
  let v = Math.min(interpolate(abs, [OP_FRAMES, OP_FRAMES + FPS], [0, base], clamp), base);
  for (const [a, b] of DUCKS) {
    const k = Math.max(interpolate(abs, [a - 8, a], [1, 0], clamp), interpolate(abs, [b, b + 16], [0, 1], clamp)); // 間の前後は1、間の中だけ0
    v = Math.min(v, base * k);
  }
  v *= interpolate(abs, [ED_BGM_AT - 16, ED_BGM_AT], [1, 0], clamp);
  return v;
};
// ED曲は台詞の下では控えめ、エンドカード（サビ）で上げ、最後にフェードアウト
const edVolume = (abs: number) =>
  interpolate(abs, [ED_BGM_AT, ED_BGM_AT + 20, MAIN_END - 6, MAIN_END + 6], [0, 0.26, 0.26, 0.5], clamp) *
  interpolate(abs, [EPISODE03_FRAMES - 45, EPISODE03_FRAMES], [1, 0], clamp);

// ───────────────────────── 全体
export const NewsEpisode03: React.FC = () => {
  return (
    <AbsoluteFill lang="ja" style={{background: '#020816'}}>
      <Sequence durationInFrames={OP_FRAMES} name="OP">
        <NewsOpening03 />
      </Sequence>

      <Sequence from={OP_FRAMES} name="本編" layout="none">
        <Sequence from={-OP_FRAMES} layout="none">
          <Stage />
          <Panels />
          <NoteChip />
          <Telop />
          <TopBug />
          <HeadlineBar />
          <Ticker />
          {CHAPTER_STARTS.filter((c) => c.id !== 'ed' && c.at > OP_FRAMES + LEAD).map((c) => (
            <Eyecatch key={c.id} at={c.at} id={c.id} />
          ))}
          <Flash at={OP_FRAMES} len={12} />
          <EndFade />
        </Sequence>
      </Sequence>
      {Array.from({length: Math.ceil((ED_BGM_AT - OP_FRAMES) / BED_LEN) + 1}).map((_, k) => (
        <Sequence key={`bed${k}`} from={OP_FRAMES + k * BED_LEN} durationInFrames={BED_LEN} name="BGM">
          <Audio src={staticFile('news_bed.wav')} volume={(f) => bgmVolume(f + OP_FRAMES + k * BED_LEN)} />
        </Sequence>
      ))}
      <Sequence from={ED_BGM_AT} name="ED BGM（全動画共通）">
        <Audio
          src={staticFile(ENDING_BGM)}
          trimBefore={endingBgmTrimBefore(ED_BGM_AT, MAIN_END)}
          volume={(f) => edVolume(f + ED_BGM_AT)}
        />
      </Sequence>
      <Sequence from={MAIN_END} durationInFrames={ENDING_CARD_FRAMES} name="エンドカード（全動画共通）">
        <NagibakuEndCard />
      </Sequence>

      {LINES.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.frames + GAP} name={`${l.speaker}: ${l.text.slice(0, 12)}`}>
          <Audio src={staticFile(`news03/${l.id}.wav`)} />
        </Sequence>
      ))}
      {SEGMENTS.map((s, i) => (
        <Sequence key={`se${i}`} from={s.from} durationInFrames={20} name="SE パネル">
          <Audio src={staticFile('se/pop.wav')} volume={0.35} />
        </Sequence>
      ))}
      {CHAPTER_STARTS.filter((c) => c.id !== 'ed' && c.at > OP_FRAMES + LEAD).map((c) => (
        <Sequence key={`ch${c.id}`} from={c.at - CH_GAP} durationInFrames={20} name="SE 章">
          <Audio src={staticFile('se/pop.wav')} volume={0.6} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
