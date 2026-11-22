import { Rng } from './rng';
import type { FaceGenes, Player, Position, Rarity, Stats, StatKey } from './types';
import { STAT_KEYS } from './types';
import { SKILLS, SKILL_MAP } from './data/skills';
import { FOREIGN_FIRST, FOREIGN_LAST, GIVEN, SURNAMES } from './data/names';

// ===== 確率設定（デバッグで変更可能） =====

export interface GachaConfig {
  /** 運命のスカウト券 1/scoutDenom */
  scoutDenom: number;
  /** 天井回数 */
  pityLimit: number;
  /** GOD ELEVEN 1/godDenom */
  godDenom: number;
  /** デバッグ：次のドローで強制発生 */
  forceScout?: boolean;
  forceGod?: boolean;
}

export const DEFAULT_GACHA_CONFIG: GachaConfig = {
  scoutDenom: 500,
  pityLimit: 1000,
  godDenom: 8192,
};

/** 1プレイ開始時の11人の本職構成（ポジション保証） */
export const TEAM_TEMPLATE: Position[] = ['GK', 'CB', 'CB', 'SB', 'SB', 'DM', 'CM', 'AM', 'WG', 'WG', 'ST'];

export const REROLL_LIMIT = 5;

/** 通常ガチャのレアリティ排出率 */
export const RARITY_RATES: { rarity: Rarity; rate: number }[] = [
  { rarity: 'N', rate: 0.44 },
  { rarity: 'R', rate: 0.33 },
  { rarity: 'SR', rate: 0.18 },
  { rarity: 'SSR', rate: 0.05 },
];

/** レアリティ別の基準能力値 */
export const RARITY_LEVEL: Record<Rarity, number> = {
  N: 50,
  R: 58,
  SR: 66,
  SSR: 75,
  GOD: 89,
};

/** ポジション別の能力傾向（基準値からのオフセット） */
const PROFILE: Record<Position, Partial<Stats>> = {
  GK: { gk: 12, judgment: 2, physical: 2, speed: -14, dribble: -26, pass: -12, shoot: -32, defense: -18, stamina: -4 },
  CB: { defense: 10, physical: 8, speed: -5, dribble: -18, pass: -6, shoot: -20, gk: -46 },
  SB: { speed: 6, stamina: 6, defense: 3, dribble: -2, physical: -4, shoot: -14, judgment: -3, gk: -46 },
  DM: { defense: 6, pass: 3, judgment: 5, physical: 3, stamina: 4, speed: -6, dribble: -6, shoot: -12, gk: -46 },
  CM: { pass: 7, judgment: 4, stamina: 5, defense: -3, shoot: -5, speed: -2, physical: -2, gk: -46 },
  AM: { pass: 6, dribble: 7, judgment: 3, shoot: 2, defense: -16, physical: -8, stamina: -2, gk: -46 },
  WG: { speed: 9, dribble: 8, shoot: -1, pass: -2, defense: -18, physical: -8, stamina: 2, judgment: -4, gk: -46 },
  ST: { shoot: 10, physical: 4, speed: 2, pass: -6, defense: -22, judgment: -2, stamina: -3, gk: -46 },
};

const SUB_CANDIDATES: Record<Position, Position[]> = {
  GK: [],
  CB: ['SB', 'DM'],
  SB: ['CB', 'WG', 'DM'],
  DM: ['CB', 'CM'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'WG', 'ST'],
  WG: ['AM', 'ST', 'SB'],
  ST: ['WG', 'AM'],
};

export interface DrawEvents {
  scout: boolean;
  god: boolean;
}

/** プレイをまたいで保持される天井カウント */
export interface PityState {
  count: number;
}

export interface GachaContext {
  rng: Rng;
  config: GachaConfig;
  pity: PityState;
  /** 通算ドロー数（このプレイ） */
  draws: number;
  /** GOD ELEVEN発動中なら全員GOD */
  godMode: boolean;
}

