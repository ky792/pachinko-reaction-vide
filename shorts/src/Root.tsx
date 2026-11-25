import {Composition, CalculateMetadataFunction} from 'remotion';
import {ShortsEpisode} from './ShortsEpisode';
import {Nagi45} from './Nagi45';
import {Episode} from './theme';
import {EPISODES, NAGI45} from './episodes';

// YouTube Shorts 専用（1080×1920）。回は src/episodes.ts に1行足すだけで増える
const meta: CalculateMetadataFunction<{ep: Episode}> = ({props}) => ({durationInFrames: props.ep.total});

export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(NAGI45).map(([id, ep]) => (
      <Composition key={id} id={`Shorts-${id}`} component={Nagi45} durationInFrames={ep.total} fps={30} width={1080} height={1920}
        defaultProps={{ep}} calculateMetadata={meta} />
    ))}
    {/* 旧「30秒ナギバク研究所」（ナギの45秒解析に移行済み・参考に残す） */}
    {Object.entries(EPISODES).map(([id, ep]) => (
      <Composition key={id} id={`Shorts-${id}`} component={ShortsEpisode} durationInFrames={ep.total} fps={30} width={1080} height={1920}
        defaultProps={{ep}} calculateMetadata={meta} />
    ))}
  </>
);
