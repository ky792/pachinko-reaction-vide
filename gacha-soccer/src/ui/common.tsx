import type { ReactNode } from 'react';
import type { Player, StatKey } from '../core/types';
import { STAT_KEYS, STAT_LABEL } from '../core/types';
import { SKILL_MAP } from '../core/data/skills';
import { POSITION_LABEL, POSITION_NAME, positionGroup } from '../core/data/formations';
import { displayStat, overall } from '../core/team';
import { isHighlight } from '../core/gacha';
import { Face } from './Face';

export function RarityLabel({ r }: { r: Player['rarity'] }) {
  return <span className={`rar r-${r}`}>{r === 'GOD' ? '神' : r}</span>;
}

export function PosTag({ p }: { p: Player }) {
  return <span className={`pos g-${positionGroup(p.position)}`}>{POSITION_LABEL[p.position]}</span>;
}

export function SkillChips({ p, max }: { p: Player; max?: number }) {
  const list = max ? p.skills.slice(0, max) : p.skills;
  return (
    <div>
      {list.map((s) => {
        const d = SKILL_MAP[s];
        if (!d) return null;
        return (
          <span key={s} className={`skill-chip ${d.kind} ${d.rare && d.kind === 'positive' ? 'rare' : ''}`} title={d.desc}>
            {d.name}
          </span>
        );
      })}
      {max && p.skills.length > max && <span className="skill-chip">+{p.skills.length - max}</span>}
    </div>
  );
}

/** 選手の得意・苦手を一言で */
export function topStats(p: Player): { best: StatKey[]; worst: StatKey } {
  const keys = STAT_KEYS.filter((k) => k !== 'gk' || p.position === 'GK');
  const sorted = [...keys].sort((a, b) => displayStat(p, b) - displayStat(p, a));
  return { best: sorted.slice(0, 2), worst: sorted[sorted.length - 1] };
}

export function PlayerCard({
  p,
  onClick,
  selected,
  animate,
  delay = 0,
  extra,
  back,
}: {
  p: Player;
  onClick?: () => void;
  selected?: boolean;
  animate?: boolean;
  delay?: number;
  extra?: ReactNode;
  /** 裏向き（まだめくっていない） */
  back?: boolean;
}) {
  const hl = isHighlight(p);
  if (back) {
    return (
      <button className="pcard card-back" onClick={onClick} aria-label="まだめくっていないカード" data-silent>
        <span className="cb-mark">GS</span>
      </button>
    );
  }
  const t = topStats(p);
  return (
    <button
      className={`pcard r-${p.rarity} ${selected ? 'selected' : ''} ${animate ? 'flip-in' : ''} ${hl ? `hl-${hl}` : ''}`}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
      onClick={onClick}
    >
      <RarityLabel r={p.rarity} />
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <Face g={p.face} size={44} rarity={p.rarity} />
        <div>
          <div className="ovr">{overall(p)}</div>
          <div>
            <PosTag p={p} />
            <span className="small muted">#{p.number}</span>
          </div>
        </div>
      </div>
      <div className="name">{p.name}</div>
      <div className="small muted">
        得意: {t.best.map((k) => STAT_LABEL[k]).join('・')}
      </div>
      <SkillChips p={p} max={2} />
      {extra}
      {animate && hl && <div className="rare-burst" style={{ animationDelay: `${delay}ms` }} />}
    </button>
  );
}

export function StatBars({ p }: { p: Player }) {
  return (
    <div>
      {STAT_KEYS.filter((k) => k !== 'gk' || p.position === 'GK' || p.stats.gk > 30).map((k) => {
        const v = displayStat(p, k);
        const base = p.stats[k];
        return (
          <div className="stat-row" key={k}>
            <span className="muted">{STAT_LABEL[k]}</span>
            <div className={`bar ${v >= 85 ? 'hi' : v < 40 ? 'lo' : ''}`}>
              <i style={{ width: `${Math.min(100, v)}%` }} />
            </div>
            <b style={{ textAlign: 'right' }}>
              {v}
              {v !== base && <span className="small" style={{ color: v > base ? '#a3e635' : '#fb7185' }}>*</span>}
            </b>
          </div>
        );
      })}
      <div className="small muted">* 技能による補正込み</div>
    </div>
  );
}

export function PlayerDetail({ p, children, onClose }: { p: Player; children?: ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Face g={p.face} size={72} rarity={p.rarity} />
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <RarityLabel r={p.rarity} />
            <PosTag p={p} />
            <span className="muted small">#{p.number}</span>
          </div>
          <h3 style={{ fontSize: 20 }}>{p.name}</h3>
          <div className="small muted">
            {POSITION_NAME[p.position]}
            {p.subPositions.length > 0 && ` ／ サブ: ${p.subPositions.map((s) => POSITION_LABEL[s]).join('・')}`}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 900 }}>{overall(p)}</div>
          <div className="small muted">総合</div>
        </div>
      </div>
      <div className="section-title">能力</div>
      <StatBars p={p} />
      <div className="section-title">特殊技能・弱点</div>
      {p.skills.length === 0 && <div className="small muted">なし</div>}
      {p.skills.map((s) => {
        const d = SKILL_MAP[s];
        return (
          <div key={s} style={{ marginBottom: 6 }}>
            <span className={`skill-chip ${d.kind}`}>{d.name}</span>
            <span className="small">{d.desc}</span>
          </div>
        );
      })}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
      <button className="btn block" style={{ marginTop: 10 }} onClick={onClose}>
        閉じる
      </button>
    </Modal>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export function BallIcon({ size = 84 }: { size?: number }) {
  return (
    <svg className="title-ball" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" />
      <polygon points="50,30 66,42 60,61 40,61 34,42" fill="#0f172a" />
      <path d="M50 30 L50 8 M66 42 L86 34 M60 61 L72 80 M40 61 L28 80 M34 42 L14 34" stroke="#0f172a" strokeWidth="3" />
    </svg>
  );
}
