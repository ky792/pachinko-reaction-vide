import { useState } from 'react';
import type { RunSession } from '../core/run';
import type { MatchMode } from '../core/types';
import { OPPONENTS, buildOpponent, type OpponentDef } from '../core/data/opponents';
import { FORMATION_MAP } from '../core/data/formations';
import { teamRatings } from '../core/team';
import type { Records, Settings } from '../core/save';
import { sfx } from '../audio/sfx';
import { Seg } from './common';
import { Face } from './Face';

interface Props {
  run: RunSession;
  records: Records;
  settings: Settings;
  onStart: (opp: OpponentDef, mode: MatchMode, controlledId: string | undefined, intervention: Settings['intervention']) => void;
  onBack: () => void;
}

export function SelectScreen({ run, records, settings, onStart, onBack }: Props) {
  const [oppId, setOppId] = useState(OPPONENTS[0].id);
  const [mode, setMode] = useState<MatchMode>('manager');
  const [ctrl, setCtrl] = useState<string>(run.players.find((p) => p.position === 'ST')?.id ?? run.players[0].id);
  const [iv, setIv] = useState<Settings['intervention']>(settings.intervention);
  const opp = OPPONENTS.find((o) => o.id === oppId)!;

  return (
    <div>
      <div className="topbar">
        <button className="btn small" onClick={onBack}>
          ←
        </button>
        <h2>対戦相手</h2>
        <div className="spacer" />
        {run.results.length > 0 && <span className="pill">このチームで {run.results.length} 試合</span>}
      </div>

      {OPPONENTS.map((o) => {
        const t = buildOpponent(o);
        const r = teamRatings(t.players, t.lineup, FORMATION_MAP[t.tactics.formation]);
        const rec = records.perOpponent[o.id];
        return (
          <button
            key={o.id}
            className={`opp ${o.boss ? 'boss' : ''} ${oppId === o.id ? 'on' : ''}`}
            onClick={() => {
              sfx.play('select');
              setOppId(o.id);
            }}
          >
            <div className="row">
              <span className="swatch" style={{ background: o.color, border: `2px solid ${o.color2}` }} />
              <b style={{ fontSize: 16, color: o.boss ? '#facc15' : undefined }}>{o.name}</b>
              <span className="stars">{o.boss ? '裏ボス' : '★'.repeat(o.stars) + '☆'.repeat(4 - o.stars)}</span>
              <div className="spacer" />
              <span className="small muted">総合 {r.total}</span>
            </div>
            <div className="small" style={{ marginTop: 4, color: '#cbd5e1' }}>
              {o.style}
            </div>
            {oppId === o.id && (
              <div style={{ marginTop: 8 }}>
                <div className="small">
                  <b style={{ color: '#a3e635' }}>長所：</b>
                  {o.strengths.join('／')}
                </div>
                <div className="small">
                  <b style={{ color: '#fb7185' }}>スカウティング（弱点）：</b>
                  {o.weaknesses.join('／')}
                </div>
                <div className="small muted">
                  戦術：{FORMATION_MAP[o.tactics.formation].name}・攻撃{{ center: '中央', side: 'サイド', balance: 'バランス' }[o.tactics.attack]}・ライン
                  {{ high: '高', normal: '標準', low: '低' }[o.tactics.line]}・プレス{{ high: '積極', normal: '標準', low: '消極' }[o.tactics.press]}・テンポ
                  {{ fast: '速', normal: '標準', slow: '遅' }[o.tactics.tempo]}
                </div>
              </div>
            )}
            {rec && (
              <div className="small muted" style={{ marginTop: 4 }}>
                通算 {rec.w}勝 {rec.d}分 {rec.l}敗
              </div>
            )}
          </button>
        );
      })}

      <div className="section-title">プレイモード</div>
      <Seg
        value={mode}
        options={[
          { value: 'manager', label: '監督' },
          { value: 'player', label: '選手' },
          { value: 'auto', label: 'フルオート' },
        ]}
        onChange={(v) => {
          sfx.play('select');
          setMode(v);
        }}
      />
      <div className="small" style={{ marginTop: 4, color: '#cbd5e1' }}>
        {mode === 'manager' && '味方全員の重要局面に介入できます（推奨）。'}
        {mode === 'player' && '選んだ1人がボールを持つ・対応する局面でのみ指示できます。その選手は局面に関わりやすくなります。'}
        {mode === 'auto' && 'すべてAIに任せて観戦します。'}
      </div>
      {mode === 'player' && (
        <div className="row" style={{ marginTop: 8 }}>
          {run.players.map((p) => (
            <button key={p.id} className={`btn small ${ctrl === p.id ? 'primary' : ''}`} onClick={() => setCtrl(p.id)}>
              <Face g={p.face} size={22} rarity={p.rarity} />
              {p.name.split(/[ ・]/)[0]}
            </button>
          ))}
        </div>
      )}
      {mode !== 'auto' && (
        <>
          <div className="section-title">守備局面の介入頻度</div>
          <Seg
            value={iv}
            options={[
              { value: 'few', label: '少ない' },
              { value: 'normal', label: '標準' },
              { value: 'many', label: '多い' },
            ]}
            onChange={setIv}
          />
          <div className="small muted" style={{ marginTop: 4 }}>
            聞かれなかった守備局面は、AIコーチが選手の判断力に応じて判断します。攻撃局面は常に介入できます。
          </div>
        </>
      )}

      <div className="bottombar">
        <div className="inner">
          <button
            className={`btn block ${opp.boss ? 'gold' : 'primary'}`}
            onClick={() => {
              sfx.play('confirm');
              onStart(opp, mode, mode === 'player' ? ctrl : undefined, iv);
            }}
          >
            {opp.boss ? '⚡ THE ELEVEN に挑む' : 'キックオフ！'}
          </button>
        </div>
      </div>
    </div>
  );
}
