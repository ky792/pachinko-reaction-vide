import {Episode} from './theme';
import s001 from './data/s001.json';
import n45_001 from './data/n45_001.json';

// ナギの45秒解析：shorts/scripts/build45.py <id> で data/<id>.json を作り、ここに1行足す
export const NAGI45: Record<string, Episode> = {
  n45_001: n45_001 as unknown as Episode,
};

// 旧シリーズ（30秒ナギバク研究所）
export const EPISODES: Record<string, Episode> = {
  s001: s001 as unknown as Episode,
};
