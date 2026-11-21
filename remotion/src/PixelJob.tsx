// 「スロット就活」をレトロゲーム風のドット絵で見せる（休憩室 #1）
//  mode 'job'  … 台詞27〜35：書類選考→一次面接→内定、10社連続不採用、圧迫面接、初任給100枚ちょっと＝参加賞
//  mode 'job2' … 台詞45〜50：試用期間（AT）→正社員（上位AT）でレベルアップ→即クビでゲームオーバー
import React from 'react';
import {continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import data from './data/kyu001.json';

// ───────── ドット文字（DotGothic16。取れなかったときは普通のゴシック）
if (typeof window !== 'undefined' && typeof FontFace !== 'undefined') {
  const h = delayRender('DotGothic16');
  new FontFace('DotGothic16', `url(${staticFile('fonts/DotGothic16-Regular.ttf')})`)
    .load()
    .then((f) => {
      (document.fonts as any).add(f);
      continueRender(h);
    })
    .catch(() => continueRender(h));
}
const DOT = '"DotGothic16", "Noto Sans CJK JP", monospace';

type L = {n: number; start: number; end: number};
const LINES = data.lines as L[];
const S = (n: number) => LINES.find((l) => l.n === n)!.start;
const E = (n: number) => LINES.find((l) => l.n === n)!.end;
const M = (n: number, r: number) => S(n) + (E(n) - S(n)) * r;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// ───────── パレットとスプライト
const PAL: Record<string, string> = {
  k: '#1a1a2e',
  o: '#ff8a1f',
  d: '#c85a10',
  w: '#ffffff',
  b: '#4fc3ff',
  g: '#e0602a',
  p: '#ff9fb0',
  y: '#ffd23f',
  r: '#e2202b',
  s: '#f5c9a0',
  h: '#2b2b2b',
  u: '#34405a',
  t: '#d6303a',
  G: '#8a8f9e',
  n: '#0b1f4d',
  c: '#b8860b',
};
const BAKU_HEAD = [
  '..kk........kk..',
  '.kddk......kddk.',
  '.kdokkkkkkkkodk.',
  '.koogbbggbbgook.',
  'kooggbbggbbggook',
  'koooggggggggoook',
];
const BAKU_FACE = {
  normal: ['kookwkooookwkook', 'kooowwwppwwwoook', '.koowwkwwkwwook.'],
  sad: ['kookkkookookkkok', 'koobwwwppwwwbook', '.koowwwkkwwwook.'],
  happy: ['kookkooooookkook', 'kooowwwppwwwoook', '.koowkwwwwkwook.'],
};
const BAKU_BODY = [
  '..kkoowwwwookk..',
  '..kwwoowwoowwk..',
  '.kowwwowwowwwok.',
  '.kowwwoyyowwwok.',
  '..kwwwwkkwwwwk..',
];
const LEGS = [
  ['..kwwwk..kwwwk..', '..kkkk....kkkk..'],
  ['...kwwwkkwwwk...', '...kkkk..kkkk...'],
];
const baku = (face: keyof typeof BAKU_FACE, step: number) => [...BAKU_HEAD, ...BAKU_FACE[face], ...BAKU_BODY, ...LEGS[step % 2]];

const BOSS = (angry: boolean) => [
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '..khhhhhhhhhhk..',
  '..khsssssssshk..',
  angry ? '..ksrrrssrrrsk..' : '..kskkksskkksk..',
  angry ? '..kskrksskrksk..' : '..kskwksskwksk..',
  '..kskkksskkksk..',
  angry ? '..ksrssssssrsk..' : '..kssssssssssk..',
  angry ? '...kskkkkkkssk..' : '...ksskkkkssk...',
  '....kssssssk....',
  '..kkuuwttwuukk..',
  '.kuuuuwttwuuuuk.',
  '.kuuuuwttwuuuuk.',
  '.kuuuuuttuuuuuk.',
  'kGGGGGGGGGGGGGGk',
  'kGGGGGGGGGGGGGGk',
];
const COIN = ['..kkkk..', '.kyyyyk.', 'kyywyyck', 'kyywyyck', 'kyywyyck', 'kyyyyyck', '.kccccc.', '..kkkk..'];
const CHEST_C = ['.kkkkkkkkkk.', 'kddddddddddk', 'kdyyyyyyyydk', 'kkkkkyykkkkk', 'kddddyydddk.', 'kddddddddddk', 'kkkkkkkkkkkk'];
const CHEST_O = ['.kkkkkkkkkk.', 'kddddddddddk', 'kkkkkkkkkkkk', 'k..........k', 'kddddyyddddk', 'kddddddddddk', 'kkkkkkkkkkkk'];

const Sprite: React.FC<{map: string[]; px: number; x: number; y: number; flip?: boolean; style?: React.CSSProperties}> = ({map, px, x, y, flip, style}) => {
  const w = Math.max(...map.map((r) => r.length));
  const h = map.length;
  const rects: React.ReactNode[] = [];
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '.' || c === ' ' || !PAL[c]) continue;
      rects.push(<rect key={`${i}-${j}`} x={i} y={j} width={1.02} height={1.02} fill={PAL[c]} />);
    }
  });
  return (
    <svg
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{position: 'absolute', left: x - (w * px) / 2, top: y - h * px, transform: flip ? 'scaleX(-1)' : undefined, ...style}}
    >
      {rects}
    </svg>
  );
};

