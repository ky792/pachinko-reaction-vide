import { Rng } from '../rng';
import { generatePlayer, TEAM_TEMPLATE, assignNumbers } from '../gacha';
import type { Player, Position, Rarity, StatKey, Tactics, Team } from '../types';
import { autoLineup } from '../team';

export interface OpponentDef {
  id: string;
  name: string;
  stars: number; // 1..5（5=裏ボス）
  level: number;
  color: string;
  color2: string;
  tactics: Tactics;
  style: string;
  strengths: string[];
  weaknesses: string[];
  boss?: boolean;
  /** 能力の味付け */
  tweak?: (p: Player, rng: Rng) => void;
  template?: Position[];
  skillsFor?: Partial<Record<Position, string[]>>;
}

const add = (p: Player, k: StatKey, v: number) => {
  p.stats[k] = Math.max(5, Math.min(99, p.stats[k] + v));
};

export const OPPONENTS: OpponentDef[] = [
  {
    id: 'hidamari',
    name: 'ひだまり商店街FC',
    stars: 1,
    level: 45,
    color: '#f97316',
    color2: '#431407',
    tactics: { formation: '442', attack: 'balance', line: 'normal', press: 'low', tempo: 'slow' },
    style: '商店街の店主たちによる草サッカーチーム。',
    strengths: ['のんびりしているのでスタミナ切れしにくい'],
    weaknesses: ['全体的に能力が低い', 'スピードに弱い'],
    tweak: (p) => add(p, 'speed', -6),
  },
  {
    id: 'minato',
    name: '港町マリナーズ',
    stars: 2,
    level: 54,
    color: '#e5e7eb',
    color2: '#0369a1',
    tactics: { formation: '433', attack: 'side', line: 'normal', press: 'normal', tempo: 'normal' },
    style: 'サイド攻撃を好む中堅チーム。',
    strengths: ['ウイングの突破'],
    weaknesses: ['中央の守備が薄い（DM・CBの守備力が低め）'],
    tweak: (p) => {
      if (p.position === 'WG') add(p, 'dribble', 6);
      if (p.position === 'CB' || p.position === 'DM') add(p, 'defense', -7);
    },
  },
  {
    id: 'teppeki',
    name: '鉄壁ユナイテッド',
    stars: 3,
    level: 60,
    color: '#4b5563',
    color2: '#e5e7eb',
    tactics: { formation: '442', attack: 'side', line: 'low', press: 'low', tempo: 'slow' },
    style: '低いラインで中央を固める守備的チーム。スルーパスは通りにくい。',
    strengths: ['中央の守備が非常に堅い', '空中戦に強いCB'],
    weaknesses: ['ラインが低いのでミドルシュートを打たれやすい', '攻撃力が低い', 'サイドバックが遅い'],
    tweak: (p) => {
      if (p.position === 'CB') {
        add(p, 'defense', 8);
        add(p, 'physical', 8);
      }
      if (p.position === 'SB') add(p, 'speed', -10);
      if (p.position === 'ST' || p.position === 'WG' || p.position === 'AM') add(p, 'shoot', -6);
    },
    skillsFor: { CB: ['aerial_king'] },
  },
  {
    id: 'shippu',
    name: '疾風レーシング',
    stars: 3,
    level: 61,
    color: '#dc2626',
    color2: '#fef2f2',
    tactics: { formation: '433', attack: 'side', line: 'high', press: 'high', tempo: 'fast' },
    style: 'ハイライン・ハイプレスで走り勝つ速攻チーム。',
    strengths: ['前線からのプレス', '圧倒的なスピード'],
    weaknesses: ['高いラインの裏（スルーパス）', '終盤のスタミナ切れ', '空中戦が苦手'],
    tweak: (p) => {
      add(p, 'speed', 8);
      add(p, 'stamina', -12);
      add(p, 'physical', -6);
    },
  },
  {
    id: 'royals',
    name: '王都ロイヤルズ',
    stars: 4,
    level: 70,
    color: '#a21caf',
    color2: '#fdf4ff',
    tactics: { formation: '4231', attack: 'balance', line: 'normal', press: 'normal', tempo: 'normal' },
    style: '総合力の高い名門クラブ。弱点が少ない。',
    strengths: ['全ポジションの総合力', 'トップ下の創造性'],
    weaknesses: ['目立った弱点はないが、プレスはやや緩い'],
    skillsFor: { AM: ['pass_magician'], ST: ['finisher'] },
  },
  {
    id: 'the_eleven',
    name: 'THE ELEVEN',
    stars: 5,
    level: 90,
    boss: true,
    color: '#111827',
    color2: '#facc15',
    tactics: { formation: '433', attack: 'center', line: 'high', press: 'high', tempo: 'fast' },
    style: '伝説の11人。中央を圧倒的な技術で支配し、超ハイラインで押し込み続ける。',
    strengths: ['中央突破・スルーパス・決定力すべてが規格外', '前線からの猛烈なプレス', '神がかったGK'],
    weaknesses: [
      '超ハイラインの裏が空いている（スルーパス・カウンター）',
      '技巧派のCBは空中戦が弱い（クロス）',
      'スタミナが少なく、70分以降プレスが崩壊する',
    ],
    tweak: (p) => {
      add(p, 'stamina', -20);
      if (['ST', 'WG', 'AM', 'CM'].includes(p.position)) {
        add(p, 'shoot', 6);
        add(p, 'pass', 6);
        add(p, 'dribble', 6);
      }
      if (p.position === 'CB') {
        add(p, 'physical', -28);
        add(p, 'speed', -12);
      }
      if (p.position === 'SB') add(p, 'defense', -6);
    },
    skillsFor: {
      GK: ['super_save'],
      AM: ['pass_magician', 'genius_dribbler'],
      ST: ['finisher', 'adversity_ace'],
      WG: ['genius_dribbler'],
      CM: ['tactician'],
      CB: ['tactician'],
    },
  },
];

export const OPPONENT_MAP: Record<string, OpponentDef> = Object.fromEntries(OPPONENTS.map((o) => [o.id, o]));

/** 敵チームはIDから決定的に生成（毎回同じメンバー） */
export function buildOpponent(def: OpponentDef): Team {
  const rng = new Rng(`opponent:${def.id}:v1`);
  const template = def.template ?? TEAM_TEMPLATE;
  const players: Player[] = template.map((pos, i) => {
    const rarity: Rarity = def.boss ? 'GOD' : def.level >= 70 ? 'SSR' : def.level >= 60 ? 'SR' : def.level >= 52 ? 'R' : 'N';
    const p = generatePlayer(rng, pos, rarity, 9000 + i, def.level);
    // 敵は技能を定義で上書き（ランダムな弱点は残す）
    const forced = def.skillsFor?.[pos];
    if (forced) {
      p.skills = [...new Set([...forced, ...p.skills.filter((s) => s === 'glass_genius' || s === 'flimsy' || s === 'nervous')])].slice(0, 3);
    }
    if (def.boss) p.skills = ['legend', ...p.skills.slice(0, 2), 'overdrive'];
    def.tweak?.(p, rng);
    p.id = `${def.id}-${i}`;
    return p;
  });
  assignNumbers(players);
  return {
    id: def.id,
    name: def.name,
    players,
    lineup: autoLineup(players, def.tactics.formation),
    tactics: { ...def.tactics },
    color: def.color,
    color2: def.color2,
  };
}
