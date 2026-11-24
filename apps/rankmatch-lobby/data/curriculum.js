/* カリキュラム（大学入学共通テスト準拠）：科目（陣地）› 分野 › 単元。weight は共通テストでの出題頻度（1〜3）。
 * 単元名は問題データの unit と一致させる。問題がまだない単元は自動で「問題準備中」になり、
 * 学力の計算（正確さ・範囲）からは外れる。問題を足せばそのまま計算に入る。
 *
 * 陣地は 5 つ（国語・数学・英語・理科・社会）。理科と社会は選択制で、分野の track が選択科目。
 *   理科：基礎 4 科目から 2 つ（共通テストの「基礎 2 科目」）
 *   社会（地歴公民）：4 科目から 1〜2 つ
 * 選んでいない科目の単元は、その人の陣地には含まれない。 */
window.CURRICULUM = {
  国語: [
    { field: '現代文', units: [{ name: '評論読解', weight: 3 }, { name: '小説読解', weight: 3 }, { name: '漢字の読み', weight: 2 }, { name: '漢字の書き', weight: 2 }, { name: '語彙', weight: 2 }, { name: '慣用句', weight: 1 }, { name: '四字熟語', weight: 1 }, { name: '文学史', weight: 1 }] },
    { field: '古文', units: [{ name: '古文単語', weight: 3 }, { name: '古典文法', weight: 3 }, { name: '敬語', weight: 2 }] },
    { field: '漢文', units: [{ name: '漢文の句法', weight: 3 }] },
  ],
  数学: [
    { field: '数学I', units: [{ name: '式の展開と因数分解', weight: 2 }, { name: '不等式', weight: 2 }, { name: '二次関数・平方完成', weight: 3 }, { name: '二次関数・判別式', weight: 3 }, { name: '三角比', weight: 3 }, { name: '正弦定理・余弦定理', weight: 3 }, { name: 'データの分析', weight: 2 }] },
    { field: '数学A', units: [{ name: '場合の数', weight: 2 }, { name: '確率', weight: 3 }, { name: '図形の性質', weight: 2 }, { name: '整数の性質', weight: 1 }] },
    { field: '数学II', units: [{ name: '二次方程式', weight: 2 }, { name: '図形と方程式', weight: 2 }, { name: '三角関数', weight: 3 }, { name: '指数関数', weight: 2 }, { name: '対数', weight: 2 }, { name: '微分', weight: 3 }, { name: '積分', weight: 3 }] },
    { field: '数学B・C', units: [{ name: '数列', weight: 3 }, { name: '漸化式', weight: 2 }, { name: '統計的な推測', weight: 2 }, { name: 'ベクトル', weight: 3 }] },
  ],
  英語: [
    { field: '読解', units: [{ name: '長文読解', weight: 3 }, { name: '掲示・広告の読み取り', weight: 2 }, { name: '語彙', weight: 3 }] },
    { field: '時制・態', units: [{ name: '現在完了', weight: 2 }, { name: '受動態', weight: 2 }] },
    { field: '準動詞', units: [{ name: '不定詞', weight: 2 }, { name: '動名詞', weight: 2 }, { name: '分詞構文', weight: 2 }, { name: '使役動詞', weight: 2 }] },
    { field: '構文・語法', units: [{ name: '仮定法', weight: 2 }, { name: '関係副詞', weight: 2 }, { name: '比較', weight: 2 }, { name: '前置詞', weight: 2 }, { name: '主語と動詞の一致', weight: 1 }] },
  ],
  理科: [
    { field: '物理基礎', track: '物理基礎', units: [{ name: '力と運動', weight: 3 }, { name: '電流と電圧', weight: 3 }, { name: '熱とエネルギー', weight: 2 }, { name: '波と音', weight: 2 }] },
    { field: '化学基礎', track: '化学基礎', units: [{ name: '原子の構造', weight: 2 }, { name: '化学式', weight: 2 }, { name: '化学反応式', weight: 2 }, { name: '水溶液の性質', weight: 2 }, { name: '中和', weight: 3 }, { name: '酸化還元', weight: 2 }] },
    { field: '生物基礎', track: '生物基礎', units: [{ name: '細胞', weight: 2 }, { name: '光合成', weight: 2 }, { name: '遺伝', weight: 3 }, { name: '体内環境', weight: 3 }, { name: '生態系と環境', weight: 2 }] },
    { field: '地学基礎', track: '地学基礎', units: [{ name: '地球の構造とプレート', weight: 3 }, { name: '岩石と地層', weight: 2 }, { name: '天気と気象', weight: 2 }, { name: '太陽系', weight: 1 }] },
  ],
  社会: [
    { field: '日本史', track: '日本史探究', units: [{ name: '飛鳥時代', weight: 2 }, { name: '奈良・平安時代', weight: 2 }, { name: '鎌倉時代', weight: 2 }, { name: '室町・戦国時代', weight: 2 }, { name: '江戸時代', weight: 3 }, { name: '明治時代', weight: 3 }, { name: '大正・昭和時代', weight: 3 }] },
    { field: '世界史', track: '世界史探究', units: [{ name: '古代・中世ヨーロッパ', weight: 2 }, { name: '中国史', weight: 3 }, { name: '近代ヨーロッパ', weight: 2 }, { name: '現代の世界', weight: 2 }] },
    { field: '地理', track: '地理探究', units: [{ name: '地形と気候', weight: 3 }, { name: '日本の地理', weight: 3 }, { name: '世界の地理', weight: 2 }, { name: '産業と資源', weight: 2 }] },
    { field: '公共・政経', track: '公共・政治経済', units: [{ name: '日本国憲法', weight: 3 }, { name: '国会', weight: 2 }, { name: '政治のしくみ', weight: 2 }, { name: '市場経済', weight: 2 }, { name: '国際政治・経済', weight: 2 }] },
  ],
};

