// 研究所UI（LAB OS）で1本の回を組む。中身は scripts/build_labui_episode.py が作る JSON（台本＋声の長さ）
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {ChapterInfo, Characters, LabBackground, LabChrome, Mode} from './LabStage';
import {ENDING_BGM, ENDING_CARD_FRAMES, NagibakuEndCard, endingBgmTrimBefore} from '../common/NagibakuEnding';
import {Subtitle} from './Subtitle';
import {DataPanel, Row} from './DataPanel';
import {BarPanel, DonutPanel, Slice, VersusPanel} from './Charts';
import {ReelReveal, VerdictStamp} from './Reveals';
import {ResultReveal} from './ResultReveal';
import {AlertCut} from './AlertCut';
import {BakuJack, KeywordPop, NagiNote} from './Interrupts';
import {ChapterCard, Shutter} from './Transitions';
import {LabTransition} from './LabTransition';
import {RenAnalysis, RenSpec} from './RenAnalysis';
import {BoostSim} from './BoostSim';
import {ImageDataPanel, ImagePanel, PhotoPanel} from './ImagePanels';
import {IntroCard, IntroData, LogoTitle} from './Opening';
import {C, ramp} from './tokens';

export type EpLine = {id: string; who: 'nagi' | 'baku'; text: string; from: number; to: number; src?: string; hide?: boolean; tsukkomi?: boolean};
export type EpEvent = {type: string; from: number; to: number; [k: string]: any};
export type EpisodeData = {
  frames: number;
  base: string; // public/ の下の回のフォルダ
  bgm?: {src: string; gain: number; from: number; to: number};
  song?: {src: string; gain: number; from: number};
  lines: EpLine[];
  subs: {who: 'nagi' | 'baku'; text: string; from: number; to: number; cont: boolean; last: boolean; hide: boolean}[];
  events: EpEvent[];
  ui: Record<string, any>;
  intro: Record<'nagi' | 'baku', IntroData>;
  title: {machine: string; title: string; date: string; cab?: string};
};

const FULL = new Set(['chapter', 'intro', 'logotitle']); // 画面を全部使う場面
const HIDE_CHARS = new Set(['ren', 'sim']);
const DIM_CHARS = new Set(['reel', 'verdict', 'result']);

const Panel: React.FC<{ev: EpEvent; ui: any; hitAt?: number}> = ({ev, ui, hitAt}) => {
  const [kind] = ev.kind.split(':');
  const d = ui[ev.kind] ?? {};
  switch (kind) {
    case 'data':
      return <DataPanel from={ev.from} title={d.title} rows={d.rows as Row[]} hitAt={hitAt} />;
    case 'donut':
      return <DonutPanel from={ev.from} title={d.title} items={d.items as Slice[]} center={d.center} />;
    case 'bar':
      return <BarPanel from={ev.from} title={d.title} items={d.items as Slice[]} />;
    case 'versus':
      return <VersusPanel from={ev.from} title={d.title} metric={d.metric} left={d.left} right={d.right} />;
    case 'ren':
      return <RenAnalysis from={ev.from} spec={d.spec as RenSpec} smoke={!!d.smoke} />;
    case 'image':
      return <ImagePanel from={ev.from} src={d.src} label={d.label} title={d.title} lines={d.lines} />;
    case 'photo':
      return <PhotoPanel from={ev.from} src={d.src} label={d.label} caption={d.caption} sub={d.sub} credit={d.credit} />;
    case 'imgdata':
      return <ImageDataPanel from={ev.from} src={d.src} title={d.title} rows={d.rows} />;
    case 'sim':
      return <BoostSim from={ev.from} title={d.title} counts={d.counts} labels={d.labels} />;
    case 'reel':
      return <ReelReveal from={ev.from} label={d.label} digits={d.digits} unit={d.unit} note={d.note} />;
    case 'verdict':
      return <VerdictStamp from={ev.from} label={d.label} word={d.word} sub={d.sub} />;
    case 'result':
      return <ResultReveal from={ev.from} to={ev.to} label={d.label} value={d.value} bar={d.bar} hitAt={hitAt} />;
    default:
      return null;
  }
};

/** 区間の中だけ描く（区間外では中身を作らない＝軽くする） */
const During: React.FC<{from: number; to: number; pad?: number; children: React.ReactNode}> = ({from, to, pad = 12, children}) => {
  const f = useCurrentFrame();
  return f >= from - 1 && f < to + pad ? <>{children}</> : null;
};

