/* カリキュラム：科目 › 分野 › 単元。weight は入試での出題頻度（1〜3）。
 * 単元名は data/questions.js の unit と一致させる。問題がまだない単元は自動で「問題準備中」になり、
 * 学力の計算（正確さ・範囲）からは外れる。問題を足せばそのまま計算に入る。 */
window.CURRICULUM = {
  国語: [
    { field: '漢字・語彙', units: [{ name: '漢字の読み', weight: 3 }, { name: '漢字の書き', weight: 3 }, { name: '語彙', weight: 2 }, { name: '四字熟語', weight: 1 }] },
    { field: '慣用表現', units: [{ name: '慣用句', weight: 2 }, { name: 'ことわざ', weight: 1 }] },
    { field: '文法・敬語', units: [{ name: '品詞', weight: 2 }, { name: '敬語', weight: 2 }, { name: '助詞・助動詞', weight: 2 }] },
    { field: '古典', units: [{ name: '古文単語', weight: 3 }, { name: '古典文法', weight: 3 }, { name: '漢文の句法', weight: 2 }] },
    { field: '文学史', units: [{ name: '文学史', weight: 1 }] },
    { field: '読解', units: [{ name: '評論読解', weight: 3 }, { name: '小説読解', weight: 2 }] },
  ],
  数学: [
    { field: '数と式', units: [{ name: '不等式', weight: 2 }, { name: '一次関数', weight: 1 }, { name: '式の展開と因数分解', weight: 2 }] },
    { field: '二次関数', units: [{ name: '二次関数・平方完成', weight: 3 }, { name: '二次関数・判別式', weight: 3 }, { name: '二次方程式', weight: 2 }] },
    { field: '図形と計量', units: [{ name: '三角比', weight: 3 }, { name: '正弦定理・余弦定理', weight: 2 }] },
    { field: '場合の数と確率', units: [{ name: '場合の数', weight: 2 }, { name: '確率', weight: 3 }] },
    { field: '数列', units: [{ name: '数列', weight: 3 }, { name: '漸化式', weight: 2 }] },
    { field: '指数・対数', units: [{ name: '対数', weight: 2 }, { name: '指数関数', weight: 1 }] },
    { field: '微分・積分', units: [{ name: '微分', weight: 3 }, { name: '積分', weight: 3 }] },
  ],
  英語: [
    { field: '時制・態', units: [{ name: '現在完了', weight: 2 }, { name: '受動態', weight: 2 }] },
    { field: '準動詞', units: [{ name: '動名詞', weight: 2 }, { name: '使役動詞', weight: 2 }, { name: '不定詞', weight: 2 }, { name: '分詞構文', weight: 2 }] },
    { field: '構文', units: [{ name: '仮定法', weight: 3 }, { name: '関係副詞', weight: 2 }, { name: '比較', weight: 2 }, { name: '主語と動詞の一致', weight: 1 }] },
    { field: '語法・語彙', units: [{ name: '前置詞', weight: 2 }, { name: '語彙', weight: 3 }] },
    { field: '長文', units: [{ name: '長文読解', weight: 3 }] },
  ],
  理科: [
    { field: '物理', units: [{ name: '力と運動', weight: 3 }, { name: '電流と電圧', weight: 3 }, { name: '音', weight: 1 }, { name: '熱とエネルギー', weight: 2 }] },
    { field: '化学', units: [{ name: '化学式', weight: 2 }, { name: '原子の構造', weight: 2 }, { name: '水溶液の性質', weight: 2 }, { name: '中和', weight: 3 }, { name: '化学反応式', weight: 2 }] },
    { field: '生物', units: [{ name: '光合成', weight: 2 }, { name: '細胞', weight: 2 }, { name: '遺伝', weight: 3 }] },
    { field: '地学', units: [{ name: '太陽系', weight: 1 }, { name: '天気と気象', weight: 2 }] },
  ],
  社会: [
    { field: '歴史', units: [{ name: '飛鳥時代', weight: 2 }, { name: '鎌倉時代', weight: 2 }, { name: '江戸時代', weight: 3 }, { name: '近代ヨーロッパ', weight: 2 }, { name: '明治時代', weight: 3 }] },
    { field: '地理', units: [{ name: '日本の地理', weight: 3 }, { name: '世界の地理', weight: 2 }] },
    { field: '公民', units: [{ name: '日本国憲法', weight: 3 }, { name: '国会', weight: 2 }, { name: '政治のしくみ', weight: 2 }, { name: '市場経済', weight: 2 }] },
  ],
};
