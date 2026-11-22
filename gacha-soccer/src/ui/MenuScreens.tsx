import { useState } from 'react';
import type { SaveData } from '../core/save';
import { ACHIEVEMENTS } from '../core/achievements';
import { OPPONENTS } from '../core/data/opponents';
import { DEFAULT_GACHA_CONFIG } from '../core/gacha';
import { sfx } from '../audio/sfx';
import { BallIcon, Seg, Toggle } from './common';

export function TitleScreen({
  save,
  hasRun,
  onNew,
  onResume,
  onRecords,
  onSettings,
}: {
  save: SaveData;
  hasRun: boolean;
  onNew: () => void;
  onResume: () => void;
  onRecords: () => void;
  onSettings: () => void;
}) {
  const r = save.records;
  return (
    <div className="title-screen">
      <BallIcon />
      <div className="logo">
        ガチャサッカー
        <small>（仮） PROTOTYPE</small>
      </div>
      <div className="muted small" style={{ maxWidth: 360 }}>
        ガチャで引いたランダムな11人を、戦術と局面判断で勝利に導け。
      </div>
      <div className="title-menu">
        <button
          className="btn primary"
          onClick={() => {
            sfx.unlock();
            sfx.play('confirm');
            onNew();
          }}
        >
          新しいチームを作る（ガチャ）
        </button>
        {hasRun && (
          <button className="btn" onClick={onResume}>
            現在のチームで続ける
          </button>
        )}
        <button className="btn" onClick={onRecords}>
          戦績・実績
        </button>
        <button className="btn" onClick={onSettings}>
          設定{save.debug.enabled ? ' / デバッグ' : ''}
        </button>
      </div>
      <div className="small muted">
        通算 {r.wins}勝 {r.draws}分 {r.losses}敗 ・ スカウト券の天井まで あと{Math.max(0, DEFAULT_GACHA_CONFIG.pityLimit - save.pity)}回
      </div>
      {save.debug.enabled && <span className="pill gold">DEBUG: スカウト1/{save.debug.scoutDenom} ・ GOD 1/{save.debug.godDenom}</span>}
    </div>
  );
}

