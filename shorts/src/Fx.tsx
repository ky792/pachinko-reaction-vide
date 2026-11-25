import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, Episode, JP, LAYOUT, Line, OUT, clamp} from './theme';

// 編集の「盛り」：カメラ（寄り・押し込み・揺れ）、集中線、火花、デカ文字。回ごとの指定は episode.json の cam / fx
// cam: {"focus": "monitor"|"nagi"|"baku", "zoom": 1.15, "mode": "snap"|"push"}

const FOCUS = {
  monitor: {x: 540, y: LAYOUT.monitor.top + LAYOUT.monitor.height / 2},
  nagi: {x: LAYOUT.chars.nagiX, y: LAYOUT.chars.bottom - LAYOUT.chars.h * 0.62},
  baku: {x: LAYOUT.chars.bakuX, y: LAYOUT.chars.bottom - LAYOUT.chars.h * 0.62},
  center: {x: 540, y: 960},
} as const;
type Cam = {z: number; x: number; y: number};

const camOfLine = (l: Line, a: number, from: Cam, fps: number): Cam => {
  const c = l.cam ?? {focus: 'center', zoom: 1, mode: 'snap'};
  const to = {z: c.zoom, ...FOCUS[(c.focus ?? 'center') as keyof typeof FOCUS]};
  const dur = l.end - l.start;
  const p = c.mode === 'push'
    ? interpolate(a, [0, dur], [0, 1], {...clamp, easing: (t) => t * (2 - t)})
    : spring({frame: a, fps, config: {damping: 16, stiffness: 260}});
  return {z: from.z + (to.z - from.z) * p, x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p};
};

export const camAt = (ep: Episode, f: number, fps: number): Cam => {
  const c0 = ep.lines[0]?.cam;
  let cam: Cam = c0 && ep.lines[0].start === 0 ? {z: c0.zoom, ...FOCUS[(c0.focus ?? 'center') as keyof typeof FOCUS]} : {z: 1, ...FOCUS.center};
  for (const l of ep.lines) {
    if (l.start > f) break;
    cam = camOfLine(l, Math.min(f, l.end) - l.start, cam, fps);
  }
  // 登録誘導では引きに戻す
  if (f >= ep.cta_start) {
    const p = spring({frame: f - ep.cta_start, fps, config: {damping: 18}});
    cam = {z: cam.z + (1 - cam.z) * p, x: cam.x + (540 - cam.x) * p, y: cam.y + (960 - cam.y) * p};
  }
  // 0フレーム目は少し寄った状態から一気に引く（フック）
  const hook = interpolate(f, [0, 10], [0.1, 0], {...clamp, easing: OUT});
  // 大きい数字のドンで押し込む
  let kick = 0;
  for (const l of ep.lines) {
    const b = l.monitor?.big_at;
    if (b !== undefined && f >= b && f < b + 14) kick += interpolate(f - b, [0, 2, 14], [0, 0.07, 0], clamp);
  }
  return {...cam, z: cam.z + hook + kick};
};

export const shakeAt = (ep: Episode, f: number) => {
  let amp = 0;
  for (const l of ep.lines) {
    const b = l.monitor?.big_at;
    if (b !== undefined && f >= b && f < b + 12) amp = Math.max(amp, interpolate(f - b, [0, 12], [16, 0]));
    if (l.pop && f >= l.start && f < l.start + 8) amp = Math.max(amp, interpolate(f - l.start, [0, 8], [12, 0]));
    if (l.shake && f >= l.start && f < l.end && f % 10 < 4) amp = Math.max(amp, 9);
  }
  if (f < 8) amp = Math.max(amp, interpolate(f, [0, 8], [10, 0]));
  for (const ev of ep.events ?? []) {
    if (ev.type === 'shake' && f >= ev.f0 && f < ev.f1) amp = Math.max(amp, interpolate(f, [ev.f0, ev.f1], [ev.amp ?? 18, ev.decay === false ? ev.amp ?? 18 : 0]));
  }
  return {x: (random(`sx${f}`) - 0.5) * 2 * amp, y: (random(`sy${f}`) - 0.5) * 2 * amp};
};

// カメラ：モニターとキャラで別々に寄る（テーマ文字・字幕には掛けない＝いつでも読める）
// モニターに寄るときは上辺を固定して下へ広げる（上のテーマ文字に被らない）。キャラに寄るときは顔を中心に広げる（モニターより手前なので被っても読める）
export const camParts = (ep: Episode, f: number, fps: number) => {
  const c = camAt(ep, f, fps);
  const toChar = c.y > LAYOUT.monitor.top + LAYOUT.monitor.height;   // 寄る先がキャラ側か
  const w = interpolate(c.y, [FOCUS.monitor.y, FOCUS.baku.y], [0, 1], clamp);
  return {
    mon: 1 + (c.z - 1) * (1 - w),
    chr: 1 + (c.z - 1) * w,
    cx: c.x,
    cy: toChar ? c.y : FOCUS.baku.y,
  };
};

