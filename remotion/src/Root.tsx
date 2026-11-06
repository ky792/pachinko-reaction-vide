import {Composition} from 'remotion';
import {NewsOpening} from './NewsOpening';
import {NewsEpisode, calculateEpisodeMetadata} from './NewsEpisode';
import {LabUIPreview, LAB_UI_FRAMES} from './labui/LabUIPreview';
import {LabUIPatterns, LAB_UI_PATTERN_FRAMES} from './labui/LabUIPatterns';
import {RenAnalysisDemo, REN_DEMO_FRAMES} from './labui/RenAnalysisDemo';
import {ShanfroEpisode, SHANFRO} from './labui/ShanfroEpisode';

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
      {/* 研究所UI（LAB OS）のプレビュー。本編には未適用 */}
      <Composition
        id="LabUIPreview"
        component={LabUIPreview}
        durationInFrames={LAB_UI_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* 研究所UIのパターン見本帳（16種） */}
      <Composition
        id="LabUIPatterns"
        component={LabUIPatterns}
        durationInFrames={LAB_UI_PATTERN_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* RNC-01（レン）の解析シーン */}
      <Composition
        id="RenAnalysisDemo"
        component={RenAnalysisDemo}
        durationInFrames={REN_DEMO_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* 新台解説：シャンフロ回（研究所UI版） */}
      <Composition
        id="ShanfroEpisode"
        component={ShanfroEpisode}
        durationInFrames={SHANFRO.frames}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
