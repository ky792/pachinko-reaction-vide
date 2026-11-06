// RNC-01 解析シーンの見本（13秒）。スペックは見本用（RUSH 1/99.9×130回＋時短 1/319×100回）
import React from 'react';
import {AbsoluteFill, Sequence, staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {LabBackground, LabChrome} from './LabStage';
import {Subtitle} from './Subtitle';
import {RA, RenAnalysis} from './RenAnalysis';
import {C} from './tokens';

export const REN_DEMO_FRAMES = RA.end;

const SE: [number, string, number][] = [
  [6, 'tick', 0.5],
  [RA.land + 6, 'slam', 0.45],
  [RA.boot, 'boot', 0.75],
  [RA.smoke, 'whoosh', 0.45],
  [RA.smoke + 6, 'tick', 0.5],
  [RA.load, 'unfold', 0.6],
  [RA.wait, 'unfold', 0.5],
  [RA.calc, 'scan', 0.5],
  [RA.stDone, 'confirm', 0.75],
  [RA.stDone + 8, 'scan', 0.45],
  [RA.jitanDone, 'confirm', 0.75],
  [RA.total, 'slam', 0.9],
  [RA.total + 8, 'tick', 0.5],
];

export const RenAnalysisDemo: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: C.navy}}>
    <LabBackground focus={1} />
    <RenAnalysis
      from={0}
      spec={{title: 'RUSH継続率の分解', st: {prob: 99.9, spins: 130}, jitan: {prob: 319, spins: 100}}}
    />
    <LabChrome mode="analysis" modeAt={0} />
    <Subtitle who="baku" from={4} to={40} text="RNC-01、起動！" />
    <Subtitle who="nagi" from={RA.smoke + 6} to={RA.smoke + 40} text="……レン、煙出てるけど。" />
    <Subtitle who="baku" from={RA.smoke + 44} to={RA.calc + 10} text="いつものことや、気にせんでええ。" />
    <Subtitle who="nagi" from={RA.total + 8} to={RA.end - 6} text={'RUSH本体で{73%}、\n引き戻しを足して{80%}だね。'} />
    {SE.map(([at, n, v], i) => (
      <Sequence key={i} from={at} durationInFrames={75}>
        <Audio src={staticFile(`labui/se/${n}.wav`)} volume={v} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
