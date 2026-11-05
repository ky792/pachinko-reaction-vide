import {Composition} from 'remotion';
import {NewsOpening} from './NewsOpening';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="NewsOpening"
      component={NewsOpening}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
