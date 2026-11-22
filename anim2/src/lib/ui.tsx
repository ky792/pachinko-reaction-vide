// 画面の上に乗るもの（カメラの影響を受けない）：字幕・ホワイトボード・効果・口パク信号
import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Board, LINES, Line, lineAt, sinceOf, speechOf} from './timeline';

export const JP = '"M PLUS Rounded 1c", "Noto Sans CJK JP", sans-serif';
const BLUE = '#2a6cff';
const NAVY = '#0b1f4d';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

// ───────── 字幕（台本の字面そのまま）
export const Subtitle: React.FC = () => {
  const frame = useCurrentFrame();
  const l = lineAt(frame);
  if (!l || frame > l.end + 6) return null;
  const color = l.who === 'nagi' ? BLUE : ORANGE;
  const a = interpolate(frame - l.start, [0, 4], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 46, display: 'flex', justifyContent: 'center', opacity: a}}>
      <div
        style={{
          position: 'relative',
          maxWidth: 940,
          background: 'rgba(255,255,255,0.96)',
          border: `6px solid ${color}`,
          borderRadius: 30,
          padding: '20px 40px 18px',
          fontFamily: JP,
          fontWeight: 800,
          fontSize: 44,
          lineHeight: 1.35,
          color: NAVY,
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(10,20,60,0.35)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -30,
            [l.who === 'nagi' ? 'left' : 'right']: 36,
            background: color,
            color: 'white',
            fontSize: 30,
            padding: '4px 22px',
            borderRadius: 999,
          }}
        >
          {l.who === 'nagi' ? 'ナギ' : 'バク'}
        </div>
        {l.text}
      </div>
    </div>
  );
};

