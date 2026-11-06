// 新台解説のOP（寸劇のあと）：キャラ紹介 → 新台解説ロゴ → タイトル。研究所UIの形で
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, IN, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

export type IntroData = {name: string; role: string; profile: string[]};

/** キャラ紹介：斜めの帯にキャラ全身＋名前を大きく */
export const IntroCard: React.FC<{from: number; to: number; who: 'nagi' | 'baku'; d: IntroData}> = ({from, to, who, d}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || f >= to) return null;
  const color = who === 'nagi' ? C.cyan : C.orange;
  const dir = who === 'nagi' ? 1 : -1;
  const band = interpolate(f, [from, from + 7], [2400 * -dir, 0], {...clamp, easing: SNAP});
  const out = interpolate(f, [to - 6, to], [0, 1], {...clamp, easing: IN});
  const body = spring({frame: f - from - 3, fps, config: {damping: 13, stiffness: 190, mass: 0.7}});
  const name = ramp(f, from + 6, from + 14);
  const prof = ramp(f, from + 12, from + 20);
  const left = who === 'nagi';
  return (
    <AbsoluteFill style={{background: C.navy, transform: `translateX(${out * 2000 * dir}px)`}}>
      <div
        style={{
          position: 'absolute',
          left: -300,
          top: 260,
          width: 2520,
          height: 520,
          background: C.navy2,
          borderTop: `10px solid ${color}`,
          borderBottom: `3px solid ${color}`,
          transform: `translateX(${band}px) skewY(${-4 * dir}deg)`,
        }}
      />
      <Img
        src={staticFile(who === 'nagi' ? 'labui/nagi_point.png' : 'labui/baku_body.png')}
        style={{
          position: 'absolute',
          [left ? 'left' : 'right']: who === 'nagi' ? 40 : 160,
          bottom: -20,
          height: who === 'nagi' ? 860 : 900,
          transform: `translateY(${(1 - body) * 400}px) ${who === 'baku' ? 'scaleX(-1)' : ''}`,
        }}
      />
      <div style={{position: 'absolute', [left ? 'left' : 'right']: who === 'nagi' ? 900 : 860, top: 330, textAlign: left ? 'left' : 'right'}}>
        <div style={{fontFamily: MONO, fontSize: 26, letterSpacing: 10, color, fontWeight: 700, opacity: name}}>NAGIBAKU LAB ▸ {who.toUpperCase()}</div>
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 200,
            lineHeight: 1.05,
            color: C.white,
            textShadow: `10px 10px 0 ${color}`,
            transform: `translateX(${(1 - name) * 80 * dir}px) skewX(-8deg)`,
            opacity: name,
          }}
        >
          {d.name}
        </div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 14,
            padding: '6px 22px 8px',
            background: color,
            color: C.navy,
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 36,
            clipPath: cham(10),
            opacity: name,
          }}
        >
          {d.role}
        </div>
        <div style={{marginTop: 20, opacity: prof}}>
          {d.profile.map((p) => (
            <div key={p} style={{fontFamily: JP, fontWeight: 800, fontSize: 42, color: C.white, lineHeight: 1.45}}>
              {p}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 新台解説ロゴ → タイトル */
export const LogoTitle: React.FC<{from: number; logoTo: number; to: number; machine: string; title: string; date: string}> = ({
  from,
  logoTo,
  to,
  machine,
  title,
  date,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || f >= to) return null;
  const logo = spring({frame: f - from, fps, config: {damping: 10, stiffness: 200, mass: 0.7}});
  const flash = interpolate(f, [from + 3, from + 4, from + 14], [0, 0.8, 0], clamp);
  const logoOut = interpolate(f, [logoTo - 6, logoTo], [0, 1], {...clamp, easing: IN});
  const t = f - logoTo;
  const band = interpolate(t, [0, 7], [-2600, 0], {...clamp, easing: SNAP});
  const tt = ramp(t, 6, 16);
  const mm = ramp(t, 2, 10);
  const out = interpolate(f, [to - 6, to], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: C.navy, opacity: 1 - out}}>
      <AbsoluteFill
        style={{
          background: `repeating-linear-gradient(-60deg, rgba(53,214,255,0.05) 0 40px, rgba(53,214,255,0) 40px 120px)`,
          backgroundPosition: `${f * 4}px 0`,
        }}
      />
      {f < logoTo && (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: 1 - logoOut}}>
          <Img
            src={staticFile('ep/shanfro/newmachine.png')}
            style={{width: 1300, transform: `scale(${interpolate(logo, [0, 1], [0.4, 1])}) rotate(${(1 - logo) * -8}deg)`}}
          />
          <AbsoluteFill style={{background: C.white, opacity: flash}} />
        </AbsoluteFill>
      )}
      {f >= logoTo && (
        <>
          <div
            style={{
              position: 'absolute',
              left: -300,
              top: 330,
              width: 2520,
              height: 420,
              background: C.navy2,
              borderTop: `10px solid ${C.cyan}`,
              borderBottom: `3px solid ${C.cyan}`,
              transform: `translateX(${band}px) skewY(-4deg)`,
            }}
          />
          <Img src={staticFile('ep/shanfro/newmachine.png')} style={{position: 'absolute', left: 70, top: 40, width: 420, opacity: mm}} />
          <AbsoluteFill style={{transform: 'rotate(-4deg)'}}>
            <div style={{position: 'absolute', left: 230, top: 390, opacity: mm, transform: `translateX(${(1 - mm) * -60}px)`}}>
              <span style={{fontFamily: MONO, fontSize: 26, letterSpacing: 8, color: C.cyan, fontWeight: 700}}>NEW MACHINE ▸ {date}</span>
              <div style={{fontFamily: JP, fontWeight: 900, fontSize: 60, color: C.white, marginTop: 6}}>{machine}</div>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 220,
                top: 520,
                fontFamily: JP,
                fontWeight: 900,
                fontSize: 104,
                color: C.white,
                textShadow: `10px 10px 0 ${C.cyan}`,
                whiteSpace: 'nowrap',
                clipPath: `inset(-30px ${(1 - tt) * 100}% -30px 0)`,
              }}
            >
              {title}
            </div>
          </AbsoluteFill>
        </>
      )}
    </AbsoluteFill>
  );
};
