// ③ 警告・ツッコミ：赤い一瞬のフラッシュ＋上下の警告帯 → 橙の帯が右から割り込む
// mode="tsukkomi" は橙の帯だけ（普段使い）。mode="alert" は警告帯つき（驚き・ここ一番）
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, IN, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

type Props = {
  from: number;
  to: number;
  lead?: string; // 小さい前置き（例：81%でも、）
  text: string; // 大きい本文
  mode?: 'tsukkomi' | 'alert';
  face?: 'angry' | 'surprised';
};

const Hazard: React.FC<{top: number; dir: 1 | -1; p: number; f: number}> = ({top, dir, p, f}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top,
      width: 1920,
      height: 64,
      transform: `translateX(${(1 - p) * 1920 * dir}px)`,
      background: `repeating-linear-gradient(-45deg, ${C.red} 0 26px, #2A0710 26px 52px)`,
      backgroundPosition: `${f * 4 * dir}px 0`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div style={{background: C.navy, padding: '6px 26px', clipPath: cham(10)}}>
      <span style={{fontFamily: MONO, fontSize: 26, letterSpacing: 8, color: C.red, fontWeight: 700}}>▲ WARNING ▲</span>
    </div>
  </div>
);

export const AlertCut: React.FC<Props> = ({from, to, lead, text, mode = 'alert', face = 'angry'}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || f >= to + 8) return null;
  const alert = mode === 'alert';
  const t0 = alert ? from + 4 : from; // 帯が入る時刻
  const redFlash = alert ? interpolate(f, [from, from + 1, from + 6], [0, 0.38, 0], clamp) : 0;
  const hz = ramp(f, from, from + 6, SNAP);
  const bandIn = interpolate(f, [t0, t0 + 6], [2300, 0], {...clamp, easing: SNAP});
  const out = ramp(f, to, to + 8, IN);
  const jolt = f >= t0 + 5 && f < t0 + 11 ? ((f - t0) % 2 === 0 ? 7 : -7) : 0;
  const facePop = spring({frame: f - t0 - 3, fps, config: {damping: 10, stiffness: 220, mass: 0.6}});
  const textIn = ramp(f, t0 + 3, t0 + 10);

  return (
    <AbsoluteFill style={{transform: `translate(${jolt - out * 2300}px, ${jolt * 0.5}px)`}}>
      <AbsoluteFill style={{background: C.red, opacity: redFlash}} />
      {alert && (
        <>
          <Hazard top={0} dir={-1} p={hz} f={f} />
          <Hazard top={1016} dir={1} p={hz} f={f} />
        </>
      )}
      <div
        style={{
          position: 'absolute',
          left: -200,
          top: 600,
          width: 2400,
          height: 250,
          transform: `translateX(${bandIn}px) rotate(-5deg)`,
          background: C.orange,
          borderTop: `6px solid ${C.navy}`,
          boxShadow: `0 -14px 0 ${C.white}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 330,
            top: 26,
            transform: `translateX(${(1 - textIn) * 80}px) skewX(-6deg)`,
            opacity: textIn,
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 20,
                letterSpacing: 5,
                fontWeight: 700,
                color: C.orange,
                background: C.navy,
                padding: '4px 14px',
              }}
            >
              BAKU
            </span>
            {lead && <span style={{fontFamily: JP, fontWeight: 900, fontSize: 48, color: C.navy}}>{lead}</span>}
          </div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 96, color: C.navy, lineHeight: 1.15, marginTop: 6, whiteSpace: 'nowrap'}}>
            {text}
          </div>
        </div>
      </div>
      <Img
        src={staticFile(`labui/baku_${face}.png`)}
        style={{
          position: 'absolute',
          right: 30,
          top: 330,
          width: 560,
          transform: `scale(${interpolate(facePop, [0, 1], [0.5, 1])}) rotate(${interpolate(facePop, [0, 1], [12, 0])}deg)`,
          transformOrigin: '60% 90%',
          opacity: f >= t0 + 3 ? 1 : 0,
        }}
      />
    </AbsoluteFill>
  );
};
