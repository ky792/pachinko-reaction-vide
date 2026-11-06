// 常設：背景・左上の研究所タグ・右上のモード表示・キャラ
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, JP, MONO, OUT, clamp, cham, ramp} from './tokens';

export type Mode = 'talk' | 'analysis' | 'alert';
const MODE = {
  talk: {label: 'TALK', color: C.muted},
  analysis: {label: 'ANALYSIS', color: C.cyan},
  alert: {label: 'ALERT', color: C.red},
};

/** 背景。focus=1 で少し暗く・寄る（データ画面のときのカメラ） */
export const LabBackground: React.FC<{focus: number}> = ({focus}) => (
  <AbsoluteFill style={{backgroundColor: C.navy, overflow: 'hidden'}}>
    <Img
      src={staticFile('labui/lab_room.jpg')}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `scale(${1.03 + focus * 0.05})`,
        filter: `brightness(${0.62 - focus * 0.2}) saturate(${1 - focus * 0.25}) blur(${2 + focus * 3}px)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, rgba(6,17,39,0.35) 0%, rgba(6,17,39,0) 30%, rgba(6,17,39,0) 60%, rgba(6,17,39,0.75) 100%)`,
      }}
    />
  </AbsoluteFill>
);

export const LabChrome: React.FC<{mode: Mode; modeAt: number}> = ({mode, modeAt}) => {
  const f = useCurrentFrame();
  const o = ramp(f, 0, 12);
  const m = MODE[mode];
  const sw = ramp(f, modeAt, modeAt + 8); // モードが切り替わった瞬間の差し込み
  return (
    <AbsoluteFill style={{opacity: o}}>
      <div
        style={{
          position: 'absolute',
          left: 48,
          top: 40,
          display: 'flex',
          alignItems: 'stretch',
          clipPath: cham(14),
          background: C.panel,
        }}
      >
        <div style={{width: 10, background: C.cyan}} />
        <div style={{padding: '10px 22px 12px 18px'}}>
          <div style={{fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.cyan, fontWeight: 700}}>
            NAGIBAKU LAB
          </div>
          <div style={{fontFamily: JP, fontSize: 22, color: C.white, fontWeight: 700, marginTop: 2}}>
            ナギバク研究所
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 48,
          top: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 22px',
          clipPath: cham(12),
          background: C.panel,
          borderRight: `6px solid ${m.color}`,
        }}
      >
        <span style={{fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.muted, fontWeight: 700}}>MODE</span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 24,
            letterSpacing: 5,
            color: m.color,
            fontWeight: 700,
            display: 'inline-block',
            minWidth: 150,
            clipPath: `inset(0 ${(1 - sw) * 100}% 0 0)`,
          }}
        >
          ▸ {m.label}
        </span>
      </div>
    </AbsoluteFill>
  );
};

type CharState = {
  nagiPose: 'body' | 'point';
  speaking: 'nagi' | 'baku' | null;
  dim: number; // 0〜1：解析結果の見せ場では一歩下がる
  bakuHidden: boolean; // ツッコミ帯に顔が出ている間
};

export const Characters: React.FC<CharState> = ({nagiPose, speaking, dim, bakuHidden}) => {
  const f = useCurrentFrame();
  const bob = (phase: number) => Math.sin((f + phase) / 22) * 4;
  const lift = (who: 'nagi' | 'baku') => (speaking === who ? -10 : 0);
  const enter = ramp(f, 0, 14);
  const base: React.CSSProperties = {
    position: 'absolute',
    bottom: -18,
    filter: `brightness(${1 - dim * 0.55})`,
    transition: 'none',
  };
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img
        src={staticFile(nagiPose === 'point' ? 'labui/nagi_point.png' : 'labui/nagi_body.png')}
        style={{
          ...base,
          left: nagiPose === 'point' ? -60 : 70,
          height: nagiPose === 'point' ? 430 : 450,
          transform: `translateY(${bob(0) + lift('nagi') + dim * 40 + (1 - enter) * 60}px)`,
          opacity: enter,
        }}
      />
      <Img
        src={staticFile('labui/baku_body.png')}
        style={{
          ...base,
          right: 70,
          height: 450,
          transform: `translateY(${bob(11) + lift('baku') + dim * 40 + (1 - enter) * 60}px) scaleX(-1)`,
          opacity: bakuHidden ? 0 : enter,
        }}
      />
    </AbsoluteFill>
  );
};

export const fadeBetween = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {...clamp, easing: OUT});
