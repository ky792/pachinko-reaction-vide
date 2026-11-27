import React from 'react';
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Audio} from '@remotion/media';
import data from './data/news03.json';

// ニュース回#03「パチンコメーカーがVTuberを5人も抱える理由とは？」
// 研究所をメインステージに、同じ画面の中でモニターとキャラが動く構成（2026-11-27 制作指示書）

const NAVY = '#0a1838';
const CYAN = '#38d6ff';
const BLUE = '#2a6cff';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const INK = '#0b1f4d';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

type Who = 'nagi' | 'baku';
type Line = {
  id: string;
  parts: {text: string; at: number}[];
  who: Who;
  text: string;
  face: string;
  look: string | null;
  flat: boolean;
  duck: boolean;
  start: number;
  end: number;
  env: number[];
};
type Panel = {key: string; from: number; to: number; step0: number};
type Step = {key: string; panel: number; v: number; at: number; quiet: boolean};
type Silent = {at: number; len: number; nagi?: string; baku?: string; look?: string; duck?: string; slow?: string};

const LINES = data.lines as Line[];
const PANELS = data.panels as Panel[];
const STEPS = data.steps as Step[];
const SILENTS = data.silents as Silent[];
const CHAPTERS = data.chapters as {at: number; mark: string; title: string}[];
const TOTAL = data.total as number;
const TITLE_AT = data.title_at as number;
const BGM_ED = data.bgm_ed as number;
const FRONT_AT = data.front_at as number;
const BOW = data.bow as {at: number; len: number};
const TITLE_LEN = 100;

export const calculateNews03Metadata: CalculateMetadataFunction<Record<string, unknown>> = () => ({
  durationInFrames: TOTAL,
});

const lineAt = (f: number): Line | null => {
  let cur: Line | null = null;
  for (const l of LINES) {
    if (l.start <= f) cur = l;
    else break;
  }
  return cur;
};
const silentAt = (f: number): Silent | null => SILENTS.find((s) => f >= s.at && f < s.at + s.len) ?? null;
const panelAt = (f: number): {p: Panel; i: number} | null => {
  for (let i = PANELS.length - 1; i >= 0; i--) {
    const p = PANELS[i];
    if (f >= p.from && f < p.to) return {p, i};
  }
  return null;
};
const stepOf = (i: number, f: number) => {
  let v = PANELS[i].step0;
  for (const s of STEPS) if (s.panel === i && s.at <= f) v = Math.max(v, s.v);
  return v;
};
const stepAt = (i: number, v: number) => {
  if (v <= PANELS[i].step0) return PANELS[i].from;
  const s = STEPS.find((x) => x.panel === i && x.v === v);
  return s ? s.at : PANELS[i].from;
};
const faceOf = (who: Who, f: number) => {
  let face = 'normal';
  for (const l of LINES) {
    if (l.start > f) break;
    if (l.who === who) face = l.face;
  }
  const s = silentAt(f);
  if (s && s[who]) face = s[who] as string;
  return face;
};
// 視線：monitor / nagi / baku / self / tablet。話している行と、無言の間で決まる
const lookOf = (who: Who, f: number): string | null => {
  const s = silentAt(f);
  if (s && (s[who] || (s.look === 'baku' && who === 'nagi'))) return s.look ?? null;
  const l = lineAt(f);
  if (l && l.who === who && f < l.end + 20) return l.look;
  // 「キャラ被っとるやん」の後の無言は、次のナギのセリフの頭までモニターを見続ける
  return null;
};

// ───────────────────────── 研究所（背景）
const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 240) * 6;
  return (
    <AbsoluteFill>
      <Img
        src={staticFile('news03/lab_room.jpg')}
        style={{width: 1920, height: 1080, objectFit: 'cover', translate: `${drift}px 0px`, scale: '1.012'}}
      />
      {/* 天井ライトのごく弱いゆらぎ */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(120,190,255,0.10), rgba(0,0,0,0) 55%)',
          opacity: 0.7 + Math.sin(frame / 37) * 0.08,
        }}
      />
    </AbsoluteFill>
  );
};

// ───────────────────────── キャラ
const HOME = {nagi: {x: 270, h: 520}, baku: {x: 1650, h: 520}} as const;

