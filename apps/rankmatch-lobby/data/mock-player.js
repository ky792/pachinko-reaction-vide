/* プレイヤーの仮データ。本番ではAPIレスポンスに置き換える。 */
window.MOCK_PLAYER = {
  name: 'ソラ',
  id: 'SR-20481',
  season: { name: 'SEASON 03', week: 6, daysLeft: 11 },
  coins: 2340,
  crystals: 85,
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
  match: { queue: 1287, estOpponent: 'B+〜A−', subject: '数学' },
  missions: [
    { id: 'm1', kind: 'DAILY', title: 'ランクマッチを3戦する', progress: 1, total: 3, reward: '120 EXP' },
    { id: 'm2', kind: 'DAILY', title: '数学で5問連続正解', progress: 3, total: 5, reward: '50 コイン' },
    { id: 'm3', kind: 'DAILY', title: '90分学習する', progress: 48, total: 90, reward: '結晶 ×5', unit: '分' },
    { id: 'm4', kind: 'WEEKLY', title: '英単語を300語復習', progress: 300, total: 300, reward: '称号「語彙の番人」', done: true },
  ],
};