/* 選択科目。min〜max 個選ぶ。def は初期値 */
window.ELECTIVES = {
  理科: { label: '理科（基礎）', options: ['物理基礎', '化学基礎', '生物基礎', '地学基礎'], min: 2, max: 2, def: ['化学基礎', '生物基礎'] },
  社会: { label: '地歴公民', options: ['日本史探究', '世界史探究', '地理探究', '公共・政治経済'], min: 1, max: 2, def: ['日本史探究'] },
};

/* 旧カリキュラムの単元の移し先（問題データと学習記録の両方に適用）。null は共通テストで問われないので外す */
window.UNIT_REMAP = {
  '国語/ことわざ': '慣用句',
  '国語/品詞': null,
  '国語/助詞・助動詞': null,
  '数学/一次関数': '図形と方程式',
  '理科/音': '波と音',
};

/* 選択科目を反映したカリキュラムを返す（選択外の track の分野を除く） */
window.curriculumFor = function (electives) {
  const out = {};
  Object.keys(window.CURRICULUM).forEach((s) => {
    const pick = (electives && electives[s]) || (window.ELECTIVES[s] && window.ELECTIVES[s].def);
    out[s] = window.CURRICULUM[s].filter((f) => !f.track || (pick || []).includes(f.track));
  });
  return out;
};

/* 問題データに UNIT_REMAP を適用（外す単元の問題は取り除く） */
window.remapBank = function (bank) {
  for (let i = bank.length - 1; i >= 0; i--) {
    const k = bank[i].subject + '/' + bank[i].unit;
    if (!(k in window.UNIT_REMAP)) continue;
    if (window.UNIT_REMAP[k] === null) bank.splice(i, 1);
    else bank[i].unit = window.UNIT_REMAP[k];
  }
  return bank;
};

/* 科目の固定色（戦闘・演習・知識データ・マイ陣地・ロボットのどこでも同じ色で科目を見分ける）。
   チーム色（自分＝ナビのタイプ色、相手＝相手の色）とは別物で、科目の名札・タブ・陣地の札に使う */
window.SUBJECT_COLOR = { 国語: '#FF6B8B', 数学: '#4DA3FF', 英語: '#FFC53D', 理科: '#3DDC97', 社会: '#FF9A4D' };

/* 受験型（科目セット）。対戦は同じ受験型の相手と組み、受験型に入らない科目の陣地は「対象外」で戦わない。
   陣地の数は 5 のまま（地図も 5 つ）。対象の陣地のうち過半数を取った側が勝ち（5 教科なら 3、3 教科なら 2） */
window.EXAM_SETS = {
  all: { label: '国公立（5教科）', short: '国公立', subjects: ['国語', '数学', '英語', '理科', '社会'] },
  bun: { label: '私大文系（国・英・社）', short: '私大文系', subjects: ['国語', '英語', '社会'] },
  ri: { label: '私大理系（数・英・理）', short: '私大理系', subjects: ['数学', '英語', '理科'] },
};
