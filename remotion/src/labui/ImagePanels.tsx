// 画像パネル：実機の筐体画像をホログラムのモニターで見せる（2026-11-28 ユーザー指示「画像調べて入れて」）
// image   … 筐体＋機種の基本情報
// imgdata … 筐体＋表（アクセル枠の機能など）
import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, JP, MONO, SNAP, Tag, cham, clamp, ramp} from './tokens';

export const CREDIT = '©硬梨菜・不二涼介・講談社／「シャングリラ・フロンティア」製作委員会・MBS ©Sammy';

const BOX = {left: 450, top: 118, width: 900, height: 660};

const Frame: React.FC<{from: number; children: React.ReactNode}> = ({from, children}) => {
  const f = useCurrentFrame();
  const draw = ramp(f, from, from + 8, SNAP);
  const open = ramp(f, from + 7, from + 18);
  return (
    <div style={{position: 'absolute', ...BOX}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: BOX.height / 2 - 2,
          width: '100%',
          height: 4,
          background: C.cyan,
          transformOrigin: 'left',
          transform: `scaleX(${draw})`,
          opacity: 1 - open,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: C.panel,
          clipPath: cham(34),
          transform: `scaleY(${Math.max(open, 0.008)})`,
          borderTop: `4px solid ${C.cyan}`,
          opacity: open > 0 ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div style={{position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(53,214,255,0.04) 0 2px, transparent 2px 6px)'}} />
        {children}
      </div>
    </div>
  );
};

/** 筐体：下から走査線で描き出し、ゆっくり浮く。後ろにシアンの台座の光 */
const Cabinet: React.FC<{from: number; src: string; height: number; left: number; top: number}> = ({from, src, height, left, top}) => {
  const f = useCurrentFrame();
  const reveal = interpolate(f, [from + 14, from + 40], [0, 1], {...clamp, easing: SNAP});
  const float = Math.sin((f - from) / 28) * 5;
  const scanY = (1 - reveal) * 100;
  return (
    <div style={{position: 'absolute', left, top, height}}>
      <div
        style={{
          position: 'absolute',
          left: '-20%',
          right: '-20%',
          bottom: -24,
          height: 60,
          background: 'radial-gradient(ellipse at 50% 50%, rgba(53,214,255,0.45), rgba(53,214,255,0) 70%)',
          opacity: reveal,
        }}
      />
      <Img
        src={staticFile(src)}
        style={{
          height,
          display: 'block',
          translate: `0 ${float}px`,
          clipPath: `inset(${scanY}% 0 0 0)`,
          filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
        }}
      />
      {reveal > 0 && reveal < 1 && (
        <div style={{position: 'absolute', left: -20, right: -20, top: `${scanY}%`, height: 3, background: C.cyanSoft, boxShadow: `0 0 18px ${C.cyan}`}} />
      )}
    </div>
  );
};

const Credit: React.FC<{o: number}> = ({o}) => (
  <div style={{position: 'absolute', left: 44, bottom: 14, fontFamily: JP, fontSize: 14, color: C.muted, opacity: o, whiteSpace: 'nowrap'}}>{CREDIT}</div>
);

export const ImagePanel: React.FC<{from: number; src: string; label: string; title: string; lines: string[]}> = ({from, src, label, title, lines}) => {
  const f = useCurrentFrame();
  const body = ramp(f, from + 16, from + 26);
  return (
    <Frame from={from}>
      <Cabinet from={from} src={src} height={570} left={60} top={36} />
      <div style={{position: 'absolute', left: 390, top: 80, right: 30, opacity: body, translate: `${(1 - body) * 30}px 0`}}>
        <Tag>{label}</Tag>
        <div style={{fontFamily: JP, fontWeight: 900, fontSize: 33, color: C.white, lineHeight: 1.2, marginTop: 10, whiteSpace: 'nowrap'}}>{title}</div>
        <div style={{marginTop: 26, display: 'flex', flexDirection: 'column', gap: 14}}>
          {lines.map((l, i) => {
            const o = ramp(f, from + 24 + i * 6, from + 32 + i * 6);
            return (
              <div key={l} style={{display: 'flex', alignItems: 'center', gap: 14, opacity: o, translate: `${(1 - o) * 24}px 0`}}>
                <div style={{width: 10, height: 10, background: i === 0 ? C.orange : C.cyan, rotate: '45deg'}} />
                <span style={{fontFamily: JP, fontWeight: 800, fontSize: 32, color: C.white, whiteSpace: 'nowrap'}}>{l}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Credit o={body} />
    </Frame>
  );
};

export const ImageDataPanel: React.FC<{from: number; src: string; title: string; rows: {label: string; value: string}[]}> = ({from, src, title, rows}) => {
  const f = useCurrentFrame();
  const body = ramp(f, from + 16, from + 26);
  return (
    <Frame from={from}>
      <Cabinet from={from} src={src} height={570} left={50} top={36} />
      <div style={{position: 'absolute', left: 370, top: 44, right: 40, opacity: body}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <Tag>DATA MONITOR</Tag>
          <span style={{fontFamily: MONO, fontSize: 16, letterSpacing: 3, color: C.muted, fontWeight: 700}}>CABINET</span>
        </div>
        <div style={{fontFamily: JP, fontWeight: 900, fontSize: 42, color: C.white, marginTop: 6}}>{title}</div>
        <div style={{marginTop: 18}}>
          {rows.map((r, i) => {
            const o = ramp(f, from + 22 + i * 7, from + 30 + i * 7);
            return (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  height: 104,
                  borderBottom: `2px solid ${C.line}`,
                  opacity: o,
                  translate: `${(1 - o) * -24}px 0`,
                  padding: '0 8px',
                }}
              >
                <span style={{fontFamily: JP, fontWeight: 900, fontSize: 38, color: C.cyan}}>{r.label}</span>
                <span style={{fontFamily: JP, fontWeight: 700, fontSize: 28, color: C.white, marginTop: 2}}>{r.value}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Credit o={body} />
    </Frame>
  );
};

/** 写真パネル：実機の写真・液晶の画面（横長）を大きく見せる。走査線で描き出してゆっくり寄る */
export const PhotoPanel: React.FC<{from: number; src: string; label: string; caption: string; sub?: string; credit?: string}> = ({from, src, label, caption, sub, credit}) => {
  const f = useCurrentFrame();
  const body = ramp(f, from + 14, from + 24);
  const reveal = interpolate(f, [from + 12, from + 32], [0, 1], {...clamp, easing: SNAP});
  const zoom = 1 + Math.min(1, Math.max(0, (f - from) / 300)) * 0.06;
  return (
    <Frame from={from}>
      <div style={{position: 'absolute', left: 40, top: 26, right: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', opacity: body}}>
        <Tag>{label}</Tag>
        <span style={{fontFamily: MONO, fontSize: 16, letterSpacing: 3, color: C.muted, fontWeight: 700}}>IMAGE</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 40,
          top: 64,
          width: 820,
          height: 440,
          overflow: 'hidden',
          background: '#020814',
          border: `2px solid ${C.line}`,
          clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
        }}
      >
        <Img src={staticFile(src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', scale: `${zoom}`}} />
        {reveal < 1 && <div style={{position: 'absolute', top: 0, bottom: 0, left: `${reveal * 100}%`, width: 3, background: C.cyanSoft, boxShadow: `0 0 18px ${C.cyan}`}} />}
      </div>
      <div style={{position: 'absolute', left: 44, top: 548, right: 40, opacity: body, translate: `${(1 - body) * 24}px 0`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <div style={{width: 12, height: 12, background: C.orange, rotate: '45deg'}} />
          <span style={{fontFamily: JP, fontWeight: 900, fontSize: 40, color: C.white, whiteSpace: 'nowrap'}}>{caption}</span>
        </div>
        {sub && <div style={{fontFamily: JP, fontWeight: 700, fontSize: 26, color: C.cyanSoft, marginTop: 6, marginLeft: 26, whiteSpace: 'nowrap'}}>{sub}</div>}
      </div>
      <div style={{position: 'absolute', right: 40, top: 510, fontFamily: JP, fontSize: 13, color: C.muted, opacity: body, whiteSpace: 'nowrap'}}>{credit ?? CREDIT}</div>
    </Frame>
  );
};
