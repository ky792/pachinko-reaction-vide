import React from 'react';
import {Composition, continueRender, delayRender} from 'remotion';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@fontsource/m-plus-rounded-1c/900.css';
import {Proto, PROTO_TOTAL} from './Proto';

// 日本語フォントの読み込みを待ってから描く
if (typeof document !== 'undefined') {
  const h = delayRender('fonts');
  Promise.all([
    document.fonts.load('800 50px "M PLUS Rounded 1c"', 'あ漢'),
    document.fonts.load('900 50px "M PLUS Rounded 1c"', 'あ漢'),
  ]).then(() => continueRender(h), () => continueRender(h));
}

export const Root: React.FC = () => (
  <>
    <Composition id="Proto01" component={Proto} durationInFrames={PROTO_TOTAL} fps={30} width={1920} height={1080} defaultProps={{debug: true}} />
    <Composition id="Proto01Clean" component={Proto} durationInFrames={PROTO_TOTAL} fps={30} width={1920} height={1080} defaultProps={{debug: false}} />
  </>
);
