// ナギバク2.0 試作01：休憩室#1「スロット就活」（k01-030〜040）
// 中身はすべてデータ（src/data/proto01.json ＝ 台本ロック＋演出表＋口パク信号）から決まる。ここは部品を並べるだけ。
import React from 'react';
import {AbsoluteFill, Img, Sequence, staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {BGM, LINES, TOTAL} from './lib/timeline';
import {Camera} from './lib/Camera';
import {Puppet} from './lib/Puppet';
import {BoardView, MouthMeter, Prop, Shuchusen, Subtitle, TrialBadge} from './lib/ui';

export const PROTO_TOTAL = TOTAL;

export const Proto: React.FC<{debug?: boolean}> = ({debug = true}) => {
  return (
    <AbsoluteFill style={{background: '#0b1f4d', overflow: 'hidden'}}>
      <Camera>
        <Img src={staticFile('a/room.jpg')} style={{position: 'absolute', width: 1920, height: 1080}} />
        <Puppet who="nagi" />
        <Puppet who="baku" />
      </Camera>
      <BoardView />
      <Shuchusen />
      <Prop />
      <Subtitle />
      {debug ? <MouthMeter /> : null}
      {debug ? <TrialBadge /> : null}

      {/* 声：台本の行（関門合格済み）だけ。行以外の声は鳴らさない */}
      {LINES.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.end - l.start + 2} layout="none">
          <Audio src={staticFile(l.voice)} />
        </Sequence>
      ))}
      {LINES.filter((l) => l.se).map((l) => (
        <Sequence key={`se-${l.id}`} from={l.start} durationInFrames={45} layout="none">
          <Audio src={staticFile(`a/se/${l.se}.wav`)} volume={0.7} />
        </Sequence>
      ))}
      {BGM ? <Audio src={staticFile(`a/${BGM.file}`)} volume={BGM.volume} trimBefore={(BGM.from ?? 0) * 30} /> : null}
    </AbsoluteFill>
  );
};
