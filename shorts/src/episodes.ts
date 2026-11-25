import {Episode} from './theme';
import s001 from './data/s001.json';

// 新しい回：shorts/scripts/build.py <id> で data/<id>.json を作り、ここに1行足す
export const EPISODES: Record<string, Episode> = {
  s001: s001 as unknown as Episode,
};
