// ナギバク研究所 UI プレビュー（18秒）
// ① 通常解説 → ② データ画面 → ④ レンの解析結果 → ③ バクの割り込み（警告） → ⑤ 場面転換で通常に戻る
// 数字はUI確認用のサンプル（実在の台ではない）。声は未収録で、字幕の長さから仮の尺を取っている
import React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Characters, LabBackground, LabChrome, Mode} from './LabStage';
import {Subtitle} from './Subtitle';
import {DataPanel, PANEL} from './DataPanel';
import {RenUnit} from './RenUnit';
import {ResultReveal} from './ResultReveal';
import {AlertCut} from './AlertCut';
import {LabTransition} from './LabTransition';
import {ramp} from './tokens';

export const LAB_UI_FRAMES = 540;

// ── タイムライン（フレーム）
const T = {
  panel: 104,
  ren: 126,
  scan: [172, 232] as const,
  result: 242,
  alert: 338,
  hit: 342,
  back: 430, // 転換で画面が全部隠れる瞬間
};

const LINES = [
  {who: 'nagi' as const, from: 8, to: 92, text: 'この台のRUSH、\nどれくらい続くか見てみよう。'},
  {who: 'nagi' as const, from: 98, to: 150, text: 'レン、分解して。'},
  {who: 'nagi' as const, from: 262, to: 332, text: '{81%}。5回に4回は、\n次の当たりまで続く計算だね。'},
  {who: 'nagi' as const, from: 444, to: 526, text: 'それ、残りの{19%}を\n毎回引いてるだけだね。'},
];

const SE: {at: number; src: string; vol?: number}[] = [
  {at: 8, src: 'tick', vol: 0.5},
  {at: 98, src: 'tick', vol: 0.5},
  {at: T.panel, src: 'unfold', vol: 0.7},
  {at: T.ren + 14, src: 'boot', vol: 0.7},
  {at: T.scan[0], src: 'scan', vol: 0.55},
  {at: T.scan[1], src: 'confirm', vol: 0.7},
  {at: T.result + 5, src: 'slam', vol: 0.9},
  {at: 262, src: 'tick', vol: 0.4},
  {at: T.alert, src: 'alarm', vol: 0.6},
  {at: T.alert + 4, src: 'slash', vol: 0.8},
  {at: T.back - 10, src: 'whoosh', vol: 0.6},
  {at: 444, src: 'tick', vol: 0.5},
];

export const LabUIPreview: React.FC = () => {
  const f = useCurrentFrame();
  const before = f < T.back; // 転換より前の場面
  const mode: Mode = !before ? 'talk' : f >= T.alert ? 'alert' : f >= T.panel ? 'analysis' : 'talk';
  const modeAt = !before ? T.back : f >= T.alert ? T.alert : f >= T.panel ? T.panel : 0;
  const focus = before ? ramp(f, T.panel, T.panel + 20) : 0;
  const speaking = LINES.find((l) => f >= l.from && f < l.to)?.who ?? (f >= T.alert + 4 && before ? 'baku' : null);
  const dim = before ? ramp(f, T.result, T.result + 8) : 0;
  const nagiPose = (f >= 8 && f < 98) || f >= T.back ? 'point' : 'body';

  return (
    <AbsoluteFill style={{backgroundColor: '#061127'}}>
      <LabBackground focus={focus} />
      <Characters nagiPose={nagiPose} speaking={speaking} dim={dim} bakuHidden={before && f >= T.alert + 6} />
      {before && (
        <>
          <DataPanel
            from={T.panel}
            title="RUSH継続率の分解"
            rows={[
              {label: 'RUSH本体の継続', value: '73%'},
              {label: '時短での引き戻し', value: '30%'},
              {label: 'トータル継続率', value: '', pending: true},
            ]}
            scan={{from: T.scan[0], to: T.scan[1]}}
            result={{at: T.scan[1], value: '81%'}}
            hitAt={T.hit}
          />
          <RenUnit from={T.ren} scanFrom={T.scan[0]} scanTo={T.scan[1]} x={PANEL.left + PANEL.width + 20} y={400} hideAt={T.result + 12} />
          <ResultReveal
            from={T.result}
            to={T.back}
            label="トータル継続率"
            value="81"
            bar={{on: '続く', off: '落ちる', ratio: 0.81}}
            hitAt={T.hit}
          />
          <AlertCut from={T.alert} to={T.back + 4} mode="alert" lead="81%あんのに、" text="ウチ毎回、初回で落ちるねん！" face="angry" />
        </>
      )}
      <LabChrome mode={mode} modeAt={modeAt} />
      {LINES.map((l) => (
        <Subtitle key={l.from} {...l} />
      ))}
      <LabTransition at={T.back} />
      {SE.map((s, i) => (
        <Sequence key={i} from={s.at} durationInFrames={90}>
          <Audio src={staticFile(`labui/se/${s.src}.wav`)} volume={s.vol ?? 0.7} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
