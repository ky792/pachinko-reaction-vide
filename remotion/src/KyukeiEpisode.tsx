import React from 'react';
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Audio} from '@remotion/media';
import data from './data/kyu001.json';
import {SlotFlow, FlowMode} from './SlotFlow';

// ───────────────────────── 共通
const BLUE = '#2a6cff';
const BLUE_DEEP = '#0b1f4d';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const YELLOW = '#ffd23f';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

type Who = 'nagi' | 'baku';
type Line = {
  id: string | null;
  n: number;
  who: Who;
  text: string;
  face: string;
  start: number;
  end: number;
  env: number[];
  punch?: boolean;
  silent?: boolean;
  ochi?: boolean;
  fx?: string;
  key?: string[];
  focus?: {who: Who; zoom: number};
};
type Step = {at: number; end: number; v: number};
type Seg = {key: string; from: number; to: number; steps: Step[]; reveal?: [number, number]};

const LINES = data.lines as Line[];
const PANELS = data.panels as Seg[];
const CHAPTERS = data.chapters as {at: number; mark: string; title: string; noeye?: boolean}[];
const TOTAL = data.total as number;

export const calculateKyuMetadata: CalculateMetadataFunction<Record<string, unknown>> = () => ({
  durationInFrames: TOTAL,
});

const lineAt = (f: number): Line | null => {
  let cur: Line | null = null;
  for (const l of LINES) {
    if (l.start <= f) cur = l;
    else break;
  }
  return cur;
};
const startOf = (n: number) => LINES.find((l) => l.n === n)!.start;
const endOf = (n: number) => LINES.find((l) => l.n === n)!.end;
const faceOf = (who: Who, f: number) => {
  let face = who === 'nagi' ? 'normal' : 'happy';
  for (const l of LINES) {
    if (l.start > f) break;
    if (l.who === who) face = l.face;
  }
  return face;
};
const chapterAt = (f: number) => {
  let c = CHAPTERS[0];
  for (const ch of CHAPTERS) if (ch.at <= f) c = ch;
  return c;
};

// ───────────────────────── キャラ（バストアップ）
const SEAT = {
  nagi: {x: 255, h: 470},
  baku: {x: 1665, h: 470},
} as const;

const Bust: React.FC<{who: Who}> = ({who}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = lineAt(frame);
  const speaking = !!line && line.who === who && frame < line.end + 3;
  const face = faceOf(who, frame);
  const env = speaking && !line!.silent ? line!.env[frame - line!.start] ?? 0 : 0;
  const local = line ? frame - line.start : 999;
  const hop = speaking ? spring({frame: local, fps, config: {damping: 9, stiffness: 240}}) : 1;
  const strong = speaking && (line!.punch || ['excited', 'angry', 'surprised', 'despair'].includes(face));
  const hopY = speaking ? (1 - hop) * (strong ? 60 : 26) : 0;
  const breathe = Math.sin(frame / 20 + (who === 'nagi' ? 0 : 2.1)) * 4;
  const enter = spring({frame: frame - (who === 'nagi' ? 2 : 8), fps, config: {damping: 15}});
  const s = SEAT[who];
  const dir = who === 'nagi' ? -1 : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: s.x - 400,
        width: 800,
        bottom: -14,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        translate: `${(1 - enter) * dir * 520}px ${-env * 14 + hopY + breathe}px`,
        scale: `${(speaking ? 1 : 0.95) * (1 + env * 0.02)}`,
        transformOrigin: '50% 100%',
        filter: speaking
          ? 'drop-shadow(0 18px 26px rgba(10,20,60,0.45))'
          : 'drop-shadow(0 18px 26px rgba(10,20,60,0.3)) brightness(0.8) saturate(0.85)',
      }}
    >
      <Img src={staticFile(`kyu/${who}_${face}.png`)} style={{height: s.h, maxWidth: 640, objectFit: 'contain'}} />
    </div>
  );
};