const Chara: React.FC<{who: Who}> = ({who}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = lineAt(frame);
  const speaking = !!line && line.who === who && frame < line.end + 2;
  const face = faceOf(who, frame);
  const env = speaking ? line!.env[frame - line!.start] ?? 0 : 0;
  const local = line ? frame - line.start : 999;
  const flat = speaking && line!.flat;
  const hop = speaking && !flat ? spring({frame: local, fps, config: {damping: 10, stiffness: 220}}) : 1;
  const strong = speaking && ['excited', 'surprised', 'angry'].includes(face);
  const enter = spring({frame: frame - (who === 'nagi' ? 0 : 5), fps, config: {damping: 16}});
  const dir = who === 'nagi' ? -1 : 1;

  // 呼吸・体の小さな揺れ（耳・しっぽの代わりに、体全体をごくわずかに傾ける）
  const seed = who === 'nagi' ? 0 : 2.3;
  const breathe = Math.sin(frame / 22 + seed) * 3.5;
  const sway = Math.sin(frame / 53 + seed) * 1.3 + Math.sin(frame / 17 + seed * 2) * 0.35;
  // 聞き手のうなずき（相手が話している間、ときどき小さく）
  let nod = 0;
  if (line && line.who !== who && frame < line.end && !line.flat) {
    const len = line.end - line.start;
    if (len > 70) {
      const k = Math.floor((frame - line.start) / 52);
      const ph = (frame - line.start) % 52;
      if (random(`nod-${who}-${line.id}-${k}`) > 0.45 && ph < 14) nod = Math.sin((ph / 14) * Math.PI) * 7;
    }
  }

  // 視線（向き）：相手・モニター・自分を指す
  const look = lookOf(who, frame);
  let lean = 0;
  let tilt = 0;
  if (look === 'monitor' || look === 'tablet') {
    lean = who === 'nagi' ? 26 : -34;
    tilt = who === 'nagi' ? 3 : -5;
  } else if (look === 'nagi' && who === 'baku') {
    lean = -40;
    tilt = -6;
  } else if (look === 'baku' && who === 'nagi') {
    lean = 22;
    tilt = 4;
  } else if (look === 'self' && who === 'baku') {
    lean = -26;
    tilt = Math.sin(local / 5) * 3;
  }
  const s = silentAt(frame);
  const slow = s && s.slow === '1';
  const lookP = slow ? interpolate(frame - s!.at, [0, 26], [0, 1], {...clamp, easing: Easing.inOut(Easing.quad)}) : 1;

  // エンディング：バクがカメラの正面へ → お辞儀
  let x: number = HOME[who].x;
  let scaleK = 1;
  let bowRot = 0;
  let bowDrop = 0;
  if (who === 'baku' && FRONT_AT !== null && frame >= FRONT_AT - 50) {
    const p = interpolate(frame, [FRONT_AT - 50, FRONT_AT - 8], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
    x = interpolate(p, [0, 1], [HOME.baku.x, 960]);
    scaleK = interpolate(p, [0, 1], [1, 1.16]);
    if (BOW && frame >= BOW.at) {
      const b = interpolate(frame, [BOW.at, BOW.at + 16, BOW.at + 70, BOW.at + 90], [0, 1, 1, 0.85], {...clamp, easing: Easing.inOut(Easing.quad)});
      bowRot = b * 38;
      bowDrop = b * 26;
    }
  }
  if (who === 'nagi' && BOW && frame >= FRONT_AT - 50) {
    // ナギは無言でバクを見る（正面へ移動したバクのほうへ）
    lean = 34;
    tilt = 4;
  }

  const h = HOME[who].h * scaleK;
  const hopY = speaking ? (1 - hop) * (strong ? 34 : 16) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 420,
        width: 840,
        bottom: -18,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        translate: `${(1 - enter) * dir * 520 + lean * lookP}px ${-env * 10 + hopY + breathe + nod + bowDrop}px`,
        rotate: `${sway + tilt * lookP}deg`,
        perspective: 900,
        scale: `${(speaking ? 1 : 0.965) * (1 + env * 0.015)}`,
        transformOrigin: '50% 100%',
        filter: speaking
          ? 'drop-shadow(0 18px 26px rgba(5,10,40,0.55))'
          : 'drop-shadow(0 18px 26px rgba(5,10,40,0.4)) brightness(0.86) saturate(0.9)',
      }}
    >
      <Img
        src={staticFile(`kyu/${who}_${face}.png`)}
        style={{height: h, maxWidth: 760, objectFit: 'contain', rotate: `x ${-bowRot}deg`, transformOrigin: '50% 100%'}}
      />
    </div>
  );
};

// ───────────────────────── モニター（背景の大型モニターの上に重ねる）
const MON = {left: 504, top: 198, width: 1052, height: 502};

const Tag: React.FC<{kind: 'fact' | 'view'}> = ({kind}) => (
  <span
    style={{
      fontSize: 22,
      fontWeight: 900,
      letterSpacing: 2,
      padding: '3px 14px',
      borderRadius: 8,
      color: kind === 'fact' ? NAVY : 'white',
      background: kind === 'fact' ? CYAN : ORANGE,
    }}
  >
    {kind === 'fact' ? '事実' : 'ナギバクの考察'}
  </span>
);

const Src: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{position: 'absolute', left: 30, right: 30, bottom: 14, fontSize: 19, color: 'rgba(200,225,255,0.8)', fontWeight: 600}}>
    出典：{children}
  </div>
);

const appear = (frame: number, at: number, d = 10) => interpolate(frame, [at, at + d], [0, 1], {...clamp, easing: OUT});

const Reveal: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties; y?: number}> = ({at, children, style, y = 18}) => {
  const frame = useCurrentFrame();
  const p = appear(frame, at);
  return <div style={{opacity: p, translate: `0px ${(1 - p) * y}px`, ...style}}>{children}</div>;
};

// 各パネル：f＝今のフレーム、st(v)＝段階 v が出たフレーム、v＝今の段階
type PP = {f: number; v: number; st: (v: number) => number; from: number};

const H: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{fontSize: 40, fontWeight: 900, color: 'white', letterSpacing: 2}}>{children}</div>
);

const OpNews: React.FC<PP> = ({v, st}) => (
  <div style={{padding: '46px 60px'}}>
    <div style={{fontSize: 24, color: CYAN, fontWeight: 800, letterSpacing: 6}}>INDUSTRY NEWS</div>
    <div style={{fontSize: 62, fontWeight: 900, color: 'white', marginTop: 18, lineHeight: 1.3}}>
      平和から
      <br />
      新VTuberユニットがデビュー
    </div>
    {v >= 1 && (
      <Reveal at={st(1)} style={{marginTop: 34, display: 'flex', gap: 26, alignItems: 'center'}}>
        <span style={{fontSize: 66, fontWeight: 900, color: CYAN, letterSpacing: 4}}>YOUTOPYA</span>
        <span style={{fontSize: 30, color: 'white', fontWeight: 700}}>ハルルナと合わせて 5人体制</span>
      </Reveal>
    )}
  </div>
);

const Row: React.FC<{k: string; children: React.ReactNode; at: number}> = ({k, children, at}) => (
  <Reveal at={at} style={{display: 'flex', alignItems: 'baseline', gap: 26, borderBottom: '1px solid rgba(120,200,255,0.25)', padding: '7px 0'}}>
    <span style={{width: 170, fontSize: 23, color: CYAN, fontWeight: 800, letterSpacing: 2}}>{k}</span>
    <span style={{fontSize: 33, color: 'white', fontWeight: 900}}>{children}</span>
  </Reveal>
);

