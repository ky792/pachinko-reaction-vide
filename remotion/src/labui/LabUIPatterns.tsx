// LAB OS パターン見本帳（1パターン3.5秒×16）
// 数字はすべて見本用のサンプル。実在の台の数字ではない
import React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Characters, LabBackground} from './LabStage';
import {Subtitle} from './Subtitle';
import {DataPanel} from './DataPanel';
import {ResultReveal} from './ResultReveal';
import {AlertCut} from './AlertCut';
import {LabTransition} from './LabTransition';
import {BarPanel, DonutPanel, VersusPanel, Slice} from './Charts';
import {ReelReveal, VerdictStamp} from './Reveals';
import {BakuJack, KeywordPop, NagiNote} from './Interrupts';
import {ChapterCard, Shutter} from './Transitions';
import {C, JP, MONO, cham, ramp} from './tokens';

const CLIP = 105;
/** 転換の見本用：帯で隠れた瞬間に中身を消す */
const Until: React.FC<{frame: number; children: React.ReactNode}> = ({frame, children}) => {
  const f = useCurrentFrame();
  return f < frame ? <>{children}</> : null;
};
const DIST: Slice[] = [
  {label: '1500個', pct: 60, key: true},
  {label: '3000個', pct: 25},
  {label: '4500個', pct: 15},
];

type Clip = {cat: string; name: string; se?: [number, string][]; color: string; dim?: boolean; hideBaku?: boolean; nagi?: 'point' | 'body'; el: React.ReactNode};

const CLIPS: Clip[] = [
  {
    cat: '通常解説',
    name: '字幕', se: [[6,'tick']] as [number, string][],
    color: C.cyan,
    nagi: 'point',
    el: <Subtitle who="nagi" from={6} to={98} text={'RUSH中は{1/99.9}を、\n130回のうちに引けるかの勝負。'} />,
  },
  {
    cat: '通常解説',
    name: 'キーワード', se: [[6,'unfold'],[14,'tick']] as [number, string][],
    color: C.cyan,
    nagi: 'point',
    el: (
      <>
        <KeywordPop from={6} to={96} word="引き戻し" read="時短中に当たりを引くこと" />
        <Subtitle who="baku" from={14} to={98} text={'時短で当たったら{引き戻し}、\nこれ覚えといてな。'} />
      </>
    ),
  },
  {
    cat: '数値データ',
    name: '表（分解）', se: [[4,'unfold']] as [number, string][],
    color: C.cyan,
    el: (
      <DataPanel
        from={4}
        title="RUSH継続率の分解"
        rows={[
          {label: 'RUSH本体の継続', value: '73%'},
          {label: '時短での引き戻し', value: '30%'},
          {label: 'トータル継続率', value: '81%'},
        ]}
      />
    ),
  },
  {
    cat: '数値データ',
    name: 'VS比較', se: [[4,'unfold'],[24,'confirm']] as [number, string][],
    color: C.cyan,
    el: <VersusPanel from={4} title="ミドル vs ライトミドル" metric="大当り確率" left={{name: 'ミドル', value: '1/319'}} right={{name: 'ライトミドル', value: '1/199', win: true}} />,
  },
  {cat: '数値データ', name: '横棒グラフ', se: [[4,'unfold'],[24,'scan']] as [number, string][], color: C.cyan, el: <BarPanel from={4} title="RUSH中の出玉振り分け" items={DIST} />},
  {cat: '数値データ', name: '円グラフ', se: [[4,'unfold'],[22,'scan']] as [number, string][], color: C.cyan, el: <DonutPanel from={4} title="RUSH中の出玉振り分け" items={DIST} center={['平均', '約2,300個']} />},
  {
    cat: '解析結果発表',
    name: '大数字', se: [[7,'slam']] as [number, string][],
    color: C.cyan,
    dim: true,
    el: <ResultReveal from={2} to={CLIP} label="トータル継続率" value="81" bar={{on: '続く', off: '落ちる', ratio: 0.81}} />,
  },
  {cat: '解析結果発表', name: 'リール停止', se: [[12,'scan'],[60,'slam']] as [number, string][], color: C.cyan, dim: true, el: <ReelReveal from={2} label="平均出玉" digits="2325" unit="個" note="大当り1回あたり" />},
  {cat: '解析結果発表', name: '判定スタンプ', se: [[8,'slam']] as [number, string][], color: C.cyan, dim: true, el: <VerdictStamp from={2} label="RNC-01の判定" word="激アマ" sub="ボーダー＋3回（千円あたり）" />},
  {
    cat: '警告・ツッコミ',
    name: '軽いツッコミ', se: [[14,'slash']] as [number, string][],
    color: C.orange,
    hideBaku: true,
    el: (
      <>
        <BarPanel from={-40} title="RUSH中の出玉振り分け" items={DIST} />
        <AlertCut from={14} to={CLIP + 4} mode="tsukkomi" text="4500個が15%は渋すぎやろ！" face="angry" />
      </>
    ),
  },
  {
    cat: '警告・ツッコミ',
    name: '警告割り込み', se: [[6,'alarm'],[10,'slash']] as [number, string][],
    color: C.red,
    hideBaku: true,
    dim: true,
    el: (
      <>
        <ResultReveal from={-60} to={CLIP + 10} label="トータル継続率" value="81" bar={{on: '続く', off: '落ちる', ratio: 0.81}} hitAt={10} />
        <AlertCut from={6} to={CLIP + 4} mode="alert" lead="81%あんのに、" text="ウチ毎回、初回で落ちるねん！" face="angry" />
      </>
    ),
  },
  {cat: '警告・ツッコミ', name: '画面ジャック', se: [[6,'slash'],[10,'alarm']] as [number, string][], color: C.orange, hideBaku: true, el: <BakuJack from={6} to={CLIP + 4} word="は！？" sub="4500個、15%しかないん！？" />},
  {
    cat: 'ナギの補足',
    name: 'ノート', se: [[6,'tick']] as [number, string][],
    color: C.cyan,
    el: (
      <>
        <NagiNote from={6} to={CLIP} text={'時短の引き戻しは、\n通常時と同じ確率で抽選。'} />
        <Subtitle who="nagi" from={14} to={98} text="そこは、ちゃんと分けて考えよう。" />
      </>
    ),
  },
  {
    cat: '場面転換',
    name: '斜め帯', se: [[40,'whoosh']] as [number, string][],
    color: C.muted,
    el: (
      <>
        <Until frame={50}>
          <DataPanel from={-40} title="RUSH継続率の分解" rows={[{label: 'RUSH本体の継続', value: '73%'}, {label: 'トータル継続率', value: '81%'}]} />
        </Until>
        <LabTransition at={50} />
      </>
    ),
  },
  {cat: '場面転換', name: '章カード', se: [[6,'whoosh'],[12,'slam']] as [number, string][], color: C.muted, dim: true, el: <ChapterCard from={6} to={88} no="02" year="2008" title="ここから始まった" />},
  {
    cat: '場面転換',
    name: 'シャッター（話題替え）', se: [[38,'whoosh']] as [number, string][],
    color: C.muted,
    el: (
      <>
        <Until frame={50}>
          <KeywordPop from={-20} to={200} word="引き戻し" />
        </Until>
        <Shutter at={50} />
      </>
    ),
  },
];

