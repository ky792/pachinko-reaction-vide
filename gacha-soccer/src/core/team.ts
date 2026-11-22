import type { FormationDef, Lineup, Player, Role, StatKey } from './types';
import { FORMATION_MAP, roleFit } from './data/formations';
import { SKILL_MAP } from './data/skills';

/** 役割ごとの能力重み */
export const ROLE_WEIGHTS: Record<Role, Partial<Record<StatKey, number>>> = {
  GK: { gk: 0.8, judgment: 0.1, physical: 0.1 },
  CB: { defense: 0.45, physical: 0.25, judgment: 0.15, speed: 0.15 },
  SB: { speed: 0.25, defense: 0.3, stamina: 0.15, pass: 0.15, dribble: 0.15 },
  DM: { defense: 0.35, pass: 0.25, judgment: 0.2, physical: 0.1, stamina: 0.1 },
  CM: { pass: 0.35, judgment: 0.2, stamina: 0.15, dribble: 0.15, defense: 0.15 },
  AM: { pass: 0.3, dribble: 0.3, shoot: 0.2, judgment: 0.2 },
  WM: { speed: 0.2, pass: 0.25, dribble: 0.2, stamina: 0.2, defense: 0.15 },
  WG: { speed: 0.3, dribble: 0.35, shoot: 0.2, pass: 0.15 },
  ST: { shoot: 0.45, physical: 0.2, speed: 0.2, dribble: 0.15 },
};

/** 技能込みの静的な能力値（試合外の表示用。条件付き補正は含めない） */
export function displayStat(p: Player, k: StatKey): number {
  let v = p.stats[k];
  for (const sid of p.skills) {
    const s = SKILL_MAP[sid];
    if (!s) continue;
    for (const e of s.effects) if (e.type === 'stat' && e.stat === k && (!e.when || e.when === 'always')) v += e.value;
  }
  return Math.max(1, Math.min(99, v));
}

export function roleRating(p: Player, role: Role): number {
  const w = ROLE_WEIGHTS[role];
  let sum = 0;
  for (const k in w) sum += displayStat(p, k as StatKey) * (w[k as StatKey] ?? 0);
  return sum * roleFit(p.position, p.subPositions, role);
}

export function overall(p: Player): number {
  return Math.round(roleRating(p, p.position));
}

/** フォーメーションへの自動配置（貪欲＋入れ替え改善） */
export function autoLineup(players: Player[], formationId: string): Lineup {
  const f = FORMATION_MAP[formationId];
  const slots = f.slots;
  const remaining = [...players];
  const lineup: Lineup = {};
  // 選択肢の少ないスロット（GK）から順に埋める
  const order = [...slots].sort((a, b) => (a.role === 'GK' ? -1 : b.role === 'GK' ? 1 : 0));
  for (const s of order) {
    let best = 0;
    let bestScore = -1;
    remaining.forEach((p, i) => {
      const sc = roleRating(p, s.role);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    });
    lineup[s.id] = remaining[best].id;
    remaining.splice(best, 1);
  }
  // 2-opt 改善
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const pa = byId[lineup[a.id]];
        const pb = byId[lineup[b.id]];
        const cur = roleRating(pa, a.role) + roleRating(pb, b.role);
        const sw = roleRating(pb, a.role) + roleRating(pa, b.role);
        if (sw > cur + 0.01) {
          lineup[a.id] = pb.id;
          lineup[b.id] = pa.id;
          improved = true;
        }
      }
    }
  }
  return lineup;
}

/** 既存配置を新フォーメーションへ移す（無効なら自動配置） */
export function ensureLineup(players: Player[], formationId: string, lineup: Lineup | undefined): Lineup {
  const f = FORMATION_MAP[formationId];
  if (!lineup) return autoLineup(players, formationId);
  const ids = new Set(players.map((p) => p.id));
  const vals = f.slots.map((s) => lineup[s.id]);
  if (vals.every((v) => v && ids.has(v)) && new Set(vals).size === 11) return lineup;
  return autoLineup(players, formationId);
}

export interface TeamRatings {
  attack: number;
  midfield: number;
  defense: number;
  speed: number;
  gk: number;
  total: number;
}

export function teamRatings(players: Player[], lineup: Lineup, f: FormationDef): TeamRatings {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const at = (pred: (r: Role) => boolean) => f.slots.filter((s) => pred(s.role)).map((s) => ({ p: byId[lineup[s.id]], s }));
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const fw = at((r) => r === 'ST' || r === 'WG' || r === 'AM');
  const mf = at((r) => r === 'CM' || r === 'DM' || r === 'WM' || r === 'AM');
  const df = at((r) => r === 'CB' || r === 'SB' || r === 'DM');
  const gk = at((r) => r === 'GK');
  const all = at(() => true);
  const attack = avg(fw.map(({ p, s }) => roleRating(p, s.role)));
  const midfield = avg(mf.map(({ p, s }) => roleRating(p, s.role)));
  const defense = avg(df.map(({ p, s }) => roleRating(p, s.role)));
  const speed = avg(all.filter((x) => x.s.role !== 'GK').map(({ p }) => displayStat(p, 'speed')));
  const g = avg(gk.map(({ p, s }) => roleRating(p, s.role)));
  const total = avg(all.map(({ p, s }) => roleRating(p, s.role)));
  return {
    attack: Math.round(attack),
    midfield: Math.round(midfield),
    defense: Math.round(defense),
    speed: Math.round(speed),
    gk: Math.round(g),
    total: Math.round(total),
  };
}