// ───────── 背景パーツ
const W = 1500,
  H = 760,
  GROUND = 560;
const Ground: React.FC = () => (
  <>
    <div style={{position: 'absolute', left: 0, top: GROUND, width: W, height: H - GROUND, background: '#3a7d2c'}} />
    <div style={{position: 'absolute', left: 0, top: GROUND, width: W, height: 12, background: '#69c24b'}} />
    {Array.from({length: 38}).map((_, i) => (
      <div key={i} style={{position: 'absolute', left: i * 40 + (i % 2) * 12, top: GROUND + 30 + (i % 3) * 22, width: 12, height: 12, background: '#2e6624'}} />
    ))}
  </>
);
const Stars: React.FC = () => (
  <>
    {Array.from({length: 40}).map((_, i) => (
      <div
        key={i}
        style={{position: 'absolute', left: (i * 397) % W, top: 40 + ((i * 131) % 300), width: 6, height: 6, background: i % 5 ? '#5a6aa0' : '#ffffff'}}
      />
    ))}
  </>
);
const Building: React.FC<{x: number; label: string; sub: string; color: string; lit?: boolean; done?: boolean}> = ({x, label, sub, color, lit, done}) => {
  const bw = 210,
    bh = 250;
  return (
    <div style={{position: 'absolute', left: x - bw / 2, top: GROUND - bh, width: bw, height: bh}}>
      <div style={{position: 'absolute', inset: 0, background: color, border: '6px solid #1a1a2e', boxShadow: lit ? '0 0 0 6px #ffd23f' : undefined}} />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <div
            key={`${r}${c}`}
            style={{position: 'absolute', left: 26 + c * 58, top: 22 + r * 46, width: 40, height: 30, background: lit ? '#ffe98a' : '#9fd4ff', border: '4px solid #1a1a2e'}}
          />
        ))
      )}
      <div style={{position: 'absolute', left: bw / 2 - 30, bottom: 0, width: 60, height: 76, background: '#6b3d1f', border: '5px solid #1a1a2e'}} />
      <div
        style={{
          position: 'absolute',
          left: -20,
          right: -20,
          top: -92,
          textAlign: 'center',
          fontFamily: DOT,
          color: '#fff',
          fontSize: 38,
          lineHeight: 1.05,
          textShadow: '4px 4px 0 #1a1a2e',
        }}
      >
        {label}
        <div style={{fontSize: 28, color: '#ffd23f'}}>{sub}</div>
      </div>
      {done ? (
        <div style={{position: 'absolute', left: bw / 2 - 50, top: 90, fontFamily: DOT, fontSize: 44, color: '#69ff6b', textShadow: '4px 4px 0 #1a1a2e'}}>CLEAR</div>
      ) : null}
    </div>
  );
};