export const MonitorCam: React.FC<{ep: Episode; children: React.ReactNode}> = ({ep, children}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = camParts(ep, f, fps);
  const s = shakeAt(ep, f);
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: `540px ${LAYOUT.monitor.top}px`,
      transform: `translate(${s.x}px, ${s.y}px) scale(${Math.min(p.mon, 1.1)})`}}>
      {children}
    </div>
  );
};

export const CharCam: React.FC<{ep: Episode; children: React.ReactNode}> = ({ep, children}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = camParts(ep, f, fps);
  const s = shakeAt(ep, f);
  const pull = interpolate(p.chr, [1.3, 2.2], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: `${p.cx}px ${p.cy}px`,
      transform: `translate(${s.x * 1.2 + (540 - p.cx) * pull}px, ${s.y * 1.2 + (1180 - p.cy) * pull}px) scale(${p.chr})`}}>
      {children}
    </div>
  );
};

// 集中線（バク・ナギの驚き／ツッコミ）。モニターに掛からないよう下側だけ
export const SpeedLines: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = ep.lines.find((x) => x.fx?.includes('speed') && f >= x.start && f < x.end + 4);
  if (!l) return null;
  const who = l.who;
  const o = FOCUS[who];
  const seed = Math.floor(f / 2);
  const op = interpolate(f - l.start, [0, 3], [0, 1], clamp) * interpolate(f, [l.end, l.end + 4], [1, 0], clamp);
  const col = l.fx?.includes('angry') ? 'rgba(255,138,31,0.55)' : 'rgba(255,255,255,0.6)';
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity: op,
      clipPath: `inset(${LAYOUT.monitor.top + LAYOUT.monitor.height + 6}px 0 0 0)`}}>
      {Array.from({length: 46}, (_, i) => {
        const ang = (i / 46) * Math.PI * 2 + random(`a${seed}-${i}`) * 0.12;
        const r0 = 260 + random(`r${seed}-${i}`) * 120;
        const w = 4 + random(`w${seed}-${i}`) * 9;
        const x0 = o.x + Math.cos(ang) * r0, y0 = o.y + Math.sin(ang) * r0;
        const x1 = o.x + Math.cos(ang) * 1500, y1 = o.y + Math.sin(ang) * 1500;
        const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
        return <polygon key={i} points={`${x0},${y0} ${x1 + nx},${y1 + ny} ${x1 - nx},${y1 - ny}`} fill={col} />;
      })}
    </svg>
  );
};

// 大きい数字のドンで飛ぶ火花
export const Sparks: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = ep.lines.find((x) => x.monitor?.big_at !== undefined && f >= x.monitor.big_at && f < x.monitor.big_at + 22);
  if (!l) return null;
  const t = f - l.monitor!.big_at;
  const o = FOCUS.monitor;
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
      {Array.from({length: 26}, (_, i) => {
        const ang = random(`sa${l.id}${i}`) * Math.PI * 2;
        const sp = 18 + random(`ss${l.id}${i}`) * 26;
        const d = sp * t * (1 - t / 44);
        const x = o.x + Math.cos(ang) * d, y = o.y + Math.sin(ang) * d + t * t * 0.4;
        const r = (1 - t / 22) * (5 + random(`sr${l.id}${i}`) * 7);
        return <circle key={i} cx={x} cy={y} r={Math.max(0, r)} fill={i % 3 ? C.orange : '#fff'} />;
      })}
    </svg>
  );
};

// デカ文字（「は？」「！？」など、台本のセリフの一部や記号だけ。台本にない言葉は出さない）
export const BigWord: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = ep.lines.find((x) => x.word && f >= x.start && f < x.end + 10);
  if (!l) return null;
  const a = f - l.start;
  const s = spring({frame: a, fps, config: {damping: 9, stiffness: 300}});
  const out = interpolate(f, [l.end + 2, l.end + 10], [1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: l.who === 'baku' ? 60 : 480, width: 480, top: LAYOUT.chars.bottom - LAYOUT.chars.h - 10, textAlign: 'center',
      fontFamily: JP, fontWeight: 900, fontSize: 210, color: l.who === 'baku' ? C.orange : C.blue, WebkitTextStroke: '12px #fff',
      paintOrder: 'stroke fill', rotate: `${l.who === 'baku' ? 10 : -10}deg`, scale: `${interpolate(s, [0, 1], [2.2, 1])}`, opacity: out,
      filter: 'drop-shadow(0 8px 0 rgba(0,0,0,0.3))'}}>
      {l.word}
    </div>
  );
};

// モニターの中身が切り替わる瞬間の光の帯
export const Sweep: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = ep.lines.find((x) => x.monitor && x.start > 0 && f >= x.start && f < x.start + 10);
  if (!l) return null;
  const t = f - l.start;
  const {left, top, width, height} = LAYOUT.monitor;
  const x = interpolate(t, [0, 10], [-300, width + 300], {...clamp, easing: OUT});
  return (
    <div style={{position: 'absolute', left, top, width, height, borderRadius: 30, overflow: 'hidden', pointerEvents: 'none'}}>
      <div style={{position: 'absolute', top: -100, bottom: -100, left: x, width: 160, rotate: '18deg',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)'}} />
    </div>
  );
};