export const LabEpisode: React.FC<{data: EpisodeData}> = ({data}) => {
  const f = useCurrentFrame();
  const at = (t: string) => data.events.filter((e) => e.type === t);
  const active = (t: string) => data.events.find((e) => e.type === t && f >= e.from && f < e.to);
  const show = active('show');
  const fx = active('fx');
  const full = data.events.some((e) => FULL.has(e.type) && f >= e.from && f < e.to);
  const showKind = show?.kind.split(':')[0];
  const line = data.lines.find((l) => f >= l.from && f < l.to);
  const mode: Mode = fx ? 'alert' : show ? 'analysis' : 'talk';
  const modeAt = fx ? fx.from : show ? show.from : 0;
  const dim = show && DIM_CHARS.has(showKind!) ? ramp(f, show.from, show.from + 8) : 0;
  const hideChars = !!show && HIDE_CHARS.has(showKind!);
  const nagiPose = line?.who === 'nagi' && !show ? 'point' : 'body';
  const focus = show ? ramp(f, show.from, show.from + 18) : 0;
  const chapters = at('chapter');
  const ci = chapters.reduce((acc, e, i) => (f >= e.from ? i : acc), -1);
  const chapter: ChapterInfo = ci >= 0 ? {no: chapters[ci].no, title: chapters[ci].title, index: ci, total: chapters.length, from: chapters[ci].from} : null;
  const mainEnd = data.frames;
  const lastLine = data.lines[data.lines.length - 1];
  const edAt = lastLine ? lastLine.from : mainEnd - 90;
  const opEnd = at('logotitle')[0]?.to ?? 0;
  const enterAt = f < opEnd ? 0 : opEnd; // 寸劇では最初からいて、OPのあと入り直す
  const hitFor = (ev: EpEvent) => data.events.find((e) => e.type === 'fx' && e.from >= ev.from && e.from < ev.to)?.from;

  return (
    <AbsoluteFill style={{backgroundColor: C.navy}}>
      <LabBackground focus={focus} chapter={chapter} />
      {!hideChars && (
        <Characters
          nagiPose={nagiPose}
          speaking={line?.who ?? null}
          lineFrom={line?.from ?? 0}
          tsukkomi={!!line?.tsukkomi}
          dim={dim}
          bakuHidden={!!fx}
          enterAt={enterAt}
        />
      )}
      {at('show').map((ev, i) => (
        <During key={`s${i}`} from={ev.from} to={ev.to} pad={2}>
          <Panel ev={ev} ui={data.ui} hitAt={hitFor(ev)} />
        </During>
      ))}
      {at('keyword').map((ev, i) => (
        <KeywordPop key={`k${i}`} from={ev.from} to={ev.to} word={ev.word} read={ev.read} />
      ))}
      {at('note').map((ev, i) => (
        <NagiNote key={`n${i}`} from={ev.from} to={ev.to} text={ev.text} />
      ))}
      {at('fx').map((ev, i) =>
        ev.kind === 'jack' ? (
          <BakuJack key={`f${i}`} from={ev.from} to={ev.to} word={ev.word} sub={ev.sub} />
        ) : (
          <AlertCut key={`f${i}`} from={ev.from} to={ev.to} mode={ev.kind === 'alert' ? 'alert' : 'tsukkomi'} lead={ev.lead} text={ev.text} face={ev.face ?? 'angry'} />
        ),
      )}
      {!full && <LabChrome mode={mode} modeAt={modeAt} chapter={chapter} machine={data.title.machine} />}
      {data.subs.map((s, i) => (s.hide ? null : <Subtitle key={`t${i}`} {...s} />))}
      {at('chapter').map((ev, i) => (
        <ChapterCard key={`c${i}`} from={ev.from} to={ev.to - 10} no={ev.no} year={ev.year} title={ev.title} />
      ))}
      {at('intro').map((ev, i) => (
        <IntroCard key={`i${i}`} from={ev.from} to={ev.to} who={ev.who} d={data.intro[ev.who as 'nagi' | 'baku']} />
      ))}
      {at('logotitle').map((ev, i) => (
        <LogoTitle key={`l${i}`} from={ev.from} logoTo={ev.logoTo} to={ev.to} {...data.title} />
      ))}
      {at('shutter').map((ev, i) => (
        <Shutter key={`sh${i}`} at={ev.from} />
      ))}
      {at('wipe').map((ev, i) => (
        <LabTransition key={`w${i}`} at={ev.from} />
      ))}

      {/* 本編の終わり：暗転 → 全動画共通のエンドカード */}
      <AbsoluteFill style={{background: '#000', opacity: interpolate(f, [mainEnd - 24, mainEnd], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
      <Sequence from={mainEnd} durationInFrames={ENDING_CARD_FRAMES} name="エンドカード（全動画共通）">
        <NagibakuEndCard />
      </Sequence>
      <Sequence from={edAt} name="ED BGM（全動画共通）">
        <Audio
          src={staticFile(ENDING_BGM)}
          trimBefore={endingBgmTrimBefore(edAt, mainEnd)}
          volume={(x) => {
            const g = x + edAt;
            const fadeIn = interpolate(g, [edAt, edAt + 45], [0.12, 0.3], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const card = interpolate(g, [mainEnd - 10, mainEnd + 10], [0, 0.32], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const out = interpolate(g, [mainEnd + ENDING_CARD_FRAMES - 45, mainEnd + ENDING_CARD_FRAMES], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (fadeIn + card) * out;
          }}
        />
      </Sequence>

      {/* 音 */}
      {data.song && (
        <Sequence from={data.song.from}>
          <Audio src={staticFile(data.song.src)} volume={data.song.gain} />
        </Sequence>
      )}
      {data.bgm && (
        <Sequence from={data.bgm.from} durationInFrames={data.bgm.to - data.bgm.from}>
          <Audio
            src={staticFile(data.bgm.src)}
            loop
            volume={(x) => {
              const g = x + data.bgm!.from;
              // 最後の台詞からED曲に受け渡す
              return data.bgm!.gain * interpolate(g, [edAt - 10, edAt + 30], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            }}
          />
        </Sequence>
      )}
      {data.lines.map((l) =>
        l.src ? (
          <Sequence key={`v${l.id}`} from={l.from} durationInFrames={l.to - l.from + 6}>
            <Audio src={staticFile(l.src)} volume={0.85} />
          </Sequence>
        ) : null,
      )}
      {data.events
        .filter((e) => e.se)
        .map((e, i) => (
          <Sequence key={`se${i}`} from={e.from + (e.seAt ?? 0)} durationInFrames={75}>
            <Audio src={staticFile(`labui/se/${e.se}.wav`)} volume={(e.seVol ?? 0.6) * 0.65} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
};
