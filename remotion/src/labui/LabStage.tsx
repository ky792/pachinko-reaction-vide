// 常設：背景（新台解説の研究所・2026-11-28 ユーザー指定の絵）・左上の研究所タグ・上の章レール・右上のモード表示・キャラ
// 背景の絵の中の大型モニターと実機の液晶には、UIを重ねて「生きている研究所」にする（絵と一緒にカメラが動く）
import React from 'react';
import {AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, OUT, clamp, cham, ramp} from './tokens';

export type Mode = 'talk' | 'analysis' | 'alert';
const MODE = {
  talk: {label: 'TALK', color: C.muted},
  analysis: {label: 'ANALYSIS', color: C.cyan},
  alert: {label: 'ALERT', color: C.red},
};

// 背景の絵（1672×941）を 1920×1080 に cover で敷いたときの倍率
const K = 1920 / 1672;
const box = (x0: number, y0: number, x1: number, y1: number): React.CSSProperties => ({
  position: 'absolute',
  left: x0 * K,
  top: y0 * K,
  width: (x1 - x0) * K,
  height: (y1 - y0) * K,
});

export type ChapterInfo = {no: string; title: string; index: number; total: number; from: number} | null;

/** 絵の中の大型モニター（右奥）：章ごとの解析画面。グラフが動き続ける */
const BigMonitor: React.FC<{chapter: ChapterInfo}> = ({chapter}) => {
  const f = useCurrentFrame();
  const swap = chapter ? ramp(f, chapter.from, chapter.from + 14) : 1;
  const bars = Array.from({length: 9}, (_, i) => 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(f / (9 + i * 1.7) + i * 1.3)) * (0.6 + 0.4 * random(`b${i}`)));
  const pts = Array.from({length: 26}, (_, i) => {
    const y = 0.5 + 0.32 * Math.sin((i + f / 6) / 2.6) * Math.cos((i - f / 9) / 5.1);
    return `${(i / 25) * 100},${y * 100}`;
  }).join(' ');
  const sweep = ((f % 120) / 120) * 100;
  return (
    <div style={{...box(1079, 179, 1521, 437), overflow: 'hidden', borderRadius: 4}}>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(5,22,52,0.82)'}} />
      <div style={{position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(53,214,255,0.06) 0 2px, transparent 2px 6px)'}} />
      {/* 上の帯：今の章 */}
      <div style={{position: 'absolute', left: 18, top: 12, right: 18, display: 'flex', alignItems: 'baseline', gap: 14, opacity: swap}}>
        <span style={{fontFamily: MONO, fontSize: 15, letterSpacing: 4, color: C.cyan, fontWeight: 700}}>
          SHANFRO ▸ {chapter?.no ? `CH.${chapter.no}` : 'STANDBY'}
        </span>
        <span style={{fontFamily: JP, fontSize: 22, color: C.white, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden'}}>{chapter?.title ?? ''}</span>
      </div>
      {/* 左：波形 */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position: 'absolute', left: 18, top: 56, width: '56%', height: '52%'}}>
        <polyline points={pts} fill="none" stroke={C.cyan} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <polyline points={`0,100 ${pts} 100,100`} fill="rgba(53,214,255,0.12)" stroke="none" />
        <line x1={sweep} x2={sweep} y1={0} y2={100} stroke="rgba(166,236,255,0.6)" strokeWidth={0.6} />
      </svg>
      {/* 右：棒グラフ */}
      <div style={{position: 'absolute', right: 20, top: 60, width: '32%', height: '52%', display: 'flex', alignItems: 'flex-end', gap: 6}}>
        {bars.map((b, i) => (
          <div key={i} style={{flex: 1, height: `${b * 100}%`, background: i === 4 ? C.orange : 'rgba(53,214,255,0.75)'}} />
        ))}
      </div>
      {/* 下：章レールの小さい版 */}
      <div style={{position: 'absolute', left: 18, right: 18, bottom: 14, display: 'flex', gap: 5}}>
        {Array.from({length: chapter?.total ?? 8}, (_, i) => (
          <div
            key={i}
            style={{flex: 1, height: 6, background: chapter && i < chapter.index ? C.cyan : chapter && i === chapter.index ? C.orange : 'rgba(142,163,196,0.3)'}}
          />
        ))}
      </div>
    </div>
  );
};

/** 絵の中の実機の液晶：色がゆっくり回り、章が変わるとフラッシュ */
const MachineScreen: React.FC<{chapter: ChapterInfo}> = ({chapter}) => {
  const f = useCurrentFrame();
  const hue = (f * 1.2) % 360;
  const flash = chapter ? interpolate(f, [chapter.from, chapter.from + 3, chapter.from + 20], [0, 1, 0], clamp) : 0;
  return (
    <div style={{...box(895, 348, 987, 442), overflow: 'hidden', borderRadius: 3}}>
      <div
        style={{
          position: 'absolute',
          inset: -20,
          background: `conic-gradient(from ${hue}deg at 50% 55%, #10306b, #35d6ff, #1a1350, #ff8a1f, #10306b)`,
          filter: 'blur(10px)',
          opacity: 0.75,
        }}
      />
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <span style={{fontFamily: JP, fontWeight: 900, fontSize: 40, color: C.white, textShadow: '0 0 12px rgba(53,214,255,0.9)', opacity: 0.85 + 0.15 * Math.sin(f / 7)}}>
          神
        </span>
      </div>
      <div style={{position: 'absolute', inset: 0, background: C.white, opacity: flash * 0.8}} />
    </div>
  );
};

/** 背景。focus=1 で暗く・寄る・ぼける（データ画面のときのカメラ） */
export const LabBackground: React.FC<{focus: number; chapter: ChapterInfo}> = ({focus, chapter}) => {
  const f = useCurrentFrame();
  const driftX = Math.sin(f / 260) * 14;
  const driftY = Math.cos(f / 330) * 6;
  const scale = 1.045 + focus * 0.07 + Math.sin(f / 400) * 0.006;
  const ring = 0.55 + 0.45 * Math.sin(f / 26);
  return (
    <AbsoluteFill style={{backgroundColor: C.navy, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          transform: `translate(${driftX}px, ${driftY}px) scale(${scale})`,
          transformOrigin: '50% 45%',
          filter: `brightness(${0.95 - focus * 0.5}) saturate(${1 - focus * 0.3}) blur(${focus * 6}px)`,
        }}
      >
        <Img src={staticFile('labui/shinkai_bg.png')} style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1081}} />
        <BigMonitor chapter={chapter} />
        <MachineScreen chapter={chapter} />
        {/* 天井のリングライトの呼吸 */}
        <div
          style={{
            position: 'absolute',
            left: 690 * K,
            top: -10,
            width: 520 * K,
            height: 230 * K,
            background: 'radial-gradient(ellipse at 50% 45%, rgba(140,220,255,0.55), rgba(140,220,255,0) 65%)',
            mixBlendMode: 'screen',
            opacity: 0.25 + ring * 0.3,
          }}
        />
        {/* 左の脳タンクの泡の光 */}
        <div
          style={{
            ...box(0, 210, 180, 500),
            background: 'radial-gradient(ellipse at 40% 50%, rgba(80,200,255,0.5), rgba(80,200,255,0) 70%)',
            mixBlendMode: 'screen',
            opacity: 0.3 + 0.25 * Math.sin(f / 19),
          }}
        />
      </AbsoluteFill>
      {/* データ画面のとき：うっすら流れるグリッド */}
      <AbsoluteFill
        style={{
          opacity: focus * 0.5,
          backgroundImage: 'linear-gradient(rgba(53,214,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(53,214,255,0.16) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          backgroundPosition: `${(f * 0.6) % 80}px ${(f * 0.9) % 80}px`,
        }}
      />
      {/* 漂うチリ（光の粒） */}
      <AbsoluteFill style={{pointerEvents: 'none', opacity: 1 - focus * 0.6}}>
        {Array.from({length: 22}, (_, i) => {
          const x = random(`px${i}`) * 1920 + Math.sin(f / (60 + i * 7) + i) * 30;
          const y = (random(`py${i}`) * 1200 - f * (0.25 + random(`ps${i}`) * 0.4)) % 1200;
          const yy = y < -60 ? y + 1200 : y;
          const s = 2 + random(`pz${i}`) * 4;
          return (
            <div
              key={i}
              style={{position: 'absolute', left: x, top: yy, width: s, height: s, borderRadius: '50%', background: 'rgba(170,230,255,0.7)', boxShadow: '0 0 8px rgba(120,210,255,0.8)', opacity: 0.35 + 0.35 * Math.sin(f / 15 + i)}}
            />
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(6,17,39,0.45) 0%, rgba(6,17,39,0) 22%, rgba(6,17,39,0) 66%, rgba(6,17,39,0.7) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const LabChrome: React.FC<{mode: Mode; modeAt: number; chapter: ChapterInfo; machine: string; voice: 'nagi' | 'baku' | null}> = ({mode, modeAt, chapter, machine, voice}) => {
  const f = useCurrentFrame();
  const o = ramp(f, 0, 12);
  const m = MODE[mode];
  const sw = ramp(f, modeAt, modeAt + 8); // モードが切り替わった瞬間の差し込み
  const chIn = chapter ? ramp(f, chapter.from + 60, chapter.from + 78) : 0;
  return (
    <AbsoluteFill style={{opacity: o}}>
      {/* 左上：研究所タグ＋解析中の機種 */}
      <div style={{position: 'absolute', left: 48, top: 36, display: 'flex', flexDirection: 'column', gap: 8}}>
        <div style={{display: 'flex', alignItems: 'stretch', clipPath: cham(14), background: C.panel}}>
          <div style={{width: 10, background: C.cyan}} />
          <div style={{padding: '10px 22px 12px 18px'}}>
            <div style={{fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.cyan, fontWeight: 700}}>NAGIBAKU LAB</div>
            <div style={{fontFamily: JP, fontSize: 22, color: C.white, fontWeight: 700, marginTop: 2}}>ナギバク研究所</div>
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', background: 'rgba(255,138,31,0.92)', clipPath: cham(8), alignSelf: 'flex-start'}}>
          <span style={{fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: C.navy, fontWeight: 700}}>NEW MACHINE</span>
          <span style={{fontFamily: JP, fontSize: 20, color: C.navy, fontWeight: 900}}>{machine}</span>
        </div>
      </div>
      {/* 上の中央：章レール */}
      {chapter && (
        <div
          style={{
            position: 'absolute',
            left: 560,
            right: 560,
            top: 40,
            opacity: chIn,
            transform: `translateY(${(1 - chIn) * -20}px)`,
          }}
        >
          <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 14}}>
            <span style={{fontFamily: MONO, fontSize: 18, letterSpacing: 4, color: C.cyan, fontWeight: 700}}>{chapter.no ? `CHAPTER ${chapter.no}` : 'SUMMARY'}</span>
            <span style={{fontFamily: JP, fontSize: 26, color: C.white, fontWeight: 900, textShadow: '0 2px 10px rgba(0,0,0,0.6)'}}>{chapter.title}</span>
          </div>
          <div style={{display: 'flex', gap: 6, marginTop: 8}}>
            {Array.from({length: chapter.total}, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
                  background: i < chapter.index ? C.cyan : i === chapter.index ? C.orange : 'rgba(142,163,196,0.35)',
                }}
              />
            ))}
          </div>
        </div>
      )}
      {/* 右上の下：声の波形バー（誰かが話している間だけ動く） */}
      <div style={{position: 'absolute', right: 52, top: 112, display: 'flex', alignItems: 'flex-end', gap: 4, height: 34}}>
        <span style={{fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: voice === 'baku' ? C.orange : voice === 'nagi' ? C.cyan : C.muted, fontWeight: 700, marginRight: 8, alignSelf: 'center'}}>
          {voice === 'baku' ? 'VOICE ▸ BAKU' : voice === 'nagi' ? 'VOICE ▸ NAGI' : 'VOICE ▸ ---'}
        </span>
        {Array.from({length: 14}, (_, i) => {
          const amp = voice ? 0.2 + 0.8 * Math.abs(Math.sin(f / (2.3 + (i % 4) * 0.7) + i * 1.9)) * (0.5 + 0.5 * random(`v${i}-${Math.floor(f / 3)}`)) : 0.08;
          return <div key={i} style={{width: 5, height: `${amp * 100}%`, background: voice === 'baku' ? C.orange : C.cyan, opacity: voice ? 0.9 : 0.35}} />;
        })}
      </div>
      {/* 右上：モード */}
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
        <div style={{width: 12, height: 12, borderRadius: '50%', background: m.color, boxShadow: `0 0 10px ${m.color}`, opacity: 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((f / 30) * Math.PI * 2))}} />
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
  expr?: string; // 話しているキャラの表情（kyu/<who>_<expr>.png）。なければ通常の立ち絵
  nagiPose: 'body' | 'point';
  speaking: 'nagi' | 'baku' | null;
  lineFrom: number;
  tsukkomi: boolean;
  dim: number; // 0〜1：解析結果の見せ場では一歩下がる
  bakuHidden: boolean; // ツッコミ帯に顔が出ている間
  enterAt: number;
};