// ───────────────────────── 背景エフェクト
const SpeedLines: React.FC<{cx: number; cy: number; t: number; color?: string}> = ({cx, cy, t, color = 'rgba(255,255,255,0.75)'}) => {
  const n = 64;
  const op = interpolate(t, [0, 4, 30, 40], [0, 1, 1, 0], clamp);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random(`a${i}${Math.floor(t / 2)}`) * 0.05;
    const r0 = 300 + random(`r${i}${Math.floor(t / 2)}`) * 220;
    const w = 6 + random(`w${i}`) * 16;
    const x1 = cx + Math.cos(a) * r0, y1 = cy + Math.sin(a) * r0;
    const x2 = cx + Math.cos(a) * 2200, y2 = cy + Math.sin(a) * 2200;
    const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
    lines.push(<polygon key={i} points={`${x1},${y1} ${x2 + nx},${y2 + ny} ${x2 - nx},${y2 - ny}`} fill={color} />);
  }
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: op}}>
      {lines}
    </svg>
  );
};

const Gloom: React.FC<{t: number}> = ({t}) => {
  const op = interpolate(t, [0, 10], [0, 1], clamp);
  const bars = [];
  for (let i = 0; i < 26; i++) {
    const x = 1180 + i * 28 + random(`g${i}`) * 10;
    const len = 300 + random(`gl${i}`) * 420;
    bars.push(<rect key={i} x={x} y={-20} width={5} height={len} fill="rgba(60,90,200,0.55)" />);
  }
  return (
    <>
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,0) 45%, rgba(10,20,70,0.55))', opacity: op}} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: op}}>
        {bars}
      </svg>
    </>
  );
};

const FxLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line || !line.fx || frame > line.end + 10) return null;
  const t = frame - line.start;
  if (line.fx === 'lines') return <SpeedLines cx={SEAT[line.who].x} cy={760} t={t} />;
  if (line.fx === 'gloom') return <Gloom t={frame - startOf(99)} />;
  if (line.fx === 'dark')
    return <AbsoluteFill style={{background: 'rgba(5,10,30,0.35)', opacity: interpolate(t, [0, 8], [0, 1], clamp)}} />;
  return null;
};

// ───────────────────────── カメラ（部屋＋キャラ）
const Room: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = lineAt(frame);
  let z = 1 + 0.025 * Math.sin(frame / 260);
  let tx = 0,
    ty = 0;
  if (line && line.focus) {
    const local = frame - line.start;
    const hold = Math.min(line.end - line.start + 10, line.ochi ? 400 : 75);
    const inP = spring({frame: local, fps, config: {damping: 18, stiffness: 160}});
    const outP = interpolate(local, [hold, hold + 10], [1, 0], clamp);
    const p = inP * outP;
    const zz = 1 + (line.focus.zoom - 1) * p;
    const fx = SEAT[line.focus.who].x;
    const fy = 760;
    z = zz;
    tx = Math.min(0, Math.max(1920 - 1920 * zz, 960 - fx * zz));
    ty = Math.min(0, Math.max(1080 - 1080 * zz, 600 - fy * zz));
  }
  let shake = 0;
  if (line && line.punch) {
    const local = frame - line.start;
    shake = Math.sin(local * 2.7) * interpolate(local, [0, 14], [14, 0], clamp);
  }
  const titleDim = interpolate(frame, [data.title_at, data.title_at + 6, data.title_at + 70, data.title_at + 80], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{transformOrigin: '0 0', scale: `${z}`, translate: `${tx + shake}px ${ty}px`}}>
      <Img src={staticFile('kyu/room.jpg')} style={{width: 1920, height: 1080}} />
      <FxLayer />
      <Bust who="nagi" />
      <Bust who="baku" />
      <AbsoluteFill style={{background: 'rgba(8,14,40,0.55)', opacity: titleDim}} />
    </AbsoluteFill>
  );
};

// ───────────────────────── 字幕（吹き出し）
const withKeys = (text: string, keys: string[] | undefined, color: string) => {
  if (!keys || !keys.length) return text;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    let best = -1,
      word = '';
    for (const w of keys) {
      const i = rest.indexOf(w);
      if (i >= 0 && (best < 0 || i < best)) {
        best = i;
        word = w;
      }
    }
    if (best < 0) {
      parts.push(rest);
      break;
    }
    if (best > 0) parts.push(rest.slice(0, best));
    parts.push(
      <span key={k++} style={{color, background: `linear-gradient(transparent 58%, ${YELLOW} 58%)`, padding: '0 4px'}}>
        {word}
      </span>
    );
    rest = rest.slice(best + word.length);
  }
  return parts;
};

