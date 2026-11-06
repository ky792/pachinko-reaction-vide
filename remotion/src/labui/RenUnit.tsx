// RNC-01（レン）：寝ている → 起動で飛び起きる → スキャン（分析中）→ 集計完了（にっこり）
// 状態ラベルつき。表情の流れは docs/NAGIBAKU_WORLD.md の RNC-01 に合わせる
import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, cham, clamp, ramp} from './tokens';

type Props = {from: number; scanFrom: number; scanTo: number; x: number; y: number; hitAt?: number; hideAt?: number};

const H = 260; // 表情ごとに絵の大きさが違うので、高さでそろえる

export const RenUnit: React.FC<Props> = ({from, scanFrom, scanTo, x, y, hitAt, hideAt}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from || (hideAt != null && f >= hideAt)) return null;
  const boot = from + 14;
  const rise = spring({frame: f - from, fps, config: {damping: 14, stiffness: 170, mass: 0.7}});
  const eye = interpolate(f, [boot, boot + 2, boot + 12], [0, 1, 0], clamp);
  const scanning = f >= scanFrom && f < scanTo;
  const done = f >= scanTo;
  const hit = hitAt != null && f >= hitAt;
  const pct = Math.round(interpolate(f, [scanFrom, scanTo], [0, 100], clamp));

  let pose = 'nemu';
  let poseAt = from;
  if (hit) [pose, poseAt] = ['bikkuri', hitAt!];
  else if (done) [pose, poseAt] = ['genki', scanTo];
  else if (scanning) [pose, poseAt] = ['bunseki', scanFrom];
  else if (f >= boot) [pose, poseAt] = ['bikkuri', boot];
  const pop = interpolate(f, [poseAt, poseAt + 6], [1.12, 1], clamp);
  const hop = pose === 'bikkuri' ? -interpolate(f, [poseAt, poseAt + 4, poseAt + 10], [0, 26, 0], clamp) : 0;

  const status = done ? 'COMPLETE' : scanning ? `SCANNING ${String(pct).padStart(3, ' ')}%` : f >= boot ? 'ONLINE' : 'SLEEP';
  const statusColor = done ? C.cyan : f >= boot ? C.cyanSoft : C.muted;
  const label = ramp(f, from + 4, from + 12);

  return (
    <div style={{position: 'absolute', left: x, top: y, width: 320, height: H}}>
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: -86,
          clipPath: cham(10),
          background: C.panel,
          padding: '8px 18px 10px',
          borderLeft: `6px solid ${statusColor}`,
          opacity: label,
          transform: `translateX(${(1 - label) * 20}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{fontFamily: MONO, fontSize: 16, letterSpacing: 3, color: C.muted, fontWeight: 700}}>
          RNC-01 <span style={{fontFamily: JP}}>レン</span>
        </div>
        <div style={{fontFamily: MONO, fontSize: 22, letterSpacing: 3, color: statusColor, fontWeight: 700, whiteSpace: 'pre'}}>
          {status}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: H,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          transform: `translateY(${(1 - rise) * 140 + hop}px) scale(${pop})`,
          transformOrigin: '50% 100%',
          opacity: Math.min(1, rise * 2),
        }}
      >
        <Img src={staticFile(`labui/ren_${pose}.png`)} style={{height: H, display: 'block'}} />
      </div>
      {/* 起動の瞬間だけ光る */}
      <div
        style={{
          position: 'absolute',
          left: 160 - 130,
          top: H / 2 - 130,
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(166,236,255,${eye * 0.9}) 0%, rgba(53,214,255,${eye * 0.45}) 35%, rgba(53,214,255,0) 70%)`,
        }}
      />
    </div>
  );
};
