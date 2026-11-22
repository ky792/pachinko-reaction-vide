import type { SkillCondition, StatKey } from '../types';
import { SKILL_MAP } from '../data/skills';
import type { MatchPlayer } from './types';

export interface EffCtx {
  minute: number;
  /** 選手のチームから見た得点差 */
  diff: number;
}

export function condOk(when: SkillCondition | undefined, mp: MatchPlayer, ctx: EffCtx): boolean {
  switch (when) {
    case undefined:
    case 'always':
      return true;
    case 'losing':
      return ctx.diff < 0;
    case 'winning':
      return ctx.diff > 0;
    case 'late':
      return ctx.minute >= 65;
    case 'early':
      return ctx.minute < 35;
    case 'tired':
      return mp.stamina < 50;
  }
}

/** 試合中の実効能力値：技能補正 × ポジション適性 × スタミナ */
export function effStat(mp: MatchPlayer, k: StatKey, ctx: EffCtx): number {
  let v = mp.p.stats[k];
  let noDef = false;
  for (const sid of mp.p.skills) {
    const s = SKILL_MAP[sid];
    if (!s) continue;
    for (const e of s.effects) {
      if (e.type === 'stat' && e.stat === k && condOk(e.when, mp, ctx)) v += e.value;
      if (e.type === 'noDefense') noDef = true;
    }
  }
  if (noDef && k === 'defense') v *= 0.3;
  const fitF = k === 'gk' ? (mp.slot.role === 'GK' ? 1 : 0.3) : 0.6 + 0.4 * mp.fit;
  const stamF = k === 'gk' ? 1 : 0.62 + 0.38 * (mp.stamina / 100);
  return Math.max(1, v * fitF * stamF);
}

export function commandBonus(mp: MatchPlayer, cmd: string, ctx: EffCtx): { value: number; skillId?: string } {
  let value = 0;
  let skillId: string | undefined;
  for (const sid of mp.p.skills) {
    const s = SKILL_MAP[sid];
    if (!s) continue;
    for (const e of s.effects) {
      if (e.type === 'command' && e.command === cmd && condOk(e.when, mp, ctx)) {
        value += e.value;
        if (e.value > 0) skillId = skillId ?? sid;
      }
    }
  }
  return { value, skillId };
}

export function finishBonus(mp: MatchPlayer, ctx: EffCtx): { value: number; skillId?: string } {
  let value = 0;
  let skillId: string | undefined;
  for (const sid of mp.p.skills) {
    const s = SKILL_MAP[sid];
    if (!s) continue;
    for (const e of s.effects) {
      if (e.type === 'finish' && condOk(e.when, mp, ctx)) {
        value += e.value;
        if (e.value > 0) skillId = skillId ?? sid;
      }
    }
  }
  return { value, skillId };
}

export function aerialBonus(mp: MatchPlayer): number {
  let v = 0;
  for (const sid of mp.p.skills) for (const e of SKILL_MAP[sid]?.effects ?? []) if (e.type === 'aerial') v += e.value;
  return v;
}

export function drainMult(mp: MatchPlayer): number {
  let m = 1;
  for (const sid of mp.p.skills) for (const e of SKILL_MAP[sid]?.effects ?? []) if (e.type === 'staminaDrain') m *= e.mult;
  return m;
}

export function involvement(mp: MatchPlayer): number {
  let m = 1;
  for (const sid of mp.p.skills) for (const e of SKILL_MAP[sid]?.effects ?? []) if (e.type === 'involvement') m *= e.mult;
  return m;
}

export function hasSkill(mp: MatchPlayer, id: string): boolean {
  return mp.p.skills.includes(id);
}
