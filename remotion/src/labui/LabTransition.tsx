// ⑤ 場面転換：斜めの帯が左から右へ抜ける。at の瞬間に画面が全部隠れるので、そこで中身を切り替える
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, JP, MONO, clamp} from './tokens';

export const TRANSITION_HALF = 10;

export const LabTransition: React.FC<{at: number; label?: string}> = ({at, label = 'NAGIBAKU LAB'}) => {
  const f = useCurrentFrame();
  const a = at - TRANSITION_HALF;
  const b = at + TRANSITION_HALF;
  if (f < a || f > b) return null;
  const x = interpolate(f, [a, b], [-3300, 2300], {...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1)});
  const word = interpolate(f, [at - 4, at, at + 4], [0, 1, 0], clamp);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div style={{position: 'absolute', top: -100, left: x, height: 1280, display: 'flex', transform: 'skewX(-18deg)'}}>
        <div style={{width: 10, background: C.white}} />
        <div style={{width: 16}} />
        <div style={{width: 2900, background: C.navy}} />
        <div style={{width: 60, background: C.cyan}} />
      </div>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: word}}>
        <div style={{fontFamily: MONO, fontSize: 30, letterSpacing: 14, color: C.cyan, fontWeight: 700}}>{label}</div>
        <div style={{fontFamily: JP, fontSize: 22, letterSpacing: 6, color: C.muted, marginTop: 10, fontWeight: 700}}>
          ナギバク研究所
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
