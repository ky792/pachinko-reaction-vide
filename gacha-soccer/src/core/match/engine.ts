import { Rng } from '../rng';
import type { Role, StatKey, Team } from '../types';
import { FORMATION_MAP, roleFit } from '../data/formations';
import { TACTIC_PARAMS } from '../data/tactics';
import { COMMANDS, EVOLUTION_MAP } from '../data/commands';
import { SKILL_MAP } from '../data/skills';
import { ensureLineup } from '../team';
import {
  aerialBonus,
  commandBonus,
  drainMult,
  effStat,
  finishBonus,
  hasSkill,
  involvement,
  type EffCtx,
} from './eff';
import { playerPos, toAbs } from './positions';
import type {
  CommandOption,
  CommandResult,
  Factor,
  Decision,
  FxKind,
  JudgeQuality,
  MatchConfig,
  MatchEvent,
  MatchPlayer,
  MatchStats,
  MatchTeam,
  Outcome,
  RiskLevel,
  Situation,
  TeamIdx,
} from './types';

export interface MatchState {
  config: MatchConfig;
  minute: number;
  endMinute: number;
  half: 1 | 2;
  score: [number, number];
  teams: [MatchTeam, MatchTeam];
  situation: Situation | null;
  next: { team: TeamIdx; x: number; counterChance: number };
  pending: Decision | null;
  halftimePause: boolean;
  events: MatchEvent[];
  finished: boolean;
  stats: MatchStats;
  possTeam: TeamIdx;
  progress: number;
}

