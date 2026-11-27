// 上乗せシミュレーション：100回まわした結果を10×10のマスで見せる（レンが回す）
// 1マス＝1回。何回目の上乗せまで行ったかで色を変える。数は公表の振り分けからの期待値で固定（見せ方用）
import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, JP, MONO, cham, clamp, ramp} from './tokens';
import {Monitor} from './Charts';

type Props = {from: number; title: string; counts: number[]; labels: string[]; total?: number};
const COLORS = ['#24467F', C.cyan, C.white];

export const BoostSim: React.FC<Props> = ({from, title, counts, labels, total = 100}) => {
  const f = useCurrentFrame();
  if (f < from) return null;
  // どのマスが何回目まで行ったか（位置はばらけさせる。毎回同じ並び）
  const cells: number[] = Array(total).fill(0);
  const order = [...Array(total).keys()].sort((a, b) => ((a * 37) % 101) - ((b * 37) % 101));
  let k = 0;
  counts.forEach((n, lv) => {
    if (lv === 0) return;
    for (let i = 0; i < n; i++) cells[order[k++]] = lv;
  });
  // lv=1 のマスの中に lv=2 を混ぜる：counts[1] は「2回目まで行った（3回目も含む）」
  const t = f - from - 18;
  const shown = Math.floor(interpolate(t, [0, 54], [0, total], clamp));
  const atLeast = (lv: number) => cells.slice(0, total).filter((c, i) => c >= lv && i < shown).length;
  const ren = ramp(f, from + 4, from + 14);
  return (
    <>
      <Monitor from={from} x={120} y={140} w={1180} h={640} label="UWANOSE SIMULATOR ×100" title={title}>
        {() => (
          <div style={{display: 'flex', gap: 46, marginTop: 18}}>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(10, 40px)', gap: 8}}>
              {cells.map((lv, i) => {
                const on = i < shown;
                const pop = on ? interpolate(t - (i / total) * 54, [0, 4], [1.5, 1], clamp) : 1;
                return (
                  <div
                    key={i}
                    style={{
                      width: 40,
                      height: 40,
                      background: on ? COLORS[lv] : '#101F3C',
                      border: `2px solid ${on && lv ? C.cyan : C.line}`,
                      transform: `scale(${pop})`,
                      boxShadow: on && lv === 2 ? `0 0 16px ${C.cyan}` : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div style={{flex: 1, paddingTop: 8}}>
              <div style={{fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: C.muted, fontWeight: 700}}>
                RUN {String(shown).padStart(3, '0')} / {total}
              </div>
              {labels.map((lab, lv) => {
                const n = lv === 0 ? shown : atLeast(lv);
                const p = lv === 0 ? 1 : ramp(t, 54 + lv * 6, 62 + lv * 6);
                return (
                  <div key={lab} style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, opacity: p}}>
                    <div style={{width: 28, height: 28, background: lv === 0 ? '#24467F' : COLORS[lv], border: `2px solid ${C.cyan}`}} />
                    <div style={{flex: 1, fontFamily: JP, fontWeight: 800, fontSize: 34, color: C.white}}>{lab}</div>
                    <div style={{fontFamily: JP, fontWeight: 900, fontSize: 64, color: lv ? C.cyan : C.white, minWidth: 120, textAlign: 'right'}}>
                      {n}
                      <span style={{fontSize: 30}}>回</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Monitor>
      <div style={{position: 'absolute', left: 1360, top: 380, opacity: ren, transform: `translateY(${(1 - ren) * 60}px)`}}>
        <div
          style={{
            clipPath: cham(10),
            background: C.panel,
            padding: '8px 18px 10px',
            borderLeft: `6px solid ${C.cyan}`,
            fontFamily: MONO,
            fontSize: 20,
            letterSpacing: 3,
            color: C.cyanSoft,
            fontWeight: 700,
            marginBottom: 14,
            whiteSpace: 'nowrap',
          }}
        >
          RNC-01 ▸ {shown < total ? 'SIMULATING' : 'COMPLETE'}
        </div>
        <Img
          src={staticFile(shown < total ? 'labui/ren_base.png' : 'labui/ren_genki.png')}
          style={{height: shown < total ? 380 : 300, transform: `translateY(${shown < total ? Math.abs(Math.sin(f / 3)) * -8 : 0}px)`}}
        />
      </div>
    </>
  );
};
