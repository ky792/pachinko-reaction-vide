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
  /* 立ち絵カード（10人の立ち絵シートから切り出したもの）。focus は顔の位置（%） */
  /* 表情差分：smile（笑顔）・special（固有）。serious（真剣）は通常の絵で代用 */
  const char = (id, focus, zoom) => ({ src: `assets/navigators/chars/${id}.webp`, w: 295, h: 500, focus, zoom,
    expr: { smile: `assets/navigators/chars/${id}_smile.webp`, special: `assets/navigators/chars/${id}_special.webp` } });

  window.NAV_DATA = {
    axes: ['分析', '共感', '熱量', '刺激', '探究'],
    expressions: { default: '通常', smile: '笑顔', serious: '真剣', special: '固有' },

    types: [
      {
        id: 'logic', advice: { name: '勝率最大化', desc: '勝率予測が最も高くなる陣地を、数字で選んで提案する' }, specialLabel: '思案', name: 'LOGIC', kana: 'ロジック', color: '#3D84FF', emblem: 'hex',
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
            visual: char('rei', [48, 21], 1),
            silhouette: { hair: 'short', accessory: 'glasses' },
            battleLines: { start: '勝率予測{rate}%。主戦場は{focus}が合理的だ。', areaWin: '{subject}、制圧。計算どおりだ。', areaLose: '{subject}を落とした。想定内だ、残りで取り返す。', win: '勝利だ。積み上げた数値が、そのまま戦力になった。', lose: '敗因は{weak}だ。数字が出た以上、対策は立てられる。', train: '記録更新。{subject}の学力が{gain}上がった。' },
            matchLines: { correct: '正解。{t}秒、悪くない。', wrong: '誤答。{unit}の確認が要るな。次で取り返せる。', streak: '{n}問連続。正答ペースが相手を上回った。', timeout: '時間切れだ。迷ったら消去法で2択まで絞れ。', win: '勝率予測を上回った。データは君の成長を示している。', lose: '敗因は明確だ。明確なら、直せる。' },
            portrait: null,
            lines: { lookup: '調べるのも一つの手段だ。ただし試験会場には持ち込めない。明日、自力で解けるかもう一度確かめよう。', morning: '朝は記憶の定着率が高い。暗記系から始めよう。', day: '今日の弱点は二次関数。そこから潰そう。', night: '残り40分で演習2セット。計算上、今日の目標に届く。', match: '相手の序盤正答率は68%。最初の3問で主導権を取れる。' },
          },
          f: {
            id: 'rize', name: 'リゼ', romaji: 'RIZE', title: '解析オペレーター',
            bio: 'ホロタブレットで学習ログを読み解く解析特化ナビ。淡々とした口調の裏で、誰より丁寧に記録を追っている。',
            catch: '誤答パターン、3つに分類できました。',
            visual: char('rize', [64, 18], 1),
            silhouette: { hair: 'sideTail', accessory: 'none' },
            battleLines: { start: '勝率は{rate}%です。{focus}に戦力を寄せるのを推奨します。', areaWin: '{subject}、確保しました。', areaLose: '{subject}、落としました。データは記録済みです。', win: '勝利です。防衛データとの差、はっきり出ました。', lose: '負けです。{weak}の差が決定打でした。', train: '{subject}の学力、+{gain}。順調です。' },
            matchLines: { correct: '正解です。{t}秒。', wrong: '誤答です。{unit}、記録に残しておきますね。', streak: '{n}問連続正解。このリズムを維持してください。', timeout: '時間切れです。次は8秒を目安に判断しましょう。', win: '勝利です。今日の解析データ、少しうれしい結果です。', lose: '負けです。でも誤答の傾向ははっきりしました。対策できます。' },
            portrait: null,
            lines: { lookup: '調べて解くのも学習法の一つです。ただ、本番には持ち込めません。解き方まで記録しておきましょう。', morning: 'おはようございます。昨日の誤答から3問、復習を用意しました。', day: '符号ミスが2日連続です。今日はそこだけ確認しましょう。', night: '今日の正答率は78%。目標まであと1セットです。', match: '相手は時間切れが多い傾向です。焦らず確実に。' },
          },
        },
      },
      {
        id: 'halo', advice: { name: '苦手を支える', desc: '自分の一番苦手な科目を主戦場にして、取りこぼしを防ぐ' }, specialLabel: '励まし', name: 'HALO', kana: 'ハロ', color: '#4FD96B', emblem: 'ring',
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
            visual: char('haru', [62, 18], 1),
            silhouette: { hair: 'messy', accessory: 'headset' },
            battleLines: { start: '勝率は{rate}%くらいか。{focus}で踏ん張れば十分いける。', areaWin: '{subject}、取ったな。いい流れだ。', areaLose: '{subject}は取られたか。大丈夫、まだ巻き返せる。', win: '勝ったな。毎日の勉強が、ちゃんと力になってる。', lose: '悔しいな。{weak}、明日から一緒に伸ばそう。', train: 'おつかれ。{subject}が+{gain}だ。積み上げてるな。' },
            matchLines: { correct: 'いいぞ、その調子だ。', wrong: '気にするな。{unit}はあとで一緒に見直そう。', streak: '{n}問連続か。積み上げが出てるな。', timeout: '時間切れか。焦らなくていい、次だ。', win: 'よくやったな。毎日の積み上げが勝たせたんだ。', lose: '悔しいな。でも、今日解けた問題は確実に増えてる。' },
            portrait: null,
            lines: { lookup: '調べて分かったなら、それも前進だ。でも本番はひとりで解く。解き方まで覚えて帰ろうな。', morning: 'おはよう。12日連続だな。今日も軽めに始めよう。', day: '昨日の続きからいこう。計画どおり進んでるぞ。', night: 'よく頑張ったな。あと1問だけやって、今日は休もう。', match: 'いつもどおりでいい。お前の積み上げは本物だ。' },
          },
          f: {
            id: 'mio', name: 'ミオ', romaji: 'MIO', title: '笑顔のクラスメイト',
            bio: '三つ編みに白い花を挿した、寄り添い型ナビ。小さな成長も見逃さず、いちばんに笑って喜んでくれる。',
            catch: '大丈夫、一緒にやればきっと伸びるよ！',
            visual: char('mio', [43, 18], 1),
            silhouette: { hair: 'twin', accessory: 'flower' },
            battleLines: { start: '勝率{rate}%だって！{focus}でがんばろうね。', areaWin: '{subject}取れたよ！やったね！', areaLose: '{subject}取られちゃった…でもまだいけるよ！', win: '勝ったー！勉強してきたこと、ちゃんと届いたね！', lose: 'くやしいね…。{weak}、いっしょに練習しよ？', train: '{subject}が+{gain}！えらいえらい！' },
            matchLines: { correct: 'やった！正解だよ！', wrong: '惜しい〜！{unit}、あとで一緒にやろうね。', streak: '{n}問連続！すごいすごい！', timeout: 'あっ、時間切れ…でも大丈夫、次いこ！', win: '勝ったー！がんばってきたの、ちゃんと出てたよ！', lose: '悔しいね…。でも、最後まで解いたのえらいよ。' },
            portrait: null,
            lines: { lookup: '調べて分かったなら、それも前進だよ！でも本番はひとりだから、解き方まで覚えて帰ろうね。', morning: 'おはよう！今日も来てくれてうれしいな。', day: 'あとちょっとで今日の目標だよ。一緒にがんばろ！', night: 'おつかれさま。今日の自分、ちゃんとほめてあげてね。', match: '大丈夫、ずっと見てたもん。いつもの君でいこう！' },
          },
        },
      },
      {
        id: 'ignite', advice: { name: '先鋒で流れをつかむ', desc: '最初に戦う陣地を主戦場にして、勢いをつける' }, specialLabel: '檄', name: 'IGNITE', kana: 'イグナイト', color: '#FF3D5A', emblem: 'star',
        tagline: '情熱で伸ばす、熱血コーチ。',
        traits: ['情熱', '行動力', '成長重視'],
        stats: [1, 3, 5, 3, 1],
        studyStyle: ['5分・10分の短時間タイムアタック', '連続正解で勢いをつける', 'ランクマッチを連戦して実戦で覚える'],
        fitFor: '机に向かうまでが重い、勢いで走りたい人',
        recommendPitch: '10問タイムアタック、自己ベスト更新いけるで！',
        characters: {
          m: {
            id: 'kaito', name: 'カイト', romaji: 'KAITO', title: '熱血コーチ',
            bio: '拳を突き上げて吠える、関西弁の熱血ナビ。理屈より行動。迷っている背中を全力で押してくる。',
            catch: 'まだいけるやろ！限界は、もうちょい先や！',
            visual: char('kaito', [48, 21], 1),
            silhouette: { hair: 'spiky', accessory: 'none' },
            battleLines: { start: '勝率{rate}%？上等や！{focus}で一気に押し切るで！', areaWin: '{subject}もろたで！', areaLose: '{subject}取られたか！次や次！', win: '勝ったで！勉強した分だけ強なっとる！', lose: 'くそっ、{weak}で負けた！演習で鍛え直すで！', train: '{subject}+{gain}！ええ汗かいたな！' },
            matchLines: { correct: 'よっしゃ！その勢いや！', wrong: 'まだまだ！次で取り返したらええ！', streak: '{n}連続！止まらんなあ！', timeout: '時間切れ！迷ったら飛び込め！', win: '勝ったで！お前の熱がスコアに出たな！', lose: '負けは燃料や！もう一戦いくで！' },
            portrait: null,
            lines: { lookup: '調べるのはアリや！けど本番にスマホは持ち込まれへんで。解き方、頭に叩き込んどけ！', morning: '朝イチの一問が一日を決めるんや！いくで！', day: '3連勝中やん！今日も全力でランク上げにいこか！', night: 'ラスト一戦！今日は勝って終わろうや！', match: '開幕ダッシュや！最初の一問で流れつかめ！' },
          },
          f: {
            id: 'akari', name: 'アカリ', romaji: 'AKARI', title: 'てっぺん志望の相棒',
            bio: 'ガッツポーズが似合う、負けず嫌いの熱血ナビ。目標はいつも一番上。一緒に走って、一緒に悔しがってくれる。',
            catch: 'やるからには、一番上までいこうよ！',
            visual: char('akari', [60, 27], 1),
            silhouette: { hair: 'sideTail', accessory: 'band' },
            battleLines: { start: '勝率{rate}%！{focus}で攻めていこう！', areaWin: '{subject}ゲット！この調子！', areaLose: '{subject}取られた〜！でも次は取る！', win: '勝ったー！このままランク駆け上がろ！', lose: 'くやしー！{weak}、特訓しよう！', train: '{subject}+{gain}！強くなってるよ！' },
            matchLines: { correct: 'ナイス！その調子！', wrong: 'ドンマイ！次は取ろう！', streak: '{n}問連続！このまま一番上まで！', timeout: '時間切れ〜！次はもっと速く！', win: '勝ったー！次はもっと上のランクいこうよ！', lose: 'くやしー！でも次は絶対勝てる！' },
            portrait: null,
            lines: { lookup: '調べるのもアリ！でも本番にスマホは持ち込めないよ。解き方ごと、自分のものにしちゃお！', morning: 'おはよ！今日も一番上目指していこう！', day: 'いい流れ来てる！このまま連続正解いっちゃお！', night: 'ラストスパート！あと10分だけ全力で！', match: '相手が格上？だからこそ燃えるんじゃん！' },
          },
        },
      },
      {
        id: 'vex', advice: { name: '得意を折る', desc: '相手が一番自信のある科目を主戦場にして、正面から崩す' }, specialLabel: '本気', name: 'VEX', kana: 'ヴェックス', color: '#A266FF', emblem: 'cross',
        tagline: '挑発×競争心。',
        traits: ['ライバル', '刺激', '成長加速'],
        stats: [3, 1, 3, 5, 2],
        studyStyle: ['ナビ自身がライバルとしてスコアで勝負', '同ランク帯の記録と常に比較', '負けた問題で即リベンジマッチ'],
        fitFor: '煽られると燃える、負けず嫌いな人',
        recommendPitch: 'この単元、同ランク帯の平均より12点低いけど。放っとくの？',
        characters: {
          m: {
            id: 'toma', name: 'トウマ', romaji: 'TOUMA', title: '毒舌のライバル',
            bio: '片耳のピアスと不敵な笑みがトレードマークの生意気なナビ。口は悪いが、本気で君の成長を望んでいる。',
            catch: '…まだその程度？マジで受験する気あんの？',
            expressionLabels: { default: '通常', smile: '挑発', serious: '本気' },
            visual: char('toma', [47, 20], 1),
            silhouette: { hair: 'swept', accessory: 'earring' },
            battleLines: { start: '勝率{rate}%。{focus}で殴れば勝てるんじゃない？知らないけど。', areaWin: '{subject}取ったね。ま、当然。', areaLose: '{subject}取られてんじゃん。だっさ。', win: '…勝ったか。ま、悪くなかったんじゃない。', lose: '{weak}で負けとか。演習サボってたでしょ。', train: '{subject}+{gain}。…ちょっとはマシになったじゃん。' },
            matchLines: { correct: 'へえ、それくらいは解けるんだ。', wrong: '…マジで？{unit}、基礎からやり直せば？', streak: '{n}連続？…まぐれじゃないなら続けてみなよ。', timeout: '時間切れとか。考えてる間に相手は進んでるけど。', win: '…ま、今日のところは認めてやるよ。', lose: 'その程度で終わる気？次は勝てよ。' },
            matchExpr: { wrong: 'smile', timeout: 'smile', lose: 'serious' },
            portrait: null,
            lines: { lookup: '…調べてきた？別にいいけど。本番じゃ誰も教えてくれねえぞ。覚えて帰れよ。', morning: '朝から来たんだ。眠そうな顔で勝てんの？', day: '昨日のスコア、半分の時間で出せるけど？', night: 'まだやんの？……ま、付き合ってやるよ。', match: '相手はA−。格上だけど、まさか逃げないよな？' },
          },
          f: {
            id: 'ruka', name: 'ルカ', romaji: 'RUKA', title: 'からかい上手のライバル',
            bio: '猫耳フードに風船ガムの小悪魔系ナビ。からかうのが趣味だけど、負けると本気で悔しがる。たまに照れる。',
            catch: 'ふーん、やるじゃん？…でも、次は絶対負けないから。',
            expressionLabels: { default: '通常', smile: 'からかい', special: '照れ（レア）' },
            visual: char('ruka', [52, 22], 1),
            silhouette: { hair: 'long', accessory: 'horns' },
            battleLines: { start: '勝率{rate}%だって。{focus}で勝負してみたら？', areaWin: '{subject}取ったじゃん。ふーん。', areaLose: '{subject}取られちゃった〜。どうするの？', win: '勝ったね。……ちょっとだけ、かっこよかったかも。', lose: '{weak}で負けたね。次も負けたら笑っちゃうよ？', train: '{subject}+{gain}。ふーん、がんばったじゃん。' },
            matchLines: { correct: 'ふーん、やるじゃん？', wrong: 'あれれ〜？{unit}、苦手なんだ？', streak: '{n}問連続……ちょっとだけ、すごいかも。', timeout: 'ぼーっとしてた？かわいいね。', win: '……べ、別に。おめでと。', lose: 'あーあ、負けちゃった。次はちゃんと勝ってよね。' },
            matchExpr: { wrong: 'smile', timeout: 'smile', win: 'special' },
            portrait: null,
            lines: { lookup: 'へえ、調べてきたんだ？…ま、覚えて帰るならいいけど。本番じゃ誰も教えてくれないよ？', morning: 'おはよ。今日こそ私のスコア、抜けるかな？', day: '連勝中？ふーん、まぐれじゃないなら証明してみて。', night: 'もう終わり？私はまだ余裕だけど。', match: '負けたら罰ゲームね。……冗談。半分だけ。' },
          },
        },
      },
      {
        id: 'echo', advice: { name: '拮抗点を読む', desc: '戦力が最も拮抗している陣地を主戦場にして、勝負を分ける' }, specialLabel: '思索', name: 'ECHO', kana: 'エコー', color: '#EBB740', emblem: 'eye',
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
            visual: char('noel', [54, 19], 1),
            silhouette: { hair: 'messy', accessory: 'none' },
            battleLines: { start: '勝率はおよそ{rate}%。{focus}を主戦場にするのが理にかなっています。', areaWin: '{subject}を得ました。理解の厚みが勝ちましたね。', areaLose: '{subject}を失いました。原因を考えるのは後にしましょう。', win: '勝利です。知識は、使ってこそ力になりますね。', lose: '{weak}の差が出ましたね。そこに次の学びがあります。', train: '{subject}の学力が{gain}深まりました。' },
            matchLines: { correct: '正解です。考え方の筋が通っていますね。', wrong: '惜しいですね。{unit}の定義に戻ってみましょう。', streak: '{n}問連続。理解が線でつながってきました。', timeout: '時間切れです。条件を一つずつ拾う練習をしましょう。', win: '見事です。勝利は理解の深さの証明ですね。', lose: '負けにも意味があります。どこで迷ったかを一緒に辿りましょう。' },
            portrait: null,
            lines: { lookup: '答えを知ることと、解けることは別のものです。なぜそうなるのか、一度自分でたどってみましょう。', morning: 'おはようございます。今朝は定義の確認から始めましょう。', day: '昨日の解法は、別の単元にも通じていますね。', night: '今日学んだことを、一文で説明できますか。', match: '問題文を最後まで。答えは構造の中にあります。' },
          },
          f: {
            id: 'sera', name: 'セラ', romaji: 'SERA', title: '好奇心の探究者',
            bio: '頬杖をついて考えを転がす、遊び心のある探究型ナビ。答えを教えるより、君の考え方そのものを面白がって深掘りする。',
            catch: '…面白いね。その考え方、もっと深掘りしてみようか。',
            visual: char('sera', [57, 24], 1),
            silhouette: { hair: 'sideTail', accessory: 'flower' },
            battleLines: { start: '勝率{rate}%。{focus}で勝負したら面白そうじゃない？', areaWin: '{subject}、取れたね。いい読み。', areaLose: '{subject}取られちゃった。相手、そこ強いんだね。', win: '勝ったね。どの陣地がいちばん楽しかった？', lose: '{weak}で負けたね。そこ、伸びしろの塊だよ。', train: '{subject}+{gain}。考え方、広がってきたね。' },
            matchLines: { correct: '正解。…ね、なんでそう思ったの？', wrong: 'へえ、そっちを選んだんだ。{unit}、ちょっと深掘りしてみよっか。', streak: '{n}問連続。面白くなってきたね。', timeout: '時間切れ。考えすぎちゃった？それも悪くないよ。', win: '勝ったね。でも、いちばん面白かった問題はどれ？', lose: '負けちゃったね。間違えた問題、実は宝の山だよ。' },
            portrait: null,
            lines: { lookup: '調べるのも探究のうちだね。でも試験には持ち込めない。…どうしてそうなるか、自分の言葉で説明できる？', morning: 'おはよ。今日はどんな「なんで？」が見つかるかな。', day: 'その間違い、実はいい線いってるよ。どこで分かれたと思う？', night: '寝る前に一個だけ。今日いちばん不思議だったことは？', match: '勝ち負けもいいけど、知らない問題に会えるのが楽しみだね。' },
          },
        },
      },
    ],
  };
  /* 表情ラベル：キャラ固有 > タイプ固有（special）> 共通 */
  window.NAV_DATA.types.forEach((t) => ['m', 'f'].forEach((g) => {
    const c = t.characters[g];
    c.expressionLabels = Object.assign({ special: t.specialLabel }, c.expressionLabels || {});
  }));
})();