const Telop: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line || line.ochi || frame > line.end + 30) return null;
  if (frame >= data.title_at && frame < data.title_at + 80) return null;
  const local = frame - line.start;
  const p = interpolate(local, [0, 5], [0, 1], {...clamp, easing: OUT});
  const nagi = line.who === 'nagi';
  const col = line.punch ? RED : nagi ? BLUE : ORANGE;
  const size = line.punch ? 58 : 50;
  const shake = line.punch ? Math.sin(local * 2.6) * interpolate(local, [0, 12], [9, 0], clamp) : 0;
  return (
    <div style={{position: 'absolute', left: 470, right: 470, bottom: 64, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 30,
          border: `${line.punch ? 8 : 6}px solid ${col}`,
          padding: '26px 44px 22px',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.38,
          color: line.punch ? RED : BLUE_DEEP,
          textAlign: 'center',
          maxWidth: 980,
          minWidth: 300,
          whiteSpace: 'pre-line',
          opacity: p,
          translate: `${shake}px ${(1 - p) * 16}px`,
          scale: `${line.punch ? interpolate(local, [0, 6], [1.22, 1], {...clamp, easing: OUT}) : 1}`,
          boxShadow: '0 14px 34px rgba(10,20,60,0.35)',
        }}
      >
        {/* しっぽ（話している側へ） */}
        <div
          style={{
            position: 'absolute',
            bottom: 26,
            [nagi ? 'left' : 'right']: -34,
            width: 0,
            height: 0,
            borderTop: '18px solid transparent',
            borderBottom: '18px solid transparent',
            [nagi ? 'borderRight' : 'borderLeft']: `34px solid ${col}`,
          } as React.CSSProperties}
        />
        <div
          style={{
            position: 'absolute',
            top: -30,
            [nagi ? 'left' : 'right']: 28,
            background: col,
            color: 'white',
            fontSize: 30,
            padding: '3px 22px',
            borderRadius: 14,
            letterSpacing: 5,
            boxShadow: '0 4px 0 rgba(0,0,0,0.18)',
          } as React.CSSProperties}
        >
          {nagi ? 'ナギ' : 'バク'}
        </div>
        {line.silent ? <span style={{letterSpacing: 10, color: '#7a86a8'}}>……</span> : withKeys(line.text, line.key, col)}
      </div>
    </div>
  );
};

// 大オチ：画面中央にドン
const Ochi: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = LINES.find((x) => x.ochi)!;
  const local = frame - l.start;
  if (local < 0 || frame > l.end + 24) return null;
  const s = spring({frame: local, fps, config: {damping: 11, stiffness: 210}});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120}}>
      <div
        style={{
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 150,
          color: '#4f8dff',
          WebkitTextStroke: '14px #08143a',
          paintOrder: 'stroke fill',
          scale: `${interpolate(s, [0, 1], [2.2, 1])}`,
          opacity: Math.min(1, local / 3),
          rotate: '-3deg',
          textShadow: '0 12px 0 rgba(0,0,0,0.25)',
        }}
      >
        {l.text}
      </div>
    </AbsoluteFill>
  );
};

