/* 本番の絵の登録表。画像を assets/territory/ に置いたら、ここに ID を足す（ART_SPEC.md 参照）。
 * 登録されていない ID は、コードで描いた仮の絵で表示される（404 を出さないため、存在する画像だけを登録する）。 */
window.ART_MANIFEST = {
  skin: ['skin_ja_goju'],    // assets/territory/skins/{id}.png      例: 'skin_ja_goju'
  base: [],    // assets/territory/bases/{id}.png      例: 'base_water'
  garden: [],  // assets/territory/garden/{id}.png     例: 'gd_sakura'
  team: [],    // チーム色マスクがある ID（{id}_team.png）。建物・台座・庭のどれでも可
};
