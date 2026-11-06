// ② 数値データ表示：中央に1本の線が走り、上下に開いてモニターになる
import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, SNAP, Tag, cham, clamp, ramp} from './tokens';

export type Row = {label: string; value: string; pending?: boolean};

type Props = {
  from: number;
  title: string;
  rows: Row[];
  scan?: {from: number; to: number}; // 解析ラインが上→下へ通る区間
  result?: {at: number; value: string}; // pending の行に入る答え
  hitAt?: number; // バクの割り込みで押しのけられる
};

export const PANEL = {left: 450, top: 150, width: 1020, height: 500};

export const DataPanel: React.FC<Props> = ({from, title, rows, scan, result, hitAt}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < from) return null;
  const draw = ramp(f, from, from + 8, SNAP);
  const open = ramp(f, from + 7, from + 18);
  const body = ramp(f, from + 15, from + 24);
  const hit = hitAt != null && f >= hitAt ? spring({frame: f - hitAt, fps, config: {damping: 11, stiffness: 260, mass: 0.6}}) : 0;
  const scanY =
    scan && f >= scan.from && f < scan.to + 4
      ? interpolate(f, [scan.from, scan.to], [0, 1], {...clamp, easing: SNAP})
      : null;
  return (
    <div
      style={{
        position: 'absolute',
        ...PANEL,
        transform: `translate(${-60 * hit}px, ${18 * hit}px) rotate(${-3.5 * hit}deg)`,
        transformOrigin: '20% 80%',
        filter: hit ? `brightness(${1 - 0.35 * hit})` : undefined,
      }}
    >
      {/* 開く前の1本線 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: PANEL.height / 2 - 2,
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
        }}
      >
        <div style={{opacity: body, padding: '30px 52px 0 56px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
            <Tag>DATA MONITOR</Tag>
            <Tag color={C.muted} size={16}>
              SAMPLE SPEC
            </Tag>
          </div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 46, color: C.white, marginTop: 6}}>{title}</div>
          <div style={{marginTop: 22}}>
            {rows.map((r, i) => {
              const rp = ramp(f, from + 20 + i * 5, from + 30 + i * 5);
              const rowMid = (i + 0.5) / rows.length;
              const passed = scanY != null && scanY > rowMid;
              const flash = scanY != null ? Math.max(0, 1 - Math.abs(scanY - rowMid) * 7) : 0;
              const done = result && f >= result.at;
              let value = r.value;
              let color = C.white;
              if (r.pending) {
                if (done) {
                  value = result!.value;
                  color = C.cyan;
                } else if (scanY != null) {
                  value = `${((f * 37) % 89) + 10}%_`;
                  color = 'rgba(166,236,255,0.55)';
                } else {
                  value = '――';
                  color = C.muted;
                }
              }
              return (
                <div
                  key={r.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: 98,
                    borderBottom: `2px solid ${C.line}`,
                    opacity: rp,
                    transform: `translateX(${(1 - rp) * -30}px)`,
                    background: `rgba(53,214,255,${flash * 0.16 + (passed && !r.pending ? 0.04 : 0)})`,
                    padding: '0 10px',
                  }}
                >
                  <span style={{fontFamily: JP, fontWeight: 700, fontSize: 32, color: C.muted}}>{r.label}</span>
                  <span
                    style={{
                      fontFamily: r.pending && !done && scanY != null ? MONO : JP,
                      fontWeight: 900,
                      fontSize: 60,
                      color,
                      fontStyle: 'normal',
                    }}
                  >
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {scanY != null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 150 + scanY * 300,
              height: 3,
              background: C.cyan,
              boxShadow: `0 0 24px 6px rgba(53,214,255,0.45)`,
            }}
          />
        )}
      </div>
    </div>
  );
};