// メッセージ窓（RPG風、文字送り）
const MsgBox: React.FC<{msgs: [number, string][]}> = ({msgs}) => {
  const f = useCurrentFrame();
  let cur: [number, string] | null = null;
  for (const m of msgs) if (m[0] <= f) cur = m;
  if (!cur) return null;
  const shown = Math.min(cur[1].length, Math.floor((f - cur[0]) * 1.4));
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top: GROUND + 26,
        height: 138,
        background: '#000',
        border: '6px solid #fff',
        outline: '6px solid #000',
        borderRadius: 10,
        padding: '18px 30px',
        fontFamily: DOT,
        fontSize: 44,
        color: '#fff',
        lineHeight: 1.3,
        letterSpacing: 2,
      }}
    >
      {cur[1].slice(0, shown)}
      {shown >= cur[1].length && Math.floor(f / 8) % 2 ? <span style={{color: '#fff'}}> ▼</span> : null}
    </div>
  );
};

const Hud: React.FC<{left: string; right?: string}> = ({left, right}) => (
  <div
    style={{
      position: 'absolute',
      left: 30,
      right: 30,
      top: 18,
      display: 'flex',
      justifyContent: 'space-between',
      fontFamily: DOT,
      fontSize: 38,
      color: '#fff',
      textShadow: '4px 4px 0 #000',
    }}
  >
    <span>{left}</span>
    <span style={{color: '#ffd23f'}}>{right}</span>
  </div>
);

const BigText: React.FC<{at: number; text: string; color: string; size?: number; y?: number; blink?: boolean; until?: number}> = ({
  at,
  text,
  color,
  size = 110,
  y = 250,
  blink,
  until = 1e9,
}) => {
  const f = useCurrentFrame();
  if (f < at || f > until) return null;
  const t = f - at;
  const sc = t < 6 ? Math.ceil((1 + (6 - t) * 0.35) * 4) / 4 : 1; // 段々に縮む（ドットっぽく）
  if (blink && Math.floor(t / 6) % 2 && t < 30) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        textAlign: 'center',
        fontFamily: DOT,
        fontSize: size,
        color,
        textShadow: '8px 8px 0 #000',
        scale: `${sc}`,
        zIndex: 9,
      }}
    >
      {text}
    </div>
  );
};

// ───────── コマの位置（キーフレーム、ドットらしく4pxずつ）
type KF = [number, number];
const posAt = (f: number, kf: KF[]) => {
  let x = kf[0][1],
    moving = false;
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, x0] = kf[i];
    const [t1, x1] = kf[i + 1];
    if (f >= t0 && f <= t1) {
      x = interpolate(f, [t0, t1], [x0, x1], clamp);
      moving = x0 !== x1;
    } else if (f > t1) x = x1;
  }
  return {x: Math.round(x / 6) * 6, moving};
};

