// シャンフロ回（新台解説・研究所UI版）
import React from 'react';
import {LabEpisode, EpisodeData} from './LabEpisode';
import data from './ep/shanfro.json';

export const SHANFRO = data as unknown as EpisodeData;
export const ShanfroEpisode: React.FC = () => <LabEpisode data={SHANFRO} />;
