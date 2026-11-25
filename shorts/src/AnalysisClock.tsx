import React from 'react';
import {Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import geo from '../public/series/nagi45/clock/geometry.json';

// ─────────────────────────────────────────────────────────────
// 45秒解析の時計UI（シリーズ固定・2026-11-25 採用デザイン）
// デザイン：レトロな機械式懐中時計×研究所UI。真鍮ゴールドの枠・アイボリーの文字盤・スケルトンの歯車・ローマ数字・赤い秒針・シアンの発光・ダークネイビー
// 素材：public/series/nagi45/clock/（shorts/scripts/make_clock_assets.py が採用デザイン画像 shorts/assets_src/analysis_clock_design.png から切り出す）
// 使い方：<AnalysisClock start={解析開始のフレーム} seconds={45} title="今回の題" />（台本や解説とは独立。時間は動画のフレームから計算）
// 動き：赤い秒針は1秒ごとにカチッと動く（60秒で一周の文字盤、残り45秒＝9時 → 反時計回り → 0秒＝12時）。
//       右下のデジタル表示・外周ゲージも同じ「残り秒」から作るので3つは完全に同期する
// 変更禁止：ユーザーの明示的な指示がない限り、デザイン・配色・基本演出は変えない
// ─────────────────────────────────────────────────────────────

const P = 'series/nagi45/clock';
const S = geo.size;            // 素材の座標系（1254）
const CREAM = '#f3ead2';
const CYAN = '#5fe3ff';
const SERIF = '"Noto Serif CJK JP", "Noto Serif JP", "DejaVu Serif", serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = (t: number) => 1 - Math.pow(1 - t, 3);

// 画面上の置き場所（Shorts 1080×1920）
const CARD = {x: 40, y: 300, k: 1000 / S};          // 起動時：中央に大きく（背景つき）
const MINI = {cx: 178, cy: 300, d: 300};            // 解析中：左上に小さく（本体だけ）
const MINI_K = MINI.d / (geo.body_r * 2);
const MINI_O = {x: MINI.cx - geo.cx * MINI_K, y: MINI.cy - geo.cy * MINI_K};
const PANEL = {x: 360, y: 168, w: 560, h: 132};       // 解析中のデジタル残り時間

export type ClockTiming = {start: number; seconds: number};

export const clockState = (f: number, fps: number, t: ClockTiming) => {
  const el = (f - t.start) / fps;
  const secs = Math.max(0, t.seconds - Math.max(0, Math.floor(el)));   // 残り秒（整数）。1秒ごとに減る
  const done = el >= t.seconds;
  const sinceTick = el < 0 ? 0 : done ? (el - t.seconds) * fps : (el - Math.floor(el)) * fps;
  return {el, secs, done, sinceTick, warn: secs <= 5 && !done};
};

// 秒針の角度（12時から時計回りの度）。カチッと動いて少し揺れる
const handAngle = (f: number, fps: number, t: ClockTiming) => {
  const {secs, sinceTick, el} = clockState(f, fps, t);
  const target = secs * 6;
  if (el < 1) return target;
  const sp = spring({frame: sinceTick, fps, config: {damping: 11, stiffness: 520, mass: 0.6}});
  return target + 6 * (1 - sp);
};

// ───────── 文字盤まわりの動くパーツ（素材の座標系 1254×1254 で描く）
const Mechanism: React.FC<{t: ClockTiming; glowOn: number; f: number; fps: number}> = ({t, glowOn, f, fps}) => {
  const {secs, el, done, warn} = clockState(f, fps, t);
  const run = Math.min(Math.max(el - 0.4, 0), t.seconds);                  // 歯車は起動の少しあとから回り、終了で止まる
  const ease = interpolate(el, [0.4, 1.2], [0, 1], clamp);
  const red = warn ? 'hue-rotate(165deg) saturate(1.8) brightness(1.05)' : 'none';
  const breathe = 0.86 + 0.14 * Math.sin(f / 11);
  const glowOp = glowOn * (done ? 0.35 : breathe);
  // 外周ゲージ：残り秒に比例して、12時側へ縮む
  const [a0, a1] = geo.gauge_a;
  const th = a0 + 2 + (a1 - a0 - 7) * (secs / t.seconds);
  const pts = [`${geo.cx}px ${geo.cy}px`];
  for (let a = a0 - 1; a <= th; a += 3) {
    const r = 420, rad = (a * Math.PI) / 180;
    pts.push(`${geo.cx + Math.sin(rad) * r}px ${geo.cy - Math.cos(rad) * r}px`);
  }
  const ang = handAngle(f, fps, t);
  return (
    <>
      {/* 内部の歯車（窓の中だけ見える）。速さと向きはばらばら */}
      <div style={{position: 'absolute', inset: 0, WebkitMaskImage: `url(${staticFile(`${P}/gearwin.png`)})`, WebkitMaskSize: '100% 100%',
        maskImage: `url(${staticFile(`${P}/gearwin.png`)})`, maskSize: '100% 100%'}}>
        {geo.gears.map((g) => (
          <Img key={g.id} src={staticFile(`${P}/gear_${g.id}.png`)} style={{position: 'absolute', left: g.x - g.r, top: g.y - g.r, width: g.r * 2,
            height: g.r * 2, rotate: `${g.dps * run * ease}deg`}} />
        ))}
      </div>
      {/* シアンの発光パーツ（起動で点灯・控えめに明滅・残り5秒で赤） */}
      <Img src={staticFile(`${P}/glow.png`)} style={{position: 'absolute', inset: 0, width: S, height: S, opacity: glowOp, filter: `${red} drop-shadow(0 0 10px ${warn ? '#ff3030' : CYAN})`}} />
      <Img src={staticFile(`${P}/gauge.png`)} style={{position: 'absolute', inset: 0, width: S, height: S, opacity: glowOn,
        clipPath: `polygon(${pts.join(',')})`, filter: `${red} drop-shadow(0 0 8px ${warn ? '#ff3030' : CYAN})`}} />
      {/* 赤い秒針 */}
      <svg width={S} height={S} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
        <g transform={`rotate(${ang} ${geo.cx} ${geo.cy})`} style={{filter: 'drop-shadow(4px 6px 3px rgba(0,0,0,0.45))'}}>
          <path d={`M ${geo.cx - 5} ${geo.cy + 70} L ${geo.cx - 3.2} ${geo.cy - geo.hand_len + 50} L ${geo.cx} ${geo.cy - geo.hand_len} L ${geo.cx + 3.2} ${geo.cy - geo.hand_len + 50} L ${geo.cx + 5} ${geo.cy + 70} Z`}
            fill="#e8341c" stroke="#5a0d05" strokeWidth={2.5} />
          <path d={`M ${geo.cx} ${geo.cy - geo.hand_len + 2} q -16 34 0 62 q 16 -28 0 -62 Z`} fill="#e8341c" stroke="#5a0d05" strokeWidth={2.5} />
          <circle cx={geo.cx} cy={geo.cy + 86} r={20} fill="#e8341c" stroke="#5a0d05" strokeWidth={3} />
          <circle cx={geo.cx} cy={geo.cy} r={26} fill="#c8a25a" stroke="#4a3412" strokeWidth={3} />
          <circle cx={geo.cx} cy={geo.cy} r={15} fill="#e8341c" stroke="#5a0d05" strokeWidth={2} />
          <circle cx={geo.cx} cy={geo.cy} r={6} fill="#9fd8ff" />
        </g>
      </svg>
    </>
  );
};

const Digits: React.FC<{secs: number; size: number; warn: boolean}> = ({secs, size, warn}) => (
  <span style={{fontFamily: SERIF, fontWeight: 900, fontStyle: 'italic', fontSize: size, color: warn ? '#ffb4a8' : CREAM, letterSpacing: -2,
    display: 'inline-block', transform: 'skewX(-10deg)', textShadow: warn ? '0 0 18px rgba(255,60,40,0.8)' : '0 0 14px rgba(95,227,255,0.35)'}}>
    00:{String(secs).padStart(2, '0')}
  </span>
);

// 解析完了：スタイリッシュな帯
const Complete: React.FC<{a: number}> = ({a}) => {
  if (a < 0 || a > 56) return null;
  const inP = OUT(interpolate(a, [0, 10], [0, 1], clamp));
  const outP = interpolate(a, [44, 56], [0, 1], clamp);
  const shift = (1 - inP) * -1100 + outP * 1100;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 760, height: 330, opacity: 1 - outP * 0.4}}>
      <div style={{position: 'absolute', left: -80, right: -80, top: 40, height: 230, background: 'linear-gradient(90deg, rgba(6,18,46,0.0), rgba(6,18,46,0.92) 18%, rgba(6,18,46,0.92) 82%, rgba(6,18,46,0))',
        transform: `skewY(-4deg) translateX(${shift * 0.6}px)`}} />
      <div style={{position: 'absolute', left: -60, right: -60, top: 36, height: 4, background: CYAN, boxShadow: `0 0 14px ${CYAN}`, transform: `skewY(-4deg) translateX(${shift}px)`}} />
      <div style={{position: 'absolute', left: -60, right: -60, top: 270, height: 4, background: CYAN, boxShadow: `0 0 14px ${CYAN}`, transform: `skewY(-4deg) translateX(${-shift}px)`}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 62, textAlign: 'center', transform: `skewY(-4deg) translateX(${-shift * 0.4}px)`}}>
        <div style={{fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 44, letterSpacing: 14, color: CREAM}}>ANALYSIS COMPLETE</div>
        <div style={{fontFamily: SERIF, fontWeight: 900, fontSize: 138, color: '#fff', lineHeight: 1.1, letterSpacing: 10, textShadow: `0 0 24px ${CYAN}, 0 0 4px ${CYAN}`}}>解析完了</div>
      </div>
    </div>
  );
};

