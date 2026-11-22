// 休憩室 #1：資料パネルのない区間を埋める小さなアニメ（「同じ画面を続けない」方針・2026-11-22）
// 区間は台詞番号で決める。カードの見た目（ホワイトボード・付箋・モニター・スマホ）も場面ごとに変える。
import React from 'react';
import {Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import data from './data/kyu001.json';

const BLUE = '#2a6cff';
const BLUE_DEEP = '#0b1f4d';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const YELLOW = '#ffd23f';
const GREEN = '#18a957';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

type L = {n: number; start: number; end: number};
const LINES = data.lines as L[];
export const S = (n: number) => LINES.find((l) => l.n === n)!.start;
export const E = (n: number) => LINES.find((l) => l.n === n)!.end;
export const M = (n: number, r: number) => S(n) + (E(n) - S(n)) * r;

const pop = (f: number, at: number, fps: number, damping = 12) => (f < at ? 0 : spring({frame: f - at, fps, config: {damping, stiffness: 220}}));
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {...clamp, easing: OUT});

// ───────── カード（見た目を場面ごとに変える）
type Look = 'board' | 'sticky' | 'monitor' | 'paper';
const Card: React.FC<{from: number; to: number; look?: Look; title?: string; width?: number; height?: number; tilt?: number; children: React.ReactNode}> = ({
  from,
  to,
  look = 'board',
  title,
  width = 1000,
  height,
  tilt = 0,
  children,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: f - from, fps, config: {damping: 13, stiffness: 170}});
  const outP = interpolate(f, [to - 8, to], [1, 0], clamp);
  const bg = look === 'sticky' ? '#fff3a8' : look === 'monitor' ? '#0e1838' : look === 'paper' ? '#fffaf0' : '#fdfdf8';
  const fg = look === 'monitor' ? 'white' : BLUE_DEEP;
  const enterFrom = look === 'sticky' ? `${(1 - inS) * 700}px ${(1 - inS) * -200}px` : look === 'monitor' ? `0 ${(1 - inS) * 500}px` : `0 ${(1 - inS) * -460}px`;
  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 960 - width / 2,
        width,
        height,
        opacity: outP,
        translate: enterFrom,
        rotate: `${tilt + (1 - inS) * (look === 'sticky' ? 12 : -6)}deg`,
        scale: look === 'monitor' ? `${0.85 + 0.15 * inS}` : undefined,
        zIndex: 3,
      }}
    >
      {look === 'board' || look === 'paper' ? (
        <>
          <div style={{position: 'absolute', top: -18, left: 80, width: 150, height: 40, background: 'rgba(255,214,120,0.9)', rotate: '-6deg', zIndex: 2}} />
          <div style={{position: 'absolute', top: -18, right: 80, width: 150, height: 40, background: 'rgba(140,200,255,0.9)', rotate: '5deg', zIndex: 2}} />
        </>
      ) : null}
      {look === 'sticky' ? <div style={{position: 'absolute', top: -14, left: width / 2 - 22, width: 44, height: 44, borderRadius: '50%', background: RED, boxShadow: '0 4px 0 #8a0f16', zIndex: 2}} /> : null}
      <div
        style={{
          position: 'relative',
          height: '100%',
          background: bg,
          backgroundImage: look === 'paper' ? 'repeating-linear-gradient(transparent 0 46px, #e7dcc5 46px 48px)' : undefined,
          borderRadius: look === 'sticky' ? 6 : 20,
          border: look === 'monitor' ? `8px solid #39457a` : look === 'sticky' ? 'none' : '6px solid #d9dde6',
          boxShadow: look === 'monitor' ? `0 0 40px rgba(60,140,255,0.45), 0 24px 50px rgba(0,0,0,0.5)` : '0 22px 50px rgba(10,20,60,0.45)',
          padding: '26px 36px 30px',
          fontFamily: JP,
          fontWeight: 900,
          color: fg,
          overflow: 'hidden',
        }}
      >
        {title ? (
          <div style={{fontSize: 42, color: look === 'monitor' ? '#7fd3ff' : look === 'sticky' ? '#8a5a00' : BLUE, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14}}>
            <span style={{width: 12, height: 40, background: look === 'monitor' ? '#7fd3ff' : ORANGE, borderRadius: 6, display: 'inline-block'}} />
            {title}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

const Stamp: React.FC<{at: number; text: string; color?: string; x: number; y: number; size?: number; rot?: number}> = ({at, text, color = RED, x, y, size = 64, rot = -10}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (f < at) return null;
  const s = pop(f, at, fps);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        border: `8px solid ${color}`,
        color,
        borderRadius: 16,
        padding: '2px 20px',
        fontSize: size,
        fontWeight: 900,
        fontFamily: JP,
        background: 'rgba(255,255,255,0.88)',
        rotate: `${rot}deg`,
        scale: `${interpolate(s, [0, 1], [2.4, 1])}`,
        whiteSpace: 'nowrap',
        zIndex: 6,
      }}
    >
      {text}
    </div>
  );
};

const Pop: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties}> = ({at, children, style}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(f, at, fps);
  if (s <= 0) return null;
  return <div style={{scale: `${s}`, ...style}}>{children}</div>;
};

// ───────── 部品
const Chips: React.FC<{words: string[]; a: number; b: number; colors?: string[]}> = ({words, a, b, colors = [BLUE, ORANGE, '#9aa3b8']}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', gap: '14px 16px', justifyContent: 'center'}}>
      {words.map((w, i) => {
        const at = a + ((b - a) * 0.8 * i) / words.length;
        const s = pop(f, at, fps);
        const c = colors[i % colors.length];
        return (
          <div key={w} style={{fontSize: 42, padding: '8px 22px', borderRadius: 40, background: 'white', color: BLUE_DEEP, border: `4px solid ${c}`, scale: `${s}`, rotate: `${(random(w) - 0.5) * 10}deg`}}>
            {w}
          </div>
        );
      })}
    </div>
  );
};

