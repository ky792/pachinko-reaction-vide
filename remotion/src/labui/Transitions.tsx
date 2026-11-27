// ⑤ 場面転換のバリエーション
//   ChapterCard：章の頭。斜めの帯に年とタイトルを大きく（CHAPTER番号は補助）
//   Shutter    ：横の短冊が互い違いに閉じて開く。軽い話題の切り替え用（at で中身を切り替える）
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, IN, JP, MONO, SNAP, clamp, ramp} from './tokens';

export const ChapterCard: React.FC<{from: number; to: number; no: string; year?: string; title: string}> = ({from, to, no, year, title}) => {
  const f = useCurrentFrame();
  if (f < from || f >= to + 10) return null;
  const inP = interpolate(f, [from, from + 8], [0, 1], {...clamp, easing: SNAP});
  const out = interpolate(f, [to, to + 10], [0, 1], {...clamp, easing: IN});
  const t = ramp(f, from + 6, from + 16);
  const y = ramp(f, from + 3, from + 12);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `rgba(3,9,22,${0.8 * inP * (1 - out)})`}} />
      <div
        style={{
          position: 'absolute',
          left: -200,
          top: 330,
          width: 2400,
          height: 420,
          background: C.navy2,
          borderTop: `8px solid ${C.cyan}`,
          transform: `translateX(${(1 - inP) * -2500 + out * 2500}px) skewY(-4deg)`,
        }}
      />
      <AbsoluteFill style={{transform: `translateX(${out * 2500}px) rotate(-4deg)`}}>
        <div style={{position: 'absolute', left: 280, top: 390, fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: 10, color: C.cyan, opacity: t}}>
          CHAPTER {no}
        </div>
        {year && (
          <div
            style={{
              position: 'absolute',
              left: 270,
              top: 410,
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 210,
              color: 'transparent',
              WebkitTextStroke: `4px ${C.cyan}`,
              transform: `translateX(${(1 - y) * -120}px) skewX(-8deg)`,
              opacity: y,
            }}
          >
            {year}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            left: year ? 900 : 280,
            top: year ? 500 : 450,
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 110,
            color: C.white,
            textShadow: `8px 8px 0 ${C.cyan}`,
            clipPath: `inset(-20px ${(1 - t) * 100}% -20px 0)`,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SHUTTER_HALF = 9;
export const Shutter: React.FC<{at: number; strips?: number}> = ({at, strips = 6}) => {
  const f = useCurrentFrame();
  if (f < at - SHUTTER_HALF - 6 || f > at + SHUTTER_HALF + 6) return null;
  const h = 1080 / strips;
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {[...Array(strips)].map((_, i) => {
        const d = i * 1.2;
        const close = interpolate(f, [at - SHUTTER_HALF - 6 + d, at - 1], [0, 1], {...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1)});
        const open = interpolate(f, [at + 1, at + SHUTTER_HALF + 6 - d], [0, 1], {...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1)});
        const dir = i % 2 === 0 ? 1 : -1;
        const x = f < at ? (1 - close) * 2000 * dir : -open * 2000 * dir;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: -40,
              top: i * h - 1,
              width: 2000,
              height: h + 2,
              background: i % 2 === 0 ? C.navy : C.navy2,
              borderBottom: `3px solid ${i % 3 === 0 ? C.cyan : C.line}`,
              transform: `translateX(${x}px)`,
            }}
          />
        );
      })}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: interpolate(f, [at - 3, at, at + 3], [0, 1, 0], clamp)}}>
        <div style={{fontFamily: MONO, fontSize: 28, letterSpacing: 12, color: C.cyan, fontWeight: 700}}>NEXT TOPIC</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const _j = JP;
