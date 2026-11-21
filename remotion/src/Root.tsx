import {Composition} from 'remotion';
import {NewsOpening} from './NewsOpening';
import {NewsEpisode, calculateEpisodeMetadata} from './NewsEpisode';
import {KyukeiEpisode, calculateKyuMetadata} from './KyukeiEpisode';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="NewsOpening"
        component={NewsOpening}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* ニュース回 第2回（キャッシュレス）完成版。尺は音声から自動で決まる */}
      <Composition
        id="News02"
        component={NewsEpisode}
        durationInFrames={2400}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={calculateEpisodeMetadata}
      />
      {/* ナギバクの休憩室 #1（スロットって複雑すぎひん？）。尺は音声から自動 */}
      <Composition
        id="Kyu001"
        component={KyukeiEpisode}
        durationInFrames={2400}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={calculateKyuMetadata}
      />
    </>
  );
};
