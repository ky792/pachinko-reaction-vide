import { useState } from 'react';
import type { RunSession } from '../core/run';
import type { Tactics } from '../core/types';
import { FORMATIONS, FORMATION_MAP, POSITION_LABEL, roleFit } from '../core/data/formations';
import { ATTACK_OPTIONS, LINE_OPTIONS, PRESS_OPTIONS, TEMPO_OPTIONS, type TacticOption } from '../core/data/tactics';
import { autoLineup, ensureLineup, roleRating, teamRatings } from '../core/team';
import { sfx } from '../audio/sfx';
import { PlayerDetail, Seg } from './common';
import { Face } from './Face';

interface Props {
  run: RunSession;
  onNext: () => void;
  onBack: () => void;
  /** 試合中の作戦変更用（フォーメーション変更不可） */
  compact?: boolean;
}

export function TacticRows({ tactics, onChange }: { tactics: Tactics; onChange: (t: Tactics) => void }) {
  const row = <K extends 'attack' | 'line' | 'press' | 'tempo'>(label: string, key: K, opts: TacticOption<Tactics[K]>[]) => {
    const cur = opts.find((o) => o.value === tactics[key]);
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="small muted" style={{ marginBottom: 4 }}>
          {label}
        </div>
        <Seg
          value={tactics[key] as string}
          options={opts.map((o) => ({ value: o.value as string, label: o.label }))}
          onChange={(v) => {
            sfx.play('select');
            onChange({ ...tactics, [key]: v });
          }}
        />
        <div className="small" style={{ marginTop: 4, color: '#cbd5e1' }}>
          {cur?.desc}
        </div>
      </div>
    );
  };
  return (
    <div>
      {row('攻撃方向', 'attack', ATTACK_OPTIONS)}
      {row('守備ライン', 'line', LINE_OPTIONS)}
      {row('プレス', 'press', PRESS_OPTIONS)}
      {row('攻撃テンポ', 'tempo', TEMPO_OPTIONS)}
    </div>
  );
}

export function TacticsScreen({ run, onNext, onBack }: Props) {
  const [, force] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const f = FORMATION_MAP[run.tactics.formation];
  run.lineup = ensureLineup(run.players, run.tactics.formation, run.lineup);
  const byId = Object.fromEntries(run.players.map((p) => [p.id, p]));
  const ratings = teamRatings(run.players, run.lineup, f);

  const setTactics = (t: Tactics) => {
    if (t.formation !== run.tactics.formation) run.lineup = autoLineup(run.players, t.formation);
    run.tactics = t;
    force((x) => x + 1);
  };

  const tapSlot = (slotId: string) => {
    if (!sel) {
      setSel(slotId);
      sfx.play('tap');
      return;
    }
    if (sel === slotId) {
      setSel(null);
      setDetail(run.lineup[slotId]);
      return;
    }
    const a = run.lineup[sel];
    run.lineup[sel] = run.lineup[slotId];
    run.lineup[slotId] = a;
    setSel(null);
    sfx.play('select');
    force((x) => x + 1);
  };

  return (
    <div>
      <div className="topbar">
        <button className="btn small" onClick={onBack}>
          ←
        </button>
        <h2>戦術設定</h2>
        <div className="spacer" />
        <span className="pill">チーム総合 {ratings.total}</span>
      </div>

      <div className="section-title">フォーメーション</div>
      <Seg
        value={run.tactics.formation}
        options={FORMATIONS.map((x) => ({ value: x.id, label: x.name }))}
        onChange={(v) => {
          sfx.play('select');
          setTactics({ ...run.tactics, formation: v });
        }}
      />
      <div className="small" style={{ marginTop: 4, color: '#cbd5e1' }}>
        {f.desc}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 12 }}>
        <div>
          <div className="mini-pitch">
            <svg viewBox="0 0 68 80" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
              <g stroke="#dcfce7aa" strokeWidth="0.5" fill="none">
                <rect x="14" y="66" width="40" height="14" />
                <rect x="24" y="74" width="20" height="6" />
                <path d="M0 0 L68 0" />
                <circle cx="34" cy="0" r="9" />
              </g>
            </svg>
            {f.slots.map((s) => {
              const p = byId[run.lineup[s.id]];
              if (!p) return null;
              const fit = roleFit(p.position, p.subPositions, s.role);
              return (
                <button
                  key={s.id}
                  className={`slot ${sel === s.id ? 'sel' : ''}`}
                  style={{ left: `${8 + s.y * 84}%`, top: `${94 - (s.x / 0.7) * 84}%` }}
                  onClick={() => tapSlot(s.id)}
                >
                  <span className="facewrap">
                    <Face g={p.face} size={38} rarity={p.rarity} />
                  </span>
                  <span className="nm">
                    <b>{POSITION_LABEL[s.role]}</b> {Math.round(roleRating(p, s.role))}
                  </span>
                  <span className="nm">{p.name.split(/[ ・]/)[0]}</span>
                  {fit < 0.8 && <span className="nm fit-bad">適性×</span>}
                  {fit >= 0.8 && fit < 0.95 && <span className="nm fit-mid">適性△</span>}
                </button>
              );
            })}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            2人を続けてタップで入れ替え／同じ選手を2回タップで詳細。数字はその位置での実力。
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="btn small"
              onClick={() => {
                run.lineup = autoLineup(run.players, run.tactics.formation);
                sfx.play('select');
                force((x) => x + 1);
              }}
            >
              自動配置
            </button>
          </div>
          <div className="panel" style={{ marginTop: 10 }}>
            {(
              [
                ['攻撃', ratings.attack],
                ['中盤', ratings.midfield],
                ['守備', ratings.defense],
                ['スピード', ratings.speed],
                ['GK', ratings.gk],
              ] as const
            ).map(([k, v]) => (
              <div className="stat-row" key={k}>
                <span className="muted">{k}</span>
                <div className={`bar ${v >= 80 ? 'hi' : v < 45 ? 'lo' : ''}`}>
                  <i style={{ width: `${v}%` }} />
                </div>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <TacticRows tactics={run.tactics} onChange={setTactics} />
          <div className="notice">
            戦術は数値補正ではなく「起きる局面」を変えます。例：サイド攻撃→1対1とクロスの局面が増える／高いライン→高い位置で奪えるが裏を取られる局面が増える／遅いテンポ→相手を走らせ終盤にスタミナを削る。
          </div>
        </div>
      </div>

      <div className="bottombar">
        <div className="inner">
          <button
            className="btn primary block"
            onClick={() => {
              sfx.play('confirm');
              onNext();
            }}
          >
            対戦相手を選ぶ →
          </button>
        </div>
      </div>
      {detail && byId[detail] && <PlayerDetail p={byId[detail]} onClose={() => setDetail(null)} />}
    </div>
  );
}