// ───────────────────────── ホワイトボード風パネル
const Board: React.FC<{seg: Seg; title: string; color?: string; width?: number; children: React.ReactNode}> = ({
  seg,
  title,
  color = BLUE,
  width = 900,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: frame - seg.from, fps, config: {damping: 13, stiffness: 170}});
  const outP = interpolate(frame, [seg.to - 8, seg.to], [1, 0], clamp);
  const tilt = (random(seg.key) - 0.5) * 3;
  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 960 - width / 2,
        width,
        opacity: outP,
        translate: `0 ${(1 - inS) * -420 + (1 - outP) * -40}px`,
        rotate: `${tilt + (1 - inS) * -8}deg`,
      }}
    >
      {/* マスキングテープ */}
      <div style={{position: 'absolute', top: -18, left: 70, width: 150, height: 40, background: 'rgba(255,214,120,0.85)', rotate: '-6deg', zIndex: 2}} />
      <div style={{position: 'absolute', top: -18, right: 70, width: 150, height: 40, background: 'rgba(140,200,255,0.85)', rotate: '5deg', zIndex: 2}} />
      <div
        style={{
          background: '#fdfdf8',
          borderRadius: 18,
          border: '6px solid #d9dde6',
          boxShadow: '0 22px 50px rgba(10,20,60,0.45)',
          padding: '30px 40px 34px',
          fontFamily: JP,
          fontWeight: 900,
          color: BLUE_DEEP,
        }}
      >
        <div style={{fontSize: 46, color, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16}}>
          <span style={{width: 14, height: 46, background: color, borderRadius: 6, display: 'inline-block'}} />
          {title}
        </div>
        {children}
      </div>
    </div>
  );
};

const pop = (frame: number, at: number, fps: number) => spring({frame: frame - at, fps, config: {damping: 12, stiffness: 220}});

const Stamp: React.FC<{at: number; text: string; color?: string; x: number; y: number; size?: number; rot?: number}> = ({
  at,
  text,
  color = RED,
  x,
  y,
  size = 64,
  rot = -12,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < at) return null;
  const s = pop(frame, at, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        border: `8px solid ${color}`,
        color,
        borderRadius: 16,
        padding: '4px 22px',
        fontSize: size,
        fontWeight: 900,
        fontFamily: JP,
        background: 'rgba(255,255,255,0.85)',
        rotate: `${rot}deg`,
        scale: `${interpolate(s, [0, 1], [2.4, 1])}`,
        opacity: Math.min(1, (frame - at) / 3),
        whiteSpace: 'nowrap',
        zIndex: 5,
      }}
    >
      {text}
    </div>
  );
};

const Chips: React.FC<{seg: Seg; words: string[]; title: string; stamp?: {at: number; text: string}}> = ({seg, words, title, stamp}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [a, b] = seg.reveal!;
  return (
    <Board seg={seg} title={title} color={ORANGE} width={1000}>
      <div style={{position: 'relative', display: 'flex', flexWrap: 'wrap', gap: '16px 18px', justifyContent: 'center', minHeight: 260}}>
        {words.map((w, i) => {
          const at = a + ((b - a - 10) * i) / words.length;
          const s = pop(frame, at, fps);
          return (
            <div
              key={w}
              style={{
                fontSize: 44,
                padding: '8px 22px',
                borderRadius: 40,
                background: i % 3 === 0 ? '#e8f0ff' : i % 3 === 1 ? '#fff1e3' : '#f1f3f7',
                border: `4px solid ${i % 3 === 0 ? BLUE : i % 3 === 1 ? ORANGE : '#9aa3b8'}`,
                scale: `${s}`,
                rotate: `${(random(w) - 0.5) * 10}deg`,
                opacity: frame < at ? 0 : 1,
              }}
            >
              {w}
            </div>
          );
        })}
        {stamp ? <Stamp at={stamp.at} text={stamp.text} x={640} y={150} size={84} /> : null}
      </div>
    </Board>
  );
};

const stepVal = (seg: Seg, frame: number) => {
  let v = 0,
    at = seg.from,
    end = seg.from;
  for (const s of seg.steps) if (s.at <= frame) ((v = s.v), (at = s.at), (end = s.end));
  return {v, at, end};
};

// 行ごとに出す表（左：項目、右：中身）
const Rows: React.FC<{rows: [string, string, string?][]; shown: (i: number) => number}> = ({rows, shown}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
      {rows.map(([k, v, c], i) => {
        const at = shown(i);
        if (at < 0 || frame < at) return <div key={k} style={{height: 78}} />;
        const s = pop(frame, at, fps);
        const color = c === 'red' ? RED : c === 'yellow' ? ORANGE : BLUE_DEEP;
        return (
          <div
            key={k}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              height: 78,
              translate: `${(1 - s) * -60}px 0`,
              opacity: Math.min(1, s * 1.4),
            }}
          >
            <div style={{width: 300, fontSize: 40, background: c === 'red' ? RED : BLUE, color: 'white', borderRadius: 14, padding: '10px 0', textAlign: 'center'}}>{k}</div>
            <div style={{fontSize: 30, color: '#9aa3b8'}}>▶</div>
            <div style={{fontSize: 46, color, borderBottom: `5px dashed ${c ? color : '#c9cfdc'}`, paddingBottom: 2}}>{v}</div>
          </div>
        );
      })}
    </div>
  );
};