const Debut: React.FC<PP> = ({v, st, from}) =>
  v >= 5 ? (
    <div style={{padding: '30px 56px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <H>デビュー配信 アーカイブ</H>
        <Tag kind="fact" />
      </div>
      <Reveal at={from} style={{marginTop: 50, textAlign: 'center'}}>
        <div style={{fontSize: 30, color: CYAN, fontWeight: 800}}>再生回数</div>
        <div style={{fontSize: 140, color: 'white', fontWeight: 900, lineHeight: 1.1}}>7万回 以上</div>
        <div style={{fontSize: 26, color: 'rgba(220,235,255,0.9)', marginTop: 8}}>公開から1週間（2026年11月27日時点）</div>
      </Reveal>
      <Src>キュインちゃんねる@HEIWA（YouTube 公開データ）</Src>
    </div>
  ) : (
  <div style={{padding: '24px 56px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>YOUTOPYA デビュー</H>
      <Tag kind="fact" />
    </div>
    <div style={{marginTop: 6}}>
      <Row k="デビュー" at={from}>
        2026.11.20 <span style={{fontSize: 30}}>20:20〜 お披露目配信</span>
      </Row>
      {v >= 1 && (
        <Row k="ユニット" at={st(1)}>
          YOUTOPYA <span style={{fontSize: 28}}>（ユートピア）・3人組</span>
        </Row>
      )}
      {v >= 2 && (
        <Row k="配信内容" at={st(2)}>
          <span style={{fontSize: 32}}>自己紹介／部屋の紹介／乙女アタック企画</span>
        </Row>
      )}
      {v >= 3 && (
        <Row k="配信" at={st(3)}>
          <span style={{fontSize: 32}}>キュインちゃんねる@HEIWA・約1時間半</span>
        </Row>
      )}
      {v >= 4 && (
        <Row k="司会" at={st(4)}>
          <span style={{fontSize: 32}}>先輩 ハルルナ（霧島ハル・霧島ルナ）</span>
        </Row>
      )}
    </div>
    <Src>平和公式X・キュインちゃんねる@HEIWA・娯楽産業・P-BOMB</Src>
  </div>
  );

const Mark: React.FC<{ok: boolean; at: number}> = ({ok, at}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sc = spring({frame: frame - at, fps, config: {damping: 11, stiffness: 200}});
  return (
    <span style={{display: 'inline-block', scale: `${sc}`, fontSize: 78, fontWeight: 900, color: ok ? CYAN : '#ff6b74', width: 92, textAlign: 'center'}}>
      {ok ? '○' : '×'}
    </span>
  );
};

const Otome: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '30px 56px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>乙女アタック 結果</H>
      <Tag kind="fact" />
    </div>
    <div style={{fontSize: 24, color: 'rgba(220,235,255,0.85)', marginTop: 6}}>スマスロ 戦国乙女5 を使った企画</div>
    <div style={{display: 'flex', gap: 40, marginTop: 30}}>
      <div style={{flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 26px', border: '2px solid rgba(255,120,130,0.5)'}}>
        <div style={{fontSize: 32, color: 'white', fontWeight: 900}}>ハルルナ（先輩）</div>
        <div style={{marginTop: 14}}>
          {v >= 1 ? (
            <>
              <Mark ok={false} at={st(1)} />
              <Mark ok={false} at={st(1) + 6} />
            </>
          ) : (
            <span style={{fontSize: 30, color: 'rgba(255,255,255,0.4)'}}>お手本……</span>
          )}
        </div>
        {v >= 1 && <Reveal at={st(1) + 10} style={{fontSize: 30, color: '#ff9aa2', fontWeight: 900}}>連続で失敗</Reveal>}
      </div>
      <div style={{flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: '20px 26px', border: `2px solid ${CYAN}`}}>
        <div style={{fontSize: 32, color: 'white', fontWeight: 900}}>新人3人</div>
        <div style={{marginTop: 14}}>
          {v >= 1 ? (
            <>
              <Mark ok at={st(1) + 18} />
              <Mark ok at={st(1) + 24} />
              <Mark ok at={st(1) + 30} />
            </>
          ) : (
            <span style={{fontSize: 30, color: 'rgba(255,255,255,0.4)'}}>挑戦</span>
          )}
        </div>
        {v >= 1 && <Reveal at={st(1) + 34} style={{fontSize: 30, color: CYAN, fontWeight: 900}}>全員成功</Reveal>}
      </div>
    </div>
    <Src>キュインちゃんねる@HEIWA デビュー配信アーカイブ（{from >= 0 ? '2026.11.20' : ''}）</Src>
  </div>
);

const MEMBERS = [
  {name: '旭アカリ', age: '22歳', color: '#ff7eb6', colorName: 'ピンク', trait: '真面目な まとめ役', note: '実は心配性'},
  {name: 'ピピ・モンブラン', age: '21歳', color: '#ffd23f', colorName: '黄色', trait: 'マイペース＆根性', note: '関西弁で話す'},
  {name: '富士ユキナ', age: '23歳', color: '#f4f7ff', colorName: '白', trait: '明るく元気なお姉さん', note: '特技はMC・司会'},
];

const Members: React.FC<PP> = ({f, v, st}) => (
  <div style={{padding: '20px 34px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>MEMBER PROFILE</H>
      <Tag kind="fact" />
    </div>
    <div style={{display: 'flex', gap: 18, marginTop: 12}}>
      {MEMBERS.map((m, i) => {
        const at = st(i + 1);
        const shown = v >= i + 1;
        const p = shown ? appear(f, at, 12) : 0;
        return (
          <div
            key={m.name}
            style={{
              flex: 1,
              height: 270,
              borderRadius: 20,
              background: `linear-gradient(170deg, ${m.color}33, rgba(10,24,56,0.85) 60%)`,
              border: `3px solid ${shown ? m.color : 'rgba(255,255,255,0.12)'}`,
              padding: '20px 22px',
              opacity: 0.25 + p * 0.75,
              translate: `0px ${(1 - p) * 22}px`,
            }}
          >
            {/* 公式ビジュアルは利用条件を確認できないため使わず、テーマカラーの札で代替 */}
            <div style={{height: 10, width: 120, borderRadius: 5, background: m.color}} />
            <div style={{fontSize: 34, fontWeight: 900, color: 'white', marginTop: 12, lineHeight: 1.15, whiteSpace: 'nowrap'}}>{shown ? m.name : '？？？'}</div>
            {shown && (
              <>
                <div style={{fontSize: 30, color: m.color, fontWeight: 900, marginTop: 10}}>
                  {m.age}・{m.colorName}
                </div>
                <div style={{fontSize: 26, color: 'white', fontWeight: 800, marginTop: 12}}>{m.trait}</div>
                <div style={{fontSize: 24, color: 'rgba(220,235,255,0.85)', marginTop: 8}}>{m.note}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
    {v >= 4 ? (
      <Reveal at={st(4)} style={{marginTop: 10, fontSize: 24, color: 'white', fontWeight: 800}}>
        キャラクターデザイン：MAIRO（ハルルナと同じ）
      </Reveal>
    ) : (
      <div style={{marginTop: 10, fontSize: 19, color: 'rgba(200,225,255,0.7)'}}>※公式ビジュアルはキュインPORTAL・公式Xでご覧ください</div>
    )}
    <Src>娯楽産業（公式プロフィール）・キュインPORTAL</Src>
  </div>
);

const Col: React.FC<{title: string; color: string; items: string[]; at: number; sub: string}> = ({title, color, items, at, sub}) => (
  <Reveal at={at} style={{flex: 1, borderRadius: 20, border: `3px solid ${color}`, background: 'rgba(255,255,255,0.05)', padding: '16px 26px'}}>
    <div style={{fontSize: 40, fontWeight: 900, color}}>{title}</div>
    <div style={{fontSize: 22, color: 'rgba(220,235,255,0.85)', marginTop: 2}}>{sub}</div>
    {items.map((t, i) => (
      <div key={t} style={{fontSize: 30, color: 'white', fontWeight: 800, marginTop: i === 0 ? 12 : 6}}>
        ・{t}
      </div>
    ))}
  </Reveal>
);

const Compare: React.FC<PP> = ({v, st}) => (
  <div style={{padding: '22px 46px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>活動の方向性</H>
      <Tag kind="fact" />
    </div>
    <div style={{display: 'flex', gap: 26, marginTop: 12}}>
      {v >= 1 ? (
        <Col title="ハルルナ" sub="2021年〜・双子" color={CYAN} items={['遊技機の紹介', '実機配信', '機種解説']} at={st(1)} />
      ) : (
        <div style={{flex: 1}} />
      )}
      {v >= 2 ? (
        <Col title="YOUTOPYA" sub="2026年11月〜・3人" color="#ffd23f" items={['キャラクターの日常', 'ストーリー性', 'キャラ中心のコンテンツ']} at={st(2)} />
      ) : (
        <div style={{flex: 1}} />
      )}
    </div>
    {v >= 3 && (
      <Reveal at={st(3)} style={{marginTop: 12, textAlign: 'center', fontSize: 25, color: 'white', fontWeight: 800}}>
        ※完全に分かれているわけではない（同じチャンネル・5人で活動）
      </Reveal>
    )}
    <Src>P-BOMB・ぱちんこドキュメント（平和発表）</Src>
  </div>
);

const POP = [
  {y: '2022', v: 770},
  {y: '2023', v: 660},
  {y: '2024', v: 690},
  {y: '2025', v: 720},
];
const Population: React.FC<PP> = ({f, v, st, from}) => {
  const maxH = 180;
  return (
    <div style={{padding: '20px 40px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <H>パチンコ参加人口</H>
        <Tag kind="fact" />
      </div>
      <div style={{display: 'flex', gap: 30, marginTop: 4}}>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: 26, height: 300, paddingLeft: 4}}>
          {POP.map((d, i) => {
            const p = interpolate(f, [from + i * 6, from + i * 6 + 18], [0, 1], {...clamp, easing: OUT});
            const hi = d.y === '2025' && v >= 1;
            return (
              <div key={d.y} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100}}>
                <div style={{fontSize: hi ? 38 : 28, fontWeight: 900, whiteSpace: 'nowrap', color: hi ? CYAN : 'white', opacity: p}}>{d.v}万</div>
                <div
                  style={{
                    width: 84,
                    height: (d.v / 770) * maxH * p,
                    borderRadius: '10px 10px 0 0',
                    background: hi ? CYAN : 'rgba(140,190,255,0.55)',
                    boxShadow: hi ? `0 0 24px ${CYAN}66` : 'none',
                  }}
                />
                <div style={{fontSize: 26, color: 'rgba(220,235,255,0.9)', fontWeight: 800, marginTop: 6}}>{d.y}</div>
              </div>
            );
          })}
        </div>
        <div style={{flex: 1, paddingTop: 22}}>
          {v >= 1 && (
            <Reveal at={st(1)}>
              <div style={{fontSize: 28, color: CYAN, fontWeight: 900}}>直近は回復</div>
              <div style={{fontSize: 50, color: 'white', fontWeight: 900, whiteSpace: 'nowrap'}}>前年比 +30万人</div>
              <div style={{fontSize: 22, color: 'rgba(220,235,255,0.85)'}}>2023年は過去最低の660万人</div>
            </Reveal>
          )}
          {v >= 2 && (
            <Reveal at={st(2)} style={{marginTop: 16, borderTop: '1px solid rgba(120,200,255,0.3)', paddingTop: 12}}>
              <div style={{fontSize: 28, color: ORANGE, fontWeight: 900}}>長期では大きく縮小</div>
              <div style={{fontSize: 31, color: 'white', fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap'}}>
                ホール数 18,244店 → 6,464店
              </div>
              <div style={{fontSize: 22, color: 'rgba(220,235,255,0.85)'}}>1995年（ピーク）→ 2025年末</div>
            </Reveal>
          )}
        </div>
      </div>
      <Src>日本生産性本部『レジャー白書』2023〜2026（推計値）・警察庁（ホール数）</Src>
    </div>
  );
};

// 娯楽の選択肢（自作の簡単なアイコン）
const Icon: React.FC<{kind: 'game' | 'video' | 'sns' | 'pachi'; color: string}> = ({kind, color}) => (
  <svg width={130} height={130} viewBox="0 0 100 100">
    <circle cx={50} cy={50} r={46} fill="rgba(255,255,255,0.06)" stroke={color} strokeWidth={4} />
    {kind === 'game' && (
      <>
        <rect x={32} y={18} width={36} height={64} rx={7} fill="none" stroke={color} strokeWidth={5} />
        <circle cx={50} cy={72} r={3.5} fill={color} />
      </>
    )}
    {kind === 'video' && (
      <>
        <rect x={18} y={28} width={64} height={44} rx={8} fill="none" stroke={color} strokeWidth={5} />
        <polygon points="44,40 44,60 61,50" fill={color} />
      </>
    )}
    {kind === 'sns' && (
      <>
        <path d="M22 30 h56 v32 h-30 l-12 10 v-10 h-14 z" fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" />
        <circle cx={38} cy={46} r={3.5} fill={color} />
        <circle cx={50} cy={46} r={3.5} fill={color} />
        <circle cx={62} cy={46} r={3.5} fill={color} />
      </>
    )}
    {kind === 'pachi' && (
      <>
        <circle cx={50} cy={50} r={20} fill="none" stroke={color} strokeWidth={5} />
        <circle cx={44} cy={44} r={5} fill={color} />
      </>
    )}
  </svg>
);

const Leisure: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '30px 46px'}}>
    <H>娯楽の選択肢が増えた</H>
    <div style={{display: 'flex', justifyContent: 'center', gap: 46, marginTop: 34}}>
      {[
        {k: 'game' as const, t: 'スマホゲーム', c: '#9ad8ff'},
        {k: 'video' as const, t: '動画配信', c: '#9ad8ff'},
        {k: 'sns' as const, t: 'SNS', c: '#9ad8ff'},
        {k: 'pachi' as const, t: 'パチンコ', c: ORANGE},
      ].map((it, i) => (
        <Reveal key={it.t} at={from + i * 8} style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <Icon kind={it.k} color={it.c} />
          <div style={{fontSize: 30, color: 'white', fontWeight: 900, marginTop: 8}}>{it.t}</div>
        </Reveal>
      ))}
    </div>
    {v >= 1 && (
      <Reveal at={st(1)} style={{marginTop: 34, textAlign: 'center'}}>
        <span style={{fontSize: 40, color: 'white', fontWeight: 900}}>
          競争相手は <span style={{color: CYAN}}>他メーカー</span> だけじゃない
        </span>
      </Reveal>
    )}
    <div style={{position: 'absolute', right: 30, top: 34}}>
      <Tag kind="view" />
    </div>
  </div>
);

const Reach: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '32px 50px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>認知度 と 遊技人口</H>
      <Tag kind="view" />
    </div>
    <Reveal at={from} style={{marginTop: 26, display: 'flex', alignItems: 'center', gap: 30, justifyContent: 'center'}}>
      <span style={{fontSize: 46, color: 'white', fontWeight: 900}}>認知度アップ</span>
      <span style={{fontSize: 46, color: CYAN, fontWeight: 900}}>≠</span>
      <span style={{fontSize: 46, color: 'white', fontWeight: 900}}>遊技人口アップ</span>
    </Reveal>
    {v >= 1 && (
      // お金・依存の話：落ち着いた表示のみ（効果音なし）
      <Reveal at={st(1)} style={{marginTop: 30, display: 'flex', gap: 22, justifyContent: 'center'}}>
        {['金銭的な負担', '遊技への抵抗感', '依存のリスク'].map((t) => (
          <div key={t} style={{fontSize: 32, color: 'white', fontWeight: 800, padding: '14px 26px', borderRadius: 14, border: '2px solid rgba(255,255,255,0.35)'}}>
            {t}
          </div>
        ))}
      </Reveal>
    )}
    {v >= 1 && (
      <Reveal at={st(1) + 20} style={{marginTop: 14, textAlign: 'center', fontSize: 26, color: 'rgba(220,235,255,0.9)'}}>
        キャラクターコンテンツだけで解決できる問題ではない
      </Reveal>
    )}
    {v >= 2 && (
      <Reveal at={st(2)} style={{marginTop: 26, textAlign: 'center', fontSize: 38, color: CYAN, fontWeight: 900}}>
        遊技機の販売以外にも、ファンとの接点を持つ
      </Reveal>
    )}
  </div>
);

const TL = [
  {y: '2008', t: 'CR戦国乙女', s: 'パチンコで誕生', v: 1},
  {y: '2009', t: '漫画連載', s: '電撃大王', v: 3},
  {y: '2011', t: 'TVアニメ', s: 'テレビ東京系', v: 3},
  {y: '以降', t: 'ゲーム・グッズ・イベント', s: '遊技機の外へ', v: 3},
  {y: '現在', t: '新台も継続', s: '誕生から18年', v: 4},
];
const Timeline: React.FC<PP> = ({f, v, st, from}) => (
  <div style={{padding: '28px 46px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>戦国乙女 の歩み</H>
      <Tag kind="fact" />
    </div>
    <div style={{position: 'relative', marginTop: 50, height: 300}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 40, height: 4, background: 'rgba(120,200,255,0.3)'}} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 40,
          height: 4,
          background: CYAN,
          width: `${interpolate(f, [from, from + 30], [0, 100], clamp) * (v >= 4 ? 1 : v >= 3 ? 0.78 : v >= 1 ? 0.18 : 0.04)}%`,
        }}
      />
      <div style={{display: 'flex', justifyContent: 'space-between'}}>
        {TL.map((e, i) => {
          const shown = v >= e.v;
          const at = st(e.v) + (e.v === 3 ? (i - 1) * 8 : 0);
          const p = shown ? appear(f, at, 12) : 0;
          const now = shown && (i === TL.length - 1 ? v >= 4 : v === e.v);
          return (
            <div key={e.y} style={{width: 180, textAlign: 'center', opacity: 0.25 + p * 0.75}}>
              <div style={{fontSize: 26, color: now ? CYAN : 'rgba(220,235,255,0.85)', fontWeight: 900}}>{e.y}</div>
              <div style={{width: 22, height: 22, borderRadius: 11, margin: '6px auto 0', background: shown ? CYAN : 'rgba(120,200,255,0.3)'}} />
              {shown && (
                <div style={{translate: `0px ${(1 - p) * 14}px`}}>
                  <div style={{fontSize: 29, color: 'white', fontWeight: 900, marginTop: 16, lineHeight: 1.2}}>{e.t}</div>
                  <div style={{fontSize: 21, color: 'rgba(220,235,255,0.85)', marginTop: 6}}>{e.s}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    <Src>ja.wikipedia「CR戦国乙女」・アニメハック・キュインPORTAL</Src>
  </div>
);

const Ip: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '26px 46px'}}>
    <Reveal at={from} style={{display: 'flex', alignItems: 'baseline', gap: 24}}>
      <span style={{fontSize: 74, color: CYAN, fontWeight: 900}}>IP</span>
      <span style={{fontSize: 46, color: 'white', fontWeight: 900}}>＝ 知的財産</span>
      <span style={{fontSize: 24, color: 'rgba(220,235,255,0.85)'}}>キャラクター・物語・作品のブランド</span>
    </Reveal>
    <div style={{display: 'flex', gap: 26, marginTop: 18}}>
      {v >= 1 && (
        <Reveal at={st(1)} style={{flex: 1, borderRadius: 18, border: '2px solid rgba(255,255,255,0.35)', padding: '16px 24px'}}>
          <div style={{fontSize: 32, color: 'white', fontWeight: 900}}>他社IPを使う</div>
          {['権利者との契約', '使用許諾が必要', '人気作品の知名度を活用'].map((t) => (
            <div key={t} style={{fontSize: 27, color: 'rgba(235,242,255,0.95)', fontWeight: 700, marginTop: 8}}>
              ・{t}
            </div>
          ))}
        </Reveal>
      )}
      {v >= 2 && (
        <Reveal at={st(2)} style={{flex: 1, borderRadius: 18, border: `3px solid ${CYAN}`, padding: '16px 24px'}}>
          <div style={{fontSize: 32, color: CYAN, fontWeight: 900}}>自社IPを展開する</div>
          {['自社主導で企画しやすい', '継続的なキャラ展開', 'グッズ・映像作品へ', '長期的なブランド形成'].map((t, i) => (
            <div key={t} style={{fontSize: 27, color: 'white', fontWeight: 700, marginTop: 8, opacity: i === 3 && v < 3 ? 0.3 : 1}}>
              ・{t}
            </div>
          ))}
        </Reveal>
      )}
    </div>
    <div style={{position: 'absolute', left: 46, bottom: 16, fontSize: 20, color: 'rgba(200,225,255,0.8)'}}>
      ※実際の権利関係・契約内容は作品によって異なります（一般的な比較）
    </div>
  </div>
);

const Portal: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '30px 50px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <Reveal at={from}>
        <div style={{fontSize: 24, color: CYAN, fontWeight: 800, letterSpacing: 4}}>2026.06.09 OPEN</div>
        <div style={{fontSize: 58, color: 'white', fontWeight: 900}}>キュインPORTAL</div>
      </Reveal>
      <Tag kind="fact" />
    </div>
    {v >= 1 && (
      <Reveal at={st(1)} style={{display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap'}}>
        {['戦国乙女', '機種情報', 'ハルルナ', '音楽', 'グッズ'].map((t) => (
          <div key={t} style={{fontSize: 32, color: 'white', fontWeight: 800, padding: '10px 24px', borderRadius: 12, background: 'rgba(56,214,255,0.14)', border: `2px solid ${CYAN}88`}}>
            {t}
          </div>
        ))}
      </Reveal>
    )}
    {v >= 2 && (
      <Reveal at={st(2)} style={{marginTop: 18, borderRadius: 16, border: `3px solid ${ORANGE}`, padding: '10px 22px', background: 'rgba(255,138,31,0.08)'}}>
        <div style={{marginBottom: 8}}>
          <Tag kind="view" />
        </div>
        <div style={{fontSize: 30, color: 'white', fontWeight: 900}}>遊技機単体ではなく、コンテンツ全体の価値を高める動き？</div>
      </Reveal>
    )}
    <Src>P-BOMB・ぱちんこドキュメント・9in-portal.com</Src>
  </div>
);

const Needs: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '26px 46px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>VTuberを続けるのに必要なもの</H>
      <Tag kind="view" />
    </div>
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12}}>
      {['キャラクター制作', 'モデル制作', '出演者', '動画制作', '配信設備', '継続的な企画'].map((t, i) => (
        <Reveal key={t} at={from + 10 + i * 7} style={{fontSize: 28, color: 'white', fontWeight: 800, padding: '9px 14px', borderRadius: 12, border: '2px solid rgba(120,200,255,0.45)', textAlign: 'center'}}>
          {t}
        </Reveal>
      ))}
    </div>
    <div style={{marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4}}>
      {v >= 1 && (
        <Reveal at={st(1)} style={{fontSize: 31, color: 'white', fontWeight: 900}}>
          企業の知名度 <span style={{color: CYAN}}>≠</span> キャラクターの人気
        </Reveal>
      )}
      {v >= 2 && (
        <Reveal at={st(2)} style={{fontSize: 27, color: 'rgba(235,242,255,0.95)', fontWeight: 800}}>
          大事なのは「かけたお金」より「動画が面白いか」
        </Reveal>
      )}
      {v >= 3 && (
        <Reveal at={st(3)} style={{fontSize: 27, color: 'rgba(235,242,255,0.95)', fontWeight: 800}}>
          企業公式ならではの責任・難しさ
        </Reveal>
      )}
      {v >= 4 && (
        <Reveal at={st(4)} style={{fontSize: 27, color: CYAN, fontWeight: 800}}>
          公式だからこそ作れる映像・メーカーの知識を生かした企画も
        </Reveal>
      )}
    </div>
  </div>
);

const Naginami: React.FC<PP> = ({from}) => (
  <div style={{padding: '20px 46px'}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <H>メーカー公式VTuberの前例</H>
      <Tag kind="fact" />
    </div>
    <Reveal at={from} style={{marginTop: 10}}>
      <div style={{fontSize: 24, color: CYAN, fontWeight: 800}}>三洋グループのVTuberユニット（2019年7月デビュー）</div>
      <div style={{fontSize: 60, color: 'white', fontWeight: 900, lineHeight: 1.15}}>ナギナミ</div>
      <div style={{fontSize: 26, color: 'rgba(220,235,255,0.9)'}}>海月ナギ・飛鮫ナミ</div>
    </Reveal>
    <Reveal at={from + 16} style={{marginTop: 14, borderRadius: 16, border: `2px solid ${CYAN}`, padding: '10px 22px'}}>
      <div style={{fontSize: 24, color: CYAN, fontWeight: 800}}>登場した遊技機</div>
      <div style={{fontSize: 40, color: 'white', fontWeight: 900}}>PA海物語 極JAPAN Withナギナミ</div>
      <div style={{fontSize: 24, color: 'rgba(220,235,255,0.9)'}}>2025年12月 ホール導入（三洋物産・三洋販売）</div>
    </Reveal>
    <Src>グリーンべると（2020.12・2025.09）・パチ7</Src>
  </div>
);

const Future: React.FC<PP> = ({v, st, from}) => (
  <div style={{padding: '34px 50px'}}>
    <Reveal at={from} style={{display: 'flex', alignItems: 'center', gap: 26}}>
      <span style={{fontSize: 46, color: 'white', fontWeight: 900}}>YOUTOPYA の遊技機化</span>
    </Reveal>
    <Reveal at={from + 8} style={{marginTop: 20, display: 'inline-block', fontSize: 50, fontWeight: 900, color: '#ff9aa2', border: '4px solid #ff9aa2', borderRadius: 14, padding: '6px 26px'}}>
      正式発表なし
    </Reveal>
    <div style={{fontSize: 24, color: 'rgba(220,235,255,0.85)', marginTop: 10}}>（2026年11月27日時点）</div>
    {v >= 1 && (
      <Reveal at={st(1)} style={{marginTop: 34, display: 'flex', alignItems: 'center', gap: 26}}>
        <span style={{fontSize: 36, color: 'white', fontWeight: 900}}>VTuberの人気</span>
        <span style={{fontSize: 40, color: CYAN, fontWeight: 900}}>≠</span>
        <span style={{fontSize: 36, color: 'white', fontWeight: 900}}>遊技機としての需要</span>
      </Reveal>
    )}
    <div style={{position: 'absolute', right: 30, top: 34}}>
      <Tag kind="view" />
    </div>
  </div>
);

const Ending: React.FC<PP> = ({from}) => (
  <div style={{padding: '50px 60px'}}>
    <div style={{fontSize: 24, color: CYAN, fontWeight: 800, letterSpacing: 6}}>SUMMARY</div>
    {['平和の新VTuberユニット YOUTOPYA', 'キャラクター・映像・音楽を広げるメーカー', 'これからの成長に注目'].map((t, i) => (
      <Reveal key={t} at={from + 10 + i * 40} style={{fontSize: 44, color: 'white', fontWeight: 900, marginTop: 24}}>
        {t}
      </Reveal>
    ))}
  </div>
);

const IdleScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: 30, color: 'rgba(160,215,255,0.55)', fontWeight: 800, letterSpacing: 10}}>NAGIBAKU LAB</div>
      <div style={{marginTop: 18, width: 300, height: 4, background: 'rgba(120,200,255,0.2)', overflow: 'hidden'}}>
        <div style={{width: 90, height: 4, background: CYAN, translate: `${((frame * 4) % 390) - 90}px 0px`}} />
      </div>
    </AbsoluteFill>
  );
};

const PANEL_VIEW: Record<string, React.FC<PP>> = {
  op_news: OpNews,
  debut: Debut,
  otome: Otome,
  members: Members,
  compare: Compare,
  population: Population,
  leisure: Leisure,
  reach: Reach,
  timeline: Timeline,
  ip: Ip,
  portal: Portal,
  needs: Needs,
  naginami: Naginami,
  future: Future,
  ending: Ending,
};

const Monitor: React.FC = () => {
  const frame = useCurrentFrame();
  const cur = panelAt(frame);
  const chap = [...CHAPTERS].reverse().find((c) => c.at <= frame);
  let body: React.ReactNode = <IdleScreen />;
  let open = 1;
  let glow = 0;
  if (cur) {
    const {p, i} = cur;
    const View = PANEL_VIEW[p.key];
    const t = frame - p.from;
    open = interpolate(t, [0, 9], [0.03, 1], {...clamp, easing: OUT});
    glow = interpolate(t, [0, 3, 14], [0, 1, 0], clamp);
    const close = interpolate(frame, [p.to - 6, p.to], [1, 0], clamp);
    open = Math.min(open, Math.max(close, 0.03));
    body = <View f={frame} v={stepOf(i, frame)} st={(v) => stepAt(i, v)} from={p.from + 8} />;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: MON.left,
        top: MON.top,
        width: MON.width,
        height: MON.height,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(8,22,58,0.92), rgba(6,16,44,0.95))',
        border: `2px solid ${CYAN}88`,
        boxShadow: `0 0 ${18 + glow * 30}px rgba(56,214,255,${0.25 + glow * 0.35})`,
        fontFamily: JP,
      }}
    >
      {/* ヘッダー（小さな英字ラベル・細い罫線） */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 34, borderBottom: '1px solid rgba(120,200,255,0.25)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 18}}>
        <span style={{fontSize: 16, color: CYAN, fontWeight: 800, letterSpacing: 4}}>NAGIBAKU NEWS / ANALYSIS</span>
        <span style={{flex: 1}} />
        <span style={{fontSize: 16, color: 'rgba(200,225,255,0.7)', fontWeight: 700}}>{chap ? `${chap.mark} ${chap.title}` : ''}</span>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 34, bottom: 0, scale: `1 ${open}`, opacity: Math.min(1, open * 1.4)}}>{body}</div>
      {/* モニターの走査線（ごく弱く・ゆっくり） */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 90,
          top: ((frame * 1.6) % (MON.height + 90)) - 90,
          background: 'linear-gradient(180deg, rgba(56,214,255,0), rgba(56,214,255,0.05), rgba(56,214,255,0))',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

// ───────────────────────── タブレット（冒頭：バクがニュースを見つける）
const TabletGlow: React.FC = () => {
  const frame = useCurrentFrame();
  const first = LINES[0];
  const out = interpolate(frame, [first.end + 30, first.end + 50], [1, 0], clamp);
  if (out <= 0) return null;
  return (
    <div style={{position: 'absolute', left: 1190, top: 690, width: 240, opacity: out * appear(frame, 0, 14), rotate: '-6deg'}}>
      <div style={{background: 'rgba(8,22,58,0.94)', border: `2px solid ${ORANGE}`, borderRadius: 14, padding: '12px 16px', fontFamily: JP}}>
        <div style={{fontSize: 14, color: ORANGE, fontWeight: 900, letterSpacing: 3}}>NEWS</div>
        <div style={{fontSize: 22, color: 'white', fontWeight: 900, lineHeight: 1.3, marginTop: 4}}>平和 新VTuber 3人デビュー</div>
      </div>
    </div>
  );
};

// ───────────────────────── 字幕（既存の吹き出し字幕と同じ仕様）
const Telop: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line || frame > line.end + 12) return null;
  if (TITLE_AT !== null && frame >= TITLE_AT && frame < TITLE_AT + TITLE_LEN) return null;
  const local = frame - line.start;
  const p = interpolate(local, [0, 5], [0, 1], {...clamp, easing: OUT});
  const nagi = line.who === 'nagi';
  const col = nagi ? BLUE : ORANGE;
  const out = interpolate(frame, [line.end + 4, line.end + 12], [1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: 470, right: 470, bottom: 40, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 26,
          border: `6px solid ${col}`,
          padding: '20px 38px 16px',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 44,
          lineHeight: 1.36,
          color: INK,
          textAlign: 'center',
          maxWidth: 980,
          minWidth: 260,
          opacity: p * out,
          translate: `0px ${(1 - p) * 14}px`,
          boxShadow: '0 14px 34px rgba(5,10,40,0.45)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -26,
            [nagi ? 'left' : 'right']: 26,
            background: col,
            color: 'white',
            fontSize: 26,
            padding: '2px 20px',
            borderRadius: 12,
            letterSpacing: 4,
          } as React.CSSProperties}
        >
          {nagi ? 'ナギ' : 'バク'}
        </div>
        {[...line.parts].reverse().find((x) => x.at <= frame)?.text ?? line.text}
      </div>
    </div>
  );
};

// ───────────────────────── 章チップ（左上・控えめ）
const ChapterChip: React.FC = () => {
  const frame = useCurrentFrame();
  const c = [...CHAPTERS].reverse().find((x) => x.at <= frame);
  if (!c) return null;
  const p = appear(frame, c.at, 12);
  return (
    <div style={{position: 'absolute', left: 40, top: 34, fontFamily: JP, opacity: p, translate: `${(1 - p) * -30}px 0px`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(8,22,58,0.86)', borderLeft: `6px solid ${CYAN}`, padding: '8px 22px', borderRadius: 6}}>
        <span style={{fontSize: 30, color: CYAN, fontWeight: 900}}>{c.mark}</span>
        <span style={{fontSize: 30, color: 'white', fontWeight: 900}}>{c.title}</span>
      </div>
    </div>
  );
};

// ───────────────────────── ニュースタイトル演出（約3秒・派手にしすぎない）
const NewsTitle: React.FC = () => {
  const frame = useCurrentFrame();
  if (TITLE_AT === null) return null;
  const t = frame - TITLE_AT;
  if (t < 0 || t >= TITLE_LEN) return null;
  const bar = interpolate(t, [0, 10], [0, 1], {...clamp, easing: OUT});
  const txt = appear(frame, TITLE_AT + 8, 12);
  const out = interpolate(t, [TITLE_LEN - 12, TITLE_LEN], [1, 0], clamp);
  return (
    <AbsoluteFill style={{fontFamily: JP, opacity: out}}>
      <AbsoluteFill style={{background: 'rgba(4,10,30,0.45)'}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 380, height: 260, background: 'rgba(8,22,58,0.94)', scale: `${bar} 1`, borderTop: `3px solid ${CYAN}`, borderBottom: `3px solid ${CYAN}`}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 410, textAlign: 'center', opacity: txt, translate: `0px ${(1 - txt) * 20}px`}}>
        <div style={{fontSize: 30, color: CYAN, fontWeight: 900, letterSpacing: 12}}>NAGIBAKU NEWS</div>
        <div style={{fontSize: 76, color: 'white', fontWeight: 900, marginTop: 18}}>パチンコメーカーがVTuberを</div>
        <div style={{fontSize: 76, color: 'white', fontWeight: 900}}>
          <span style={{color: CYAN}}>5人</span>も抱える理由とは？
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ───────────────────────── 暗転
const FadeOut: React.FC = () => {
  const frame = useCurrentFrame();
  if (!BOW) return null;
  const o = interpolate(frame, [BOW.at + BOW.len - 34, BOW.at + BOW.len - 4], [0, 1], clamp);
  return <AbsoluteFill style={{background: '#000', opacity: o}} />;
};

// ───────────────────────── 音
// BGM：既存のニュース用BGM（news_bed）。会話の邪魔をしない音量。ギャグの間（duck）は一時的に止める
const duckRanges: [number, number][] = [
  ...LINES.filter((l) => l.duck).map((l) => [l.start - 34, l.end + 10] as [number, number]),
  ...SILENTS.filter((s) => s.duck === '1').map((s) => [s.at - 6, s.at + s.len + 4] as [number, number]),
];
const bedVolume = (f: number) => {
  const base = 0.11;
  if (BGM_ED !== null && f >= BGM_ED - 20) return interpolate(f, [BGM_ED - 20, BGM_ED], [base, 0], clamp);
  let v = base;
  for (const [a, b] of duckRanges) {
    if (f >= a - 10 && f <= b + 14) {
      const k = Math.min(interpolate(f, [a - 10, a], [1, 0], clamp), interpolate(f, [b, b + 14], [0, 1], clamp));
      v = Math.min(v, base * k);
    }
  }
  if (TITLE_AT !== null && f >= TITLE_AT && f < TITLE_AT + TITLE_LEN) v = base * 1.4;
  return v;
};
const edVolume = (f: number) => {
  const local = f - (BGM_ED ?? 0);
  const fade = BOW ? interpolate(f, [BOW.at + BOW.len - 40, BOW.at + BOW.len - 4], [1, 0], clamp) : 1;
  return interpolate(local, [0, 20], [0, 0.16], clamp) * fade;
};

export const LabNews03: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Stage />
      <Monitor />
      <Chara who="nagi" />
      <Chara who="baku" />
      <TabletGlow />
      <ChapterChip />
      <Telop />
      <NewsTitle />
      <FadeOut />

      <Audio src={staticFile('news_bed.wav')} loop volume={bedVolume} />
      {BGM_ED !== null && (
        <Sequence from={BGM_ED} durationInFrames={TOTAL - BGM_ED}>
          <Audio src={staticFile('news_open.wav')} volume={(f) => edVolume(f + BGM_ED)} />
        </Sequence>
      )}
      {LINES.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.end - l.start + 6}>
          <Audio src={staticFile(`news03/${l.id}.wav`)} />
        </Sequence>
      ))}
      {/* ホログラムSE（B2・ナギバク標準）：パネルが開く瞬間と、段階が進むとき */}
      {PANELS.map((p, i) => (
        <Sequence key={`pa${i}`} from={Math.max(0, p.from - 2)} durationInFrames={45}>
          <Audio src={staticFile('news03/holo_appear.wav')} volume={0.32} />
        </Sequence>
      ))}
      {STEPS.filter((s) => !s.quiet).map((s, i) => (
        <Sequence key={`st${i}`} from={s.at} durationInFrames={30}>
          <Audio src={staticFile('news03/holo_data.wav')} volume={0.22} />
        </Sequence>
      ))}
      {CHAPTERS.slice(1).map((c) => (
        <Sequence key={`ch${c.at}`} from={c.at} durationInFrames={40}>
          <Audio src={staticFile('kyu/se_pop.wav')} volume={0.28} />
        </Sequence>
      ))}
      {TITLE_AT !== null && (
        <>
          <Sequence from={TITLE_AT - 9} durationInFrames={40}>
            <Audio src={staticFile('news03/holo_charge.wav')} volume={0.3} />
          </Sequence>
          <Sequence from={TITLE_AT + 6} durationInFrames={60}>
            <Audio src={staticFile('news03/holo_appear.wav')} volume={0.42} />
          </Sequence>
        </>
      )}
    </AbsoluteFill>
  );
};