/** 1ドローごとのレアアイテム抽選。天井カウントもここで更新する。 */
export function rollRareItems(ctx: GachaContext): DrawEvents {
  ctx.draws++;
  ctx.pity.count++;
  const rScout = ctx.rng.next();
  const rGod = ctx.rng.next();
  let scout = rScout < 1 / ctx.config.scoutDenom || ctx.pity.count >= ctx.config.pityLimit;
  let god = rGod < 1 / ctx.config.godDenom;
  if (ctx.config.forceScout) {
    scout = true;
    ctx.config.forceScout = false;
  }
  if (ctx.config.forceGod) {
    god = true;
    ctx.config.forceGod = false;
  }
  if (scout) ctx.pity.count = 0;
  return { scout, god };
}

function rollRarity(rng: Rng): Rarity {
  const r = rng.next();
  let acc = 0;
  for (const { rarity, rate } of RARITY_RATES) {
    acc += rate;
    if (r < acc) return rarity;
  }
  return 'N';
}

const clampStat = (v: number) => Math.max(5, Math.min(99, Math.round(v)));

function genFace(rng: Rng): FaceGenes {
  return {
    skin: rng.int(0, 4),
    hair: rng.int(0, 7),
    hairColor: rng.int(0, 7),
    eyes: rng.int(0, 4),
    mouth: rng.int(0, 3),
    brow: rng.int(0, 2),
    accessory: rng.chance(0.18) ? rng.int(1, 3) : 0,
  };
}

function genName(rng: Rng): string {
  if (rng.chance(0.28)) return `${rng.pick(FOREIGN_FIRST)}・${rng.pick(FOREIGN_LAST)}`;
  return `${rng.pick(SURNAMES)} ${rng.pick(GIVEN)}`;
}

function pickSkill(rng: Rng, position: Position, kinds: ('positive' | 'negative' | 'mixed')[], exclude: string[]): string | null {
  const pool = SKILLS.filter(
    (s) => kinds.includes(s.kind) && !exclude.includes(s.id) && (s.positions.length === 0 || s.positions.includes(position)),
  );
  if (pool.length === 0) return null;
  return rng.weighted(pool, (s) => s.weight).id;
}

/**
 * 選手を1人生成する。
 * - 高レアほど能力が高いが、弱点（マイナス技能や極端に低い能力）を持ちやすい
 * - 低レアでも技能を持つことがあり、戦術次第で活躍できる
 */
export function generatePlayer(rng: Rng, position: Position, rarity: Rarity, drawIndex: number, levelOverride?: number): Player {
  const level = levelOverride ?? RARITY_LEVEL[rarity];
  const spread = rarity === 'GOD' ? 4 : 6;
  const stats = {} as Stats;
  // 個性：得意能力を1つ大きく伸ばす
  const signature: StatKey = rng.pick(STAT_KEYS.filter((k) => k !== 'gk' || position === 'GK'));
  for (const k of STAT_KEYS) {
    const off = PROFILE[position][k] ?? 0;
    let v = level + off + rng.gauss() * spread;
    if (k === signature) v += rng.int(5, 12);
    stats[k] = clampStat(v);
  }
  if (position !== 'GK') stats.gk = clampStat(rng.int(5, 18));

  const skills: string[] = [];
  // ポジティブ技能
  const posCount =
    rarity === 'GOD'
      ? rng.int(2, 3)
      : rarity === 'SSR'
        ? rng.int(1, 2)
        : rarity === 'SR'
          ? rng.chance(0.65) ? 1 : 0
          : rarity === 'R'
            ? rng.chance(0.35) ? 1 : 0
            : rng.chance(0.2) ? 1 : 0;
  for (let i = 0; i < posCount; i++) {
    const kinds: ('positive' | 'mixed')[] = rarity === 'GOD' ? ['positive'] : ['positive', 'mixed'];
    const s = pickSkill(rng, position, kinds, skills);
    if (s) skills.push(s);
  }
  // 弱点：高レアほど持ちやすい（GODは持たない）
  const weakChance = rarity === 'SSR' ? 0.55 : rarity === 'SR' ? 0.4 : rarity === 'R' ? 0.25 : rarity === 'N' ? 0.15 : 0;
  if (rng.chance(weakChance)) {
    if (rng.chance(0.55)) {
      const s = pickSkill(rng, position, ['negative', 'mixed'], skills);
      if (s && !(SKILL_MAP[s].kind === 'mixed' && skills.some((x) => SKILL_MAP[x].kind === 'mixed'))) skills.push(s);
    } else {
      // 極端に低い能力（GK以外のGK能力は対象外）
      const candidates = STAT_KEYS.filter((k) => k !== 'gk' && k !== signature);
      const k = rng.pick(candidates);
      stats[k] = clampStat(stats[k] - rng.int(18, 28));
    }
  }

  const subPositions = SUB_CANDIDATES[position].filter(() => rng.chance(0.35));

  return {
    id: `p${drawIndex}-${rng.int(1000, 9999)}`,
    name: genName(rng),
    position,
    subPositions,
    rarity,
    stats,
    skills,
    face: genFace(rng),
    number: 0,
    drawIndex,
  };
}