// 横に並ぶ流れ
const Flow: React.FC<{seg: Seg; title: string; steps: string[]; last?: string; color?: string}> = ({seg, title, steps, last, color = BLUE}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const [a, b] = seg.reveal!;
  return (
    <Board seg={seg} title={title} color={color} width={1180}>
      <div style={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 170}}>
        {steps.map((t, i) => {
          const at = a + ((b - a) * 0.8 * i) / steps.length;
          const s = pop(frame, at, fps);
          const final = i === steps.length - 1;
          return (
            <React.Fragment key={t}>
              {i > 0 ? <div style={{fontSize: 46, color: '#9aa3b8', opacity: frame < at ? 0 : 1}}>➜</div> : null}
              <div
                style={{
                  fontSize: 40,
                  padding: '16px 20px',
                  borderRadius: 20,
                  background: final ? color : 'white',
                  color: final ? 'white' : BLUE_DEEP,
                  border: `5px solid ${color}`,
                  scale: `${s}`,
                  opacity: frame < at ? 0 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </div>
            </React.Fragment>
          );
        })}
        {last ? <Stamp at={b - 14} text={last} x={840} y={-120} size={90} rot={10} /> : null}
      </div>
    </Board>
  );
};

const JobPanel: React.FC<{seg: Seg}> = ({seg}) => {
  const {v, at, end} = stepVal(seg, useCurrentFrame());
  const rows: [string, string, string?][] = [
    ['書類選考', 'CZ当選'],
    ['一次面接', 'CZ突破'],
    ['内定', 'AT当選', 'yellow'],
    ['初任給', '100枚ちょっと', 'red'],
  ];
  const first = seg.steps[1];
  const shown = (i: number) => {
    if (i < 3) return v >= 3 ? first.at + ((first.end - first.at) * 0.75 * i) / 3 : -1;
    return v >= 4 ? seg.steps.find((s) => s.v === 4)!.at + 10 : -1;
  };
  const st35 = seg.steps.find((s) => s.v === 3.5);
  const st5 = seg.steps.find((s) => s.v === 5);
  return (
    <Board seg={seg} title="スロット就活" color={ORANGE} width={980}>
      <div style={{position: 'relative'}}>
        <Rows rows={rows} shown={shown} />
        {st35 ? <Stamp at={st35.at + 6} text="10社連続 不採用" x={560} y={70} size={52} /> : null}
        {st5 ? <Stamp at={st5.at + 18} text="参加賞" x={620} y={-108} size={70} rot={8} /> : null}
      </div>
    </Board>
  );
};

const Job2Panel: React.FC<{seg: Seg}> = ({seg}) => {
  const rows: [string, string, string?][] = [
    ['試用期間', 'AT'],
    ['正社員', '上位AT', 'yellow'],
    ['即クビ', '上乗せできず終了', 'red'],
  ];
  const shown = (i: number) => {
    const s = seg.steps.find((x) => x.v === i + 1);
    return s ? s.at + 4 : -1;
  };
  const s3 = seg.steps.find((x) => x.v === 3);
  return (
    <Board seg={seg} title="入社してからも試験" color={ORANGE} width={980}>
      <div style={{position: 'relative'}}>
        <Rows rows={rows} shown={shown} />
        {s3 ? <Stamp at={s3.at + 8} text="クビ" x={660} y={-110} size={90} rot={10} /> : null}
      </div>
    </Board>
  );
};

const RowsPanel: React.FC<{seg: Seg; title: string; rows: [string, string, string?][]}> = ({seg, title, rows}) => {
  const shown = (i: number) => {
    if (seg.steps.length) {
      const s = [...seg.steps].reverse().find((x) => x.v >= i + 1);
      if (!s) return -1;
      const first = seg.steps.find((x) => x.v >= i + 1)!;
      const prevV = seg.steps[seg.steps.indexOf(first) - 1]?.v ?? 0;
      return first.at + ((first.end - first.at) * 0.7 * (i - prevV)) / Math.max(1, first.v - prevV);
    }
    const [a, b] = seg.reveal!;
    return a + ((b - a) * 0.75 * i) / rows.length;
  };
  return (
    <Board seg={seg} title={title} width={1040}>
      <Rows rows={rows} shown={shown} />
    </Board>
  );
};

const NeqPanel: React.FC<{seg: Seg}> = ({seg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(frame, seg.from + 18, fps);
  return (
    <Board seg={seg} title="結論" color={RED} width={1180}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, fontSize: 60, minHeight: 160}}>
        <span>仕組みが多い</span>
        <span style={{fontSize: 110, color: RED, scale: `${interpolate(s, [0, 1], [3, 1])}`, opacity: Math.min(1, s * 2)}}>≠</span>
        <span>面白い場面が多い</span>
      </div>
    </Board>
  );
};