export const AnalysisClock: React.FC<{start: number; seconds: number; title?: string}> = ({start, seconds, title}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = {start, seconds};
  const a = f - start;
  if (a < 0) return null;
  const {secs, done, warn} = clockState(f, fps, t);
  const end = start + seconds * fps;
  // 起動 → 移動
  const enter = spring({frame: a, fps, config: {damping: 14, stiffness: 180}});
  const mv = OUT(interpolate(a, [50, 64], [0, 1], clamp));
  const cardBg = interpolate(a, [46, 54], [1, 0], clamp);
  const k = interpolate(mv, [0, 1], [CARD.k, MINI_K]) * interpolate(enter, [0, 1], [1.25, 1]);
  const ox = interpolate(mv, [0, 1], [CARD.x, MINI_O.x]) - (geo.cx * (k - interpolate(mv, [0, 1], [CARD.k, MINI_K])));
  const oy = interpolate(mv, [0, 1], [CARD.y, MINI_O.y]) - (geo.cy * (k - interpolate(mv, [0, 1], [CARD.k, MINI_K])));
  // 発光：起動でちらついて点灯
  const glowOn = a < 6 ? 0 : a < 16 ? (random(`g${a}`) > 0.45 ? 1 : 0.15) : 1;
  const ringRot = f * 0.25;   // 背景の円形装飾（ごくゆっくり）
  return (
    <>
      {/* 起動時の全体（背景つき） */}
      {cardBg > 0 && (
        <div style={{position: 'absolute', left: CARD.x, top: CARD.y, width: S, height: S, transformOrigin: '0 0', scale: `${CARD.k * interpolate(enter, [0, 1], [1.25, 1])}`,
          translate: `${-(geo.cx * CARD.k * (interpolate(enter, [0, 1], [1.25, 1]) - 1))}px ${-(geo.cy * CARD.k * (interpolate(enter, [0, 1], [1.25, 1]) - 1))}px`,
          opacity: Math.min(cardBg, interpolate(a, [0, 5], [0, 1], clamp))}}>
          <Img src={staticFile(`${P}/card.png`)} style={{position: 'absolute', inset: 0, width: S, height: S, boxShadow: '0 20px 60px rgba(0,0,0,0.6)'}} />
          <svg width={S} height={S} style={{position: 'absolute', inset: 0, opacity: 0.35}}>
            {[500, 560].map((r, i) => (
              <circle key={r} cx={geo.cx} cy={geo.cy} r={r} fill="none" stroke={CYAN} strokeWidth={2} strokeDasharray={i ? '2 14' : '60 24 6 24'}
                transform={`rotate(${i ? -ringRot : ringRot} ${geo.cx} ${geo.cy})`} />
            ))}
          </svg>
          <div style={{position: 'absolute', left: geo.digits_box[0], top: geo.digits_box[1] - 6, width: geo.digits_box[2] - geo.digits_box[0], textAlign: 'center'}}>
            <Digits secs={secs} size={118} warn={warn} />
          </div>
        </div>
      )}
      {/* 時計本体（起動時は全体の上にぴったり重なり、そのまま左上へ移動） */}
      <div style={{position: 'absolute', left: ox, top: oy, width: S, height: S, transformOrigin: '0 0', scale: `${k}`, opacity: interpolate(a, [0, 5], [0, 1], clamp)}}>
        <Img src={staticFile(`${P}/body.png`)} style={{position: 'absolute', inset: 0, width: S, height: S,
          filter: mv > 0.5 ? 'drop-shadow(0 10px 18px rgba(0,0,0,0.6))' : 'none'}} />
        <Mechanism t={t} glowOn={glowOn} f={f} fps={fps} />
      </div>
      {/* 解析中：デジタル残り時間（採用デザインの REMAINING パネルを再現）と今回の題 */}
      {mv > 0 && (
        <div style={{position: 'absolute', left: PANEL.x, top: PANEL.y, width: PANEL.w, opacity: mv, translate: `${(1 - mv) * 80}px 0`}}>
          <div style={{position: 'relative', height: PANEL.h}}>
            <div style={{position: 'absolute', inset: 0, background: 'rgba(8,22,54,0.88)', border: '3px solid #8fd8ff', transform: 'skewX(-14deg)',
              boxShadow: warn ? '0 0 18px rgba(255,60,40,0.6)' : '0 0 14px rgba(95,227,255,0.45)'}} />
            <div style={{position: 'absolute', left: 18, top: -22, padding: '2px 22px', background: 'linear-gradient(90deg, #7fd0ff, #4aa8ee)', transform: 'skewX(-14deg)',
              fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 26, letterSpacing: 6, color: '#08203f'}}>REMAINING</div>
            <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, paddingTop: 4}}>
              <Digits secs={secs} size={104} warn={warn} />
              <span style={{fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 28, color: CREAM}}>SEC.</span>
            </div>
          </div>
          {title && (
            <div style={{marginTop: 18, fontFamily: '"Noto Sans CJK JP", sans-serif', fontWeight: 900, fontSize: 40, lineHeight: 1.25, color: '#fff',
              WebkitTextStroke: '9px #0a1a3f', paintOrder: 'stroke fill'}}>
              {title.split('\n').map((r, i) => <div key={i}>{r}</div>)}
            </div>
          )}
        </div>
      )}
      <Complete a={f - end} />
    </>
  );
};

// 時計UIの音（起動・カチッ・歯車・停止）。ナギの声を邪魔しない音量
export const ClockSounds: React.FC<{start: number; seconds: number}> = ({start, seconds}) => {
  const {fps} = useVideoConfig();
  const end = start + seconds * fps;
  return (
    <>
      <Sequence from={start}><Audio src={staticFile(`${P}/boot.wav`)} volume={0.5} /></Sequence>
      {Array.from({length: seconds}, (_, i) => (
        <Sequence key={i} from={start + (i + 1) * fps}><Audio src={staticFile(`${P}/tick.wav`)} volume={i >= seconds - 6 ? 0.32 : 0.2} /></Sequence>
      ))}
      <Sequence from={start + 12} durationInFrames={end - start - 12}><Audio src={staticFile(`${P}/gears_loop.wav`)} volume={0.12} /></Sequence>
      <Sequence from={end}><Audio src={staticFile(`${P}/stop.wav`)} volume={0.55} /></Sequence>
    </>
  );
};