const Big: React.FC<{at: number; text: string; color?: string; size?: number; sub?: string}> = ({at, text, color = ORANGE, size = 110, sub}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(f, at, fps, 10);
  if (s <= 0) return null;
  return (
    <div style={{textAlign: 'center'}}>
      <div style={{fontSize: size, color, WebkitTextStroke: '10px white', paintOrder: 'stroke fill', scale: `${interpolate(s, [0, 1], [2, 1])}`, lineHeight: 1.15}}>{text}</div>
      {sub ? <div style={{fontSize: 40, marginTop: 8, opacity: Math.min(1, s)}}>{sub}</div> : null}
    </div>
  );
};

// ───────── 各場面
// 1：冒頭のフリ（朝から機械の修理……のはず）
const Plan: React.FC = () => (
  <Card from={S(1) - 2} to={E(1.1) + 8} look="sticky" title="バクの今日の予定" width={760} tilt={2}>
    <div style={{fontSize: 64, textAlign: 'center', color: BLUE_DEEP}}>機械の修理（朝から）</div>
  </Card>
);

// 4〜6：バクは毎日打っている
const Calendar: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = S(4) + 6,
    b = E(4) - 10;
  return (
    <Card from={S(4) - 4} to={E(6) + 6} look="paper" title="バクの今月" width={900}>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, position: 'relative'}}>
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => (
          <div key={d} style={{textAlign: 'center', fontSize: 30, color: '#8a7f68'}}>
            {d}
          </div>
        ))}
        {Array.from({length: 21}).map((_, i) => {
          const at = a + ((b - a) * i) / 21;
          const s = pop(f, at, fps);
          return (
            <div key={i} style={{height: 74, borderRadius: 10, border: '3px solid #e2d6bd', background: 'white', position: 'relative', fontSize: 22, color: '#a89c84', padding: 4}}>
              {i + 1}
              {s > 0 ? (
                <div style={{position: 'absolute', inset: 6, borderRadius: '50%', border: `5px solid ${RED}`, color: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, scale: `${interpolate(s, [0, 1], [2, 1])}`, rotate: `${(random(i) - 0.5) * 30}deg`}}>
                  打
                </div>
              ) : null}
            </div>
          );
        })}
        <Stamp at={S(5) + 10} text="冷静に考えたら…" color={BLUE} x={330} y={120} size={52} rot={-6} />
        <Stamp at={S(6) + 14} text="よっぽど" x={560} y={250} size={60} rot={8} />
      </div>
    </Card>
  );
};