function qualityLabel(q: number): string {
  if (q >= 0.85) return 'ドフリー';
  if (q >= 0.65) return '決定的な位置';
  if (q >= 0.45) return 'シュートコースあり';
  if (q >= 0.25) return '角度が厳しい';
  return '遠目から';
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const other = (t: TeamIdx): TeamIdx => (t === 0 ? 1 : 0);

const SIT_PROGRESS: Record<string, number> = { wing: 0.78, center: 0.68, box: 0.88, counter: 0.55, defend: 0.75 };

function buildMatchTeam(team: Team, idx: TeamIdx): MatchTeam {
  const f = FORMATION_MAP[team.tactics.formation];
  const lineup = ensureLineup(team.players, team.tactics.formation, team.lineup);
  const byId = Object.fromEntries(team.players.map((p) => [p.id, p]));
  const players: MatchPlayer[] = f.slots.map((slot) => {
    const p = byId[lineup[slot.id]];
    return {
      p,
      slot,
      team: idx,
      fit: roleFit(p.position, p.subPositions, slot.role),
      stamina: 100,
      goals: 0,
      assists: 0,
      shots: 0,
      score: 0,
    };
  });
  return { team, tactics: { ...team.tactics }, players };
}

/**
 * 試合シミュレーションエンジン（UI非依存）。
 * advance() で「ユーザー判断が必要になるまで」または「試合終了まで」進む。
 * 乱数は全てシード付き Rng を経由するため、同じシード・同じ選択なら必ず同じ試合になる。
 */
export class MatchEngine {
  s: MatchState;
  rng: Rng;
  private byId: Map<string, MatchPlayer>;

  constructor(config: MatchConfig) {
    this.rng = new Rng(config.seed);
    const teams: [MatchTeam, MatchTeam] = [buildMatchTeam(config.home, 0), buildMatchTeam(config.away, 1)];
    this.byId = new Map();
    for (const t of teams) for (const mp of t.players) this.byId.set(mp.p.id, mp);
    this.s = {
      config,
      minute: 0,
      endMinute: 90 + this.rng.int(1, 4),
      half: 1,
      score: [0, 0],
      teams,
      situation: null,
      next: { team: 0, x: 0.3, counterChance: 0 },
      pending: null,
      halftimePause: false,
      events: [],
      finished: false,
      stats: {
        shots: [0, 0],
        onTarget: [0, 0],
        possession: [0, 0],
        decisions: [],
        goals: [],
        evolutionsUsed: 0,
        evolutionsSucceeded: 0,
        wasBehind: [false, false],
      },
      possTeam: 0,
      progress: 0.3,
    };
    this.emit({ kind: 'kickoff', team: 0, rx: 0.5, ry: 0.5, text: 'キックオフ！', fx: 'whistle', dur: 900 });
  }

  // ===== 公開API =====

  /** ユーザー判断・ハーフタイム・試合終了のいずれかまで進める */
  advance(): void {
    let guard = 0;
    while (!this.s.finished && !this.s.pending && !this.s.halftimePause && guard++ < 2000) {
      this.step();
    }
  }

  /** 保留中の判断に答える */
  choose(optionKey: string): void {
    const d = this.s.pending;
    if (!d) return;
    const opt = d.options.find((o) => o.key === optionKey);
    if (!opt) return;
    this.s.pending = null;
    this.s.situation = null;
    this.resolve(d.situation, opt, d.options, true);
  }

  resumeHalftime(): void {
    this.s.halftimePause = false;
  }

  setTactics(team: TeamIdx, patch: Partial<MatchTeam['tactics']>): void {
    const t = this.s.teams[team];
    t.tactics = { ...t.tactics, ...patch, formation: t.tactics.formation };
  }

  player(id: string): MatchPlayer {
    return this.byId.get(id)!;
  }

  // ===== 進行 =====

  private step(): void {
    const s = this.s;
    if (!s.situation) {
      if (s.half === 1 && s.minute >= 45) {
        this.halftime();
        return;
      }
      if (s.minute >= s.endMinute) {
        this.fulltime();
        return;
      }
      this.startPossession();
      return;
    }
    const sit = s.situation;
    const options = this.buildOptions(sit, 2);
    if (this.userControls(sit)) {
      s.pending = { situation: sit, options, team: sit.type === 'defend' ? other(sit.atk) : sit.atk, title: this.sitTitle(sit) };
      return;
    }
    s.situation = null;
    const opt = this.aiChoose(sit, options);
    this.resolve(sit, opt, options, false);
  }

  private halftime(): void {
    const s = this.s;
    s.half = 2;
    s.minute = 45;
    for (const t of s.teams) for (const mp of t.players) mp.stamina = Math.min(100, mp.stamina + 14);
    s.next = { team: 1, x: 0.3, counterChance: 0 };
    this.emit({ kind: 'halftime', team: 1, rx: 0.5, ry: 0.5, text: 'ハーフタイム', fx: 'whistle', dur: 1200 });
    s.halftimePause = true;
  }

  private fulltime(): void {
    const s = this.s;
    s.finished = true;
    // 決勝点のラベル付け
    const [a, b] = s.score;
    if (a !== b) {
      const win: TeamIdx = a > b ? 0 : 1;
      const loserGoals = Math.min(a, b);
      const winnerGoals = s.stats.goals.filter((g) => g.team === win);
      const decisive = winnerGoals[loserGoals];
      if (decisive) decisive.label = decisive.label ? `${decisive.label}・決勝点` : '決勝点';
    }
    this.emit({ kind: 'fulltime', team: 0, rx: 0.5, ry: 0.5, text: '試合終了！', fx: 'whistle', dur: 1500 });
  }

  private advanceTime(dt: number, possTeam: TeamIdx): void {
    const s = this.s;
    s.minute += dt;
    s.stats.possession[possTeam] += dt;
    for (const ti of [0, 1] as TeamIdx[]) {
      const t = s.teams[ti];
      const opp = s.teams[other(ti)];
      const press = TACTIC_PARAMS.press[t.tactics.press].drain;
      const tempo = t.tactics.tempo === 'fast' ? 1.1 : 1;
      const tired = opp.tactics.tempo === 'slow' && possTeam !== ti ? TACTIC_PARAMS.tempo.slow.tireOpponent : 1;
      for (const mp of t.players) {
        if (mp.slot.role === 'GK') continue;
        const st = mp.p.stats.stamina;
        const d = dt * 0.62 * press * tempo * tired * drainMult(mp) * (1.6 - st / 100);
        mp.stamina = clamp(mp.stamina - d, 5, 100);
      }
    }
  }

  // ===== 攻撃の組み立て =====

  private startPossession(): void {
    const s = this.s;
    const T = s.next.team;
    const D = other(T);
    const tT = s.teams[T];
    const tD = s.teams[D];
    const startX = s.next.x;
    const counterChance = s.next.counterChance;
    const tempo = TACTIC_PARAMS.tempo[tT.tactics.tempo];
    const dt = tempo.minutes * (0.75 + this.rng.next() * 0.5) * (startX > 0.4 ? 0.7 : 1);
    this.advanceTime(dt, T);
    s.possTeam = T;

    // 組み立てのパス演出
    const builders = this.pickMany(T, ['CB', 'SB', 'DM', 'CM'], 2);
    let px = startX;
    for (const b of builders) {
      px = Math.min(0.55, px + 0.1);
      this.emitAt(b, T, px, `${this.nm(b)}がボールを運ぶ`, 'pass', 420);
    }

    if (this.rng.chance(counterChance)) {
      this.setSituation(this.makeCounter(T, '素早く縦へ！カウンターだ'));
      return;
    }

    const atkR = this.avgOf(T, ['CB', 'SB', 'DM', 'CM', 'AM', 'WM'], (mp, c) =>
      this.eff(mp, 'pass', c) * 0.45 + this.eff(mp, 'judgment', c) * 0.3 + this.eff(mp, 'dribble', c) * 0.25,
    );
    const defR = this.avgOf(D, ['ST', 'WG', 'AM', 'CM', 'DM', 'WM'], (mp, c) =>
      this.eff(mp, 'defense', c) * 0.4 + this.eff(mp, 'speed', c) * 0.3 + mp.stamina * 0.3 * 0.8,
    );
    const pReach = clamp(
      0.5 +
        (atkR - defR) * 0.0065 +
        tempo.retention -
        TACTIC_PARAMS.press[tD.tactics.press].turnover -
        TACTIC_PARAMS.line[tD.tactics.line].pressHeight +
        (startX - 0.3) * 0.4,
      0.16,
      0.9,
    );

    if (!this.rng.chance(pReach)) {
      const stealer = this.pickOne(D, { ST: 1, WG: 1, AM: 1, CM: 2, DM: 2, WM: 1.5 });
      const highPress = tD.tactics.press === 'high' && this.rng.chance(0.4);
      this.emitAt(stealer, D, 0.5, highPress ? `${this.nm(stealer)}の激しいプレス！高い位置で奪った！` : `${this.nm(stealer)}がパスカット`, 'steal', 520);
      if (highPress) {
        this.setSituation(this.makeCounter(D, 'ショートカウンター！', stealer.p.id));
      } else {
        s.next = { team: D, x: 0.42, counterChance: TACTIC_PARAMS.tempo[tD.tactics.tempo].counterRate };
      }
      return;
    }

    // 敵陣への侵入：戦術によって局面の種類が変わる
    if (this.rng.chance(TACTIC_PARAMS.press[tD.tactics.press].brokenCounter * 0.45)) {
      this.setSituation(this.makeCounter(T, '相手のプレスを剥がした！一気に前へ！'));
      return;
    }
    if (this.rng.chance(TACTIC_PARAMS.line[tD.tactics.line].behindRisk * 0.6)) {
      this.setSituation(this.makeCenter(T, true));
      return;
    }
    let sideRate: number = TACTIC_PARAMS.attack[tT.tactics.attack].sideRate;
    if (tT.tactics.attack === 'balance') {
      // 相手の弱い方を突く
      const flank = this.avgOf(D, ['SB'], (mp, c) => this.eff(mp, 'defense', c) + this.eff(mp, 'speed', c));
      const center = this.avgOf(D, ['CB', 'DM'], (mp, c) => this.eff(mp, 'defense', c) + this.eff(mp, 'judgment', c));
      sideRate = clamp(0.5 + (center - flank) * 0.01, 0.3, 0.7);
    }
    if (this.rng.chance(sideRate)) this.setSituation(this.makeWing(T));
    else this.setSituation(this.makeCenter(T, false));
  }

  /** 局面をセット。守備側に判断のタイミングを与える */
  private setSituation(sit: Situation, silent = false): void {
    const s = this.s;
    s.possTeam = sit.atk;
    s.progress = SIT_PROGRESS[sit.type];
    if (!sit.defended && sit.type !== 'defend') {
      const def = other(sit.atk);
      const dangerous = sit.type === 'box' || sit.type === 'counter';
      const trigger = dangerous || this.rng.chance(0.45);
      if (trigger) {
        sit.defended = true;
        const defSit: Situation = {
          ...sit,
          type: 'defend',
          underlying: sit,
          desc: this.defendDesc(sit),
        };
        // 介入頻度：many=全て / normal=危険な局面＋一部 / few=ゴール前のみ。それ以外はAIコーチが判断
        if (def === 0) {
          const iv = s.config.intervention;
          if (iv === 'few' && sit.type !== 'box') defSit.aiOnly = true;
          if (iv === 'normal' && !dangerous && this.rng.chance(0.7)) defSit.aiOnly = true;
        }
        s.situation = defSit;
        if (!silent) this.emitSit(sit);
        return;
      }
    }
    s.situation = sit;
    if (!silent) this.emitSit(sit);
  }

  private emitSit(sit: Situation): void {
    const a = this.player(sit.actorId);
    const ry = sit.lane === 'L' ? 0.1 : sit.lane === 'R' ? 0.9 : 0.5;
    this.emit({ kind: 'carry', team: sit.atk, rx: SIT_PROGRESS[sit.type], ry, carrierId: a.p.id, text: sit.desc, dur: 600 });
  }

  // ===== 局面生成 =====

  private makeWing(T: TeamIdx, laneHint?: 'L' | 'R'): Situation {
    const lane: 'L' | 'R' = laneHint ?? (this.rng.chance(0.5) ? 'L' : 'R');
    const cands = this.s.teams[T].players.filter((mp) => mp.slot.side === lane && ['WG', 'WM', 'SB', 'AM', 'CM'].includes(mp.slot.role));
    const w: Partial<Record<Role, number>> = { WG: 3, WM: 2.5, SB: 1, AM: 0.6, CM: 0.4 };
    const actor = this.weightedPlayer(cands.length ? cands : this.s.teams[T].players.filter((m) => m.slot.role !== 'GK'), (mp) => w[mp.slot.role] ?? 0.3);
    const D = other(T);
    const defSide = lane === 'L' ? 'R' : 'L';
    const defender =
      this.s.teams[D].players.find((mp) => mp.slot.role === 'SB' && mp.slot.side === defSide) ??
      this.pickOne(D, { CB: 1 });
    const c = this.ctx(defender);
    const ca = this.ctx(actor);
    // DFの向き：判断力が高いDFほど、より危険な方を切る
    const cutThreat = this.eff(actor, 'dribble', ca) + this.eff(actor, 'shoot', ca);
    const lineThreat = this.eff(actor, 'speed', ca) + this.eff(actor, 'dribble', ca);
    const smart = this.eff(defender, 'judgment', c) / 100;
    const pInside = clamp(0.5 + ((cutThreat - lineThreat) / 60) * smart, 0.2, 0.8);
    const stance = this.rng.chance(pInside) ? 'inside' : 'outside';
    const support = this.bestTarget(T, actor.p.id);
    return {
      type: 'wing',
      atk: T,
      actorId: actor.p.id,
      defenderId: defender.p.id,
      supportId: support.p.id,
      lane,
      quality: 0,
      stance,
      mod: 0,
      chain: 0,
      desc: `${lane === 'L' ? '左' : '右'}サイドで${this.nm(actor)}が${this.nm(defender)}と1対1！ DFは${stance === 'inside' ? '中' : '縦'}を切っている`,
    };
  }

  private makeCenter(T: TeamIdx, behindLine: boolean): Situation {
    const actor = this.pickOne(T, { AM: 3, CM: 2, ST: 1.2, WG: 0.7, DM: 0.6 });
    const D = other(T);
    const defender = this.pickOne(D, { DM: 2, CB: 2, CM: 0.6 });
    const runner = this.bestRunner(T, actor.p.id);
    return {
      type: 'center',
      atk: T,
      actorId: actor.p.id,
      defenderId: defender.p.id,
      supportId: runner.p.id,
      lane: 'C',
      quality: 0.14,
      mod: 0,
      chain: 0,
      behindLine,
      desc: behindLine
        ? `相手の高いラインの裏にスペース！ ${this.nm(actor)}が前を向いた`
        : `中央、${this.nm(actor)}がバイタルエリアでボールを持つ`,
    };
  }

  private makeCounter(T: TeamIdx, text: string, actorId?: string): Situation {
    const actor = actorId ? this.player(actorId) : this.pickOne(T, { WG: 2, AM: 2, CM: 1.5, ST: 1, SB: 0.6, DM: 0.6 });
    const D = other(T);
    const defender = this.pickOne(D, { CB: 2, DM: 1.5, SB: 1 });
    const runner = this.bestRunner(T, actor.p.id);
    return {
      type: 'counter',
      atk: T,
      actorId: actor.p.id,
      defenderId: defender.p.id,
      supportId: runner.p.id,
      lane: 'C',
      quality: 0.1,
      mod: 0,
      chain: 0,
      behindLine: true,
      desc: `${text} ${this.nm(actor)}が持ち上がる`,
    };
  }

  private makeBox(T: TeamIdx, actorId: string, quality: number, chain: number, opts: { gk1v1?: boolean; desc: string; defended?: boolean; mod?: number }): Situation {
    const D = other(T);
    const defender = this.pickOne(D, { CB: 3, SB: 0.5, DM: 0.5 }, true);
    const support = this.bestTarget(T, actorId);
    return {
      type: 'box',
      atk: T,
      actorId,
      defenderId: defender.p.id,
      supportId: support.p.id,
      lane: 'C',
      quality: clamp(quality, 0.05, 0.95),
      mod: opts.mod ?? 0,
      chain,
      gk1v1: opts.gk1v1,
      defended: opts.defended,
      desc: opts.desc,
    };
  }

  // ===== コマンド選択肢の構築（乱数を使わない純粋計算） =====

  buildOptions(sit: Situation, depth: number): CommandOption[] {
    switch (sit.type) {
      case 'wing':
        return this.wingOptions(sit, depth);
      case 'center':
        return this.centerOptions(sit, depth, false);
      case 'counter':
        return this.centerOptions(sit, depth, true);
      case 'box':
        return this.boxOptions(sit, depth);
      case 'defend':
        return this.defendOptions(sit, depth);
    }
  }

  /** 成功率 = 基本値 + 各要因。内訳は UI でそのまま表示する（表示値 = 判定値） */
  private calc(base: number, fs: (Factor | null | undefined)[], min = 5, max = 95): { rate: number; base: number; factors: Factor[] } {
    const list = fs.filter((f): f is Factor => !!f && Math.round(f.value) !== 0).map((f) => ({ label: f.label, value: Math.round(f.value) }));
    const v = base + list.reduce((a, f) => a + f.value, 0);
    return { rate: Math.round(clamp(v, min, max)), base: Math.round(base), factors: list };
  }

  private skillF(b: { value: number; skillId?: string }): Factor | null {
    if (!b.value) return null;
    return { label: b.skillId ? `技能「${SKILL_MAP[b.skillId]?.name ?? ''}」` : '技能・弱点', value: b.value };
  }

  private evoF(evo?: string): Factor | null {
    return evo ? { label: '進化ボーナス', value: EVOLUTION_MAP[evo].bonus } : null;
  }

  private defF(mod: number, scale = 1): Factor | null {
    return mod ? { label: 'DFの守備対応', value: mod * scale } : null;
  }

  shotRate(
    shooterId: string,
    quality: number,
    header: boolean,
    extra: (Factor | null)[],
  ): { rate: number; base: number; factors: Factor[]; skillId?: string; baseLabel: string } {
    const sh = this.player(shooterId);
    const c = this.ctx(sh);
    const gk = this.gkOf(other(sh.team));
    const shootV = header
      ? (this.eff(sh, 'physical', c) * 0.5 + this.eff(sh, 'judgment', c) * 0.2 + aerialBonus(sh)) * 0.6 + this.eff(sh, 'shoot', c) * 0.4
      : this.eff(sh, 'shoot', c);
    const g = this.eff(gk, 'gk', this.ctx(gk));
    const fb = finishBonus(sh, c);
    // 位置・フリー度（quality）で基本値が大きく変わる：遠目≈6%、角度が厳しい≈14%、1対1≈47%、ドフリー≈70%
    const r = this.calc(2 + 80 * Math.pow(quality, 1.6), [{ label: header ? 'ヘディング力 vs GK' : 'シュート力 vs GK', value: (shootV - g) * 0.24 }, this.skillF(fb), ...extra], 2, 92);
    return { ...r, skillId: fb.skillId, baseLabel: header ? 'ヘディングの体勢' : qualityLabel(quality) };
  }

  private oppDanger(defTeam: TeamIdx): number {
    // 攻撃側がボールを失ったときの相手の脅威度
    const r = this.avgOf(defTeam, ['ST', 'WG', 'AM'], (mp, c) => this.eff(mp, 'shoot', c) * 0.5 + this.eff(mp, 'speed', c) * 0.5);
    return clamp(r / 65, 0.5, 1.8);
  }

  private value(o: Outcome, sit: Situation, depth: number): number {
    switch (o.kind) {
      case 'goal':
        return 1;
      case 'saved':
        return -0.01;
      case 'header':
        return o.rate / 100;
      case 'situation':
        return this.estimate(o.next, depth - 1);
      case 'turnover':
        return -{ low: 0.012, mid: 0.03, high: 0.075 }[o.danger] * this.oppDanger(other(sit.atk));
      case 'reset':
        return 0.03;
      case 'steal':
        return o.counter ? 0.075 : 0.025;
      case 'atkMod': {
        const u = sit.underlying!;
        const late = this.s.minute >= 75 ? o.timeBurn * 0.01 * Math.sign(this.s.score[other(u.atk)] - this.s.score[u.atk]) : 0;
        return -this.estimate({ ...u, mod: u.mod + o.mod }, depth - 1) + late;
      }
      case 'atkAdvantage':
        return -this.estimate(o.next, depth - 1);
    }
  }

  /** 局面の期待値（その局面の攻撃側から見たゴール確率の目安） */
  estimate(sit: Situation, depth: number): number {
    if (depth <= 0) {
      const m = 1 + sit.mod / 45;
      switch (sit.type) {
        case 'box':
          return (this.shotRate(sit.actorId, sit.quality, false, [this.defF(sit.mod, 0.5)]).rate / 100) * 0.95;
        case 'wing':
          return 0.085 * m;
        case 'center':
          return (sit.behindLine ? 0.11 : 0.08) * m;
        case 'counter':
          return 0.13 * m;
        case 'defend':
          return 0.09;
      }
    }
    const opts = this.buildOptions(sit, depth);
    return Math.max(...opts.map((o) => o.ev));
  }

  private mkOpt(
    sit: Situation,
    depth: number,
    o: Omit<CommandOption, 'ev' | 'key' | 'name'> & { name?: string },
  ): CommandOption {
    const evo = o.evolutionId ? EVOLUTION_MAP[o.evolutionId] : undefined;
    const name = o.name ?? evo?.name ?? COMMANDS[o.commandId].name;
    const r = o.rate / 100;
    const ev = r * this.value(o.onSuccess, sit, depth) + (1 - r) * this.value(o.onFail, sit, depth);
    return { ...o, name, key: `${o.evolutionId ?? o.commandId}:${o.targetId ?? ''}`, ev };
  }

  private wingOptions(sit: Situation, depth: number): CommandOption[] {
    const A = this.player(sit.actorId);
    const Dp = this.player(sit.defenderId);
    const S = this.player(sit.supportId);
    const ca = this.ctx(A);
    const cd = this.ctx(Dp);
    const e = (mp: MatchPlayer, k: StatKey, c: EffCtx) => this.eff(mp, k, c);
    const mod = sit.mod;
    const opts: CommandOption[] = [];
    const T = sit.atk;
    const ch = sit.chain + 1;
    const diff = (a: number, d: number, label = '能力差') => ({ label, value: (a - d) * 0.48 });

    // 縦突破
    {
      const b = commandBonus(A, 'dribble', ca);
      const r = this.calc(50, [
        diff(e(A, 'speed', ca) * 0.5 + e(A, 'dribble', ca) * 0.5, e(Dp, 'defense', cd) * 0.5 + e(Dp, 'speed', cd) * 0.5, '能力差（速さ・ドリブル）'),
        { label: sit.stance === 'outside' ? 'DFが縦を切っている' : 'DFが中を切っている（縦が空く）', value: sit.stance === 'outside' ? -18 : 10 },
        this.skillF(b),
        this.defF(mod),
      ]);
      const receiver = this.bestShooter(T, A.p.id);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'dribble',
          name: '縦突破',
          actorId: A.p.id,
          ...r,
          reward: '中',
          risk: '小',
          successText: '縦をぶち抜く！',
          failText: 'DFに体を入れられた',
          onSuccess: { kind: 'situation', next: this.makeBox(T, A.p.id, 0.3, ch, { desc: `${this.nm(A)}がエンドライン際へ！ 中には${this.nm(receiver)}`, defended: true }) },
          onFail: { kind: 'turnover', danger: 'low' },
          skillUsed: b.skillId,
        }),
      );
    }
    // カットイン / ファントムカットイン
    {
      const b = commandBonus(A, 'cutin', ca);
      const evo = (hasSkill(A, 'genius_dribbler') || hasSkill(A, 'finisher')) && sit.stance === 'outside' ? 'phantom_cutin' : undefined;
      const r = this.calc(46, [
        diff(
          e(A, 'dribble', ca) * 0.6 + e(A, 'judgment', ca) * 0.2 + e(A, 'speed', ca) * 0.2,
          e(Dp, 'defense', cd) * 0.6 + e(Dp, 'judgment', cd) * 0.4,
          '能力差（技術・判断）',
        ),
        { label: sit.stance === 'inside' ? 'DFが中を切っている' : 'DFが縦を切っている（中が空く）', value: sit.stance === 'inside' ? -18 : 12 },
        this.skillF(b),
        this.evoF(evo),
        this.defF(mod),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'cutin',
          evolutionId: evo,
          actorId: A.p.id,
          ...r,
          reward: evo ? '大' : '中',
          risk: '中',
          successText: evo ? '幻の切り返し！完全に逆を取った！' : '中へ切れ込んだ！',
          failText: 'カットインを読まれた',
          onSuccess: {
            kind: 'situation',
            next: this.makeBox(T, A.p.id, evo ? 0.62 : 0.46, ch, { desc: `${this.nm(A)}がカットインからシュートコースを作った`, defended: true, mod: evo ? 8 : 0 }),
          },
          onFail: { kind: 'turnover', danger: 'mid' },
          skillUsed: b.skillId,
        }),
      );
    }
    // シザース / 高速シザース
    {
      const b = commandBonus(A, 'scissors', ca);
      const tired = Dp.stamina < 60 ? (60 - Dp.stamina) * 0.4 : 0;
      const evo = hasSkill(A, 'genius_dribbler') && (Dp.stamina < 65 || e(A, 'speed', ca) >= e(Dp, 'speed', cd)) ? 'fast_scissors' : undefined;
      const r = this.calc(36, [
        diff(e(A, 'dribble', ca) * 0.8 + e(A, 'speed', ca) * 0.2, e(Dp, 'defense', cd) * 0.5 + e(Dp, 'judgment', cd) * 0.5, '能力差（ドリブル vs 守備・判断）'),
        tired ? { label: '相手DFのスタミナ切れ', value: tired } : null,
        this.skillF(b),
        this.evoF(evo),
        this.defF(mod),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'scissors',
          evolutionId: evo,
          actorId: A.p.id,
          ...r,
          reward: '大',
          risk: '大',
          successText: evo ? '高速シザースでDFを置き去り！' : 'シザースで完全に外した！',
          failText: 'フェイントが通じない！逆襲を受ける',
          onSuccess: {
            kind: 'situation',
            next: this.makeBox(T, A.p.id, evo ? 0.7 : 0.6, ch, { desc: `${this.nm(Dp)}を抜き去った！ ${this.nm(A)}の前が開いた`, defended: true }),
          },
          onFail: { kind: 'turnover', danger: 'high' },
          skillUsed: b.skillId,
        }),
      );
    }
    // クロス / 天空ヘッド
    {
      const b = commandBonus(A, 'cross', ca);
      const cb = this.pickOne(other(T), { CB: 1 }, true);
      const aerialS = this.aerial(S);
      const aerialC = this.aerial(cb);
      const evo = hasSkill(S, 'aerial_king') && aerialS > aerialC ? 'sky_header' : undefined;
      const r = this.calc(42, [
        { label: 'キッカーのパス精度', value: (e(A, 'pass', ca) - 60) * 0.5 },
        { label: `空中戦（${this.nm(S)} vs ${this.nm(cb)}）`, value: (aerialS - aerialC) * 0.7 },
        this.skillF(b),
        this.evoF(evo),
        this.defF(mod),
      ]);
      const hr = this.shotRate(S.p.id, evo ? 0.6 : 0.42, true, []);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'cross',
          evolutionId: evo,
          actorId: A.p.id,
          targetId: S.p.id,
          ...r,
          reward: '中',
          risk: '小',
          successText: `${this.nm(S)}が競り勝った！ヘディング！`,
          failText: 'クロスは跳ね返された',
          onSuccess: { kind: 'header', shooterId: S.p.id, rate: hr.rate, assistId: A.p.id },
          onFail: { kind: 'turnover', danger: 'low' },
          skillUsed: b.skillId,
          name: evo ? undefined : `クロス（→${this.nm(S)}）`,
        }),
      );
    }
    // 戻す
    {
      const r = this.calc(86, [{ label: 'パス精度', value: (e(A, 'pass', ca) - 60) * 0.2 }], 60, 97);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'pass',
          name: 'バックパスで作り直す',
          actorId: A.p.id,
          ...r,
          reward: '小',
          risk: '小',
          successText: '落ち着いて作り直す',
          failText: 'パスがずれた',
          onSuccess: { kind: 'reset' },
          onFail: { kind: 'turnover', danger: 'mid' },
        }),
      );
    }
    return opts;
  }

  private centerOptions(sit: Situation, depth: number, counter: boolean): CommandOption[] {
    const A = this.player(sit.actorId);
    const Dp = this.player(sit.defenderId);
    const R = this.player(sit.supportId);
    const ca = this.ctx(A);
    const cd = this.ctx(Dp);
    const cr = this.ctx(R);
    const T = sit.atk;
    const D = other(T);
    const tD = this.s.teams[D];
    const e = (mp: MatchPlayer, k: StatKey, c: EffCtx) => this.eff(mp, k, c);
    const mod = sit.mod;
    const ch = sit.chain + 1;
    const lineP = TACTIC_PARAMS.line[tD.tactics.line];
    const opts: CommandOption[] = [];
    const cbSpeed = this.avgOf(D, ['CB'], (mp, c) => this.eff(mp, 'speed', c));

    // スルーパス / キラーパス
    {
      const b = commandBonus(A, 'through', ca);
      const rb = commandBonus(R, 'through', cr);
      const lineMod = tD.tactics.line === 'high' ? 14 : tD.tactics.line === 'low' ? -10 : 0;
      const runnerOk = hasSkill(R, 'line_breaker') || e(R, 'speed', cr) >= 75;
      const evo = hasSkill(A, 'pass_magician') && runnerOk && (tD.tactics.line === 'high' || counter || sit.behindLine) ? 'killer_pass' : undefined;
      const r = this.calc(34, [
        counter ? { label: 'カウンター（相手の守備が整っていない）', value: 12 } : sit.behindLine ? { label: 'ライン裏にスペース', value: 10 } : null,
        {
          label: '能力差（パス・受け手の速さ vs 守備）',
          value:
            (e(A, 'pass', ca) * 0.6 + e(A, 'judgment', ca) * 0.4 + (e(R, 'speed', cr) - 60) * 0.3 - (e(Dp, 'judgment', cd) * 0.4 + e(Dp, 'defense', cd) * 0.3 + cbSpeed * 0.3)) *
            0.48,
        },
        lineMod ? { label: tD.tactics.line === 'high' ? '相手のラインが高い（裏が広い）' : '相手のラインが低い（裏が狭い）', value: lineMod } : null,
        this.skillF(b),
        rb.value ? { label: `受け手の技能「${SKILL_MAP[rb.skillId ?? '']?.name ?? ''}」`, value: rb.value * 0.5 } : null,
        this.evoF(evo),
        this.defF(mod),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'through',
          evolutionId: evo,
          actorId: A.p.id,
          targetId: R.p.id,
          ...r,
          reward: '大',
          risk: '中',
          successText: evo ? '時が止まるようなキラーパス！' : `${this.nm(R)}が抜け出した！`,
          failText: 'パスはカットされた',
          onSuccess: {
            kind: 'situation',
            next: this.makeBox(T, R.p.id, evo ? 0.8 : 0.7, ch, { gk1v1: true, desc: `${this.nm(R)}がGKと1対1！`, defended: true }),
            assistId: A.p.id,
          },
          onFail: { kind: 'turnover', danger: 'mid' },
          skillUsed: b.skillId ?? rb.skillId,
          name: evo ? undefined : `スルーパス（→${this.nm(R)}）`,
        }),
      );
    }
    // シュート（ミドル）
    {
      const sr = this.shotRate(A.p.id, counter ? 0.1 : 0.15, false, [
        tD.tactics.line === 'low' ? { label: '相手のラインが低い（ミドルが空く）', value: 0.06 * 44 } : null,
        this.defF(mod, 0.5),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'shoot',
          name: counter ? 'ロングシュート' : 'ミドルシュート',
          actorId: A.p.id,
          rate: sr.rate,
          base: sr.base,
          baseLabel: sr.baseLabel,
          factors: sr.factors,
          reward: '特大',
          risk: '小',
          successText: 'ゴール！！',
          failText: 'シュートは枠を捉えきれない',
          onSuccess: { kind: 'goal', shooterId: A.p.id },
          onFail: { kind: 'saved', shooterId: A.p.id },
          skillUsed: sr.skillId,
        }),
      );
    }
    // ドリブル（中央突破 / 持ち上がり）
    {
      const b = commandBonus(A, 'dribble', ca);
      const r = counter
        ? this.calc(52, [
            { label: '能力差（スピード勝負）', value: (e(A, 'speed', ca) * 0.6 + e(A, 'dribble', ca) * 0.4 - e(Dp, 'speed', cd) * 0.6 - e(Dp, 'defense', cd) * 0.4) * 0.48 },
            this.skillF(b),
            this.defF(mod),
          ])
        : this.calc(40, [
            { label: '能力差（ドリブル・体の強さ）', value: (e(A, 'dribble', ca) * 0.7 + e(A, 'physical', ca) * 0.3 - e(Dp, 'defense', cd) * 0.6 - e(Dp, 'physical', cd) * 0.4) * 0.48 },
            lineP.boxDensity ? { label: lineP.boxDensity > 0 ? '相手が中央を固めている' : '相手の中央が手薄', value: -lineP.boxDensity } : null,
            this.skillF(b),
            this.defF(mod),
          ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'dribble',
          name: counter ? 'ドリブルで持ち運ぶ' : '中央突破',
          actorId: A.p.id,
          ...r,
          reward: '中',
          risk: counter ? '中' : '大',
          successText: 'DFを振り切った！',
          failText: '囲まれてボールを失った',
          onSuccess: { kind: 'situation', next: this.makeBox(T, A.p.id, counter ? 0.52 : 0.5, ch, { desc: `${this.nm(A)}がペナルティエリアに侵入！`, defended: true }) },
          onFail: { kind: 'turnover', danger: counter ? 'mid' : 'high' },
          skillUsed: b.skillId,
        }),
      );
    }
    // パス
    {
      const b = commandBonus(A, 'pass', ca);
      const r = this.calc(84, [{ label: 'パス精度', value: (e(A, 'pass', ca) - 60) * 0.25 }, this.skillF(b)], 55, 97);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'pass',
          name: counter ? '落ち着かせる' : 'サイドへ展開',
          actorId: A.p.id,
          ...r,
          reward: '小',
          risk: '小',
          successText: counter ? '一度落ち着かせる' : 'サイドへ展開',
          failText: 'パスが乱れた',
          onSuccess: counter ? { kind: 'reset' } : { kind: 'situation', next: this.makeWingDet(T) },
          onFail: { kind: 'turnover', danger: 'mid' },
          skillUsed: b.skillId,
        }),
      );
    }
    return opts;
  }

  /** 期待値計算用に乱数を使わずサイド局面を作る（実行時は改めて向きを抽選） */
  private makeWingDet(T: TeamIdx): Situation {
    const cands = this.s.teams[T].players.filter((mp) => mp.slot.role === 'WG' || mp.slot.role === 'WM' || mp.slot.role === 'SB');
    const actor = cands.sort((a, b) => this.eff(b, 'dribble', this.ctx(b)) - this.eff(a, 'dribble', this.ctx(a)))[0] ?? this.pickOne(T, { CM: 1 }, true);
    const lane = actor.slot.side === 'R' ? 'R' : 'L';
    const D = other(T);
    const defSide = lane === 'L' ? 'R' : 'L';
    const defender = this.s.teams[D].players.find((mp) => mp.slot.role === 'SB' && mp.slot.side === defSide) ?? this.pickOne(D, { CB: 1 }, true);
    return {
      type: 'wing',
      atk: T,
      actorId: actor.p.id,
      defenderId: defender.p.id,
      supportId: this.bestTarget(T, actor.p.id).p.id,
      lane,
      quality: 0,
      stance: 'inside',
      mod: 0,
      chain: 0,
      desc: '',
      reroll: true,
    };
  }

  private boxOptions(sit: Situation, depth: number): CommandOption[] {
    const A = this.player(sit.actorId);
    const Dp = this.player(sit.defenderId);
    const S = this.player(sit.supportId);
    const ca = this.ctx(A);
    const cd = this.ctx(Dp);
    const T = sit.atk;
    const e = (mp: MatchPlayer, k: StatKey, c: EffCtx) => this.eff(mp, k, c);
    const mod = sit.mod;
    const ch = sit.chain + 1;
    const opts: CommandOption[] = [];
    const density = TACTIC_PARAMS.line[this.s.teams[other(T)].tactics.line].boxDensity;
    const sr = this.shotRate(A.p.id, sit.quality, false, [
      !sit.gk1v1 && density ? { label: density > 0 ? 'ゴール前が密集（相手の低いライン）' : 'ゴール前が手薄', value: -density * 0.5 } : null,
      this.defF(mod, 0.5),
    ]);
    opts.push(
      this.mkOpt(sit, depth, {
        commandId: 'shoot',
        actorId: A.p.id,
        rate: sr.rate,
        base: sr.base,
        baseLabel: sr.baseLabel,
        factors: sr.factors,
        reward: '特大',
        risk: '小',
        successText: 'ゴール！！',
        failText: 'GKが止めた！',
        onSuccess: { kind: 'goal', shooterId: A.p.id },
        onFail: { kind: 'saved', shooterId: A.p.id },
        skillUsed: sr.skillId,
      }),
    );
    if (sit.chain < 3) {
      const gk = this.gkOf(other(T));
      const gkV = e(gk, 'gk', this.ctx(gk));
      // パス
      const b = commandBonus(A, 'pass', ca);
      const pr = sit.gk1v1
        ? this.calc(48, [{ label: 'パス精度 vs GKの飛び出し', value: (e(A, 'pass', ca) - gkV) * 0.5 }, this.skillF(b)], 10, 90)
        : this.calc(
            50,
            [
              { label: 'パス精度', value: (e(A, 'pass', ca) - 60) * 0.6 },
              { label: '相手DFの読み', value: -(e(Dp, 'judgment', cd) - 60) * 0.3 },
              this.skillF(b),
              this.defF(mod, 0.5),
            ],
            10,
            92,
          );
      // ラストパスが通れば「フリー」で受ける＝高い質のシュート機会
      const q2 = sit.gk1v1 ? 0.96 : Math.max(0.78, Math.min(0.9, sit.quality + 0.3));
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'pass',
          name: sit.gk1v1 ? `横パス（→${this.nm(S)}）` : `ラストパス（→${this.nm(S)}）`,
          actorId: A.p.id,
          targetId: S.p.id,
          ...pr,
          reward: '大',
          risk: '小',
          successText: `${this.nm(S)}へ！フリーだ！`,
          failText: 'パスは読まれていた',
          onSuccess: {
            kind: 'situation',
            next: this.makeBox(T, S.p.id, q2, ch, { desc: `${this.nm(S)}がフリーでボールを受けた！`, defended: true }),
            assistId: A.p.id,
          },
          onFail: { kind: 'turnover', danger: 'low' },
          skillUsed: b.skillId,
        }),
      );
      // ドリブル
      const db = commandBonus(A, 'dribble', ca);
      if (sit.gk1v1) {
        const r = this.calc(30, [{ label: 'ドリブル vs GK', value: (e(A, 'dribble', ca) - gkV) * 0.6 }, this.skillF(db), this.defF(mod, 0.5)], 5, 85);
        opts.push(
          this.mkOpt(sit, depth, {
            commandId: 'dribble',
            name: 'GKをかわす',
            actorId: A.p.id,
            ...r,
            reward: '特大',
            risk: '小',
            successText: 'GKをかわして無人のゴールへ！',
            failText: 'GKが飛び出して止めた',
            onSuccess: { kind: 'goal', shooterId: A.p.id },
            onFail: { kind: 'saved', shooterId: A.p.id },
            skillUsed: db.skillId,
          }),
        );
      } else {
        const r = this.calc(42, [{ label: '能力差（ドリブル vs 守備）', value: (e(A, 'dribble', ca) - e(Dp, 'defense', cd)) * 0.48 }, this.skillF(db), this.defF(mod)]);
        opts.push(
          this.mkOpt(sit, depth, {
            commandId: 'dribble',
            name: 'DFをかわす',
            actorId: A.p.id,
            ...r,
            reward: '中',
            risk: '小',
            successText: '切り返してDFを外した！',
            failText: 'DFにブロックされた',
            onSuccess: {
              kind: 'situation',
              next: this.makeBox(T, A.p.id, Math.min(0.9, sit.quality + 0.24), ch, { desc: `${this.nm(A)}、DFを外して決定機！`, defended: true }),
            },
            onFail: { kind: 'turnover', danger: 'low' },
            skillUsed: db.skillId,
          }),
        );
      }
    }
    return opts;
  }

  private defendOptions(sit: Situation, depth: number): CommandOption[] {
    const u = sit.underlying!;
    const A = this.player(u.actorId);
    const Dp = this.player(u.defenderId);
    const ca = this.ctx(A);
    const cd = this.ctx(Dp);
    const e = (mp: MatchPlayer, k: StatKey, c: EffCtx) => this.eff(mp, k, c);
    const opts: CommandOption[] = [];
    const isDribbleSit = u.type === 'wing' || u.type === 'counter' || (u.type === 'box' && !u.gk1v1);
    const counterOk = u.type !== 'box';
    const beaten = (q: number): Situation =>
      u.type === 'box'
        ? { ...u, quality: Math.min(0.92, u.quality + 0.25), mod: u.mod + 5, defended: true, desc: `${this.nm(A)}がDFを外した！` }
        : this.makeBox(u.atk, A.p.id, q, u.chain + 1, { desc: `${this.nm(Dp)}が外された！ ${this.nm(A)}が抜け出す`, defended: true });

    // プレス
    {
      const b = commandBonus(Dp, 'press', cd);
      const r = this.calc(44, [
        { label: '能力差（寄せの速さ・スタミナ vs 相手の技術）', value: (e(Dp, 'speed', cd) * 0.4 + e(Dp, 'defense', cd) * 0.3 + Dp.stamina * 0.3 - e(A, 'dribble', ca) * 0.5 - e(A, 'pass', ca) * 0.5) * 0.48 },
        this.skillF(b),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'press',
          actorId: Dp.p.id,
          ...r,
          reward: '中',
          risk: '中',
          successText: '鋭い寄せでボールを奪った！',
          failText: 'プレスをかわされた！',
          onSuccess: { kind: 'steal', counter: counterOk && u.type !== 'wing', byId: Dp.p.id },
          onFail: { kind: 'atkMod', mod: 12, timeBurn: 0 },
          skillUsed: b.skillId,
        }),
      );
    }
    // コースを限定
    {
      const b = commandBonus(Dp, 'limit', cd);
      const r = this.calc(72, [{ label: '判断力の差', value: (e(Dp, 'judgment', cd) - e(A, 'judgment', ca)) * 0.5 }, this.skillF(b)], 30, 95);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'limit',
          actorId: Dp.p.id,
          ...r,
          reward: '小',
          risk: 'なし',
          successText: 'コースを切った！相手は苦しい体勢',
          failText: '限定しきれなかった',
          onSuccess: { kind: 'atkMod', mod: -16, timeBurn: 0 },
          onFail: { kind: 'atkMod', mod: 0, timeBurn: 0 },
          skillUsed: b.skillId,
        }),
      );
    }
    // タックル / 鉄壁スライディング
    {
      const b = commandBonus(Dp, 'tackle', cd);
      const evo = hasSkill(Dp, 'defense_craftsman') && isDribbleSit ? 'iron_sliding' : undefined;
      const r = this.calc(40, [
        { label: '能力差（守備・体の強さ vs ドリブル）', value: (e(Dp, 'defense', cd) * 0.6 + e(Dp, 'physical', cd) * 0.4 - e(A, 'dribble', ca) * 0.6 - e(A, 'physical', ca) * 0.4) * 0.48 },
        this.skillF(b),
        this.evoF(evo),
      ]);
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'tackle',
          evolutionId: evo,
          actorId: Dp.p.id,
          ...r,
          reward: '大',
          risk: evo ? '小' : '大',
          successText: evo ? '鉄壁のスライディング！完璧に刈り取った！' : 'タックル成功！カウンターだ！',
          failText: evo ? 'わずかに届かず。それでも体勢は崩した' : 'タックルをかわされた！ピンチ！',
          onSuccess: { kind: 'steal', counter: counterOk, byId: Dp.p.id },
          onFail: evo ? { kind: 'atkMod', mod: 4, timeBurn: 0 } : { kind: 'atkAdvantage', next: beaten(0.6) },
          skillUsed: b.skillId,
        }),
      );
    }
    // インターセプト
    {
      const b = commandBonus(Dp, 'intercept', cd);
      const r = this.calc(34, [
        { label: '能力差（読み・速さ vs パス・判断）', value: (e(Dp, 'judgment', cd) * 0.6 + e(Dp, 'speed', cd) * 0.4 - e(A, 'pass', ca) * 0.6 - e(A, 'judgment', ca) * 0.4) * 0.48 },
        u.type === 'center' || u.type === 'counter' ? { label: 'パスを出す局面（読みやすい）', value: 6 } : null,
        this.skillF(b),
      ]);
      const runnerSit: Situation =
        u.type === 'box'
          ? beaten(0.7)
          : this.makeBox(u.atk, u.supportId, 0.68, u.chain + 1, { gk1v1: true, desc: `読みが外れた！ ${this.nm(this.player(u.supportId))}がフリーで抜け出す`, defended: true });
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'intercept',
          actorId: Dp.p.id,
          ...r,
          reward: '特大',
          risk: '特大',
          successText: '読み切った！インターセプトから逆襲！',
          failText: '読みが外れた！',
          onSuccess: { kind: 'steal', counter: true, byId: Dp.p.id },
          onFail: { kind: 'atkAdvantage', next: runnerSit },
          skillUsed: b.skillId,
        }),
      );
    }
    // 撤退
    if (u.type !== 'box') {
      opts.push(
        this.mkOpt(sit, depth, {
          commandId: 'retreat',
          actorId: Dp.p.id,
          rate: 88,
          base: 88,
          factors: [],
          reward: '小',
          risk: 'なし',
          successText: '下がって守備ブロックを整えた',
          failText: '戻りきれない',
          onSuccess: { kind: 'atkMod', mod: -8, timeBurn: 2.5 },
          onFail: { kind: 'atkMod', mod: 4, timeBurn: 1 },
        }),
      );
    }
    return opts;
  }

  // ===== 判断 =====

  private userControls(sit: Situation): boolean {
    const cfg = this.s.config;
    if (cfg.mode === 'auto') return false;
    if (sit.type === 'defend') {
      if (other(sit.atk) !== 0) return false;
      if (sit.aiOnly) return false;
      if (cfg.mode === 'player') return sit.underlying!.defenderId === cfg.controlledId;
      return true;
    }
    if (sit.atk !== 0) return false;
    if (cfg.mode === 'player') return sit.actorId === cfg.controlledId;
    return true;
  }

  private aiChoose(sit: Situation, options: CommandOption[]): CommandOption {
    const decider = sit.type === 'defend' ? this.player(sit.underlying!.defenderId) : this.player(sit.actorId);
    const j = this.eff(decider, 'judgment', this.ctx(decider));
    const noise = 0.012 + Math.max(0, 100 - j) * 0.0005;
    let best = options[0];
    let bestV = -Infinity;
    for (const o of options) {
      const v = o.ev + this.rng.gauss() * noise;
      if (v > bestV) {
        bestV = v;
        best = o;
      }
    }
    return best;
  }

  judge(options: CommandOption[], chosen: CommandOption): JudgeQuality {
    const evs = options.map((o) => o.ev).sort((a, b) => b - a);
    const best = evs[0];
    const gap = best - chosen.ev;
    const spread = best - evs[evs.length - 1];
    if (gap <= Math.max(0.004, spread * 0.08)) return spread > 0.012 ? 'good' : 'ok';
    if (gap <= Math.max(0.02, spread * 0.35)) return 'ok';
    return 'bad';
  }

  // ===== 解決 =====

  private resolve(sit: Situation, opt: CommandOption, options: CommandOption[], byUser: boolean): void {
    const s = this.s;
    const actor = this.player(opt.actorId);
    const team = actor.team;
    const prog = SIT_PROGRESS[sit.type];
    const ry = sit.lane === 'L' ? 0.12 : sit.lane === 'R' ? 0.88 : 0.5;
    const relX = team === sit.atk ? prog : 1 - prog;

    // 進化・技能の演出
    if (opt.evolutionId) {
      s.stats.evolutionsUsed += team === 0 ? 1 : 0;
      this.emit({
        kind: 'evolve',
        team,
        rx: relX,
        ry,
        carrierId: sit.type === 'defend' ? sit.actorId : actor.p.id,
        text: `${this.nm(actor)}のコマンドが進化！【${opt.name}】`,
        fx: 'evolve',
        fxText: opt.name,
        fxSub: this.nm(actor),
        dur: 1300,
        playerId: actor.p.id,
      });
    } else if (opt.skillUsed && SKILL_MAP[opt.skillUsed]) {
      this.emit({
        kind: 'skill',
        team,
        rx: relX,
        ry,
        carrierId: sit.type === 'defend' ? sit.actorId : actor.p.id,
        text: `${this.nm(actor)}の特殊技能【${SKILL_MAP[opt.skillUsed].name}】`,
        fx: 'skill',
        fxText: SKILL_MAP[opt.skillUsed].name,
        fxSub: this.nm(actor),
        dur: 900,
        playerId: actor.p.id,
        skillId: opt.skillUsed,
      });
    }

    const roll = this.rng.next() * 100;
    const success = roll < opt.rate;
    const outcome = success ? opt.onSuccess : opt.onFail;
    const defFactor = opt.factors.find((f) => f.label === 'DFの守備対応');
    const userDefended = team === 1 && sit.atk === 1 && !!defFactor;

    // コマンド実行の演出
    const kind: MatchEvent['kind'] =
      opt.commandId === 'shoot' ? 'shot' : opt.commandId === 'cross' ? 'cross' : opt.commandId === 'dribble' || opt.commandId === 'cutin' || opt.commandId === 'scissors' ? 'dribble' : 'command';
    if (opt.commandId !== 'shoot' && !(opt.commandId === 'dribble' && sit.gk1v1)) {
      const defNote = userDefended ? `［あなたの守備対応 ${defFactor!.value > 0 ? '+' : ''}${defFactor!.value}%］` : '';
      this.emit({
        kind,
        team,
        rx: relX,
        ry,
        carrierId: sit.type === 'defend' ? sit.actorId : actor.p.id,
        text: `${this.nm(actor)}：${opt.name}（${opt.rate}%）${defNote} → ${success ? opt.successText : opt.failText}`,
        fx: success ? (sit.type === 'defend' && outcome.kind === 'steal' ? 'steal' : 'hit') : 'none',
        dur: 700,
      });
    }
    const result: CommandResult = {
      name: opt.name,
      actorName: actor.p.name,
      team,
      rate: opt.rate,
      roll: Math.floor(roll),
      success,
      base: opt.base,
      baseLabel: opt.baseLabel,
      factors: opt.factors,
      resultText: success ? opt.successText : opt.failText,
      nextText: this.outcomeText(outcome, sit),
      evolved: !!opt.evolutionId,
      byUser,
      minute: Math.floor(s.minute),
    };
    if (byUser) {
      const q = this.judge(options, opt);
      const qText = q === 'good' ? '好判断' : q === 'ok' ? '妥当な判断' : '疑問の残る判断';
      const rText = success ? (q === 'bad' ? '結果オーライ' : '成功') : q === 'good' ? '判断は正しかった、結果は不運' : '失敗';
      result.quality = q;
      result.qualityText = `${qText}／${rText}`;
      s.stats.decisions.push({ minute: Math.floor(s.minute), team, commandName: opt.name, evolved: !!opt.evolutionId, success, quality: q, rate: opt.rate, result });
      if (opt.evolutionId && success) s.stats.evolutionsSucceeded++;
    } else if (opt.evolutionId && success && team === 0) {
      s.stats.evolutionsSucceeded++;
    }
    if (byUser || userDefended) {
      this.emit({
        kind: 'judge',
        team,
        rx: relX,
        ry,
        carrierId: sit.type === 'defend' ? sit.actorId : actor.p.id,
        text: `${byUser ? '' : '相手の'}${opt.name} ${opt.rate}% → 出目${result.roll}で${success ? '成功' : '失敗'}。${result.nextText}`,
        fx: 'result',
        dur: byUser ? 2100 : 1700,
        result,
      });
    }
    actor.score += success ? 1 : -0.3;
    this.applyOutcome(sit, outcome, opt);
  }

  private applyOutcome(sit: Situation, o: Outcome, opt: CommandOption): void {
    const s = this.s;
    const atk = sit.atk;
    switch (o.kind) {
      case 'goal':
        this.shotTaken(o.shooterId, true);
        this.goal(o.shooterId, (opt.onSuccess as { assistId?: string }).assistId ?? sit.assistId);
        return;
      case 'saved':
        this.shotTaken(o.shooterId, false);
        return;
      case 'header': {
        const sh = this.player(o.shooterId);
        const ok = this.rng.next() * 100 < o.rate;
        this.emit({ kind: 'shot', team: sh.team, rx: 0.9, ry: 0.5, carrierId: sh.p.id, text: `${this.nm(sh)}のヘディングシュート！（決定率${o.rate}%）`, dur: 650 });
        if (ok) {
          this.shotTaken(sh.p.id, true, true);
          this.goal(sh.p.id, o.assistId);
        } else this.shotTaken(sh.p.id, false, true);
        return;
      }
      case 'situation': {
        const next = { ...o.next, assistId: o.assistId };
        if (next.reroll) {
          this.setSituation(this.makeWing(atk, next.lane === 'C' ? undefined : (next.lane as 'L' | 'R')));
        } else this.setSituation(next);
        return;
      }
      case 'turnover': {
        const D = other(atk);
        if (o.danger === 'high') {
          this.setSituation(this.makeCounter(D, 'ボールを奪ってカウンター！'));
        } else if (o.danger === 'mid') {
          s.next = { team: D, x: 0.42, counterChance: TACTIC_PARAMS.tempo[s.teams[D].tactics.tempo].counterRate + 0.12 };
        } else {
          s.next = { team: D, x: 0.18, counterChance: 0 };
        }
        return;
      }
      case 'reset':
        s.minute += 0.8;
        s.next = { team: atk, x: 0.5, counterChance: 0 };
        return;
      case 'steal': {
        const D = other(atk);
        if (o.counter) this.setSituation(this.makeCounter(D, 'ボール奪取から速攻！', this.forwardOf(D, o.byId)));
        else s.next = { team: D, x: 0.32, counterChance: 0.1 };
        return;
      }
      case 'atkMod': {
        const u = sit.underlying!;
        s.minute += o.timeBurn;
        this.setSituation({ ...u, mod: u.mod + o.mod, defended: true }, true);
        return;
      }
      case 'atkAdvantage':
        this.setSituation({ ...o.next, defended: true });
        return;
    }
  }

  private shotTaken(shooterId: string, onTarget: boolean, header = false): void {
    const sh = this.player(shooterId);
    this.s.stats.shots[sh.team]++;
    sh.shots++;
    if (onTarget) {
      this.s.stats.onTarget[sh.team]++;
      return;
    }
    const D = other(sh.team);
    const saved = this.rng.chance(0.55);
    if (saved) this.s.stats.onTarget[sh.team]++;
    const gk = this.gkOf(D);
    this.emit({
      kind: saved ? 'save' : 'miss',
      team: sh.team,
      rx: 0.97,
      ry: saved ? 0.5 : this.rng.chance(0.5) ? 0.38 : 0.62,
      carrierId: saved ? gk.p.id : undefined,
      text: saved ? `${this.nm(gk)}がセーブ！` : header ? 'ヘディングは枠の外！' : 'シュートは枠を外れた！',
      fx: saved ? 'save' : 'none',
      dur: 800,
    });
    if (saved) gk.score += 1;
    this.s.next = { team: D, x: 0.15, counterChance: saved && this.rng.chance(0.15) ? 1 : 0 };
  }

  private goal(scorerId: string, assistId?: string): void {
    const s = this.s;
    const sc = this.player(scorerId);
    const T = sc.team;
    const before: [number, number] = [...s.score];
    s.score[T]++;
    sc.goals++;
    sc.score += 3;
    if (assistId && assistId !== scorerId) {
      const a = this.player(assistId);
      a.assists++;
      a.score += 1.5;
    }
    const diffBefore = before[T] - before[other(T)];
    const diffAfter = diffBefore + 1;
    let label = '';
    let big = false;
    if (sc.goals === 3) {
      label = 'ハットトリック';
      big = true;
    }
    if (diffAfter === 1 && s.stats.wasBehind[T]) {
      label = label || '逆転ゴール';
      big = true;
    } else if (diffAfter === 1 && s.minute >= 80) {
      label = label || '勝ち越しゴール';
      big = true;
    } else if (diffAfter === 0 && s.minute >= 80) {
      label = label || '土壇場の同点弾';
      big = true;
    }
    for (const x of [0, 1] as TeamIdx[]) if (s.score[x] < s.score[other(x)]) s.stats.wasBehind[x] = true;
    s.stats.goals.push({ minute: Math.min(90, Math.floor(s.minute) + 1), team: T, scorerId, assistId, label: label || undefined });
    const fx: FxKind = T === 0 ? (big ? 'bigGoal' : 'goal') : 'conceded';
    this.emit({
      kind: 'goal',
      team: T,
      rx: 1.0,
      ry: 0.5,
      text: `ゴール！！ ${this.nm(sc)}${assistId && assistId !== scorerId ? `（アシスト：${this.nm(this.player(assistId))}）` : ''}${label ? `【${label}】` : ''}`,
      fx,
      fxText: label ? `${label}!!` : 'GOAL!!',
      fxSub: this.nm(sc),
      dur: big ? 3200 : 2400,
      playerId: scorerId,
    });
    s.next = { team: other(T), x: 0.3, counterChance: 0 };
    s.minute += 0.6;
  }

  // ===== ユーティリティ =====

  ctx(mp: MatchPlayer): EffCtx {
    return { minute: this.s.minute, diff: this.s.score[mp.team] - this.s.score[other(mp.team)] };
  }

  eff(mp: MatchPlayer, k: StatKey, c: EffCtx): number {
    return effStat(mp, k, c);
  }

  aerial(mp: MatchPlayer): number {
    const c = this.ctx(mp);
    return this.eff(mp, 'physical', c) * 0.7 + this.eff(mp, 'judgment', c) * 0.3 + aerialBonus(mp);
  }

  nm(mp: MatchPlayer): string {
    const n = mp.p.name;
    const parts = n.includes('・') ? n.split('・') : n.split(' ');
    return parts[0];
  }

  private gkOf(t: TeamIdx): MatchPlayer {
    return this.s.teams[t].players.find((mp) => mp.slot.role === 'GK')!;
  }

  private avgOf(t: TeamIdx, roles: Role[], f: (mp: MatchPlayer, c: EffCtx) => number): number {
    const ps = this.s.teams[t].players.filter((mp) => roles.includes(mp.slot.role));
    if (!ps.length) return 50;
    return ps.reduce((a, mp) => a + f(mp, this.ctx(mp)), 0) / ps.length;
  }

  private controlledBias(mp: MatchPlayer): number {
    return this.s.config.mode === 'player' && mp.p.id === this.s.config.controlledId ? 1.8 : 1;
  }

  private weightedPlayer(cands: MatchPlayer[], w: (mp: MatchPlayer) => number): MatchPlayer {
    return this.rng.weighted(cands, (mp) => w(mp) * involvement(mp) * this.controlledBias(mp));
  }

  /** 役割の重みで1人選ぶ。det=true のときは乱数を使わず最有力を返す */
  private pickOne(t: TeamIdx, w: Partial<Record<Role, number>>, det = false): MatchPlayer {
    const cands = this.s.teams[t].players.filter((mp) => (w[mp.slot.role] ?? 0) > 0);
    const pool = cands.length ? cands : this.s.teams[t].players.filter((mp) => mp.slot.role !== 'GK');
    if (det) {
      return pool.reduce((a, b) => {
        const sa = (w[a.slot.role] ?? 0.1) * (this.eff(a, 'defense', this.ctx(a)) + 50);
        const sb = (w[b.slot.role] ?? 0.1) * (this.eff(b, 'defense', this.ctx(b)) + 50);
        return sb > sa ? b : a;
      });
    }
    return this.weightedPlayer(pool, (mp) => w[mp.slot.role] ?? 0.1);
  }

  private pickMany(t: TeamIdx, roles: Role[], n: number): MatchPlayer[] {
    const ps = this.s.teams[t].players.filter((mp) => roles.includes(mp.slot.role));
    const res: MatchPlayer[] = [];
    for (let i = 0; i < n && ps.length; i++) {
      const j = Math.floor(this.rng.next() * ps.length);
      res.push(ps.splice(j, 1)[0]);
    }
    return res.sort((a, b) => a.slot.x - b.slot.x);
  }

  /** ゴール前のターゲット（クロス・ラストパス用、乱数なし） */
  private bestTarget(t: TeamIdx, exclude: string): MatchPlayer {
    const ps = this.s.teams[t].players.filter((mp) => mp.p.id !== exclude && ['ST', 'WG', 'AM', 'CM', 'WM'].includes(mp.slot.role));
    const roleW: Partial<Record<Role, number>> = { ST: 1.25, AM: 1, WG: 1, CM: 0.85, WM: 0.85 };
    return ps.reduce((a, b) => {
      const sa = (this.aerial(a) * 0.4 + this.eff(a, 'shoot', this.ctx(a)) * 0.6) * (roleW[a.slot.role] ?? 1) * involvement(a) * this.controlledBias(a);
      const sb = (this.aerial(b) * 0.4 + this.eff(b, 'shoot', this.ctx(b)) * 0.6) * (roleW[b.slot.role] ?? 1) * involvement(b) * this.controlledBias(b);
      return sb > sa ? b : a;
    });
  }

  private bestShooter(t: TeamIdx, exclude: string): MatchPlayer {
    return this.bestTarget(t, exclude);
  }

  /** 裏へ走る選手（乱数なし） */
  private bestRunner(t: TeamIdx, exclude: string): MatchPlayer {
    const ps = this.s.teams[t].players.filter((mp) => mp.p.id !== exclude && ['ST', 'WG', 'AM'].includes(mp.slot.role));
    const pool = ps.length ? ps : this.s.teams[t].players.filter((mp) => mp.p.id !== exclude && mp.slot.role !== 'GK');
    return pool.reduce((a, b) => {
      const sa = (this.eff(a, 'speed', this.ctx(a)) + (hasSkill(a, 'line_breaker') ? 15 : 0) + this.eff(a, 'shoot', this.ctx(a)) * 0.5) * this.controlledBias(a);
      const sb = (this.eff(b, 'speed', this.ctx(b)) + (hasSkill(b, 'line_breaker') ? 15 : 0) + this.eff(b, 'shoot', this.ctx(b)) * 0.5) * this.controlledBias(b);
      return sb > sa ? b : a;
    });
  }

  /** ボールを奪った後、前を向いて運ぶ選手 */
  private forwardOf(t: TeamIdx, stealerId: string): string {
    const st = this.player(stealerId);
    if (['CM', 'AM', 'WG', 'WM', 'ST'].includes(st.slot.role)) return stealerId;
    return this.pickOne(t, { AM: 2, CM: 2, WG: 1.5, WM: 1 }).p.id;
  }

  private sitTitle(sit: Situation): string {
    switch (sit.type) {
      case 'wing':
        return 'サイド 1対1';
      case 'center':
        return sit.behindLine ? '裏のスペース' : '中央 バイタルエリア';
      case 'counter':
        return 'カウンター';
      case 'box':
        return sit.gk1v1 ? 'GKと1対1' : '決定機';
      case 'defend':
        return '守備の局面';
    }
  }

  private defendDesc(u: Situation): string {
    const a = this.player(u.actorId);
    const d = this.player(u.defenderId);
    const where =
      u.type === 'wing' ? `${u.lane === 'L' ? '相手の左' : '相手の右'}サイド` : u.type === 'box' ? 'ペナルティエリア内' : u.type === 'counter' ? 'カウンター' : '中央';
    return `${where}で${this.nm(a)}が仕掛けてくる！ 対応するのは${this.nm(d)}`;
  }

  private emitAt(mp: MatchPlayer, team: TeamIdx, progress: number, text: string, kind: MatchEvent['kind'], dur: number): void {
    this.s.progress = progress;
    this.s.possTeam = team;
    const pos = playerPos(mp, team, progress, this.s.teams[mp.team].tactics.line);
    this.s.events.push({
      idx: this.s.events.length,
      minute: Math.floor(this.s.minute),
      kind,
      team,
      ball: pos,
      carrierId: mp.p.id,
      progress,
      text,
      score: [...this.s.score],
      dur,
    });
  }

  private emit(e: {
    kind: MatchEvent['kind'];
    team: TeamIdx;
    rx: number;
    ry: number;
    carrierId?: string;
    text: string;
    fx?: FxKind;
    fxText?: string;
    fxSub?: string;
    dur: number;
    playerId?: string;
    skillId?: string;
    result?: CommandResult;
  }): void {
    const s = this.s;
    const ball = toAbs(e.team, e.rx, e.ry);
    s.events.push({
      idx: s.events.length,
      minute: Math.floor(s.minute),
      kind: e.kind,
      team: e.team,
      ball,
      carrierId: e.carrierId,
      progress: s.progress,
      text: e.text,
      fx: e.fx,
      fxText: e.fxText,
      fxSub: e.fxSub,
      score: [...s.score],
      dur: e.dur,
      playerId: e.playerId,
      skillId: e.skillId,
      result: e.result,
    });
  }

  /** コマンドの結果、次に何が起きるかを言葉で説明する */
  private outcomeText(o: Outcome, sit: Situation): string {
    const boxRate = (n: Situation) => this.shotRate(n.actorId, n.quality, false, [this.defF(n.mod, 0.5)]).rate;
    switch (o.kind) {
      case 'goal':
        return 'ゴール！';
      case 'saved':
        return 'シュートは決まらず、相手ボールに。';
      case 'header':
        return `${this.nm(this.player(o.shooterId))}のヘディングシュートへ（決定率${o.rate}%）。`;
      case 'situation':
        if (o.next.reroll) return '次の局面：サイドで1対1。';
        return `次の局面：${this.sitTitle(o.next)}${o.next.type === 'box' ? `（${this.nm(this.player(o.next.actorId))}のシュート成功率 約${boxRate(o.next)}%）` : ''}。`;
      case 'turnover':
        return {
          low: 'ボールロスト。相手は自陣深くからの攻撃になる（危険度：低）。',
          mid: '中盤でボールロスト。相手の速攻に注意（危険度：中）。',
          high: 'ボールを奪われ、カウンターを受ける（危険度：高）！',
        }[o.danger];
      case 'reset':
        return 'ボールを保持したまま組み立て直し（約1分経過）。';
      case 'steal':
        return o.counter ? 'ボールを奪った！そのままカウンターへ。' : 'ボールを奪った。自分たちの攻撃へ。';
      case 'atkMod': {
        const u = sit.underlying!;
        const t =
          o.mod < 0
            ? `${this.nm(this.player(u.actorId))}の次のプレーの成功率 ${o.mod}%。`
            : o.mod > 0
              ? `${this.nm(this.player(u.actorId))}の次のプレーの成功率 +${o.mod}%（相手が有利に）。`
              : '相手の攻撃はそのまま続く。';
        return o.timeBurn ? `${t}時計が${o.timeBurn}分進む。` : t;
      }
      case 'atkAdvantage':
        return `突破された！相手の${this.sitTitle(o.next)}${o.next.type === 'box' ? `（シュート成功率 約${boxRate(o.next)}%）` : ''}。`;
    }
  }
}

export function commandRiskColor(r: RiskLevel): string {
  return { なし: '#7dd3a7', 小: '#9fd36b', 中: '#f5c451', 大: '#f08a4b', 特大: '#ef4b6c' }[r];
}
