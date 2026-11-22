// 休憩室シリーズのオープニング（冒頭の寸劇のあと）：シリーズロゴ →  キャラ紹介 → 回タイトル
//   0〜24   部屋が暗くなり、マグにカメラが吸い込まれる
//   18〜110 ロゴ「ナギバクの休憩室」（マグと湯気・英字・ナギとバクがのぞく）
//   110〜170 キャラ紹介（左にナギ・右にバク）
//   170〜250 回タイトル「#1 スロットって複雑すぎひん？」
import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const BLUE = '#2a6cff';
const BLUE_DEEP = '#0b1f4d';
const ORANGE = '#ff8a1f';
const YELLOW = '#ffd23f';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const OP_LEN = 250;
const LOGO = 18,
  CAST = 110,
  TITLE = 170;

const Steam: React.FC<{t: number; x: number}> = ({t, x}) => {
  const p = interpolate(t, [0, 30], [0, 1], clamp);
  return (
    <svg width={120} height={220} style={{position: 'absolute', left: x, top: -200, opacity: 0.85}} viewBox="0 0 120 220">
      <path
        d={`M60 220 C 20 ${180 - 8 * Math.sin(t / 6)}, 100 ${130 + 8 * Math.sin(t / 7)}, 60 ${90} S 30 ${30 + 6 * Math.sin(t / 5)}, 60 0`}
        fill="none"
        stroke="white"
        strokeWidth={14}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${p} 1`}
      />
    </svg>
  );
};

const Mug: React.FC<{t: number}> = ({t}) => {
  const {fps} = useVideoConfig();
  const s = spring({frame: t, fps, config: {damping: 11, stiffness: 160}});
  return (
    <div style={{position: 'relative', width: 230, height: 200, scale: `${s}`, rotate: `${(1 - s) * -30}deg`}}>
      <Steam t={t - 10} x={20} />
      <Steam t={t - 16} x={90} />
      <div style={{position: 'absolute', left: 0, top: 20, width: 180, height: 170, borderRadius: '14px 14px 60px 60px', background: 'white', border: `10px solid ${BLUE_DEEP}`}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 50, textAlign: 'center', fontFamily: '"Noto Sans", sans-serif', fontWeight: 900, fontSize: 30, color: ORANGE, letterSpacing: 2}}>N×B</div>
      </div>
      <div style={{position: 'absolute', left: 168, top: 60, width: 70, height: 90, borderRadius: '0 50px 50px 0', border: `14px solid ${BLUE_DEEP}`, borderLeft: 'none'}} />
    </div>
  );
};

const Logo: React.FC<{t: number}> = ({t}) => {
  const {fps} = useVideoConfig();
  const a = spring({frame: t - 18, fps, config: {damping: 10, stiffness: 200}});
  const b = spring({frame: t - 28, fps, config: {damping: 9, stiffness: 220}});
  const en = 'NAGIBAKU  BREAK  ROOM';
  const typed = Math.max(0, Math.min(en.length, Math.floor((t - 44) * 1.2)));
  const peek = spring({frame: t - 52, fps, config: {damping: 14}});
  const out = interpolate(t, [CAST - LOGO - 10, CAST - LOGO], [1, 0], clamp);
  const zoomOut = interpolate(t, [CAST - LOGO - 10, CAST - LOGO], [1, 1.4], clamp);
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: out, scale: `${zoomOut}`}}>
      {/* 後ろの光 */}
      <div style={{position: 'absolute', width: 1200, height: 1200, borderRadius: '50%', background: `conic-gradient(from ${t * 1.5}deg, rgba(255,255,255,0.08) 0 10deg, transparent 10deg 30deg)`, maskImage: 'radial-gradient(circle, black 30%, transparent 70%)'}} />
      {/* ナギとバクがのぞく */}
      <Img src={staticFile('kyu/nagi_happy.png')} style={{position: 'absolute', left: -40 + (1 - peek) * -400, bottom: -20, height: 430, rotate: '8deg'}} />
      <Img src={staticFile('kyu/baku_happy.png')} style={{position: 'absolute', right: -40 + (1 - peek) * -400, bottom: -20, height: 430, rotate: '-8deg'}} />
      <div style={{display: 'flex', alignItems: 'center', gap: 40}}>
        <Mug t={t} />
        <div style={{fontFamily: JP, fontWeight: 900, lineHeight: 1}}>
          <div style={{fontSize: 92, color: 'white', WebkitTextStroke: `14px ${BLUE_DEEP}`, paintOrder: 'stroke fill', scale: `${a}`, transformOrigin: '0 100%'}}>
            ナギ<span style={{color: ORANGE}}>バク</span>の
          </div>
          <div style={{fontSize: 220, color: YELLOW, WebkitTextStroke: `20px ${BLUE_DEEP}`, paintOrder: 'stroke fill', textShadow: `0 14px 0 ${BLUE_DEEP}`, scale: `${interpolate(b, [0, 1], [2.2, 1])}`, opacity: Math.min(1, b * 2), rotate: '-3deg', marginTop: 4}}>
            休憩室
          </div>
          <div style={{fontSize: 40, letterSpacing: 6, color: 'white', marginTop: 18, fontFamily: '"Noto Sans", sans-serif'}}>
            {en.slice(0, typed)}
            <span style={{opacity: Math.floor(t / 6) % 2 ? 1 : 0}}>▌</span>
          </div>
        </div>
      </div>
      {/* きらきら */}
      {Array.from({length: 14}).map((_, i) => {
        const at = 30 + i * 3;
        const k = t - at;
        if (k < 0 || k > 24) return null;
        const x = (random(`sx${i}`) - 0.5) * 1500,
          y = (random(`sy${i}`) - 0.5) * 700;
        return <div key={i} style={{position: 'absolute', left: 960 + x, top: 540 + y, width: 22, height: 22, background: i % 2 ? YELLOW : 'white', rotate: '45deg', scale: `${Math.sin((k / 24) * Math.PI)}`}} />;
      })}
    </AbsoluteFill>
  );
};

const Cast: React.FC<{t: number}> = ({t}) => {
  const {fps} = useVideoConfig();
  const l = spring({frame: t, fps, config: {damping: 15, stiffness: 170}});
  const r = spring({frame: t - 8, fps, config: {damping: 15, stiffness: 170}});
  const out = interpolate(t, [TITLE - CAST - 8, TITLE - CAST], [1, 0], clamp);
  const card = (who: 'nagi' | 'baku', p: number) => {
    const nagi = who === 'nagi';
    return (
      <div style={{position: 'absolute', top: 0, bottom: 0, [nagi ? 'left' : 'right']: 0, width: 980, translate: `${(1 - p) * (nagi ? -1100 : 1100)}px 0`, background: nagi ? `linear-gradient(120deg, ${BLUE_DEEP}, ${BLUE})` : `linear-gradient(240deg, #7a2a00, ${ORANGE})`, clipPath: nagi ? 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' : 'polygon(12% 0, 100% 0, 100% 100%, 0 100%)', overflow: 'hidden'} as React.CSSProperties}>
        <div style={{position: 'absolute', [nagi ? 'left' : 'right']: -40, top: 40, fontFamily: '"Noto Sans", sans-serif', fontWeight: 900, fontSize: 260, color: 'rgba(255,255,255,0.08)', whiteSpace: 'nowrap'} as React.CSSProperties}>{nagi ? 'NAGI' : 'BAKU'}</div>
        <Img src={staticFile(`kyu/${who}_${nagi ? 'smug' : 'excited'}.png`)} style={{position: 'absolute', bottom: -30, [nagi ? 'left' : 'right']: 60, height: 640, scale: `${0.9 + 0.1 * p}`} as React.CSSProperties} />
        <div style={{position: 'absolute', top: 300, [nagi ? 'left' : 'right']: 560, width: 380, fontFamily: JP, fontWeight: 900, color: 'white', textAlign: nagi ? 'left' : 'right'} as React.CSSProperties}>
          <div style={{fontSize: 130, WebkitTextStroke: '10px rgba(0,0,0,0.35)', paintOrder: 'stroke fill'}}>{nagi ? 'ナギ' : 'バク'}</div>
          <div style={{fontSize: 34, marginTop: 10, lineHeight: 1.4, opacity: interpolate(p, [0.6, 1], [0, 1], clamp)}}>
            {nagi ? <>研究所の頭脳。<br />いつも目は閉じたまま</> : <>研究所のメカニック。<br />パチンコ・パチスロ大好き</>}
          </div>
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{opacity: out}}>
      {card('nagi', l)}
      {card('baku', r)}
      <div style={{position: 'absolute', left: 960 - 70, top: 470, width: 140, height: 140, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Noto Sans", sans-serif', fontWeight: 900, fontSize: 64, color: BLUE_DEEP, scale: `${spring({frame: t - 16, fps, config: {damping: 10}})}`, boxShadow: '0 10px 30px rgba(0,0,0,0.4)'}}>×</div>
    </AbsoluteFill>
  );
};

const Title: React.FC<{t: number}> = ({t}) => {
  const {fps} = useVideoConfig();
  const a = spring({frame: t, fps, config: {damping: 10, stiffness: 200}});
  const b = spring({frame: t - 8, fps, config: {damping: 10, stiffness: 200}});
  const c = spring({frame: t - 16, fps, config: {damping: 14}});
  const badge = spring({frame: t - 2, fps, config: {damping: 12}});
  const out = interpolate(t, [OP_LEN - TITLE - 10, OP_LEN - TITLE], [1, 0], clamp);
  const word: React.CSSProperties = {fontFamily: JP, fontWeight: 900, WebkitTextStroke: `16px ${BLUE_DEEP}`, paintOrder: 'stroke fill', lineHeight: 1.1};
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: out}}>
      <div style={{position: 'absolute', top: 150, fontFamily: JP, fontWeight: 900, fontSize: 56, color: BLUE_DEEP, background: YELLOW, padding: '4px 30px', borderRadius: 14, rotate: '-4deg', scale: `${badge}`}}>#1</div>
      <div style={{...word, fontSize: 150, color: 'white', scale: `${interpolate(a, [0, 1], [2.5, 1])}`, opacity: Math.min(1, a * 2), rotate: '-3deg'}}>スロットって</div>
      <div style={{...word, fontSize: 190, color: ORANGE, scale: `${interpolate(b, [0, 1], [2.5, 1])}`, opacity: Math.min(1, b * 2), rotate: '-3deg'}}>複雑すぎひん？</div>
      <div style={{marginTop: 26, fontFamily: JP, fontWeight: 900, fontSize: 40, color: BLUE_DEEP, background: '#fdfdf8', padding: '8px 30px', borderRadius: 14, border: `5px solid ${BLUE}`, translate: `0 ${(1 - c) * 60}px`, opacity: c}}>
        ナギバクの休憩室
      </div>
    </AbsoluteFill>
  );
};

