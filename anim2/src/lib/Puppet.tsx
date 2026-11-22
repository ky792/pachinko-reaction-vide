// キャラ1体。今は「表情集の全身画像の差し替え＋体の動き」で動かす（仮素材）。
// パーツ素材（N-01〜・B-01〜）が届いたら、この中身を rig.json の重ね描き（体・頭・目・口・耳・尻尾）に差し替える。
// 外から渡すもの（表情・傾き・話しているか・口の形・音量）は今と変えない。
import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Who, sinceOf, speechOf, lineAt, LINES} from './timeline';

export const SEAT = {
  nagi: {x: 255, h: 560},
  baku: {x: 1665, h: 560},
} as const;

export const Puppet: React.FC<{who: Who}> = ({who}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = lineAt(frame);
  const st = l ? l[who] : {face: who === 'nagi' ? 'nagi_01' : 'baku_01', tilt: 0};
  const {speaking, level} = speechOf(who, frame);

  // 表情が切り替わった瞬間：一瞬ふくらむ（フラッシュ風の「パッ」）
  const faceSince = sinceOf(frame, (x) => x[who].face).from;
  const changed = l && faceSince === l.start && LINES.indexOf(l) > 0;
  const pop = changed ? interpolate(frame - faceSince, [0, 2, 6], [1.06, 1.03, 1], {extrapolateRight: 'clamp'}) : 1;

  // 傾き（首かしげ）はばねで
  const tiltSince = sinceOf(frame, (x) => x[who].tilt ?? 0);
  const prevTilt = tiltSince.prev ? tiltSince.prev[who].tilt ?? 0 : 0;
  const tk = spring({frame: frame - tiltSince.from, fps, config: {damping: 14, stiffness: 120}});
  const tilt = interpolate(tk, [0, 1], [prevTilt, st.tilt ?? 0]) * (who === 'nagi' ? -1 : 1);

  // 呼吸（ゆっくり・小さく）
  const breathe = Math.sin(frame / (who === 'nagi' ? 26 : 18) + (who === 'nagi' ? 0 : 1.7));
  const scaleY = 1 + breathe * (who === 'nagi' ? 0.005 : 0.008);

  // バク：話し始めに跳ねる＋声の大きさで少し上下。ナギ：淡々（跳ねない）
  let hopY = 0;
  if (who === 'baku' && speaking && l) {
    const k = spring({frame: frame - l.start, fps, config: {damping: 9, stiffness: 260}});
    hopY = (1 - k) * 34 + level * 7;
  }

  const s = SEAT[who];
  const isNagiTank = st.face === 'nagi_01' || st.face === 'nagi_03' || st.face === 'nagi_06';
  return (
    <div
      style={{
        position: 'absolute',
        left: s.x - 450,
        width: 900,
        bottom: -30,
        height: s.h + 40,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        transformOrigin: '50% 100%',
        transform: `translateY(${-hopY}px) rotate(${tilt}deg) scale(${pop}, ${pop * scaleY})`,
        filter: speaking
          ? 'drop-shadow(0 16px 22px rgba(10,20,60,0.45))'
          : 'drop-shadow(0 16px 22px rgba(10,20,60,0.3)) brightness(0.93)',
      }}
    >
      <div style={{position: 'relative', height: s.h}}>
        <Img src={staticFile(`a/char/${st.face}.png`)} style={{height: s.h, display: 'block'}} />
        {who === 'nagi' && isNagiTank ? <TankGlow face={st.face} frame={frame} /> : null}
      </div>
    </div>
  );
};

// ナギの脳タンク：同じ絵のタンク部分だけを明るくして、ゆっくり脈打たせる（絵は描き足さない）
const TANK: Record<string, string> = {
  nagi_01: 'inset(36% 70% 10% 0%)',
  nagi_03: 'inset(30% 74% 8% 0%)',
  nagi_06: 'inset(30% 74% 8% 0%)',
};
const TankGlow: React.FC<{face: string; frame: number}> = ({face, frame}) => {
  const p = (Math.sin(frame / 22) + 1) / 2;
  return (
    <Img
      src={staticFile(`a/char/${face}.png`)}
      style={{
        position: 'absolute',
        inset: 0,
        height: '100%',
        clipPath: TANK[face],
        mixBlendMode: 'screen',
        opacity: 0.18 + p * 0.32,
        filter: 'brightness(1.5) saturate(1.6) hue-rotate(-8deg)',
      }}
    />
  );
};