/** キャラ：ナギ＝nagi.png（説明中は指し棒 nagi_point.png）、バク＝baku_stand.png（2026-11-28 の新しい立ち絵） */
export const Characters: React.FC<CharState> = ({expr, nagiPose, speaking, lineFrom, tsukkomi, dim, bakuHidden, enterAt}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const breathe = (phase: number) => Math.sin((f + phase) / 22) * 3;
  const hop = (who: 'nagi' | 'baku') => {
    if (speaking !== who) return 0;
    const s = spring({frame: f - lineFrom, fps, config: {damping: 10, stiffness: 260}});
    return (1 - s) * (tsukkomi ? 50 : 24);
  };
  const enter = (d: number) => spring({frame: f - enterAt - d, fps, config: {damping: 16}});
  const look = (who: 'nagi' | 'baku') => (speaking && speaking !== who ? 1 : 0);
  // 話者フォーカス：話している方は明るく少し大きく、待っている方は暗く少し小さく（切り替えは数フレームでなめらかに）
  const focusAmt = (who: 'nagi' | 'baku') => {
    if (!speaking) return 0.5;
    const k = interpolate(f - lineFrom, [0, 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return speaking === who ? 0.5 + 0.5 * k : 0.5 - 0.5 * k;
  };
  const scaleOf = (who: 'nagi' | 'baku') => 0.96 + 0.07 * focusAmt(who);
  const filt = (who: 'nagi' | 'baku') => {
    const a = focusAmt(who);
    const b = 0.75 + 0.3 * a - dim * (a > 0.5 ? 0.15 : 0.45);
    return `drop-shadow(0 16px 30px rgba(0,20,80,0.4)) brightness(${b}) saturate(${0.85 + 0.15 * a})`;
  };
  const exprSrc = (who: 'nagi' | 'baku') => (expr && speaking === who ? `kyu/${who}_${expr}.png` : null);
  const point = nagiPose === 'point';
  const nagiExpr = exprSrc('nagi');
  const bakuExpr = exprSrc('baku');
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img
        src={staticFile(nagiExpr ?? (point ? 'labui/nagi_point.png' : 'nagi.png'))}
        style={{
          position: 'absolute',
          left: nagiExpr ? 10 : point ? -70 : -10,
          top: 1090 - (nagiExpr ? 560 : point ? 560 : 610),
          height: nagiExpr ? 560 : point ? 560 : 610,
          translate: `${(1 - enter(4)) * -600 + look('nagi') * 14}px ${breathe(0) - hop('nagi') + dim * 40}px`,
          rotate: `${look('nagi') * 2}deg`,
          scale: `${scaleOf('nagi')}`,
          transformOrigin: '50% 100%',
          filter: filt('nagi'),
        }}
      />
      <Img
        src={staticFile(bakuExpr ?? 'baku_stand.png')}
        style={{
          position: 'absolute',
          left: bakuExpr ? 1400 : 1330,
          top: 1090 - (bakuExpr ? 560 : 610),
          height: bakuExpr ? 560 : 610,
          scale: `${scaleOf('baku')}`,
          translate: `${(1 - enter(10)) * 600 - look('baku') * 14}px ${breathe(11) - hop('baku') + dim * 40}px`,
          rotate: `${-look('baku') * 2}deg`,
          transformOrigin: '50% 100%',
          filter: filt('baku'),
          opacity: bakuHidden ? 0 : 1,
        }}
      />
    </AbsoluteFill>
  );
};

export const fadeBetween = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {...clamp, easing: OUT});