const PekaPanel: React.FC<{seg: Seg}> = ({seg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const at = seg.from + 30;
  const s = pop(frame, at, fps);
  const glow = frame < at ? 0 : 0.6 + 0.4 * Math.abs(Math.sin((frame - at) / 5));
  return (
    <Board seg={seg} title="シンプルでも強い" color={BLUE} width={760}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, minHeight: 230}}>
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: '50%',
            background: frame < at ? '#3a3f4f' : `radial-gradient(circle, #fff6b0, ${YELLOW} 45%, ${ORANGE})`,
            boxShadow: frame < at ? 'none' : `0 0 ${90 * glow}px ${30 * glow}px rgba(255,200,40,0.85)`,
            border: '10px solid #22263a',
          }}
        />
        <div style={{fontSize: 120, color: ORANGE, scale: `${frame < at ? 0 : s}`, rotate: '-8deg', WebkitTextStroke: '6px #0b1f4d', paintOrder: 'stroke fill'}}>
          ペカッ
        </div>
      </div>
    </Board>
  );
};

const Panel: React.FC<{seg: Seg}> = ({seg}) => {
  if (seg.key.startsWith('flow_')) return <SlotFlow mode={seg.key.slice(5) as FlowMode} from={seg.from} to={seg.to} />;
  switch (seg.key) {
    case 'terms1':
      return (
        <Chips
          seg={seg}
          title="スロット用語（の一部）"
          words={['通常A', '通常B', '天国準備', '天国', '高確', '超高確', '規定ゲーム数', '周期抽選', 'CZ', 'AT', '上位AT', '差枚数管理', '有利区間']}
          stamp={{at: startOf(9), text: '呪文？'}}
        />
      );
    case 'terms2':
      return <Chips seg={seg} title="まだある" words={['上乗せ', 'セットストック', '特化ゾーン', '引き戻し', 'モード示唆', '設定示唆']} />;
    case 'route':
      return (
        <RowsPanel
          seg={seg}
          title="当たりまでの道（一例）"
          rows={[
            ['レア役', 'CZを抽選'],
            ['規定ゲーム数', '到達で当たり'],
            ['周期抽選', 'ポイントを貯める'],
          ]}
        />
      );
    case 'job':
      return <JobPanel seg={seg} />;
    case 'job2':
      return <Job2Panel seg={seg} />;
    case 'attype':
      return (
        <RowsPanel
          seg={seg}
          title="ATのタイプ（一例）"
          rows={[
            ['ゲーム数管理', '上乗せで伸ばす'],
            ['セット継続', '継続抽選を突破'],
            ['差枚数管理', '決まった枚数を消化'],
          ]}
        />
      );
    case 'yuuri':
      return (
        <RowsPanel
          seg={seg}
          title="有利区間（スマスロ）"
          rows={[
            ['有利区間', '出玉の上限に関わる仕組み'],
            ['切れた後', '恩恵で上位ATのチャンスを作る台も', 'yellow'],
          ]}
        />
      );
    case 'pachi':
      return <Flow seg={seg} title="パチンコ" steps={['ヘソに入れる', '当てる', 'RUSH', '連チャン']} last="以上！" color={ORANGE} />;
    case 'moments':
      return <Flow seg={seg} title="嬉しい瞬間（一例）" steps={['強レア役', '高確', 'CZ', '突破→AT']} />;
    case 'gyakuten':
      return <Flow seg={seg} title="AT中の逆転（一例）" steps={['残り10G', '強チェリー', '特化ゾーン', '一気に上乗せ']} color={ORANGE} />;
    case 'neq':
      return <NeqPanel seg={seg} />;
    case 'peka':
      return <PekaPanel seg={seg} />;
  }
  return null;
};