// ───────── ホワイトボード風カード
const Card: React.FC<{children: React.ReactNode; enter: number; width?: number}> = ({children, enter, width = 1000}) => (
  <div style={{position: 'absolute', top: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
    <div
      style={{
        width,
        background: '#fbfbf7',
        borderRadius: 22,
        border: '10px solid #c9ced8',
        boxShadow: '0 18px 40px rgba(10,20,60,0.35)',
        padding: '30px 36px',
        fontFamily: JP,
        fontWeight: 800,
        color: NAVY,
        transform: `translateY(${(1 - enter) * -60}px) scale(${0.9 + enter * 0.1})`,
        opacity: Math.min(1, enter * 1.6),
      }}
    >
      {children}
    </div>
  </div>
);

const Chip: React.FC<{text: string; on: boolean; hot?: boolean; k: number}> = ({text, on, hot, k}) => (
  <div
    style={{
      padding: '14px 26px',
      borderRadius: 16,
      fontSize: 44,
      background: hot ? ORANGE : on ? '#e8f0ff' : '#eee',
      color: hot ? 'white' : NAVY,
      border: `4px solid ${hot ? ORANGE : BLUE}`,
      transform: `scale(${0.6 + k * 0.4})`,
      opacity: k,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </div>
);

export const BoardView: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = lineAt(frame);
  if (!l || !l.board) return null;
  const b = l.board as NonNullable<Board>;
  const since = sinceOf(frame, (x) => x.board).from;
  // 同じ種類の図解が続いているあいだは、出てくるアニメを繰り返さない
  const kindSince = sinceOf(frame, (x) => x.board?.kind ?? null).from;
  const enter = spring({frame: frame - kindSince, fps, config: {damping: 16}});
  const span = (l.end - since) || 60;
  if (b.kind === 'flow') {
    return (
      <Card enter={enter}>
        <div style={{fontSize: 30, color: '#667', marginBottom: 14}}>スロット（AT機）の当たりまで</div>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14}}>
          {b.items.map((t, i) => {
            const at = kindSince + 6 + i * (span / (b.items.length + 0.5));
            const k = spring({frame: frame - at, fps, config: {damping: 12}});
            return (
              <React.Fragment key={t}>
                {i > 0 ? <div style={{fontSize: 40, color: BLUE, opacity: k}}>▶</div> : null}
                <Chip text={t} on k={k} hot={i === b.hot} />
              </React.Fragment>
            );
          })}
          {b.ask ? (
            <div style={{fontSize: 90, color: RED, marginLeft: 6, transform: `scale(${spring({frame: frame - since - 20, fps, config: {damping: 8}})})`}}>？</div>
          ) : null}
        </div>
      </Card>
    );
  }
  if (b.kind === 'job') {
    return (
      <Card enter={enter} width={1040}>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 80px 1fr', rowGap: 12, alignItems: 'center', fontSize: 42}}>
          <div style={{fontSize: 28, color: '#667', textAlign: 'center'}}>スロット</div>
          <div />
          <div style={{fontSize: 28, color: '#667', textAlign: 'center'}}>就活</div>
          {b.rows.map(([a, c], i) => {
            const at = since + 8 + i * (span / (b.rows.length + 0.3));
            const k = spring({frame: frame - at, fps, config: {damping: 13}});
            const last = i === b.rows.length - 1;
            return (
              <React.Fragment key={a}>
                <div style={{textAlign: 'center', opacity: k, color: BLUE}}>{a}</div>
                <div style={{textAlign: 'center', opacity: k, color: '#999'}}>＝</div>
                <div
                  style={{
                    textAlign: 'center',
                    opacity: k,
                    transform: `translateX(${(1 - k) * 40}px)`,
                    color: last ? 'white' : NAVY,
                    background: last ? ORANGE : 'transparent',
                    borderRadius: 14,
                    padding: '2px 0',
                  }}
                >
                  {c}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>
    );
  }
  if (b.kind === 'stamps') {
    return (
      <Card enter={enter} width={1080}>
        <div style={{fontSize: 30, color: '#667', marginBottom: 12, textAlign: 'center'}}>バクのCZ挑戦　10回</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14}}>
          {Array.from({length: b.count}).map((_, i) => {
            const at = since + 10 + i * Math.max(2, (span - 14) / b.count);
            const k = interpolate(frame - at, [0, 4], [0, 1], {...clamp, easing: OUT});
            return (
              <div key={i} style={{position: 'relative', height: 92, borderRadius: 14, background: '#e8f0ff', border: `4px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: BLUE}}>
                {b.label} {i + 1}
                <div
                  style={{
                    position: 'absolute',
                    fontSize: 34,
                    color: RED,
                    border: `5px solid ${RED}`,
                    borderRadius: 10,
                    padding: '0 8px',
                    background: 'rgba(255,255,255,0.75)',
                    transform: `rotate(-14deg) scale(${interpolate(k, [0, 1], [2.4, 1])})`,
                    opacity: k,
                  }}
                >
                  {b.stamp}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }
  if (b.kind === 'salary') {
    const k1 = spring({frame: frame - since - 30, fps, config: {damping: 12}});
    const endAt = since + Math.round(span * 0.6);
    const k2 = interpolate(frame - endAt, [0, 5], [0, 1], {...clamp, easing: OUT});
    return (
      <Card enter={enter} width={900}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, fontSize: 46}}>
          <div style={{color: '#667', fontSize: 36, whiteSpace: 'nowrap'}}>{b.label}</div>
          <div style={{color: ORANGE, fontSize: 64, whiteSpace: 'nowrap', transform: `scale(${0.5 + k1 * 0.5})`, opacity: k1}}>{b.value}</div>
          <div
            style={{
              color: 'white',
              background: RED,
              borderRadius: 14,
              padding: '6px 22px',
              whiteSpace: 'nowrap',
              transform: `rotate(-6deg) scale(${interpolate(k2, [0, 1], [2.2, 1])})`,
              opacity: k2,
            }}
          >
            {b.end}
          </div>
        </div>
      </Card>
    );
  }
  return null;
};

// ───────── 集中線（ツッコミの瞬間だけ）
export const Shuchusen: React.FC = () => {
  const frame = useCurrentFrame();
  const l = lineAt(frame);
  if (!l || l.fx !== 'shuchusen') return null;
  const t = frame - l.start;
  if (t > 16) return null;
  const a = interpolate(t, [0, 2, 12, 16], [0, 1, 1, 0], clamp);
  const lines = Array.from({length: 64}).map((_, i) => {
    const ang = (i / 64) * Math.PI * 2 + (i % 3) * 0.01;
    const r0 = 380 + ((i * 97) % 160) + (t % 2) * 20;
    return (
      <line key={i} x1={960 + Math.cos(ang) * r0} y1={540 + Math.sin(ang) * r0} x2={960 + Math.cos(ang) * 1400} y2={540 + Math.sin(ang) * 1400} stroke="#0b1f4d" strokeWidth={4 + (i % 4) * 3} />
    );
  });
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: a * 0.55}}>
      {lines}
    </svg>
  );
};

// ───────── 小道具：参加賞のリボン
export const Prop: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = lineAt(frame);
  if (!l || !l.prop) return null;
  const at = l.start + Math.round((l.end - l.start) * 0.62);
  const k = spring({frame: frame - at, fps, config: {damping: 9}});
  if (frame < at) return null;
  return (
    <div style={{position: 'absolute', left: 700, top: 150, transform: `rotate(-8deg) scale(${k})`, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div
        style={{
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(circle, #fff 0 46%, ${ORANGE} 47% 60%, #ffd23f 61% 100%)`,
          border: `8px solid ${NAVY}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 58,
          color: NAVY,
          boxShadow: '0 14px 30px rgba(10,20,60,0.4)',
        }}
      >
        {l.prop.text}
      </div>
      <div style={{display: 'flex', gap: 30, marginTop: -30}}>
        <div style={{width: 60, height: 120, background: BLUE, clipPath: 'polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)'}} />
        <div style={{width: 60, height: 120, background: BLUE, clipPath: 'polygon(0 0,100% 0,100% 100%,50% 80%,0 100%)'}} />
      </div>
    </div>
  );
};

// ───────── 口パク信号（仮）：口のパーツが届くまで、口の形を記号で見せて同期を確かめる
const SHAPE = ['閉', '小', '中', '大', 'お'];
const MouthIcon: React.FC<{m: number; color: string}> = ({m, color}) => {
  const rx = [26, 22, 22, 26, 13][m];
  const ry = [2, 6, 12, 20, 15][m];
  return (
    <svg width={64} height={50}>
      <ellipse cx={32} cy={25} rx={rx} ry={ry} fill={m === 0 ? color : '#5a1020'} stroke={color} strokeWidth={4} />
    </svg>
  );
};
export const MouthMeter: React.FC = () => {
  const frame = useCurrentFrame();
  const row = (who: 'nagi' | 'baku') => {
    const s = speechOf(who, frame);
    const color = who === 'nagi' ? BLUE : ORANGE;
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: 10, opacity: s.speaking ? 1 : 0.45}}>
        <div style={{width: 64, fontSize: 24, color}}>{who === 'nagi' ? 'ナギ' : 'バク'}</div>
        <MouthIcon m={s.mouth} color={color} />
        <div style={{width: 30, fontSize: 26}}>{SHAPE[s.mouth]}</div>
      </div>
    );
  };
  return (
    <div style={{position: 'absolute', right: 24, top: 24, background: 'rgba(11,31,77,0.82)', color: 'white', borderRadius: 16, padding: '10px 16px', fontFamily: JP, fontWeight: 800}}>
      <div style={{fontSize: 18, opacity: 0.8, marginBottom: 4}}>口パク信号（パーツ到着後に口へ接続）</div>
      {row('nagi')}
      {row('baku')}
    </div>
  );
};

export const TrialBadge: React.FC = () => (
  <div style={{position: 'absolute', left: 24, top: 24, background: RED, color: 'white', fontFamily: JP, fontWeight: 900, fontSize: 24, padding: '6px 16px', borderRadius: 10}}>
    試作01・仮素材（表情集の差し替え）
  </div>
);

export const usedLines = (): Line[] => LINES;