export const Opening: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0 || t >= OP_LEN) return null;
  // 背景：休憩室の上に暗い幕 → ロゴ・紹介の間は二色の背景
  const veil = interpolate(t, [0, 14, OP_LEN - 12, OP_LEN], [0, 1, 1, 0], clamp);
  const wipe = interpolate(t, [6, 22], [0, 1], {...clamp, easing: OUT});
  return (
    <AbsoluteFill style={{zIndex: 20}}>
      <AbsoluteFill style={{background: `rgba(8,14,40,${0.65 * veil})`}} />
      {t < TITLE ? (
        <AbsoluteFill style={{clipPath: `circle(${wipe * 120}% at 50% 55%)`, background: `radial-gradient(circle at 30% 40%, #3a5bd0, ${BLUE_DEEP} 60%), linear-gradient(90deg, ${BLUE_DEEP}, #5a2a10)`}}>
          <AbsoluteFill style={{backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 3px, transparent 3px)', backgroundSize: '44px 44px', translate: `${(t * 1.2) % 44}px ${(t * 0.6) % 44}px`}} />
        </AbsoluteFill>
      ) : null}
      {t >= LOGO && t < CAST ? <Logo t={t - LOGO} /> : null}
      {t >= CAST && t < TITLE ? <Cast t={t - CAST} /> : null}
      {t >= TITLE ? <Title t={t - TITLE} /> : null}
    </AbsoluteFill>
  );
};

export const openingSounds = (at: number) => [
  {at: at + 2, src: 'se_chapter', vol: 0.45},
  {at: at + LOGO + 26, src: 'se_res', vol: 0.55},
  {at: at + CAST, src: 'se_pop', vol: 0.45},
  {at: at + CAST + 8, src: 'se_pop', vol: 0.45},
  {at: at + TITLE, src: 'se_emphasis', vol: 0.45},
];
