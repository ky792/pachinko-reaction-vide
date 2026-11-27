// ④ 解析結果発表：画面が締まる → シアンの帯が切り込む → 数字がドンと止まる → 内訳バー
// 1本の動画で1〜2回だけ使う見せ場用
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

type Props = {
  from: number;
  to: number;
  label: string; // 例：RUSH継続率
  value: string; // 例：81
  unit?: string; // 例：%
  bar?: {on: string; off: string; ratio: number}; // 内訳バー
  hitAt?: number;
};

export const ResultReveal: React.FC<Props> = ({from, to, label, value, unit = '%', bar, hitAt}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || f >= to) return null;
  const dim = ramp(f, from, from + 6);
  const band = interpolate(f, [from, from + 7], [-2600, 0], {...clamp, easing: SNAP});
  const flash = interpolate(f, [from + 6, from + 7, from + 16], [0, 1, 0], clamp);
  const s = spring({frame: f - from - 5, fps, config: {damping: 12, stiffness: 240, mass: 0.6}});
  const numScale = interpolate(s, [0, 1], [1.9, 1]);
  const numO = ramp(f, from + 5, from + 8);
  const chip = ramp(f, from + 9, from + 17);
  const meta = ramp(f, from + 13, from + 22);
  const fill = ramp(f, from + 16, from + 40);
  const ghost = interpolate(f, [from, to], [40, -40]);
  const hit = hitAt != null && f >= hitAt ? spring({frame: f - hitAt, fps, config: {damping: 10, stiffness: 260, mass: 0.6}}) : 0;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `rgba(3,9,22,${0.86 * dim})`}} />
      <AbsoluteFill
        style={{
          transform: `translate(${-70 * hit}px, ${26 * hit}px) rotate(${-4 * hit}deg)`,
          transformOrigin: '30% 60%',
          filter: hit ? `brightness(${1 - 0.3 * hit})` : undefined,
        }}
      >
        {/* 帯 */}
        <div
          style={{
            position: 'absolute',
            left: -300,
            top: 340,
            width: 2520,
            height: 330,
            transform: `translateX(${band}px) skewY(-4deg)`,
            background: C.navy2,
            borderTop: `8px solid ${C.cyan}`,
            borderBottom: `3px solid ${C.cyan}`,
            overflow: 'hidden',
          }}
        >
          <div style={{position: 'absolute', inset: 0, background: C.cyan, opacity: flash}} />
          {/* 奥に大きな白抜き数字（奥行き用） */}
          <div
            style={{
              position: 'absolute',
              left: 1180 + ghost,
              top: -170,
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 640,
              lineHeight: 1,
              color: 'transparent',
              WebkitTextStroke: `3px rgba(53,214,255,0.22)`,
              transform: 'skewX(-8deg)',
            }}
          >
            {value}
          </div>
        </div>

        {/* ラベル */}
        <div
          style={{
            position: 'absolute',
            left: 300,
            top: 285,
            clipPath: cham(14),
            background: C.cyan,
            padding: '8px 30px 10px',
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 46,
            color: C.navy,
            transform: `translateX(${(1 - chip) * -60}px) skewX(-8deg)`,
            opacity: chip,
          }}
        >
          {label}
        </div>

        {/* 数字 */}
        <div
          style={{
            position: 'absolute',
            left: 290,
            top: 300,
            display: 'flex',
            alignItems: 'baseline',
            transform: `scale(${numScale}) skewX(-8deg)`,
            transformOrigin: '30% 60%',
            opacity: numO,
          }}
        >
          <span
            style={{
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 380,
              lineHeight: 1,
              color: C.white,
              textShadow: `12px 12px 0 ${C.cyan}`,
              letterSpacing: -10,
            }}
          >
            {value}
          </span>
          <span style={{fontFamily: JP, fontWeight: 900, fontSize: 170, color: C.cyan, marginLeft: 16}}>{unit}</span>
        </div>

        {/* 内訳バー */}
        {bar && (
          <div style={{position: 'absolute', left: 1080, top: 430, width: 640, opacity: meta, transform: `skewY(-4deg)`}}>
            <div style={{fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.cyan, fontWeight: 700}}>
              RNC-01 ▸ ANALYSIS COMPLETE
            </div>
            <div style={{display: 'flex', height: 40, marginTop: 18, background: '#16294B', clipPath: cham(0, 14)}}>
              <div style={{width: `${bar.ratio * 100 * fill}%`, background: C.cyan}} />
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 14, fontFamily: JP, fontWeight: 800}}>
              <span style={{fontSize: 34, color: C.white}}>
                {bar.on} <span style={{color: C.cyan}}>{Math.round(bar.ratio * 100 * fill)}%</span>
              </span>
              <span style={{fontSize: 30, color: C.muted, opacity: ramp(f, from + 38, from + 46)}}>
                {bar.off} {Math.round((1 - bar.ratio) * 100)}%
              </span>
            </div>
          </div>
        )}
      </AbsoluteFill>
      {/* レン：帯の右下で結果を出したポーズ */}
      <Img
        src={staticFile(hit ? 'labui/ren_bikkuri.png' : 'labui/ren_kaisetsu.png')}
        style={{
          position: 'absolute',
          right: 90,
          top: 700,
          height: 230,
          opacity: ramp(f, from + 12, from + 20),
          transform: `translateY(${(1 - ramp(f, from + 12, from + 22)) * 40}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