// 12〜13：知らなくても打てるけど、アツいか分からない
const Thermo: React.FC = () => {
  const f = useCurrentFrame();
  const wob = f >= S(13) ? 0.5 + 0.42 * Math.sin((f - S(13)) / 3.2) * Math.cos((f - S(13)) / 7) : 0.15;
  return (
    <Card from={S(12) - 4} to={E(13) + 6} look="monitor" title="打つだけなら…" width={980}>
      <div style={{display: 'flex', alignItems: 'center', gap: 40}}>
        <Pop at={S(12) + 12} style={{fontSize: 56, color: '#7dffa0'}}>
          知識ゼロでも打てる ✔
        </Pop>
      </div>
      {f >= S(13) ? (
        <div style={{marginTop: 26}}>
          <div style={{fontSize: 44, color: '#ffd23f', marginBottom: 12}}>いま、アツい？</div>
          <div style={{position: 'relative', height: 60, borderRadius: 30, background: 'linear-gradient(90deg, #3a6cff, #ffd23f, #ff3a3a)'}}>
            <div style={{position: 'absolute', top: -14, left: `calc(${wob * 100}% - 10px)`, width: 20, height: 88, background: 'white', borderRadius: 6, boxShadow: '0 0 12px white'}} />
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 30, marginTop: 8, color: '#9fb4ff'}}>
            <span>ぬるい</span>
            <span style={{fontSize: 52, color: 'white'}}>？？？</span>
            <span>アツい</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
};

// 14〜15：分からないままお金を入れ続ける
const Coins: React.FC = () => {
  const f = useCurrentFrame();
  const a = S(14) + 4;
  const n = f < a ? 0 : Math.floor((f - a) / 9);
  return (
    <Card from={S(14) - 4} to={E(15) + 6} look="board" title="分からないまま…" width={900} height={520}>
      <div style={{position: 'relative', height: 380}}>
        {/* 台のシルエット */}
        <div style={{position: 'absolute', left: 300, top: 40, width: 220, height: 320, borderRadius: 24, background: '#3a4470', border: '8px solid #1f2650'}}>
          <div style={{margin: '30px auto 0', width: 150, height: 90, borderRadius: 10, background: '#0b1230', display: 'flex', justifyContent: 'space-around', alignItems: 'center', fontSize: 50, color: '#ffd23f'}}>
            <span>?</span>
            <span>?</span>
            <span>?</span>
          </div>
          <div style={{margin: '40px auto 0', width: 60, height: 14, background: '#111', borderRadius: 7}} />
        </div>
        {Array.from({length: 7}).map((_, i) => {
          const t = ((f - a - i * 9) % 63) / 63;
          if (f < a + i * 9) return null;
          return <div key={i} style={{position: 'absolute', left: 395, top: -40 + t * 200, width: 34, height: 34, borderRadius: '50%', background: YELLOW, border: '4px solid #b8860b', opacity: t < 0.9 ? 1 : 0}} />;
        })}
        <div style={{position: 'absolute', left: 560, top: 150, fontSize: 56, color: RED, whiteSpace: 'nowrap'}}>-{(n * 1000).toLocaleString()}円</div>
        <Stamp at={S(15) + 4} text="言い方！" color={ORANGE} x={40} y={140} size={70} rot={-8} />
      </div>
    </Card>
  );
};

// 16：パチンコの用語
const PachiTerms: React.FC = () => (
  <Card from={S(16) - 4} to={E(16) + 6} look="sticky" title="パチンコの用語" width={900} tilt={-2}>
    <Chips words={['ヘソ', '保留', '確変', 'ST', '時短', '右打ち', 'RUSH']} a={S(16)} b={E(16)} colors={[ORANGE, BLUE]} />
  </Card>
);

// 17〜18：パチンコ vs スロット
const Versus: React.FC<{from: number; to: number; title: string; left: [string, string[]]; right: [string, string[]]; pick?: {at: number; side: 'left' | 'right'; text: string}; banner?: {at: number; text: string}}> = ({
  from,
  to,
  title,
  left,
  right,
  pick,
  banner,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const side = (lbl: string, items: string[], c: string, at: number, chosen: boolean) => (
    <div style={{flex: 1, background: 'white', borderRadius: 18, border: `6px solid ${c}`, padding: '16px 20px', scale: `${pop(f, at, fps)}`, boxShadow: chosen ? `0 0 0 8px ${YELLOW}` : undefined}}>
      <div style={{fontSize: 52, color: c, textAlign: 'center'}}>{lbl}</div>
      {items.map((it, i) => (
        <div key={it} style={{fontSize: 34, textAlign: 'center', marginTop: 8, opacity: f >= at + 8 + i * 6 ? 1 : 0, color: BLUE_DEEP}}>
          {it}
        </div>
      ))}
    </div>
  );
  const chosen = pick && f >= pick.at ? pick.side : null;
  return (
    <Card from={from} to={to} look="board" title={title} width={1180}>
      <div style={{display: 'flex', gap: 30, alignItems: 'stretch', position: 'relative'}}>
        {side(left[0], left[1], ORANGE, from + 6, chosen === 'left')}
        <div style={{alignSelf: 'center', fontSize: 80, color: RED, scale: `${pop(f, from + 14, fps)}`}}>VS</div>
        {side(right[0], right[1], BLUE, from + 10, chosen === 'right')}
        {pick ? <Stamp at={pick.at} text={pick.text} x={pick.side === 'left' ? 30 : 620} y={70} size={50} rot={-6} /> : null}
      </div>
      {banner && f >= banner.at ? (
        <div style={{marginTop: 16, textAlign: 'center', fontSize: 50, color: RED, scale: `${pop(f, banner.at, fps)}`}}>{banner.text}</div>
      ) : null}
    </Card>
  );
};

// 36〜37：途中の抽選を全部なくしたら
const Simplify: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nodes = ['通常', 'レア役', '高確', '前兆', 'CZ', 'AT'];
  const cut = (i: number) => (i > 0 && i < nodes.length - 1 ? M(36, 0.3 + 0.12 * i) : 1e9);
  return (
    <Card from={S(36) - 4} to={E(37) + 6} look="board" title="途中の抽選を全部なくしたら？" width={1250}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 170}}>
        {nodes.map((n, i) => {
          const gone = f >= cut(i) + 10;
          const x = f >= cut(i) ? ramp(f, cut(i), cut(i) + 10) : 0;
          return (
            <React.Fragment key={n}>
              {i > 0 && !(gone && i < nodes.length - 1) ? <div style={{fontSize: 40, color: '#9aa3b8'}}>➜</div> : null}
              {!gone || i === 0 || i === nodes.length - 1 ? (
                <div style={{position: 'relative', fontSize: 40, padding: '16px 20px', borderRadius: 18, border: `5px solid ${i === nodes.length - 1 ? GREEN : BLUE}`, background: 'white', opacity: 1 - x * 0.7, scale: `${pop(f, S(36) + i * 3, fps)}`}}>
                  {n}
                  {x > 0 ? <div style={{position: 'absolute', left: -10, right: -10, top: '50%', height: 8, background: RED, rotate: '-12deg', scale: `${x} 1`, transformOrigin: '0 50%'}} /> : null}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      {f >= S(37) ? (
        <div style={{textAlign: 'center', fontSize: 58, color: '#7a86a8', scale: `${pop(f, S(37), fps)}`}}>
          ……単調。<span style={{fontSize: 40}}>ふぁ〜</span>
        </div>
      ) : null}
    </Card>
  );
};

// 38：前兆中のドキドキ
const Heart: React.FC = () => {
  const f = useCurrentFrame();
  const t = f - S(38);
  const beat = 1 + 0.18 * Math.max(0, Math.sin(t / (6 - Math.min(3.5, t / 40))));
  const g = ramp(f, S(38), E(38));
  return (
    <Card from={S(38) - 4} to={E(38) + 6} look="monitor" title="前兆中……" width={980}>
      <div style={{display: 'flex', alignItems: 'center', gap: 40}}>
        <div style={{fontSize: 170, color: '#ff4a7a', scale: `${beat * (0.8 + g * 0.4)}`, textShadow: `0 0 ${30 * g}px #ff4a7a`, lineHeight: 1}}>♥</div>
        <div style={{flex: 1}}>
          <div style={{fontSize: 46, color: '#ffd23f'}}>「これ当たってるやろ」</div>
          <div style={{marginTop: 18, height: 40, borderRadius: 20, background: '#24305e', overflow: 'hidden'}}>
            <div style={{width: `${g * 100}%`, height: '100%', background: 'linear-gradient(90deg,#ff7a3a,#ff3a6a)'}} />
          </div>
          <div style={{fontSize: 30, marginTop: 8, color: '#9fb4ff'}}>ドキドキ度</div>
        </div>
      </div>
    </Card>
  );
};

// 39〜40：文句と好きは両立
const Balance: React.FC = () => {
  const f = useCurrentFrame();
  const tilt = f < S(40) ? -14 + 4 * Math.sin(f / 8) : interpolate(f, [S(40), S(40) + 20], [-14, 0], {...clamp, easing: OUT});
  return (
    <Card from={S(39) - 4} to={E(40) + 6} look="paper" title="文句と好き" width={900} height={430}>
      <div style={{position: 'relative', height: 300}}>
        <div style={{position: 'absolute', left: 420, top: 70, width: 14, height: 200, background: '#6b4e2e'}} />
        <div style={{position: 'absolute', left: 120, top: 70, width: 620, height: 12, background: '#6b4e2e', rotate: `${tilt}deg`, transformOrigin: '50% 50%'}}>
          <div style={{position: 'absolute', left: -40, top: 12, width: 160, padding: '10px 0', textAlign: 'center', background: '#ffe1e1', border: `5px solid ${RED}`, borderRadius: 14, fontSize: 40, color: RED, rotate: `${-tilt}deg`}}>文句</div>
          <div style={{position: 'absolute', right: -40, top: 12, width: 160, padding: '10px 0', textAlign: 'center', background: '#e1ffe9', border: `5px solid ${GREEN}`, borderRadius: 14, fontSize: 40, color: GREEN, rotate: `${-tilt}deg`}}>好き</div>
        </div>
        <Stamp at={S(40) + 18} text="両立！" color={GREEN} x={330} y={170} size={70} rot={-6} />
      </div>
    </Card>
  );
};

// 55〜56：よう考える／縛られるほど燃える
const Bulb: React.FC = () => {
  const f = useCurrentFrame();
  const on = f >= S(55) + 10;
  return (
    <Card from={S(55) - 4} to={E(56) + 6} look="sticky" width={880} tilt={2}>
      <div style={{display: 'flex', alignItems: 'center', gap: 36}}>
        <div style={{position: 'relative', width: 170, height: 200}}>
          {on
            ? Array.from({length: 8}).map((_, i) => (
                <div key={i} style={{position: 'absolute', left: 80, top: 80, width: 10, height: 50, background: ORANGE, rotate: `${i * 45}deg`, transformOrigin: '5px 90px', translate: '0 -90px', opacity: 0.6 + 0.4 * Math.sin(f / 4 + i)}} />
              ))
            : null}
          <div style={{position: 'absolute', left: 35, top: 35, width: 100, height: 100, borderRadius: '50%', background: on ? '#fff36a' : '#ddd', boxShadow: on ? '0 0 50px #ffd23f' : 'none', border: '6px solid #8a6d00'}} />
          <div style={{position: 'absolute', left: 60, top: 132, width: 50, height: 40, background: '#7a7f8c', borderRadius: 6}} />
        </div>
        <div>
          <Big at={S(55) + 6} text="よう考える！" color={ORANGE} size={86} />
          {f >= S(56) ? (
            <Pop at={S(56) + 4} style={{fontSize: 48, color: RED, marginTop: 10}}>
              縛られるほど 燃える🔥
            </Pop>
          ) : null}
        </div>
      </div>
    </Card>
  );
};

// 68〜69：好き？嫌い？
const Choice: React.FC = () => (
  <Versus from={S(68) - 4} to={E(69) + 6} title="スロットの複雑さは…" left={['好き', ['山場が多い']]} right={['嫌い', ['覚えることが多い']]} pick={{at: S(69) + 6, side: 'left', text: '好きなとこは好き'}} />
);

// 76〜78：何気ないセリフがモード示唆
const Hint: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <Card from={S(77) - 4} to={E(78) + 6} look="monitor" title="知識があると見え方が変わる" width={1180}>
      <div style={{display: 'flex', gap: 30, alignItems: 'center', minHeight: 300}}>
        <div style={{flex: 1.2, position: 'relative'}}>
          <Pop at={S(77)} style={{background: 'white', color: BLUE_DEEP, borderRadius: 30, padding: '24px 30px', fontSize: 44}}>
            「今日はなんだか、いい感じかも…」
          </Pop>
          {f >= M(77, 0.45) ? <Stamp at={M(77, 0.45)} text="モード示唆！" color={RED} x={80} y={150} size={52} /> : null}
        </div>
        {f >= S(78) ? (
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 16}}>
            <div style={{background: '#24305e', borderRadius: 16, padding: '14px 20px', fontSize: 34, whiteSpace: 'nowrap', scale: `${pop(f, S(78), fps)}`}}>
              知らない人：<span style={{color: '#9fb4ff'}}>「ふーん」</span>
            </div>
            <div style={{background: '#5e2430', borderRadius: 16, padding: '14px 20px', fontSize: 34, whiteSpace: 'nowrap', scale: `${pop(f, M(78, 0.45), fps)}`}}>
              知ってる人：<span style={{color: '#ffd23f'}}>手汗ダラダラ</span>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
};

// 79〜81：複雑さは正義？ → いや
const Justice: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = f < S(81) ? 0 : Math.min(9, Math.floor((f - S(81)) / 12) + 1);
  return (
    <Card from={S(79) - 4} to={E(81) + 6} look="board" width={1100}>
      {f < S(80) ? <Big at={S(79)} text="複雑 ＝ 正義？" color={BLUE} size={100} /> : null}
      {f >= S(80) && f < S(81) ? <Big at={S(80)} text="いや。" color={RED} size={130} /> : null}
      {f >= S(81) ? (
        <div>
          <div style={{fontSize: 44, marginBottom: 12}}>抽選を増やしただけの台</div>
          <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
            {Array.from({length: n}).map((_, i) => (
              <div key={i} style={{fontSize: 34, padding: '10px 16px', borderRadius: 12, background: '#eef2fb', border: '4px solid #9aa3b8', scale: `${pop(f, S(81) + i * 12, fps)}`}}>
                抽選{i + 1}
              </div>
            ))}
            {n >= 9 ? <div style={{fontSize: 40, color: RED, alignSelf: 'center'}}>…当たり、遠すぎ</div> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
};

// 86〜91：勉強しに来てない／解析サイト大好き
const Phone: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const hist = ['天井期待値まとめ', 'モード移行率', '設定判別ポイント', 'CZ突破率一覧', '上位AT直撃の条件', 'リーチ目一覧', 'ゾーン実戦データ'];
  const bm = f < S(90) ? 0 : Math.min(128, Math.round(ramp(f, S(90), E(90)) * 128));
  return (
    <>
      {f < S(87) ? (
        <Card from={S(86) - 4} to={S(87) + 4} look="board" width={1000}>
          <Big at={S(86) + 4} text="ゲームしに来てんねん！" color={ORANGE} size={84} sub="勉強しに来てんちゃうぞ" />
        </Card>
      ) : null}
      {f >= S(87) - 4 && f < S(88) + 4 ? (
        <div style={{position: 'absolute', left: 960 - 230, top: 60, width: 460, height: 740, borderRadius: 50, background: '#111', padding: 18, translate: `0 ${(1 - pop(f, S(87) - 4, fps)) * 700}px`, zIndex: 3, boxShadow: '0 30px 60px rgba(0,0,0,0.5)'}}>
          <div style={{width: '100%', height: '100%', borderRadius: 36, background: '#f4f6fb', overflow: 'hidden', fontFamily: JP, fontWeight: 900}}>
            <div style={{background: ORANGE, color: 'white', fontSize: 30, padding: '30px 20px 14px'}}>閲覧履歴（バクのスマホ）</div>
            {hist.map((h, i) => (
              <div key={h} style={{fontSize: 30, padding: '16px 20px', borderBottom: '2px solid #dde2ee', color: BLUE_DEEP, opacity: f >= S(87) + 4 + i * 5 ? 1 : 0, translate: `${f >= S(87) + 4 + i * 5 ? 0 : 60}px 0`}}>
                🔍 {h}
              </div>
            ))}
            <div style={{textAlign: 'center', fontSize: 34, color: RED, marginTop: 14, opacity: f >= M(87, 0.7) ? 1 : 0}}>今も見てた</div>
          </div>
        </div>
      ) : null}
      {f >= S(88) && f < S(89) + 4 ? (
        <Versus from={S(88)} to={S(89) + 4} title="同じ“勉強”でも" left={['好きで勉強', ['○ 楽しい']]} right={['勉強せな楽しめへん', ['× しんどい']]} />
      ) : null}
      {f >= S(89) ? (
        <Card from={S(89)} to={E(91) + 6} look="sticky" width={760} tilt={-2}>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: 44}}>ブックマーク</div>
            <div style={{fontSize: 130, color: RED}}>{bm}<span style={{fontSize: 50}}>件</span></div>
            {f >= S(91) ? <Pop at={S(91)} style={{fontSize: 46, color: GREEN}}>結局、楽しんでる</Pop> : null}
          </div>
        </Card>
      ) : null}
    </>
  );
};

// 92〜93：まだまだある
const More: React.FC = () => (
  <Card from={S(92) - 4} to={E(93) + 6} look="monitor" title="話し始めたらキリがない" width={1100}>
    <Chips words={['リール制御', '設定判別', 'リーチ目', '演出法則', '天井', 'ゾーン', '設定示唆', '小役カウンター']} a={S(92)} b={E(93)} colors={['#7fd3ff', ORANGE, '#ff7ab8']} />
  </Card>
);

// 94〜102：収支
const Balance2: React.FC = () => {
  const f = useCurrentFrame();
  const pts = [0, 6, -4, 9, 2, -12, -20, -15, -30, -38];
  const shown = f < S(95) ? 0 : Math.min(pts.length, Math.floor(ramp(f, S(95), E(96)) * pts.length) + 1);
  const W2 = 760,
    H2 = 300;
  const xy = (i: number) => [20 + (i * (W2 - 40)) / (pts.length - 1), H2 / 2 - pts[i] * 3.4];
  const path = pts.slice(0, shown).map((_, i) => `${i ? 'L' : 'M'} ${xy(i)[0]} ${xy(i)[1]}`).join(' ');
  return (
    <Card from={S(94) - 4} to={E(97) + 6} look="paper" title="バクの今月の収支" width={940}>
      <div style={{position: 'relative', height: 330}}>
        {f < S(95) ? <div style={{fontSize: 120, textAlign: 'center', color: '#b0a690', marginTop: 60, filter: 'blur(2px)'}}>？？？</div> : null}
        <svg width={W2} height={H2} style={{position: 'absolute', left: 40, top: 10}}>
          <line x1={0} y1={H2 / 2} x2={W2} y2={H2 / 2} stroke="#c9bfa8" strokeWidth={3} strokeDasharray="10 8" />
          <path d={path} fill="none" stroke={shown > 6 ? RED : BLUE} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
          {shown ? <circle cx={xy(shown - 1)[0]} cy={xy(shown - 1)[1]} r={12} fill={shown > 6 ? RED : BLUE} /> : null}
        </svg>
        {f >= S(97) ? <Pop at={S(97) + 6} style={{position: 'absolute', left: 300, top: 230, fontSize: 44, color: ORANGE}}>楽しめたら勝ち（本人談）</Pop> : null}
      </div>
    </Card>
  );
};

// 102〜106：本日の作業報告書（口すべりからサボりがばれる）
const Report: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const row = (label: string, value: string, at: number, color = BLUE_DEEP, circle = false) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 20, height: 84, borderBottom: '3px solid #e2d6bd'}}>
      <div style={{width: 230, fontSize: 38, color: '#8a7f68'}}>{label}</div>
      <div style={{position: 'relative', fontSize: 50, color, opacity: f >= at ? 1 : 0, scale: `${f >= at ? pop(f, at, fps) : 0}`, transformOrigin: '0 50%'}}>
        {f >= at ? value : ''}
        {circle && f >= at + 6 ? <div style={{position: 'absolute', inset: '-10px -20px', border: `6px solid ${RED}`, borderRadius: '50%', rotate: '-4deg'}} /> : null}
      </div>
      {f < at ? <div style={{fontSize: 40, color: '#c9bfa8'}}>＿＿＿＿＿＿</div> : null}
    </div>
  );
  const shake = f >= S(106) && f < S(106) + 16 ? Math.sin(f * 2.4) * 8 : 0;
  return (
    <Card from={S(102) - 6} to={E(106) + 6} look="paper" title="本日の作業報告書　担当：バク" width={980}>
      <div style={{position: 'relative', translate: `${shake}px 0`}}>
        {row('本日の作業', '機械の修理', S(102) - 2)}
        {row('実際は', 'スマスロ', S(102) + 12, RED, true)}
        {row('言い分', 'スロットの研究日', M(102, 0.6), '#7a86a8')}
        {row('そんな日', 'ない', S(103) + 12, RED)}
        {row('進み具合', '0%', M(104, 0.7), '#7a86a8')}
        <Stamp at={S(105) + 6} text="所長に報告" x={560} y={330} size={70} rot={-10} />
      </div>
    </Card>
  );
};

