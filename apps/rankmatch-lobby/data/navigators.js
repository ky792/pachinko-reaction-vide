/* キャラクターデータ。UIはこのファイルの内容だけを読んで描画する。
 *
 * 画像の扱い（優先順）
 *   1. portrait : 背景透過の単独立ち絵（未制作）。用意できたら
 *                 { default: 'assets/navigators/halo/mio/default.png', smile: ..., serious: ..., special: ... } を入れる。
 *   2. visual   : タイプ紹介キービジュアルからの「切り出し表示」。画像自体は加工せず、
 *                 focus（顔の位置を画像幅・高さに対する%で）と zoom で見せる範囲を決める。
 *                 w/h は元画像の解像度。キービジュアルは立ち絵の代わりではなく暫定表示。
 *   3. silhouette : 画像が読めないときのホログラム（髪型・小物で描き分け）。
 */
(function () {
  const KV = {
    logic: { src: 'assets/navigators/logic.png', w: 1672, h: 941 },
    halo: { src: 'assets/navigators/halo.png', w: 835, h: 316 },
    ignite: { src: 'assets/navigators/ignite.png', w: 1672, h: 941 },
    vex: { src: 'assets/navigators/vex.png', w: 1672, h: 941 },
    echo: { src: 'assets/navigators/echo.png', w: 1672, h: 315 },
  };
  const visual = (type, focus, zoom) => Object.assign({}, KV[type], { focus, zoom });

  window.NAV_DATA = {
    axes: ['分析', '共感', '熱量', '刺激', '探究'],
    expressions: { default: '通常', smile: '笑顔', serious: '真剣', special: '固有' },

    types: [
      {
        id: 'logic', name: 'LOGIC', kana: 'ロジック', color: '#3D84FF', emblem: 'hex', keyVisual: KV.logic,
        tagline: '分析で勝つ、知の戦略家。',
        traits: ['論理的・分析的', '効率重視', '計画的に成長を導く'],
        stats: [5, 2, 2, 1, 3],
        studyStyle: ['弱点単元を特定して集中演習', '正答率・解答時間をグラフで振り返る', '試験日から逆算した学習計画'],
        fitFor: '感情より数字で、効率よく点を伸ばしたい人',
        recommendPitch: '正答率が最も低い単元です。ここを上げるのが最短です。',
        characters: {
          m: {
            id: 'rei', name: 'レイ', romaji: 'REI', title: '知の戦略家',
            bio: '眼鏡の奥で常に最適解を計算している参謀型ナビ。感情に流されず、合格までの最短手順だけを提示する。',
            catch: '感情じゃなく、データで考えよう。',
            visual: visual('logic', [41, 22], 1.75),
            silhouette: { hair: 'short', accessory: 'glasses' },
            portrait: null,
            lines: { morning: '朝は記憶の定着率が高い。暗記系から始めよう。', day: '今日の弱点は二次関数。そこから潰そう。', night: '残り40分で演習2セット。計算上、今日の目標に届く。', match: '相手の序盤正答率は68%。最初の3問で主導権を取れる。' },
          },
          f: {
            id: 'rize', name: 'リゼ', romaji: 'RIZE', title: '解析オペレーター',
            bio: 'ホロタブレットで学習ログを読み解く解析特化ナビ。淡々とした口調の裏で、誰より丁寧に記録を追っている。',
            catch: '誤答パターン、3つに分類できました。',
            visual: visual('logic', [68, 37], 1.75),
            silhouette: { hair: 'sideTail', accessory: 'none' },
            portrait: null,
            lines: { morning: 'おはようございます。昨日の誤答から3問、復習を用意しました。', day: '符号ミスが2日連続です。今日はそこだけ確認しましょう。', night: '今日の正答率は78%。目標まであと1セットです。', match: '相手は時間切れが多い傾向です。焦らず確実に。' },
          },
        },
      },
      {
        id: 'halo', name: 'HALO', kana: 'ハロ', color: '#4FD96B', emblem: 'ring', keyVisual: KV.halo,
        tagline: 'ともに進む、やさしい伴走者。',
        traits: ['やさしく親身', 'モチベーション維持', '継続をサポート'],
        stats: [2, 5, 3, 1, 2],
        studyStyle: ['毎日少しずつ続ける習慣化サポート', '忘れかけた問題をタイミングよく復習', '小さな達成を記録してほめる'],
        fitFor: '続けるのが苦手で、まず習慣を作りたい人',
        recommendPitch: '3日前に解いた問題、そろそろ忘れる頃だよ。今なら定着する。',
        characters: {
          m: {
            id: 'haru', name: 'ハル', romaji: 'HARU', title: '手を差しのべる先輩',
            bio: '首にヘッドホンをかけた、面倒見のいい先輩型ナビ。無理な詰め込みはさせず、隣で計画を立てて最後まで付き合う。',
            catch: '焦らなくていい。俺がペースを見てるから。',
            visual: visual('halo', [45, 25], 1.05),
            silhouette: { hair: 'messy', accessory: 'headset' },
            portrait: null,
            lines: { morning: 'おはよう。12日連続だな。今日も軽めに始めよう。', day: '昨日の続きからいこう。計画どおり進んでるぞ。', night: 'よく頑張ったな。あと1問だけやって、今日は休もう。', match: 'いつもどおりでいい。お前の積み上げは本物だ。' },
          },
          f: {
            id: 'mio', name: 'ミオ', romaji: 'MIO', title: '笑顔のクラスメイト',
            bio: '三つ編みに白い花を挿した、寄り添い型ナビ。小さな成長も見逃さず、いちばんに笑って喜んでくれる。',
            catch: '大丈夫、一緒にやればきっと伸びるよ！',
            visual: visual('halo', [60, 33], 1.05),
            silhouette: { hair: 'twin', accessory: 'flower' },
            portrait: null,
            lines: { morning: 'おはよう！今日も来てくれてうれしいな。', day: 'あとちょっとで今日の目標だよ。一緒にがんばろ！', night: 'おつかれさま。今日の自分、ちゃんとほめてあげてね。', match: '大丈夫、ずっと見てたもん。いつもの君でいこう！' },
          },
        },
      },
      {
        id: 'ignite', name: 'IGNITE', kana: 'イグナイト', color: '#FF3D5A', emblem: 'star', keyVisual: KV.ignite,
        tagline: '情熱で伸ばす、熱血コーチ。',
        traits: ['情熱', '行動力', '成長重視'],
        stats: [1, 3, 5, 3, 1],
        studyStyle: ['5分・10分の短時間タイムアタック', '連続正解で勢いをつける', 'ランクマッチを連戦して実戦で覚える'],
        fitFor: '机に向かうまでが重い、勢いで走りたい人',
        recommendPitch: '10問タイムアタック、自己ベスト更新いけるで！',
        characters: {
          m: {
            id: 'kaito', name: 'カイト', romaji: 'KAITO', title: '熱血コーチ',
            bio: '指をさして限界の先を示す、関西弁の熱血ナビ。理屈より行動。迷っている背中を全力で押してくる。',
            catch: 'まだいけるやろ！限界は、もうちょい先や！',
            visual: visual('ignite', [25, 21], 1.6),
            silhouette: { hair: 'spiky', accessory: 'none' },
            portrait: null,
            lines: { morning: '朝イチの一問が一日を決めるんや！いくで！', day: '3連勝中やん！今日も全力でランク上げにいこか！', night: 'ラスト一戦！今日は勝って終わろうや！', match: '開幕ダッシュや！最初の一問で流れつかめ！' },
          },
          f: {
            id: 'akari', name: 'アカリ', romaji: 'AKARI', title: 'てっぺん志望の相棒',
            bio: 'ガッツポーズが似合う、負けず嫌いの熱血ナビ。目標はいつも一番上。一緒に走って、一緒に悔しがってくれる。',
            catch: 'やるからには、一番上までいこうよ！',
            visual: visual('ignite', [50, 34], 1.6),
            silhouette: { hair: 'sideTail', accessory: 'band' },
            portrait: null,
            lines: { morning: 'おはよ！今日も一番上目指していこう！', day: 'いい流れ来てる！このまま連続正解いっちゃお！', night: 'ラストスパート！あと10分だけ全力で！', match: '相手が格上？だからこそ燃えるんじゃん！' },
          },
        },
      },
      {
        id: 'vex', name: 'VEX', kana: 'ヴェックス', color: '#A266FF', emblem: 'cross', keyVisual: KV.vex,
        tagline: '挑発×競争心。',
        traits: ['ライバル', '刺激', '成長加速'],
        stats: [3, 1, 3, 5, 2],
        studyStyle: ['ナビ自身がライバルとしてスコアで勝負', '同ランク帯の記録と常に比較', '負けた問題で即リベンジマッチ'],
        fitFor: '煽られると燃える、負けず嫌いな人',
        recommendPitch: 'この単元、同ランク帯の平均より12点低いけど。放っとくの？',
        characters: {
          m: {
            id: 'toma', name: 'トウマ', romaji: 'TOUMA', title: '毒舌のライバル',
            bio: 'ヘッドホンと指輪がトレードマークの生意気なナビ。口は悪いが、本気で君の成長を望んでいる。',
            catch: '…まだその程度？マジで受験する気あんの？',
            expressionLabels: { default: '通常', smile: '挑発', serious: '本気' },
            visual: visual('vex', [18, 19], 1.6),
            silhouette: { hair: 'swept', accessory: 'earring' },
            portrait: null,
            lines: { morning: '朝から来たんだ。眠そうな顔で勝てんの？', day: '昨日のスコア、半分の時間で出せるけど？', night: 'まだやんの？……ま、付き合ってやるよ。', match: '相手はA−。格上だけど、まさか逃げないよな？' },
          },
          f: {
            id: 'ruka', name: 'ルカ', romaji: 'RUKA', title: 'からかい上手のライバル',
            bio: 'お団子ヘアとチョーカーの小悪魔系ナビ。からかうのが趣味だけど、負けると本気で悔しがる。たまに照れる。',
            catch: 'ふーん、やるじゃん？…でも、次は絶対負けないから。',
            expressionLabels: { default: '通常', smile: 'からかい', special: '照れ（レア）' },
            visual: visual('vex', [85, 28], 1.95),
            silhouette: { hair: 'twin', accessory: 'earring' },
            portrait: null,
            lines: { morning: 'おはよ。今日こそ私のスコア、抜けるかな？', day: '連勝中？ふーん、まぐれじゃないなら証明してみて。', night: 'もう終わり？私はまだ余裕だけど。', match: '負けたら罰ゲームね。……冗談。半分だけ。' },
          },
        },
      },
      {
        id: 'echo', name: 'ECHO', kana: 'エコー', color: '#EBB740', emblem: 'eye', keyVisual: KV.echo,
        tagline: '知の深淵から、新たな視点を。',
        traits: ['博学・探究心', '多角的な思考', '新しい視点の提示'],
        stats: [4, 2, 1, 1, 5],
        studyStyle: ['公式の成り立ちから理解する', '1問を深掘りして応用問題につなげる', '別解・記述で考えを言葉にする'],
        fitFor: '暗記より「わかる」快感で伸びたい人',
        recommendPitch: 'この問い、昨日の三角比と同じ構造をしています。',
        characters: {
          m: {
            id: 'noel', name: 'ノエル', romaji: 'NOEL', title: '書を携えた哲学者',
            bio: '黄金の星図が浮かぶ本を手にした、物静かな哲学者型ナビ。丁寧な語り口で、公式の背後にある理屈を一つずつ解き明かす。',
            catch: '覚える前に、なぜそうなるのかを見てみましょう。',
            visual: visual('echo', [44, 30], 1.05),
            silhouette: { hair: 'messy', accessory: 'none' },
            portrait: null,
            lines: { morning: 'おはようございます。今朝は定義の確認から始めましょう。', day: '昨日の解法は、別の単元にも通じていますね。', night: '今日学んだことを、一文で説明できますか。', match: '問題文を最後まで。答えは構造の中にあります。' },
          },
          f: {
            id: 'sera', name: 'セラ', romaji: 'SERA', title: '好奇心の探究者',
            bio: '頬杖をついて考えを転がす、遊び心のある探究型ナビ。答えを教えるより、君の考え方そのものを面白がって深掘りする。',
            catch: '…面白いね。その考え方、もっと深掘りしてみようか。',
            visual: visual('echo', [65, 33], 1.05),
            silhouette: { hair: 'sideTail', accessory: 'flower' },
            portrait: null,
            lines: { morning: 'おはよ。今日はどんな「なんで？」が見つかるかな。', day: 'その間違い、実はいい線いってるよ。どこで分かれたと思う？', night: '寝る前に一個だけ。今日いちばん不思議だったことは？', match: '勝ち負けもいいけど、知らない問題に会えるのが楽しみだね。' },
          },
        },
      },
    ],
  };
})();
