// カメラ：ショット名 → 倍率と注視点。切り替えは「情報が変わる・リアクション」のときだけ（演出表の cam）
import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {lineAt, sinceOf} from './timeline';

type Shot = {z: number; x: number; y: number; ease: number};
export const SHOTS: Record<string, Shot> = {
  two: {z: 1, x: 960, y: 540, ease: 12},
  wide: {z: 0.94, x: 960, y: 520, ease: 18},
  nagi_up: {z: 1.42, x: 430, y: 640, ease: 12},
  baku_up: {z: 1.42, x: 1490, y: 640, ease: 12},
  baku_punch: {z: 1.6, x: 1520, y: 680, ease: 4},
  nagi_punch: {z: 1.6, x: 400, y: 680, ease: 4},
};
const OUT = Easing.bezier(0.2, 0.9, 0.25, 1);

export const useCamera = () => {
  const frame = useCurrentFrame();
  const l = lineAt(frame);
  const name = l ? l.cam : 'two';
  const {from, prev} = sinceOf(frame, (x) => x.cam);
  const to = SHOTS[name] ?? SHOTS.two;
  const fr = prev ? SHOTS[prev.cam] ?? SHOTS.two : to;
  const k = interpolate(frame - from, [0, to.ease], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: OUT});
  // 同じショットの間は、ゆっくり寄り続ける（最大 +3%）
  const drift = 1 + Math.min(0.03, (frame - from) * 0.00035);
  let z = interpolate(k, [0, 1], [fr.z, to.z]) * drift;
  const x = interpolate(k, [0, 1], [fr.x, to.x]);
  const y = interpolate(k, [0, 1], [fr.y, to.y]);
  // 画面の外が見えないように注視点を制限
  z = Math.max(z, 1);
  const cx = Math.min(Math.max(x, 960 / z), 1920 - 960 / z);
  const cy = Math.min(Math.max(y, 540 / z), 1080 - 540 / z);
  // 揺れ
  let sx = 0;
  let sy = 0;
  if (l && l.shake && frame - l.start < l.shake * 30) {
    const t = frame - l.start;
    const a = (1 - t / (l.shake * 30)) * 9;
    sx = Math.sin(t * 2.3) * a;
    sy = Math.cos(t * 3.1) * a * 0.6;
  }
  return {z, cx, cy, sx, sy};
};

export const Camera: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {z, cx, cy, sx, sy} = useCamera();
  return (
    <div
      style={{
        position: 'absolute',
        width: 1920,
        height: 1080,
        transformOrigin: '0 0',
        transform: `translate(${960 - cx * z + sx}px, ${540 - cy * z + sy}px) scale(${z})`,
      }}
    >
      {children}
    </div>
  );
};