// ───────── シーン1：スロット就活
const JobScene: React.FC = () => {
  const f = useCurrentFrame();
  const X = [300, 620, 940, 1260];
  const t28 = (r: number) => M(28, r);
  // 10社連続不採用：台詞30〜31の間、一次面接の前で跳ね返される
  const fa = S(30) + 6,
    fb = E(31);
  const bounceLen = (fb - fa) / 10;
  const failN = f < fa ? 0 : Math.min(10, Math.floor((f - fa) / bounceLen) + 1);
  const inFail = f >= fa && f < fb + 4;
  const bossA = S(32),
    bossB = E(32) + 4;
  const walkA = S(33) + 4;
  const kf: KF[] = [
    [S(27) - 4, 110],
    [t28(0.05), 110],
    [t28(0.22), X[0] - 60],
    [t28(0.3), X[0] - 60],
    [t28(0.48), X[1] - 60],
    [t28(0.56), X[1] - 60],
    [t28(0.76), X[2] - 60],
    [S(30), X[2] - 60],
  ];
  let bx: number, moving: boolean;
  let jumpY = 0;
  let face: keyof typeof BAKU_FACE = 'normal';
  if (inFail) {
    // 扉に向かって歩く → 跳ね返る、を10回
    const lt = ((f - fa) % bounceLen) / bounceLen;
    const near = X[1] - 70,
      far = X[1] - 230;
    bx = Math.round((lt < 0.5 ? far + (near - far) * (lt / 0.5) : near - (near - far) * ((lt - 0.5) / 0.5)) / 6) * 6;
    jumpY = lt >= 0.5 ? Math.round(Math.sin(((lt - 0.5) / 0.5) * Math.PI) * 60 / 6) * 6 : 0;
    moving = lt < 0.5;
    face = lt >= 0.5 ? 'sad' : 'normal';
  } else if (f >= bossA && f < walkA) {
    bx = X[1] - 230;
    moving = false;
    face = 'sad';
  } else if (f >= walkA) {
    const p = posAt(f, [
      [walkA, X[1] - 230],
      [M(33, 0.3), X[2] - 60],
      [M(33, 0.42), X[2] - 60],
      [M(33, 0.62), X[3] - 80],
    ]);
    bx = p.x;
    moving = p.moving;
    face = f >= S(35) ? 'sad' : f >= M(33, 0.62) ? 'normal' : 'happy';
  } else {
    const p = posAt(f, kf);
    bx = p.x;
    moving = p.moving;
    face = f >= t28(0.76) ? 'happy' : 'normal';
  }
  const step = moving ? Math.floor(f / 5) : 0;
  const cleared = (i: number) => {
    if (i === 0) return f >= t28(0.22) && !(f >= fa && f < walkA);
    if (i === 1) return f >= t28(0.48) && !(f >= fa && f < walkA);
    if (i === 2) return (f >= t28(0.76) && f < fa) || f >= M(33, 0.3);
    return false;
  };
  const chestOpen = f >= M(33, 0.66);
  const coinsUp = f >= M(33, 0.7);
  const msgs: [number, string][] = [
    [S(27), 'スロット就活　はじまる！'],
    [t28(0.1), '書類選考（CZ当選）……　通過！'],
    [t28(0.36), '一次面接（CZ突破）……　通過！'],
    [t28(0.62), 'ついに　内定（AT当選）！'],
    [S(29), 'CZって　どれくらい　落ちるの？'],
    [fa, '～回想～　一次面接（CZ）に　挑む！'],
    [S(31), `不採用　×${failN}`],
    [bossA, '圧迫面接官が　あらわれた！'],
    [walkA, 'やっと　内定（AT当選）！'],
    [M(33, 0.64), '初任給の　宝箱を　開けた！'],
    [M(33, 0.74), 'AT　100枚ちょっと　を　手に入れた……'],
    [S(34), 'それは　当たり……？'],
    [S(35), 'さんかしょう　を　もらった。'],
  ];
  return (
    <>
      <Stars />
      <Ground />
      <Building x={X[0]} label="書類選考" sub="CZ当選" color="#5872c9" done={cleared(0)} />
      <Building x={X[1]} label="一次面接" sub="CZ突破" color="#7b58c9" done={cleared(1)} lit={inFail} />
      <Building x={X[2]} label="内定" sub="AT当選" color="#c95872" done={cleared(2)} lit={cleared(2)} />
      {/* 初任給：宝箱 */}
      <div style={{position: 'absolute', left: X[3] - 100, top: GROUND - 300, width: 200, textAlign: 'center', fontFamily: DOT, color: '#fff', fontSize: 38, textShadow: '4px 4px 0 #1a1a2e'}}>
        初任給
        <div style={{fontSize: 28, color: '#ffd23f'}}>？？？</div>
      </div>
      <Sprite map={chestOpen ? CHEST_O : CHEST_C} px={12} x={X[3]} y={GROUND} />
      {coinsUp
        ? [0, 1].map((i) => (
            <Sprite key={i} map={COIN} px={6} x={X[3] - 14 + i * 28} y={GROUND - 96 - Math.min(40, (f - M(33, 0.7)) * 3) - i * 6} />
          ))
        : null}
      {coinsUp ? (
        <div
          style={{
            position: 'absolute',
            left: X[3] - 140,
            top: GROUND - 230,
            width: 280,
            textAlign: 'center',
            fontFamily: DOT,
            fontSize: 34,
            color: '#ffd23f',
            textShadow: '4px 4px 0 #000',
          }}
        >
          +100枚ちょっと
        </div>
      ) : null}
      {/* 跳ね返されたときの「不採用」 */}
      {inFail && ((f - fa) % bounceLen) / bounceLen >= 0.45 ? (
        <div style={{position: 'absolute', left: X[1] - 260, top: GROUND - 300, fontFamily: DOT, fontSize: 52, color: '#ff4a4a', textShadow: '5px 5px 0 #000'}}>不採用！</div>
      ) : null}
      {/* 圧迫面接官 */}
      {f >= bossA && f < bossB ? (
        <Sprite
          map={BOSS(true)}
          px={18}
          x={X[1] + (Math.floor(f / 2) % 2 ? 6 : -6)}
          y={GROUND - 10}
          style={{filter: Math.floor(f / 4) % 2 ? 'brightness(1.3)' : undefined, zIndex: 5}}
        />
      ) : null}
      <Sprite map={baku(face, step)} px={9} x={bx} y={GROUND - jumpY} style={{zIndex: 6}} />
      <Hud left="バク　LV1" right={failN ? `不採用 ×${failN}` : 'スロット就活'} />
      <BigText at={S(27) - 2} until={t28(0.04)} text="スロット就活" color="#ffd23f" size={130} y={190} blink />
      <BigText at={S(35)} text="参加賞" color="#ff9fb0" size={150} y={170} />
      <MsgBox msgs={msgs} />
    </>
  );
};

