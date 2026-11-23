/* プレイヤーの仮データ。本番ではAPIレスポンスに置き換える。 */
window.MOCK_PLAYER = {
  name: 'ソラ',
  id: 'SR-20481',
  season: { name: 'SEASON 03', week: 6, daysLeft: 11 },
  coins: 2340,
  crystals: 420,
  rank: {
    tier: 'B', division: '+', label: 'B+',
    rp: 1482, nextTier: 'A−', nextAt: 1600, floor: 1300,
    nationalPos: 4210, winStreak: 3,
  },
  level: { lv: 27, exp: 3420, next: 4500 },
  today: {
    minutes: 48, goalMinutes: 90,
    solved: 36, correct: 28,
    streakDays: 12,
    bySubject: [
      { name: '数学', minutes: 26 },
      { name: '英語', minutes: 14 },
      { name: '理科', minutes: 8 },
    ],
  },
  recommend: {
    subject: '数学', unit: '二次関数・平方完成',
    accuracy: 54, questions: 10, minutes: 12,
    rewardExp: 180,
  },
  match: { subject: '数学' },
  /* 学力ステータス：科目ごとに 速さ / 正確さ / 応用（0〜100）。演習で伸び、対戦（自動戦闘）の戦力になる */
  stats: {
    国語: { speed: 61, acc: 77, app: 56 },
    数学: { speed: 72, acc: 69, app: 63 },
    英語: { speed: 57, acc: 66, app: 59 },
    理科: { speed: 66, acc: 71, app: 52 },
    社会: { speed: 69, acc: 79, app: 47 },
  },
  focus: '社会', // 防衛時の主戦場
  tickets: { now: 3, max: 5 },
  defenseLog: [
    { name: 'ミナト', rank: 'B+', win: true, score: '3-1', rp: 8, ago: '2時間前' },
    { name: 'コハル', rank: 'A−', win: false, score: '2-3', rp: -6, ago: '5時間前' },
    { name: 'レン', rank: 'B', win: true, score: '3-0', rp: 5, ago: '昨日' },
  ],
  missions: [
    { id: 'm1', kind: 'DAILY', title: 'ランクマッチを3戦する', progress: 1, total: 3, reward: '120 EXP' },
    { id: 'm2', kind: 'DAILY', title: '数学で5問連続正解', progress: 3, total: 5, reward: '50 コイン' },
    { id: 'm3', kind: 'DAILY', title: '90分学習する', progress: 48, total: 90, reward: '結晶 ×5', unit: '分' },
    { id: 'm4', kind: 'WEEKLY', title: '英単語を300語復習', progress: 300, total: 300, reward: '称号「語彙の番人」', done: true },
  ],
};