const Panels: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {PANELS.filter((s) => frame >= s.from && frame < s.to).map((s) => (
        <Panel key={s.key} seg={s} />
      ))}
    </>
  );
};

// ───────────────────────── 右上の章バッジ
const ChapterChip: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < data.title_at + 80 || frame >= data.end_card) return null;
  const c = chapterAt(frame);
  const s = spring({frame: frame - (c.noeye ? data.title_at + 80 : c.at + 40), fps, config: {damping: 14}});
  return (
    <div
      style={{
        position: 'absolute',
        top: 34,
        right: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: JP,
        fontWeight: 900,
        translate: `${(1 - s) * 500}px 0`,
      }}
    >
      <div style={{background: ORANGE, color: 'white', fontSize: 30, padding: '6px 16px', borderRadius: 12, letterSpacing: 2}}>TALK {c.mark}</div>
      <div style={{background: 'rgba(11,31,77,0.88)', color: 'white', fontSize: 36, padding: '6px 22px', borderRadius: 12, border: '3px solid rgba(255,255,255,0.7)'}}>
        {c.title}
      </div>
    </div>
  );
};

// ───────────────────────── 章のアイキャッチ（コースター風の帯）
const Eyecatch: React.FC<{at: number; mark: string; title: string}> = ({at, mark, title}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 46) return null;
  const inX = interpolate(t, [0, 9], [2200, 0], {...clamp, easing: OUT});
  const outX = interpolate(t, [36, 46], [0, -2400], {...clamp, easing: Easing.in(Easing.cubic)});
  const x = inX + outX;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: -200, right: -200, top: 330, height: 120, background: BLUE, rotate: '-4deg', translate: `${x * 1.15}px 0`}} />
      <div
        style={{
          position: 'absolute',
          left: -200,
          right: -200,
          top: 400,
          height: 230,
          background: ORANGE,
          rotate: '-4deg',
          translate: `${x}px 0`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 40,
          fontFamily: JP,
          fontWeight: 900,
          color: 'white',
        }}
      >
        <div style={{fontSize: 64, background: 'white', color: ORANGE, borderRadius: 20, padding: '4px 26px'}}>TALK {mark}</div>
        <div style={{fontSize: 96, WebkitTextStroke: '10px #7a3300', paintOrder: 'stroke fill'}}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};

