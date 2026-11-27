// シャンフロ回 v2（新台解説・研究所UI版、2026-11-28 新背景）。本編＋全動画共通のエンドカード
import React from 'react';
import {LabEpisode, EpisodeData} from './LabEpisode';
import {ENDING_CARD_FRAMES} from '../common/NagibakuEnding';
import data from './ep/shanfro2.json';

export const SHANFRO2 = data as unknown as EpisodeData;
export const SHANFRO2_FRAMES = SHANFRO2.frames + ENDING_CARD_FRAMES;
export const ShanfroEpisode2: React.FC = () => <LabEpisode data={SHANFRO2} />;
