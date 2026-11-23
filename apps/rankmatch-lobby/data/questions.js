/* 問題データ（仮）。answer は choices の添字。出題時に選択肢の順番はシャッフルされる。
 * difficulty: 1=基礎 2=標準 3=応用。unit は誤答分析・おすすめ学習に使う。 */
window.QUESTION_BANK = [
  // ---------- 数学 ----------
  { id: 'ma01', subject: '数学', unit: '二次関数・平方完成', difficulty: 2, q: 'y = x² − 6x + 5 の頂点の座標は？', choices: ['(3, −4)', '(3, 4)', '(−3, −4)', '(6, 5)'], answer: 0, explain: 'y = (x − 3)² − 4 と平方完成できるので、頂点は (3, −4)。' },
  { id: 'ma02', subject: '数学', unit: '二次方程式', difficulty: 1, q: 'x² − 5x + 6 = 0 の解は？', choices: ['x = 2, 3', 'x = −2, −3', 'x = 1, 6', 'x = −1, 6'], answer: 0, explain: '(x − 2)(x − 3) = 0 と因数分解できるので x = 2, 3。' },
  { id: 'ma03', subject: '数学', unit: '二次関数・判別式', difficulty: 2, q: 'x² + 4x + k = 0 が重解をもつとき、k の値は？', choices: ['4', '2', '−4', '16'], answer: 0, explain: '判別式 D = 16 − 4k = 0 より k = 4。' },
  { id: 'ma04', subject: '数学', unit: '三角比', difficulty: 1, q: 'sin 30° の値は？', choices: ['1/2', '√3/2', '√2/2', '1'], answer: 0, explain: '30°・60°・90° の直角三角形の辺の比 1 : √3 : 2 から、sin 30° = 1/2。' },
  { id: 'ma05', subject: '数学', unit: '対数', difficulty: 1, q: 'log₂ 8 の値は？', choices: ['3', '4', '2', '8'], answer: 0, explain: '2³ = 8 なので log₂ 8 = 3。' },
  { id: 'ma06', subject: '数学', unit: '数列', difficulty: 1, q: '1 から 10 までの自然数の和は？', choices: ['55', '50', '45', '100'], answer: 0, explain: 'n(n + 1)/2 に n = 10 を代入して 10 × 11 / 2 = 55。' },
  { id: 'ma07', subject: '数学', unit: '数列', difficulty: 2, q: '初項 3、公差 4 の等差数列の第 10 項は？', choices: ['39', '43', '40', '36'], answer: 0, explain: '一般項 aₙ = 3 + (n − 1) × 4 より、a₁₀ = 3 + 36 = 39。' },
  { id: 'ma08', subject: '数学', unit: '確率', difficulty: 2, q: '大小 2 つのサイコロを投げて、目の和が 7 になる確率は？', choices: ['1/6', '7/36', '1/12', '5/36'], answer: 0, explain: '和が 7 になるのは (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) の 6 通り。6/36 = 1/6。' },
  { id: 'ma09', subject: '数学', unit: '微分', difficulty: 2, q: 'f(x) = x³ を微分した f′(x) は？', choices: ['3x²', 'x²', '3x³', 'x⁴/4'], answer: 0, explain: '(xⁿ)′ = nxⁿ⁻¹ より、(x³)′ = 3x²。' },
  { id: 'ma10', subject: '数学', unit: '場合の数', difficulty: 1, q: '5 人の中から 2 人を選ぶ組合せは何通り？', choices: ['10 通り', '20 通り', '25 通り', '5 通り'], answer: 0, explain: '₅C₂ = (5 × 4) / (2 × 1) = 10 通り。並べ方の ₅P₂ = 20 と区別する。' },
  { id: 'ma11', subject: '数学', unit: '一次関数', difficulty: 1, q: '直線 y = 2x + 1 に平行で、点 (0, −3) を通る直線は？', choices: ['y = 2x − 3', 'y = −2x − 3', 'y = 2x + 3', 'y = −x/2 − 3'], answer: 0, explain: '平行なので傾きは同じ 2。y 切片が −3 なので y = 2x − 3。' },
  { id: 'ma12', subject: '数学', unit: '不等式', difficulty: 1, q: '不等式 2x − 3 > 5 の解は？', choices: ['x > 4', 'x > 1', 'x < 4', 'x > 8'], answer: 0, explain: '2x > 8 より x > 4。正の数で割るので不等号の向きは変わらない。' },

  // ---------- 英語 ----------
  { id: 'en01', subject: '英語', unit: '現在完了', difficulty: 1, q: 'I have lived here (   ) 2015.', choices: ['since', 'for', 'from', 'during'], answer: 0, explain: '起点となる時点（2015 年）の前は since。期間（five years など）なら for。' },
  { id: 'en02', subject: '英語', unit: '仮定法', difficulty: 2, q: 'If I (   ) a bird, I could fly to you.', choices: ['were', 'am', 'will be', 'have been'], answer: 0, explain: '現在の事実に反する仮定は仮定法過去。be 動詞は主語に関係なく were が基本。' },
  { id: 'en03', subject: '英語', unit: '前置詞', difficulty: 1, q: 'She is interested (   ) science.', choices: ['in', 'on', 'at', 'with'], answer: 0, explain: 'be interested in ～ で「～に興味がある」。' },
  { id: 'en04', subject: '英語', unit: '語彙', difficulty: 1, q: '“increase” の反対の意味の語は？', choices: ['decrease', 'improve', 'include', 'expand'], answer: 0, explain: 'increase（増える）⇔ decrease（減る）。' },
  { id: 'en05', subject: '英語', unit: '使役動詞', difficulty: 2, q: 'My mother made me (   ) my room.', choices: ['clean', 'to clean', 'cleaning', 'cleaned'], answer: 0, explain: '使役動詞 make は「make + 人 + 動詞の原形」。to は付けない。' },
  { id: 'en06', subject: '英語', unit: '受動態', difficulty: 1, q: 'This book (   ) by many people around the world.', choices: ['is read', 'reads', 'is reading', 'has read'], answer: 0, explain: '本は「読まれる」側なので受動態 be + 過去分詞。' },
  { id: 'en07', subject: '英語', unit: '語彙', difficulty: 2, q: '“abandon” の意味として最も適切なものは？', choices: ['見捨てる・放棄する', '受け入れる', '借りる', '強調する'], answer: 0, explain: 'abandon は「（計画・場所・人などを）見捨てる、放棄する」。' },
  { id: 'en08', subject: '英語', unit: '関係副詞', difficulty: 2, q: 'This is the house (   ) I was born.', choices: ['where', 'which', 'what', 'whose'], answer: 0, explain: '後ろが I was born で完全な文なので、場所を表す関係副詞 where。which なら in which になる。' },
  { id: 'en09', subject: '英語', unit: '比較', difficulty: 1, q: 'This bag is (   ) than that one.', choices: ['more expensive', 'expensiver', 'most expensive', 'as expensive'], answer: 0, explain: 'expensive のような長い形容詞の比較級は more + 原級。' },
  { id: 'en10', subject: '英語', unit: '動名詞', difficulty: 2, q: 'I am looking forward to (   ) you again.', choices: ['seeing', 'see', 'saw', 'be seen'], answer: 0, explain: 'look forward to の to は前置詞なので、後ろは動名詞 seeing。' },
  { id: 'en11', subject: '英語', unit: '主語と動詞の一致', difficulty: 3, q: 'Neither he nor I (   ) ready for the test.', choices: ['am', 'are', 'is', 'be'], answer: 0, explain: 'neither A nor B が主語のとき、動詞は B（近いほう）に合わせる。B = I なので am。' },
  { id: 'en12', subject: '英語', unit: '語彙', difficulty: 2, q: '“consequence” の意味として最も適切なものは？', choices: ['結果・影響', '原因', '良心', '一致'], answer: 0, explain: 'consequence は「（ある行動の）結果、影響」。as a consequence で「その結果」。' },

  // ---------- 理科 ----------
  { id: 'sc01', subject: '理科', unit: '化学式', difficulty: 1, q: '水の化学式は？', choices: ['H₂O', 'HO₂', 'H₂O₂', 'OH'], answer: 0, explain: '水は水素原子 2 個と酸素原子 1 個からなる。H₂O₂ は過酸化水素。' },
  { id: 'sc02', subject: '理科', unit: '光合成', difficulty: 1, q: '植物が光合成でとり入れる気体は？', choices: ['二酸化炭素', '酸素', '窒素', '水素'], answer: 0, explain: '光合成は二酸化炭素と水から、光のエネルギーでデンプンなどをつくり、酸素を出す。' },
  { id: 'sc03', subject: '理科', unit: '電流と電圧', difficulty: 1, q: '3 Ω の抵抗に 2 A の電流が流れているとき、電圧は？', choices: ['6 V', '1.5 V', '5 V', '0.67 V'], answer: 0, explain: 'オームの法則 V = RI より、3 × 2 = 6 V。' },
  { id: 'sc04', subject: '理科', unit: '太陽系', difficulty: 1, q: '太陽系で最も大きい惑星は？', choices: ['木星', '土星', '地球', '海王星'], answer: 0, explain: '木星の直径は地球の約 11 倍で、太陽系最大の惑星。' },
  { id: 'sc05', subject: '理科', unit: '水溶液の性質', difficulty: 1, q: '酸性の水溶液に BTB 溶液を加えると何色になる？', choices: ['黄色', '緑色', '青色', '赤色'], answer: 0, explain: 'BTB 溶液は酸性で黄色、中性で緑色、アルカリ性で青色。' },
  { id: 'sc06', subject: '理科', unit: '力と運動', difficulty: 2, q: '地表付近の重力加速度の大きさはおよそいくら？', choices: ['9.8 m/s²', '1.6 m/s²', '98 m/s²', '3.0 m/s²'], answer: 0, explain: '地表付近では約 9.8 m/s²。1.6 m/s² はおよそ月面の値。' },
  { id: 'sc07', subject: '理科', unit: '原子の構造', difficulty: 2, q: '原子番号 6 の元素は？', choices: ['炭素', '窒素', '酸素', 'ホウ素'], answer: 0, explain: '原子番号は陽子の数。H, He, Li, Be, B, C … の 6 番目が炭素。' },
  { id: 'sc08', subject: '理科', unit: '細胞', difficulty: 2, q: '細胞内で呼吸を行い、エネルギーをとり出すはたらきをもつのは？', choices: ['ミトコンドリア', '葉緑体', '核', '細胞壁'], answer: 0, explain: 'ミトコンドリアは酸素を使って有機物を分解し、エネルギー（ATP）をとり出す。' },
  { id: 'sc09', subject: '理科', unit: '力と運動', difficulty: 1, q: '速さ 20 m/s で等速直線運動する物体は、5 秒間で何 m 進む？', choices: ['100 m', '4 m', '25 m', '15 m'], answer: 0, explain: '距離 = 速さ × 時間 = 20 × 5 = 100 m。' },
  { id: 'sc10', subject: '理科', unit: '中和', difficulty: 2, q: '塩酸と水酸化ナトリウム水溶液を中和させると、何ができる？', choices: ['塩化ナトリウムと水', '水素と酸素', '塩素と水', '炭酸ナトリウムと水'], answer: 0, explain: 'HCl + NaOH → NaCl + H₂O。酸とアルカリから塩（えん）と水ができる。' },
  { id: 'sc11', subject: '理科', unit: '遺伝', difficulty: 2, q: 'DNA の塩基で、アデニン（A）と対になるのは？', choices: ['チミン（T）', 'グアニン（G）', 'シトシン（C）', 'ウラシル（U）'], answer: 0, explain: 'DNA では A と T、G と C が対になる。ウラシルは RNA の塩基。' },
  { id: 'sc12', subject: '理科', unit: '音', difficulty: 1, q: '空気中を伝わる音の速さはおよそいくら？', choices: ['340 m/s', '34 m/s', '3,400 m/s', '30 万 km/s'], answer: 0, explain: '常温の空気中で約 340 m/s。30 万 km/s は光の速さ。' },

  // ---------- 社会 ----------
  { id: 'so01', subject: '社会', unit: '鎌倉時代', difficulty: 1, q: '鎌倉幕府を開いた人物は？', choices: ['源頼朝', '足利尊氏', '平清盛', '徳川家康'], answer: 0, explain: '源頼朝は 1192 年に征夷大将軍となり、鎌倉に幕府を開いた（守護・地頭の設置は 1185 年）。' },
  { id: 'so02', subject: '社会', unit: '日本国憲法', difficulty: 2, q: '日本国憲法が施行されたのは何年？', choices: ['1947 年', '1946 年', '1945 年', '1951 年'], answer: 0, explain: '1946 年 11 月 3 日に公布、1947 年 5 月 3 日に施行。公布と施行を区別する。' },
  { id: 'so03', subject: '社会', unit: '日本の地理', difficulty: 1, q: '日本で最も長い川は？', choices: ['信濃川', '利根川', '石狩川', '北上川'], answer: 0, explain: '信濃川は約 367 km で日本最長。流域面積が最大なのは利根川。' },
  { id: 'so04', subject: '社会', unit: '政治のしくみ', difficulty: 2, q: '著書『法の精神』で三権分立を説いたのは？', choices: ['モンテスキュー', 'ルソー', 'ロック', 'ホッブズ'], answer: 0, explain: 'モンテスキューは『法の精神』で立法・行政・司法の三権分立を主張した。' },
  { id: 'so05', subject: '社会', unit: '飛鳥時代', difficulty: 1, q: '大化の改新が始まった年は？', choices: ['645 年', '710 年', '593 年', '794 年'], answer: 0, explain: '645 年、中大兄皇子と中臣鎌足が蘇我氏を倒して政治改革を始めた。710 年は平城京遷都。' },
  { id: 'so06', subject: '社会', unit: '国会', difficulty: 1, q: '衆議院議員の任期は何年？', choices: ['4 年', '6 年', '3 年', '5 年'], answer: 0, explain: '衆議院は任期 4 年で解散がある。参議院は任期 6 年で解散がなく、3 年ごとに半数を改選。' },
  { id: 'so07', subject: '社会', unit: '世界の地理', difficulty: 1, q: '世界で最も面積が大きい国は？', choices: ['ロシア', 'カナダ', '中国', 'アメリカ'], answer: 0, explain: 'ロシアの面積は約 1,710 万 km²で世界最大。2 位はカナダ。' },
  { id: 'so08', subject: '社会', unit: '江戸時代', difficulty: 1, q: '江戸幕府の最後の将軍は？', choices: ['徳川慶喜', '徳川家茂', '徳川吉宗', '徳川綱吉'], answer: 0, explain: '15 代将軍徳川慶喜が 1867 年に大政奉還を行った。' },
  { id: 'so09', subject: '社会', unit: '世界の地理', difficulty: 2, q: '経度 0 度の本初子午線が通る都市は？', choices: ['ロンドン', 'パリ', 'ニューヨーク', 'ローマ'], answer: 0, explain: 'ロンドン郊外のグリニッジ天文台を通る経線が経度 0 度。' },
  { id: 'so10', subject: '社会', unit: '市場経済', difficulty: 2, q: 'ほかの条件が同じとき、商品の価格が上がると需要量は一般にどうなる？', choices: ['減る', '増える', '変わらない', 'ゼロになる'], answer: 0, explain: '需要曲線は右下がり。価格が上がると買いたい量（需要量）は減る。' },
  { id: 'so11', subject: '社会', unit: '国会', difficulty: 1, q: '参議院議員の任期は何年？', choices: ['6 年', '4 年', '3 年', '5 年'], answer: 0, explain: '参議院は任期 6 年。3 年ごとに半数ずつ選挙で入れかわる。' },
  { id: 'so12', subject: '社会', unit: '近代ヨーロッパ', difficulty: 1, q: '1789 年に始まった革命は？', choices: ['フランス革命', '名誉革命', 'ロシア革命', 'アメリカ独立革命'], answer: 0, explain: '1789 年、バスティーユ牢獄の襲撃からフランス革命が始まり、人権宣言が出された。' },
];
