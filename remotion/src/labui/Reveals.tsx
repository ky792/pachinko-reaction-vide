// ④ 解析結果発表のバリエーション
//   ReelReveal   ：パチンコのリールのように数字が回って、左から1桁ずつ止まる
//   VerdictStamp ：結論をひと言で。ハンコのように斜めに押される
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

const Dim: React.FC<{from: number}> = ({from}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: `rgba(3,9,22,${0.86 * ramp(f, from, from + 6)})`}} />;
};

const Band: React.FC<{from: number; children?: React.ReactNode}> = ({from, children}) => {
  const f = useCurrentFrame();
  const x = interpolate(f, [from, from + 7], [-2600, 0], {...clamp, easing: SNAP});
  const flash = interpolate(f, [from + 6, from + 7, from + 16], [0, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: -300,
        top: 340,
        width: 2520,
        height: 330,
        transform: `translateX(${x}px) skewY(-4deg)`,
        background: C.navy2,
        borderTop: `8px solid ${C.cyan}`,
        borderBottom: `3px solid ${C.cyan}`,
        overflow: 'hidden',
      }}
    >
      <div style={{position: 'absolute', inset: 0, background: C.cyan, opacity: flash}} />
      {children}
    </div>
  );
};

const Chip: React.FC<{from: number; text: string; left: number; top: number}> = ({from, text, left, top}) => {
  const f = useCurrentFrame();
  const p = ramp(f, from + 9, from + 17);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        clipPath: cham(14),
        background: C.cyan,
        padding: '8px 30px 10px',
        fontFamily: JP,
        fontWeight: 900,
        fontSize: 46,
        color: C.navy,
        transform: `translateX(${(1 - p) * -60}px) skewX(-8deg)`,
        opacity: p,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

/** 数字がリールで回って止まる。stopEvery フレームごとに左から1桁ずつ止まる */
export const ReelReveal: React.FC<{from: number; label: string; digits: string; unit: string; note?: string; stopEvery?: number}> = ({
  from,
  label,
  digits,
  unit,
  note,
  stopEvery = 9,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const H = 300;
  const chars = digits.split('');
  const numIdx = chars.map((c, i) => (/[0-9]/.test(c) ? i : -1)).filter((i) => i >= 0);
  const start = from + 10;
  return (
    <AbsoluteFill>
      <Dim from={from} />
      <Band from={from} />
      <Chip from={from} text={label} left={300} top={285} />
      <div style={{position: 'absolute', left: 300, top: 360, display: 'flex', alignItems: 'flex-end', transform: 'skewX(-8deg)'}}>
        {chars.map((c, i) => {
          const order = numIdx.indexOf(i);
          if (order < 0)
            return (
              <span key={i} style={{fontFamily: JP, fontWeight: 900, fontSize: 200, color: C.white, lineHeight: `${H}px`, opacity: ramp(f, start, start + 6)}}>
                {c}
              </span>
            );
          const stopAt = start + 14 + order * stopEvery;
          const stopped = f >= stopAt;
          const target = Number(c);
          // 回っている間は速く、止まる瞬間に少し行き過ぎて戻る
          const bounce = stopped ? spring({frame: f - stopAt, fps, config: {damping: 9, stiffness: 300, mass: 0.5}}) : 0;
          const spinPos = ((f - start) * 0.9 + order * 3.3) % 10;
          const pos = stopped ? target + (1 - bounce) * -0.35 : spinPos;
          const visible = f >= start;
          return (
            <div key={i} style={{position: 'relative', width: 190, height: H, overflow: 'hidden', opacity: visible ? 1 : 0}}>
              <div style={{position: 'absolute', top: -pos * H + 0, left: 0, width: '100%'}}>
                {[...Array(12)].map((_, k) => (
                  <div
                    key={k}
                    style={{
                      height: H,
                      lineHeight: `${H}px`,
                      textAlign: 'center',
                      fontFamily: JP,
                      fontWeight: 900,
                      fontSize: 300,
                      color: stopped ? C.white : 'rgba(166,236,255,0.7)',
                      textShadow: stopped ? `10px 10px 0 ${C.cyan}` : 'none',
                      filter: stopped ? undefined : 'blur(3px)',
                    }}
                  >
                    {k % 10}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <span style={{fontFamily: JP, fontWeight: 900, fontSize: 120, color: C.cyan, marginLeft: 14, marginBottom: 40, opacity: ramp(f, start + 14 + numIdx.length * stopEvery, start + 20 + numIdx.length * stopEvery)}}>
          {unit}
        </span>
      </div>
      {note && (
        <div
          style={{
            position: 'absolute',
            left: 1240,
            top: 470,
            fontFamily: MONO,
            fontSize: 22,
            letterSpacing: 4,
            color: C.cyan,
            fontWeight: 700,
            opacity: ramp(f, start + 18 + numIdx.length * stopEvery, start + 26 + numIdx.length * stopEvery),
            transform: 'skewY(-4deg)',
          }}
        >
          RNC-01 ▸ RESULT
          <div style={{fontFamily: JP, fontSize: 38, letterSpacing: 1, color: C.white, fontWeight: 800, marginTop: 10}}>{note}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** 結論をひと言で押す */
export const VerdictStamp: React.FC<{from: number; label: string; word: string; sub?: string; ren?: boolean}> = ({from, label, word, sub, ren = true}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - from - 6, fps, config: {damping: 11, stiffness: 260, mass: 0.6}});
  const scale = interpolate(s, [0, 1], [2.4, 1]);
  const shock = interpolate(f, [from + 8, from + 9, from + 20], [0, 1, 0], clamp);
  return (
    <AbsoluteFill>
      <Dim from={from} />
      <Band from={from} />
      <Chip from={from} text={label} left={560} top={285} />
      {/* 押した瞬間の輪 */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 420,
          top: 505 - 420,
          width: 840,
          height: 840,
          borderRadius: '50%',
          border: `6px solid rgba(53,214,255,${shock})`,
          transform: `scale(${0.6 + (1 - shock) * 0.6})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 350,
          textAlign: 'center',
          transform: `scale(${scale}) rotate(-6deg)`,
          opacity: f >= from + 6 ? 1 : 0,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 220,
            lineHeight: 1.1,
            color: C.white,
            padding: '0 50px',
            border: `10px solid ${C.cyan}`,
            textShadow: `10px 10px 0 ${C.cyan}`,
            background: 'rgba(6,17,39,0.6)',
          }}
        >
          {word}
        </span>
      </div>
      {sub && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 700,
            textAlign: 'center',
            fontFamily: JP,
            fontWeight: 800,
            fontSize: 40,
            color: C.white,
            opacity: ramp(f, from + 18, from + 26),
          }}
        >
          {sub}
        </div>
      )}
      {ren && (
        <Img
          src={staticFile('labui/ren_genki.png')}
          style={{position: 'absolute', right: 110, top: 690, height: 230, opacity: ramp(f, from + 14, from + 22)}}
        />
      )}
    </AbsoluteFill>
  );
};