export interface DrawResult {
  player: Player;
  events: DrawEvents;
}

/** ガチャ1回（1人）。レアアイテム抽選込み */
export function drawPlayer(ctx: GachaContext, position: Position): DrawResult {
  const events = rollRareItems(ctx);
  if (events.god) ctx.godMode = true;
  const rarity = ctx.godMode ? 'GOD' : rollRarity(ctx.rng);
  const player = generatePlayer(ctx.rng, position, rarity, ctx.draws);
  return { player, events };
}

/** 11人を一括で引く */
export function drawTeam(ctx: GachaContext): { players: Player[]; scoutGained: number; godTriggered: boolean } {
  const players: Player[] = [];
  let scoutGained = 0;
  let godTriggered = false;
  for (const pos of TEAM_TEMPLATE) {
    const r = drawPlayer(ctx, pos);
    players.push(r.player);
    if (r.events.scout) scoutGained++;
    if (r.events.god) godTriggered = true;
  }
  if (godTriggered) convertToGod(ctx, players);
  assignNumbers(players);
  return { players, scoutGained, godTriggered };
}

/** GOD ELEVEN：全員を神選手へ（本職ポジションは維持=ポジション適性保証） */
export function convertToGod(ctx: GachaContext, players: Player[]): void {
  for (let i = 0; i < players.length; i++) {
    const old = players[i];
    if (old.rarity === 'GOD') continue;
    const np = generatePlayer(ctx.rng, old.position, 'GOD', old.drawIndex);
    np.id = `${old.id}g`;
    np.number = old.number;
    players[i] = np;
  }
}

/** 運命のスカウト券：指定ポジションの最高レア（GOD）選手を確定生成 */
export function scoutPlayer(ctx: GachaContext, position: Position): Player {
  ctx.draws++;
  return generatePlayer(ctx.rng, position, 'GOD', ctx.draws);
}

const NUMBER_PREF: Record<Position, number[]> = {
  GK: [1, 21],
  CB: [4, 5, 3],
  SB: [2, 3, 16],
  DM: [6, 15],
  CM: [8, 14],
  AM: [10, 20],
  WG: [7, 11, 17],
  ST: [9, 19, 18],
};

export function assignNumbers(players: Player[]): void {
  const used = new Set<number>();
  for (const p of players) {
    if (p.number && !used.has(p.number)) {
      used.add(p.number);
      continue;
    }
    const n = NUMBER_PREF[p.position].find((x) => !used.has(x)) ?? [...Array(40).keys()].map((x) => x + 12).find((x) => !used.has(x))!;
    p.number = n;
    used.add(n);
  }
}

/** 見た目上のレア度判定（ガチャ演出用） */
export function isHighlight(p: Player): 'god' | 'ssr' | 'rareSkill' | null {
  if (p.rarity === 'GOD') return 'god';
  if (p.rarity === 'SSR') return 'ssr';
  if (p.skills.some((s) => SKILL_MAP[s]?.rare)) return 'rareSkill';
  return null;
}