// ───────── シーン2：入社してからも試験
const OfficeScene: React.FC = () => {
  const f = useCurrentFrame();
  const lv = f >= S(47) + 6;
  const fired = S(49);
  const fly = f >= fired + 10 ? Math.min(1, (f - fired - 10) / 14) : 0;
  const over = fired + 26;
  const bx = 760 - fly * 900;
  const by = GROUND - Math.round(Math.sin(fly * Math.PI) * 260 / 6) * 6;
  const msgs: [number, string][] = [
    [S(45), '入社してからも　試験が　ある……？'],
    [S(46), '身分：試用期間（AT）'],
    [S(47) + 6, 'レベルアップ！　正社員（上位AT）に　なった！'],
    [S(48), '上乗せ　できなかったら……？'],
    [fired, '社長「上乗せ　ゼロ？　クビ！」'],
    [S(50), 'CONTINUE？　　▶はい　　いいえ'],
  ];
  return (
    <>
      {/* 社内（床と壁） */}
      <div style={{position: 'absolute', inset: 0, background: '#2c3550'}} />
      {Array.from({length: 8}).map((_, i) => (
        <div key={i} style={{position: 'absolute', left: 80 + i * 180, top: 110, width: 120, height: 150, background: '#9fd4ff', border: '6px solid #1a1a2e'}} />
      ))}
      <div style={{position: 'absolute', left: 0, top: GROUND, width: W, height: H - GROUND, background: '#7a5434'}} />
      {Array.from({length: 25}).map((_, i) => (
        <div key={i} style={{position: 'absolute', left: i * 60, top: GROUND, width: 6, height: H - GROUND, background: '#5e3f25'}} />
      ))}
      {/* 名札 */}
      {f >= S(46) && f < fired ? (
        <div
          style={{
            position: 'absolute',
            left: 560,
            top: 300,
            width: 400,
            textAlign: 'center',
            fontFamily: DOT,
            fontSize: 44,
            color: lv ? '#1a1a2e' : '#fff',
            background: lv ? '#ffd23f' : '#5872c9',
            border: '6px solid #1a1a2e',
            padding: '6px 0',
          }}
        >
          {lv ? '正社員（上位AT）' : '試用期間（AT）'}
        </div>
      ) : null}
      {lv && f < S(48)
        ? Array.from({length: 10}).map((_, i) => {
            const t = f - S(47) - 6;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 760 + Math.cos(i * 0.63) * (90 + t * 6) - 9,
                  top: GROUND - 120 + Math.sin(i * 0.63) * (90 + t * 6) - 9,
                  width: 18,
                  height: 18,
                  background: i % 2 ? '#ffd23f' : '#fff',
                  opacity: t < 26 ? 1 : 0,
                }}
              />
            );
          })
        : null}
      {/* 社長 */}
      {f >= fired - 4 ? <Sprite map={BOSS(true)} px={14} x={1180} y={GROUND} style={{filter: Math.floor(f / 4) % 2 ? 'brightness(1.3)' : undefined}} /> : null}
      {f >= fired && f < over + 6 ? (
        <div style={{position: 'absolute', left: 1000, top: GROUND - 330, fontFamily: DOT, fontSize: 70, color: '#ff4a4a', textShadow: '6px 6px 0 #000'}}>クビ！</div>
      ) : null}
      <Sprite map={baku(fly > 0 ? 'sad' : lv ? 'happy' : 'normal', 0)} px={10} x={bx} y={by} style={{rotate: `${fly * -540}deg`}} />
      <Hud left={`バク　LV${lv ? 2 : 1}`} right={lv ? '正社員' : f >= S(46) ? '試用期間' : ''} />
      <BigText at={S(47) + 6} until={S(48)} text="LEVEL UP!" color="#ffd23f" size={120} y={150} blink />
      {f >= over ? <div style={{position: 'absolute', inset: 0, background: `rgba(120,0,0,${Math.min(0.55, (f - over) / 20)})`, zIndex: 8}} /> : null}
      <BigText at={over} text="GAME OVER" color="#ff4a4a" size={150} y={170} />
      <MsgBox msgs={msgs} />
    </>
  );
};

