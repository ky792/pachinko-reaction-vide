// ③ 警告・ツッコミのバリエーション ＋ ナギ側の「補足」
//   BakuJack ：バクが画面をジャック。橙が右から斜めに塗りつぶし、ひと言だけ特大で
//   NagiNote ：ナギの冷静な補足。左からノートが差し込まれる（ツッコミへの返しにも）
//   KeywordPop：キーワードを1語だけ、四隅のカギ括弧で囲って出す（通常解説の強調）
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, IN, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

export const BakuJack: React.FC<{from: number; to: number; word: string; sub?: string}> = ({from, to, word, sub}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || f >= to + 8) return null;
  const wipe = interpolate(f, [from, from + 6], [0, 1], {...clamp, easing: SNAP});
  const out = ramp(f, to, to + 8, IN);
  const s = spring({frame: f - from - 4, fps, config: {damping: 9, stiffness: 260, mass: 0.6}});
  const face = spring({frame: f - from - 2, fps, config: {damping: 12, stiffness: 200, mass: 0.7}});
  const shake = f >= from + 5 && f < from + 13 ? Math.sin(f * 2.7) * 10 : 0;
  // 右下から左上へ斜めに塗る
  const edge = interpolate(wipe, [0, 1], [2400, -600]);
  return (
    <AbsoluteFill style={{transform: `translate(${shake - out * 2300}px, 0)`}}>
      <AbsoluteFill style={{clipPath: `polygon(${edge}px 0, 2600px 0, 2600px 1080px, ${edge - 500}px 1080px)`, background: C.orange}}>
        <AbsoluteFill
          style={{
            background: `repeating-linear-gradient(-60deg, rgba(255,255,255,0.08) 0 40px, rgba(255,255,255,0) 40px 120px)`,
            backgroundPosition: `${f * 6}px 0`,
          }}
        />
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 120, top: 120, fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: 8, color: C.navy, opacity: s}}>
        BAKU ▸ INTERRUPT
      </div>
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 200,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 300,
          lineHeight: 1,
          color: C.navy,
          transform: `scale(${interpolate(s, [0, 1], [1.8, 1])}) rotate(-6deg)`,
          transformOrigin: '20% 60%',
          textShadow: `12px 12px 0 ${C.white}`,
          opacity: f >= from + 4 ? 1 : 0,
          whiteSpace: 'nowrap',
        }}
      >
        {word}
      </div>
      {sub && (
        <div
          style={{
            position: 'absolute',
            left: 130,
            top: 600,
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 64,
            color: C.white,
            background: C.navy,
            padding: '10px 34px 14px',
            clipPath: cham(16),
            transform: `translateX(${(1 - ramp(f, from + 10, from + 18)) * -80}px) rotate(-3deg)`,
            opacity: ramp(f, from + 10, from + 18),
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </div>
      )}
      <Img
        src={staticFile('labui/baku_surprised.png')}
        style={{
          position: 'absolute',
          right: 40,
          bottom: 0,
          height: 620,
          transform: `translateY(${(1 - face) * 500}px) rotate(${(1 - face) * 10}deg)`,
          transformOrigin: '50% 100%',
        }}
      />
    </AbsoluteFill>
  );
};

export const NagiNote: React.FC<{from: number; to: number; title?: string; text: string}> = ({from, to, title = 'NOTE', text}) => {
  const f = useCurrentFrame();
  if (f < from || f >= to + 8) return null;
  const p = ramp(f, from, from + 10);
  const out = ramp(f, to, to + 8, IN);
  const line = ramp(f, from + 4, from + 16);
  const glow = interpolate(f, [from, from + 2, from + 10], [0, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 470,
        top: 300,
        width: 900,
        transform: `translateX(${(1 - p) * -90 - out * 60}px)`,
        opacity: p * (1 - out),
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
      }}
    >
      <div style={{background: C.panel, clipPath: cham(26), borderLeft: `10px solid ${C.cyan}`, padding: '26px 44px 34px 40px', position: 'relative'}}>
        <div style={{position: 'absolute', inset: 0, background: `rgba(53,214,255,${glow * 0.25})`}} />
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <span style={{fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: 6, color: C.cyan}}>{title}</span>
          <span style={{fontFamily: MONO, fontWeight: 700, fontSize: 16, letterSpacing: 4, color: C.muted}}>NAGI ANALYSIS</span>
        </div>
        <div style={{fontFamily: JP, fontWeight: 800, fontSize: 52, lineHeight: 1.4, color: C.white, marginTop: 12, whiteSpace: 'pre-line'}}>{text}</div>
        <div style={{position: 'absolute', left: 0, bottom: 0, height: 4, width: '100%', background: C.cyan, transformOrigin: 'left', transform: `scaleX(${line})`}} />
      </div>
    </div>
  );
};

const Bracket: React.FC<{pos: 'tl' | 'tr' | 'bl' | 'br'; p: number}> = ({pos, p}) => {
  const L = 54;
  const d = (1 - p) * 60;
  const st: React.CSSProperties = {position: 'absolute', width: L, height: L, borderColor: C.cyan, borderStyle: 'solid', borderWidth: 0};
  if (pos === 'tl') Object.assign(st, {left: -d, top: -d, borderLeftWidth: 8, borderTopWidth: 8});
  if (pos === 'tr') Object.assign(st, {right: -d, top: -d, borderRightWidth: 8, borderTopWidth: 8});
  if (pos === 'bl') Object.assign(st, {left: -d, bottom: -d, borderLeftWidth: 8, borderBottomWidth: 8});
  if (pos === 'br') Object.assign(st, {right: -d, bottom: -d, borderRightWidth: 8, borderBottomWidth: 8});
  return <div style={{...st, opacity: p}} />;
};

export const KeywordPop: React.FC<{from: number; to: number; tag?: string; word: string; read?: string}> = ({from, to, tag = 'KEYWORD', word, read}) => {
  const f = useCurrentFrame();
  if (f < from || f >= to + 6) return null;
  const b = ramp(f, from, from + 10);
  const w = ramp(f, from + 4, from + 12);
  const out = ramp(f, to, to + 6, IN);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 230, display: 'flex', justifyContent: 'center', opacity: 1 - out}}>
      <div style={{position: 'relative', padding: '36px 80px 44px', textAlign: 'center'}}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((p) => (
          <Bracket key={p} pos={p} p={b} />
        ))}
        <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: 8, color: C.cyan, opacity: w}}>{tag}</div>
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 150,
            lineHeight: 1.15,
            color: C.white,
            letterSpacing: 6,
            clipPath: `inset(0 ${(1 - w) * 100}% 0 0)`,
            textShadow: `8px 8px 0 ${C.navy2}`,
          }}
        >
          {word}
        </div>
        {read && <div style={{fontFamily: JP, fontWeight: 700, fontSize: 30, color: C.muted, opacity: w}}>{read}</div>}
      </div>
    </div>
  );
};
