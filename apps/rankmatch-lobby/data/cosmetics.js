/* マイ陣地のカスタマイズ用アイテム。すべて見た目だけで、対戦の強さには一切影響しない。
 * 陣地の「持ち主の色」（自分＝ナビのテーマ色／相手＝相手ナビの色）は変えられない（対戦での判別性を守るため）。
 *
 * kind:  skin（科目ごとの建物） / base（台座） / deco（装飾・2つまで） / flag（旗の文字）
 * price: クリスタル（有償通貨）。0 は最初から所持
 * unlock: 学習の実績で無料開放（{ type, value, label }）。price と両方ある場合はどちらでも入手可 */
window.COSMETICS = {
  items: [
    // ---- 建物（科目ごと） ----
    { id: 'skin_ja_std', kind: 'skin', subject: '国語', name: '本の塔', price: 0 },
    { id: 'skin_ja_shoin', kind: 'skin', subject: '国語', name: '書院の塔', desc: '三層の屋根をもつ書庫。瓦が持ち主の色に光る', price: 300, rarity: 'epic' },
    { id: 'skin_ma_std', kind: 'skin', subject: '数学', name: '多面体の核', price: 0 },
    { id: 'skin_ma_crystal', kind: 'skin', subject: '数学', name: '結晶の尖塔', desc: '幾何学的な結晶が台座から突き出す', price: 300, rarity: 'epic' },
    { id: 'skin_en_std', kind: 'skin', subject: '英語', name: '時計塔と地球儀', price: 0 },
    { id: 'skin_en_castle', kind: 'skin', subject: '英語', name: '古城', desc: '四隅に塔を備えた城砦。旗がはためく', price: 300, rarity: 'epic' },
    { id: 'skin_sc_std', kind: 'skin', subject: '理科', name: '原子と実験器具', price: 0 },
    { id: 'skin_sc_obs', kind: 'skin', subject: '理科', name: '天文台', desc: '回転するドームと望遠鏡、パラボラアンテナ', price: 300, rarity: 'epic' },
    { id: 'skin_so_std', kind: 'skin', subject: '社会', name: '遺跡群', price: 0 },
    { id: 'skin_so_tenshu', kind: 'skin', subject: '社会', name: '天守閣', desc: '石垣の上にそびえる三層の天守', price: 300, rarity: 'epic' },
    // ---- 台座 ----
    { id: 'base_std', kind: 'base', name: '標準', price: 0 },
    { id: 'base_garden', kind: 'base', name: '庭園', desc: '木々と池のある台座', price: 200, rarity: 'rare', unlock: { type: 'streak', value: 7, label: '7日連続で学習' } },
    { id: 'base_neon', kind: 'base', name: 'ネオン', desc: '二重の光の縁と、光る柱', price: 200, rarity: 'rare' },
    { id: 'base_marble', kind: 'base', name: '白亜', desc: '白い石の台座と列柱', price: 250, rarity: 'rare' },
    // ---- 装飾 ----
    { id: 'deco_flag', kind: 'deco', name: '旗', desc: '旗の文字が陣地に立つ', price: 0 },
    { id: 'deco_lantern', kind: 'deco', name: '灯籠', desc: '陣地のまわりを光の灯籠が巡る', price: 150, rarity: 'rare', unlock: { type: 'train', value: 3, label: '演習を3セット' } },
    { id: 'deco_petals', kind: 'deco', name: '桜吹雪', desc: '花びらが舞い続ける', price: 180, rarity: 'rare' },
    { id: 'deco_halo', kind: 'deco', name: '天輪', desc: '陣地の上に大きな光の輪', price: 220, rarity: 'epic', unlock: { type: 'duel', value: 1, label: '直接対決で陣地を1回奪還' } },
  ],
  packs: [
    { id: 'p1', crystals: 60, yen: 120 },
    { id: 'p2', crystals: 320, yen: 610, bonus: '+20' },
    { id: 'p3', crystals: 680, yen: 1220, bonus: '+60' },
    { id: 'p4', crystals: 1400, yen: 2440, bonus: '+160' },
  ],
  /* 未成年の月額上限の例（業界で一般的な目安。実装時は法務確認のうえ決定） */
  limits: [{ label: '15歳以下', yen: 5000 }, { label: '16〜19歳', yen: 10000 }],
  defaults: {
    owned: ['skin_ja_std', 'skin_ma_std', 'skin_en_std', 'skin_sc_std', 'skin_so_std', 'base_std', 'deco_flag'],
    equip: { skins: { 国語: 'skin_ja_std', 数学: 'skin_ma_std', 英語: 'skin_en_std', 理科: 'skin_sc_std', 社会: 'skin_so_std' }, base: 'base_std', decos: ['deco_flag'], flag: '' },
  },
};