// 107〜108：コメントで教えて
const Comments: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <Card from={S(107) - 4} to={E(108) + 6} look="board" title="コメントで教えてね" width={1000}>
      <div style={{fontSize: 42, marginBottom: 16}}>パチンコとスロット、どっちのどこが好き？</div>
      {['パチンコ派：', 'スロット派：', '両方派：'].map((t, i) => (
        <div key={t} style={{display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, scale: `${pop(f, S(107) + 10 + i * 8, fps)}`}}>
          <div style={{width: 54, height: 54, borderRadius: '50%', background: [ORANGE, BLUE, GREEN][i]}} />
          <div style={{flex: 1, fontSize: 36, padding: '10px 18px', borderRadius: 14, background: '#f1f3f8', border: '3px solid #d9dde6', color: '#7a86a8'}}>
            {t}＿＿＿＿＿＿＿＿
          </div>
        </div>
      ))}
    </Card>
  );
};

// ───────── パチンコ台（57〜67）
const PachiBoard: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = S(57) - 4,
    to = E(67) + 6;
  const inS = spring({frame: f - from, fps, config: {damping: 14}});
  const outP = interpolate(f, [to - 8, to], [1, 0], clamp);
  // 出来事のタイミング
  const ball58 = M(58, 0.05),
    reel58 = M(58, 0.3),
    rush58 = M(58, 0.55),
    ijo58 = M(58, 0.85);
  const yaku59 = M(59, 0.55);
  const sakibare = M(61, 0.04),
    hoChange = M(61, 0.25),
    reach = M(61, 0.45),
    crash = M(61, 0.82);
  const migi = S(64),
    hoNone = S(65);
  const shake = (f >= S(60) && f < S(60) + 14) || (f >= crash && f < crash + 16) ? Math.sin(f * 2.6) * 10 : 0;
  // リールの絵柄
  let reels = ['7', '3', '5'];
  if (f >= reel58 - 12 && f < reel58) reels = ['?', '?', '?'].map((_, i) => '1234567'[(f + i * 3) % 7]);
  if (f >= reel58) reels = ['7', '7', '7'];
  if (f >= S(61)) reels = ['7', '1', '7'];
  if (f >= reach && f < crash) reels = ['7', '1234567'[Math.floor(f / 2) % 7], '7'];
  if (f >= crash) reels = ['7', '7', '7'];
  if (f >= hoNone) reels = ['3', '8', '1'];
  // 保留ランプ
  let hold = f >= ball58 + 10 ? 4 : 2;
  if (f >= hoNone) hold = f >= M(65, 0.85) ? 1 : 0;
  const holdColor = (i: number) => (f >= hoChange && f < crash && i === 0 ? RED : '#4fc3ff');
  // 連チャン
  const rensa = f >= migi ? Math.min(12, Math.floor((f - migi) / 10) + 1) : f >= rush58 ? Math.min(3, Math.floor((f - rush58) / 8) + 1) : 0;
  const flash = (at: number, len = 10) => (f >= at && f < at + len ? 1 - (f - at) / len : 0);
  const fl = Math.max(flash(sakibare, 12), flash(crash, 14), flash(yaku59, 12), flash(reel58, 8));
  const yakuY = f >= crash ? interpolate(f, [crash, crash + 6], [-160, 0], clamp) : f >= yaku59 ? interpolate(f, [yaku59, yaku59 + 6], [-160, 0], clamp) : -160;
  const yakuShown = (f >= yaku59 && f < S(60) + 20) || (f >= crash && f < S(63));
  return (
    <div style={{position: 'absolute', left: 960 - 380, top: 40, width: 760, height: 760, opacity: outP, translate: `${shake}px ${(1 - inS) * -800}px`, scale: '0.84', transformOrigin: '50% 0', zIndex: 3}}>
      {/* 筐体 */}
      <div style={{position: 'absolute', inset: 0, borderRadius: 60, background: 'linear-gradient(160deg,#dfe6f5,#8d9bc0)', border: '10px solid #3a4470', boxShadow: '0 30px 60px rgba(0,0,0,0.5)'}} />
      {/* 盤面 */}
      <div style={{position: 'absolute', left: 50, top: 40, width: 660, height: 600, borderRadius: '48% 48% 40% 40%', background: 'radial-gradient(circle at 50% 40%, #2a3a8a, #0d1440)', border: '8px solid #c8a24a', overflow: 'hidden'}}>
        {/* 釘 */}
        {Array.from({length: 60}).map((_, i) => (
          <div key={i} style={{position: 'absolute', left: 40 + ((i * 97) % 580), top: 380 + ((i * 53) % 190), width: 8, height: 8, borderRadius: '50%', background: '#d9d9d9'}} />
        ))}
        {/* 液晶 */}
        <div style={{position: 'absolute', left: 150, top: 90, width: 360, height: 230, borderRadius: 16, background: '#05081c', border: '6px solid #6a7ad0', display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontFamily: JP, fontWeight: 900, fontSize: 120, color: f >= crash && f < hoNone ? YELLOW : 'white', textShadow: f >= crash && f < hoNone ? '0 0 30px #ffd23f' : 'none'}}>
          {reels.map((r, i) => (
            <span key={i}>{r}</span>
          ))}
        </div>
        {f >= reach && f < crash ? <div style={{position: 'absolute', left: 170, top: 262, width: 320, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 44, color: 'white', background: RED, borderRadius: 10}}>激アツ</div> : null}
        {f >= rush58 && f < S(59) ? <div style={{position: 'absolute', left: 170, top: 262, width: 320, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 44, color: BLUE_DEEP, background: YELLOW, borderRadius: 10}}>RUSH突入！</div> : null}
        {/* 保留 */}
        <div style={{position: 'absolute', left: 230, top: 350, display: 'flex', gap: 18, opacity: f >= reach && f < crash ? 0 : 1}}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{width: 34, height: 34, borderRadius: '50%', background: i < hold ? holdColor(i) : '#2a3058', boxShadow: i < hold ? `0 0 12px ${holdColor(i)}` : 'none', scale: `${f >= hoChange && f < crash && i === 0 ? 1.4 : 1}`}} />
          ))}
        </div>
        {/* ヘソ */}
        <div style={{position: 'absolute', left: 300, top: 470, width: 60, height: 30, borderRadius: '0 0 30px 30px', background: '#c8a24a'}} />
        {/* 玉 */}
        {f >= ball58 && f < ball58 + 14 ? <div style={{position: 'absolute', left: 318, top: interpolate(f, [ball58, ball58 + 14], [0, 470]), width: 24, height: 24, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, white, #9aa)'}} /> : null}
        {/* 右打ち */}
        {f >= migi && f < hoNone
          ? Array.from({length: 10}).map((_, i) => {
              const t = ((f - migi + i * 4) % 30) / 30;
              return <div key={i} style={{position: 'absolute', left: 600, top: 40 + t * 520, width: 22, height: 22, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, white, #9aa)'}} />;
            })
          : null}
        {/* 回らない：釘ではじかれる玉 */}
        {f >= hoNone
          ? Array.from({length: 6}).map((_, i) => {
              const t = ((f - hoNone + i * 9) % 54) / 54;
              return <div key={i} style={{position: 'absolute', left: 300 + Math.sin(t * 9 + i) * 140 * t, top: 380 + t * 220, width: 20, height: 20, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, white, #9aa)'}} />;
            })
          : null}
        {/* 役物 */}
        {yakuShown ? (
          <div style={{position: 'absolute', left: 200, top: 20 + yakuY, width: 260, height: 90, borderRadius: 20, background: 'linear-gradient(#ffe36a,#ff9a1f)', border: '6px solid #8a4a00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: JP, fontWeight: 900, fontSize: 48, color: '#7a2a00'}}>
            ★ 役物 ★
          </div>
        ) : null}
        <div style={{position: 'absolute', inset: 0, background: 'white', opacity: fl * 0.75}} />
      </div>
      {/* 吹き出し文字 */}
      {f >= sakibare && f < sakibare + 26 ? <div style={{position: 'absolute', left: -120, top: 60, fontFamily: JP, fontWeight: 900, fontSize: 80, color: '#7fd3ff', WebkitTextStroke: '8px #0b1f4d', paintOrder: 'stroke fill', rotate: '-10deg'}}>キュイン！</div> : null}
      {(f >= crash && f < crash + 30) || (f >= yaku59 && f < yaku59 + 26) ? <div style={{position: 'absolute', right: -160, top: 80, fontFamily: JP, fontWeight: 900, fontSize: 84, color: YELLOW, WebkitTextStroke: '9px #0b1f4d', paintOrder: 'stroke fill', rotate: '8deg'}}>ガシャーン！</div> : null}
      {f >= ijo58 && f < S(59) ? <div style={{position: 'absolute', right: -140, top: 260, border: `9px solid ${RED}`, color: RED, background: 'rgba(255,255,255,0.9)', borderRadius: 16, fontFamily: JP, fontWeight: 900, fontSize: 80, padding: '0 20px', rotate: '10deg', scale: `${interpolate(pop(f, ijo58, fps), [0, 1], [2.4, 1])}`}}>以上！</div> : null}
      {f >= S(62) && f < E(62) ? <div style={{position: 'absolute', left: -150, top: 300, fontFamily: JP, fontWeight: 900, fontSize: 96, color: '#ff5a8a', WebkitTextStroke: '9px white', paintOrder: 'stroke fill', scale: `${pop(f, S(62), fps)}`}}>本能！</div> : null}
      {rensa > 0 && f < hoNone ? (
        <div style={{position: 'absolute', right: -170, top: 420, fontFamily: JP, fontWeight: 900, fontSize: 64, color: RED, WebkitTextStroke: '8px white', paintOrder: 'stroke fill'}}>
          {rensa}連！{f >= migi ? <div style={{fontSize: 44, color: '#ff5a8a'}}>脳汁ドバー</div> : null}
        </div>
      ) : null}
      {f >= hoNone ? <div style={{position: 'absolute', left: -170, top: 430, fontFamily: JP, fontWeight: 900, fontSize: 52, color: '#9fb4ff', WebkitTextStroke: '7px #0b1f4d', paintOrder: 'stroke fill', rotate: '-6deg'}}>保留4個が<br />遠い……</div> : null}
      <div style={{position: 'absolute', left: 30, bottom: 12, fontFamily: JP, fontWeight: 700, fontSize: 22, color: '#2a3058'}}>※イメージです。実在の機種ではありません</div>
      {f >= S(67) ? (
        <div style={{position: 'absolute', left: -60, right: -60, bottom: -30, display: 'flex', justifyContent: 'space-around'}}>
          {['キュイン派', 'ガキン派', 'ピキーン派'].map((t, i) => (
            <div key={t} style={{fontFamily: JP, fontWeight: 900, fontSize: 38, color: 'white', background: [BLUE, ORANGE, '#c03aff'][i], padding: '8px 22px', borderRadius: 30, scale: `${pop(f, S(67) + 6 + i * 8, fps)}`}}>
              {t}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ───────── どの区間で何を出すか
export const BEATS: {from: number; to: number; el: React.ReactNode}[] = [
  {from: S(1) - 2, to: E(1.1) + 8, el: <Plan />},
  {from: S(4) - 4, to: E(6) + 6, el: <Calendar />},
  {from: S(12) - 4, to: E(13) + 6, el: <Thermo />},
  {from: S(14) - 4, to: E(15) + 6, el: <Coins />},
  {from: S(16) - 4, to: E(16) + 6, el: <PachiTerms />},
  {
    from: S(17) - 4,
    to: E(18) + 6,
    el: <Versus from={S(17) - 4} to={E(18) + 6} title="同じ店にあるのに" left={['パチンコ', ['当てる', 'RUSH', '連チャン']]} right={['スロット', ['用語', 'の', '山……']]} banner={{at: S(18) + 8, text: 'なんでここまで違う？'}} />,
  },
  {from: S(36) - 4, to: E(37) + 6, el: <Simplify />},
  {from: S(38) - 4, to: E(38) + 6, el: <Heart />},
  {from: S(39) - 4, to: E(40) + 6, el: <Balance />},
  {from: S(55) - 4, to: E(56) + 6, el: <Bulb />},
  {from: S(57) - 4, to: E(67) + 6, el: <PachiBoard />},
  {from: S(68) - 4, to: E(69) + 6, el: <Choice />},
  {from: S(77) - 4, to: E(78) + 6, el: <Hint />},
  {from: S(79) - 4, to: E(81) + 6, el: <Justice />},
  {from: S(86) - 4, to: E(91) + 6, el: <Phone />},
  {from: S(92) - 4, to: E(93) + 6, el: <More />},
  {from: S(94) - 4, to: E(97) + 6, el: <Balance2 />},
  {from: S(102) - 6, to: E(106) + 6, el: <Report />},
  {from: S(107) - 4, to: E(108) + 6, el: <Comments />},
];

export const Beats: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {BEATS.filter((b) => f >= b.from && f < b.to).map((b, i) => (
        <React.Fragment key={b.from + '-' + i}>{b.el}</React.Fragment>
      ))}
    </>
  );
};

// 効果音のタイミング
export const beatSounds = (): {at: number; src: string; vol: number}[] => {
  const out = BEATS.map((b) => ({at: b.from + 2, src: 'se_pop', vol: 0.35}));
  out.push({at: Math.round(M(58, 0.3)), src: 'px_coin', vol: 0.3});
  out.push({at: Math.round(M(61, 0.04)), src: 'px_start', vol: 0.35});
  out.push({at: Math.round(M(61, 0.82)), src: 'se_emphasis', vol: 0.5});
  out.push({at: Math.round(M(59, 0.55)), src: 'se_emphasis', vol: 0.4});
  out.push({at: S(105) + 6, src: 'se_emphasis', vol: 0.45});
  return out.map((o) => ({...o, at: Math.round(o.at)}));
};