// ───────────────────────── タイトル
const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame - data.title_at;
  if (t < 0 || t > 80) return null;
  const a = spring({frame: t, fps, config: {damping: 10, stiffness: 200}});
  const b = spring({frame: t - 8, fps, config: {damping: 10, stiffness: 200}});
  const c = spring({frame: t - 18, fps, config: {damping: 14}});
  const out = interpolate(t, [70, 80], [1, 0], clamp);
  const word: React.CSSProperties = {fontFamily: JP, fontWeight: 900, WebkitTextStroke: '16px #0b1f4d', paintOrder: 'stroke fill', lineHeight: 1.1};
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: out}}>
      <div style={{...word, fontSize: 150, color: 'white', scale: `${interpolate(a, [0, 1], [2.5, 1])}`, opacity: Math.min(1, a * 2), rotate: '-3deg'}}>スロットって</div>
      <div style={{...word, fontSize: 190, color: ORANGE, scale: `${interpolate(b, [0, 1], [2.5, 1])}`, opacity: Math.min(1, b * 2), rotate: '-3deg'}}>
        複雑すぎひん？
      </div>
      <div
        style={{
          marginTop: 30,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 44,
          color: BLUE_DEEP,
          background: '#fdfdf8',
          padding: '8px 34px',
          borderRadius: 14,
          border: `5px solid ${BLUE}`,
          translate: `0 ${(1 - c) * 60}px`,
          opacity: c,
        }}
      >
        ナギバクの休憩室　#1
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame - data.end_card;
  if (t < 0) return null;
  const s = spring({frame: t, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{background: `rgba(8,14,40,${0.6 * Math.min(1, t / 10)})`, alignItems: 'center', justifyContent: 'center', gap: 24}}>
      <div
        style={{
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 130,
          color: 'white',
          WebkitTextStroke: '14px #0b1f4d',
          paintOrder: 'stroke fill',
          scale: `${interpolate(s, [0, 1], [0.6, 1])}`,
          opacity: s,
        }}
      >
        ナギ<span style={{color: ORANGE}}>バク</span>の休憩室
      </div>
      <div style={{fontFamily: JP, fontWeight: 900, fontSize: 48, color: BLUE_DEEP, background: '#fdfdf8', padding: '10px 34px', borderRadius: 16, opacity: s}}>
        パチンコとスロット、どこが好き？　コメントで教えてね
      </div>
    </AbsoluteFill>
  );
};

// ───────────────────────── 音
const OCHI = LINES.find((l) => l.ochi)!;
const bgmVolume = (f: number) => {
  const base = f >= data.title_at && f < data.title_at + 80 ? 0.2 : 0.11;
  if (f >= data.bgm_cut && f < data.bgm_resume) return interpolate(f, [data.bgm_cut, data.bgm_cut + 12], [base, 0], clamp);
  if (f >= data.bgm_resume) return interpolate(f, [data.bgm_resume, data.bgm_resume + 20], [0, base], clamp);
  return base;
};

export const KyukeiEpisode: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Room />
      <Panels />
      <Telop />
      <Ochi />
      <ChapterChip />
      {CHAPTERS.filter((c) => !c.noeye).map((c) => (
        <Eyecatch key={c.at} at={c.at} mark={c.mark} title={c.title} />
      ))}
      <Title />
      <EndCard />

      <Audio src={staticFile('kyu/bgm.mp3')} loop volume={bgmVolume} />
      {LINES.filter((l) => l.id).map((l) => (
        <Sequence key={l.id!} from={l.start} durationInFrames={l.end - l.start + 6}>
          <Audio src={staticFile(`kyu001/${l.id}.wav`)} />
        </Sequence>
      ))}
      {LINES.filter((l) => l.punch).map((l) => (
        <Sequence key={`p${l.n}`} from={l.start} durationInFrames={30}>
          <Audio src={staticFile('kyu/se_emphasis.wav')} volume={0.45} />
        </Sequence>
      ))}
      {PANELS.map((s) => (
        <Sequence key={`s${s.key}`} from={s.from + 2} durationInFrames={30}>
          <Audio src={staticFile('kyu/se_pop.wav')} volume={0.4} />
        </Sequence>
      ))}
      {CHAPTERS.filter((c) => !c.noeye).map((c) => (
        <Sequence key={`c${c.at}`} from={c.at} durationInFrames={50}>
          <Audio src={staticFile('kyu/se_chapter.wav')} volume={0.5} />
        </Sequence>
      ))}
      <Sequence from={data.title_at} durationInFrames={60}>
        <Audio src={staticFile('kyu/se_res.wav')} volume={0.6} />
      </Sequence>
      <Sequence from={data.bgm_cut} durationInFrames={40}>
        <Audio src={staticFile('kyu/se_bgm_cut.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={OCHI.start} durationInFrames={60}>
        <Audio src={staticFile('kyu/se_ochi.wav')} volume={0.7} />
      </Sequence>
      <Sequence from={startOf(9)} durationInFrames={30}>
        <Audio src={staticFile('kyu/se_emphasis.wav')} volume={0.4} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const KYU_SAMPLE = {endOf};