// ───────── 外枠（ゲーム画面）
export const PixelJob: React.FC<{mode: 'job' | 'job2'; from: number; to: number}> = ({mode, from, to}) => {
  const f = useCurrentFrame();
  // ブラウン管が点くように：横線→全開
  const on = interpolate(f, [from, from + 8], [0, 1], clamp);
  const off = interpolate(f, [to - 8, to], [1, 0], clamp);
  const sy = Math.min(on, off);
  return (
    <div
      style={{
        position: 'absolute',
        left: 210,
        top: 46,
        width: W,
        height: H,
        background: '#0b0d1f',
        border: '10px solid #1a1a2e',
        outline: '8px solid #d9dde6',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 24px 54px rgba(10,20,60,0.5)',
        scale: `1 ${Math.max(0.01, sy)}`,
        filter: sy < 1 ? `brightness(${1 + (1 - sy) * 2})` : undefined,
      }}
    >
      {mode === 'job' ? <JobScene /> : <OfficeScene />}
      {/* 走査線 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 3px, transparent 3px, transparent 6px)',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      />
    </div>
  );
};

// 効果音のタイミング（KyukeiEpisode から鳴らす）
export const pixelSounds = (): {at: number; src: string; vol: number}[] => {
  const out: {at: number; src: string; vol: number}[] = [];
  const t28 = (r: number) => M(28, r);
  out.push({at: S(27) - 2, src: 'px_start', vol: 0.35});
  out.push({at: t28(0.22), src: 'px_pass', vol: 0.3});
  out.push({at: t28(0.48), src: 'px_pass', vol: 0.3});
  out.push({at: t28(0.76), src: 'px_fanfare', vol: 0.25});
  const fa = S(30) + 6,
    fb = E(31);
  const bl = (fb - fa) / 10;
  for (let i = 0; i < 10; i++) out.push({at: Math.round(fa + bl * (i + 0.5)), src: 'px_fail', vol: 0.28});
  out.push({at: S(32), src: 'px_boss', vol: 0.35});
  out.push({at: Math.round(M(33, 0.3)), src: 'px_pass', vol: 0.25});
  out.push({at: Math.round(M(33, 0.7)), src: 'px_coin', vol: 0.3});
  out.push({at: S(35), src: 'px_sad', vol: 0.3});
  out.push({at: S(47) + 6, src: 'px_fanfare', vol: 0.28});
  out.push({at: S(49) + 10, src: 'px_jump', vol: 0.3});
  out.push({at: S(49) + 26, src: 'px_gameover', vol: 0.32});
  return out.map((o) => ({...o, at: Math.round(o.at)}));
};
