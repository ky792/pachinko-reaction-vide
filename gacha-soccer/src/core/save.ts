/**
 * 永続データ（localStorage）。
 * プレイをまたいで持ち越すのは「スカウト券の天井カウント」「戦績」「実績」「設定」だけ。
 * 選手・スカウト券・GOD ELEVEN はそのプレイ限り（ここには保存しない）。
 */
import { DEFAULT_GACHA_CONFIG } from './gacha';

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  /** 演出を短縮する */
  fastFx: boolean;
  speed: 1 | 2 | 4;
  intervention: 'many' | 'normal' | 'few';
}

export interface OpponentRecord {
  w: number;
  d: number;
  l: number;
}

export interface Records {
  runs: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  totalDraws: number;
  scoutCount: number;
  godCount: number;
  bossWins: number;
  perOpponent: Record<string, OpponentRecord>;
  biggestWin: number;
  goodDecisions: number;
  totalDecisions: number;
}

export interface DebugSettings {
  enabled: boolean;
  scoutDenom: number;
  godDenom: number;
  fixedSeed: string;
}

export interface SaveData {
  version: 1;
  pity: number;
  settings: Settings;
  records: Records;
  achievements: Record<string, string>;
  debug: DebugSettings;
}

const KEY = 'gacha-soccer-save-v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    pity: 0,
    settings: { volume: 0.7, muted: false, fastFx: false, speed: 1, intervention: 'normal' },
    records: {
      runs: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      totalDraws: 0,
      scoutCount: 0,
      godCount: 0,
      bossWins: 0,
      perOpponent: {},
      biggestWin: 0,
      goodDecisions: 0,
      totalDecisions: 0,
    },
    achievements: {},
    debug: { enabled: false, scoutDenom: DEFAULT_GACHA_CONFIG.scoutDenom, godDenom: DEFAULT_GACHA_CONFIG.godDenom, fixedSeed: '' },
  };
}

export function loadSave(): SaveData {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...d,
      ...s,
      settings: { ...d.settings, ...s.settings },
      records: { ...d.records, ...s.records },
      achievements: { ...s.achievements },
      debug: { ...d.debug, ...s.debug },
    };
  } catch {
    return d;
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモード等）でもゲームは続行
  }
}

export function resetSave(): SaveData {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return defaultSave();
}