export function RecordsScreen({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const r = save.records;
  const pct = r.totalDecisions ? Math.round((r.goodDecisions / r.totalDecisions) * 100) : 0;
  return (
    <div>
      <div className="topbar">
        <button className="btn small" onClick={onBack}>
          ←
        </button>
        <h2>戦績・実績</h2>
      </div>
      <div className="panel">
        <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
          <span className="k">周回数</span>
          <b>{r.runs}</b>
          <span className="k">試合数</span>
          <b>{r.matches}</b>
          <span className="k">勝敗</span>
          <b>
            {r.wins}勝 {r.draws}分 {r.losses}敗
          </b>
          <span className="k">総得点 / 総失点</span>
          <b>
            {r.goalsFor} / {r.goalsAgainst}
          </b>
          <span className="k">最大得点差勝利</span>
          <b>{r.biggestWin}</b>
          <span className="k">好判断率</span>
          <b>
            {pct}%（{r.goodDecisions}/{r.totalDecisions}）
          </b>
          <span className="k">ガチャ総回数</span>
          <b>{r.totalDraws}</b>
          <span className="k">スカウト券 獲得</span>
          <b>{r.scoutCount}</b>
          <span className="k">GOD ELEVEN</span>
          <b>{r.godCount}</b>
          <span className="k">THE ELEVEN 撃破</span>
          <b>{r.bossWins}</b>
          <span className="k">スカウト券 天井カウント</span>
          <b>
            {save.pity} / {DEFAULT_GACHA_CONFIG.pityLimit}
          </b>
        </div>
      </div>
      <div className="section-title">対戦成績</div>
      <div className="panel">
        {OPPONENTS.map((o) => {
          const x = r.perOpponent[o.id] ?? { w: 0, d: 0, l: 0 };
          return (
            <div className="list-item" key={o.id}>
              <span className="swatch" style={{ background: o.color }} />
              <span>{o.name}</span>
              <div className="spacer" />
              <span className="small">
                {x.w}勝 {x.d}分 {x.l}敗
              </span>
            </div>
          );
        })}
      </div>
      <div className="section-title">
        実績（{Object.keys(save.achievements).length}/{ACHIEVEMENTS.length}）
      </div>
      <div className="panel">
        {ACHIEVEMENTS.map((a) => {
          const got = save.achievements[a.id];
          return (
            <div className="list-item" key={a.id} style={{ opacity: got ? 1 : 0.45 }}>
              <span>{got ? '🏆' : '🔒'}</span>
              <div>
                <b>{a.name}</b>
                <div className="small muted">{a.desc}</div>
              </div>
              <div className="spacer" />
              {got && <span className="small muted">{got}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsScreen({
  save,
  onChange,
  onReset,
  onForce,
  onBack,
}: {
  save: SaveData;
  onChange: (s: SaveData) => void;
  onReset: () => void;
  onForce: (k: 'scout' | 'god') => void;
  onBack: () => void;
}) {
  const st = save.settings;
  const dbg = save.debug;
  const [taps, setTaps] = useState(0);
  const [armReset, setArmReset] = useState(false);
  const [forced, setForced] = useState('');
  const set = (patch: Partial<SaveData['settings']>) => onChange({ ...save, settings: { ...st, ...patch } });
  const setD = (patch: Partial<SaveData['debug']>) => onChange({ ...save, debug: { ...dbg, ...patch } });
  return (
    <div>
      <div className="topbar">
        <button className="btn small" onClick={onBack}>
          ←
        </button>
        <h2>設定</h2>
      </div>
      <div className="panel">
        <div className="list-item">
          <span>音量</span>
          <div className="spacer" />
          <div style={{ width: 160 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={st.volume}
              onChange={(e) => set({ volume: Number(e.target.value) })}
              onPointerUp={() => sfx.play('select')}
            />
          </div>
        </div>
        <div className="list-item">
          <span>ミュート</span>
          <div className="spacer" />
          <Toggle on={st.muted} onChange={(v) => set({ muted: v })} />
        </div>
        <div className="list-item">
          <div>
            <div>演出を短縮</div>
            <div className="small muted">ゴール・カットイン・ガチャ演出を短くします（スキップはいつでも可能）</div>
          </div>
          <div className="spacer" />
          <Toggle on={st.fastFx} onChange={(v) => set({ fastFx: v })} />
        </div>
        <div className="list-item">
          <span>試合の再生速度</span>
          <div className="spacer" />
          <Seg
            value={String(st.speed)}
            options={[
              { value: '1', label: 'x1' },
              { value: '2', label: 'x2' },
              { value: '4', label: 'x4' },
            ]}
            onChange={(v) => set({ speed: Number(v) as 1 | 2 | 4 })}
          />
        </div>
      </div>

      <div className="section-title" onClick={() => setTaps((x) => x + 1)}>
        開発者向け
      </div>
      <div className="panel">
        <div className="list-item">
          <div>
            <div>デバッグ機能</div>
            <div className="small muted">確率変更・強制発生・シード固定</div>
          </div>
          <div className="spacer" />
          <Toggle on={dbg.enabled} onChange={(v) => setD({ enabled: v })} />
        </div>
        {dbg.enabled && (
          <>
            <div className="list-item">
              <span style={{ flex: 1 }}>運命のスカウト券 1/</span>
              <input type="number" min={1} value={dbg.scoutDenom} onChange={(e) => setD({ scoutDenom: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 110 }} />
            </div>
            <div className="list-item">
              <span style={{ flex: 1 }}>GOD ELEVEN 1/</span>
              <input type="number" min={1} value={dbg.godDenom} onChange={(e) => setD({ godDenom: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 110 }} />
            </div>
            <div className="list-item">
              <span style={{ flex: 1 }}>天井カウント（現在値）</span>
              <input type="number" min={0} max={999} value={save.pity} onChange={(e) => onChange({ ...save, pity: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })} style={{ width: 110 }} />
            </div>
            <div className="list-item">
              <span style={{ flex: 1 }}>シード固定（空=ランダム）</span>
              <input type="text" value={dbg.fixedSeed} onChange={(e) => setD({ fixedSeed: e.target.value })} style={{ width: 140 }} placeholder="例: 12345" />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small gold" onClick={() => { onForce('scout'); setForced('次のドローでスカウト券が出ます'); }}>
                次のドローでスカウト券
              </button>
              <button className="btn small gold" onClick={() => { onForce('god'); setForced('次のドローでGOD ELEVENが発生します'); }}>
                次のドローでGOD
              </button>
              <button className="btn small" onClick={() => setD({ scoutDenom: 500, godDenom: 8192 })}>
                確率を既定に戻す
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              強制発生は「次に新しいチームを作る／引き直す」ときの1ドローに適用されます。
            </div>
            {forced && <div className="pill gold" style={{ marginTop: 6 }}>✔ {forced}</div>}
          </>
        )}
        <div className="list-item">
          <span>セーブデータ削除</span>
          <div className="spacer" />
          <button
            className="btn small danger"
            onClick={() => {
              if (!armReset) {
                setArmReset(true);
                return;
              }
              setArmReset(false);
              onReset();
            }}
          >
            {armReset ? 'もう一度押すと全削除' : '削除'}
          </button>
        </div>
      </div>
      {taps > 6 && <div className="small muted">build: prototype</div>}
    </div>
  );
}