export const LAB_UI_PATTERN_FRAMES = CLIPS.length * CLIP;

const Label: React.FC<{i: number; c: Clip}> = ({i, c}) => {
  const f = useCurrentFrame();
  const p = ramp(f, 0, 8);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 36, display: 'flex', justifyContent: 'center', opacity: p}}>
      <div style={{display: 'flex', alignItems: 'stretch', clipPath: cham(12), background: 'rgba(6,17,39,0.92)'}}>
        <div style={{background: c.color, padding: '8px 18px', fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.navy, letterSpacing: 2}}>
          {String(i + 1).padStart(2, '0')}
        </div>
        <div style={{padding: '6px 24px 8px', fontFamily: JP, fontWeight: 800, fontSize: 30, color: C.white}}>
          <span style={{color: c.color}}>{c.cat}</span>
          <span style={{color: C.muted}}> ／ </span>
          {c.name}
        </div>
      </div>
    </div>
  );
};

export const LabUIPatterns: React.FC = () => {
  const f = useCurrentFrame();
  const i = Math.min(CLIPS.length - 1, Math.floor(f / CLIP));
  const c = CLIPS[i];
  const local = f - i * CLIP;
  const focus = c.cat === '数値データ' || c.name === '斜め帯' ? 1 : 0;
  return (
    <AbsoluteFill style={{backgroundColor: C.navy}}>
      <LabBackground focus={focus} />
      <Characters nagiPose={c.nagi ?? 'body'} speaking={null} dim={c.dim ? Math.min(1, local / 8) : 0} bakuHidden={!!c.hideBaku && local > 16} />
      {CLIPS.map((clip, k) => (
        <Sequence key={k} from={k * CLIP} durationInFrames={CLIP}>
          {clip.el}
          <Label i={k} c={clip} />
          {(clip.se ?? []).map(([at, name], j) => (
            <Sequence key={j} from={at} durationInFrames={75}>
              <Audio src={staticFile(`labui/se/${name}.wav`)} volume={name === 'tick' ? 0.5 : 0.7} />
            </Sequence>
          ))}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
