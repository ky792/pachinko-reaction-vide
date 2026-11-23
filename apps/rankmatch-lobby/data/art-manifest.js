/* 本番の絵の登録表。画像を assets/territory/ に置いたら、ここに ID を足す（ART_SPEC.md 参照）。
 * 登録されていない ID は、コードで描いた仮の絵で表示される（404 を出さないため、存在する画像だけを登録する）。 */
window.ART_MANIFEST = {
  skin: ['skin_ja_goju', 'skin_ja_std', 'skin_ma_std', 'skin_en_std', 'skin_sc_std', 'skin_so_std'],    // assets/territory/skins/{id}.png      例: 'skin_ja_goju'
  base: ['base_std', 'base_garden', 'base_neon', 'base_marble', 'base_float', 'base_snow', 'base_desert', 'base_water'],    // assets/territory/bases/{id}.png      例: 'base_water'
  garden: ['gd_sakura', 'gd_pine', 'gd_bamboo', 'gd_palm', 'gd_maple', 'gd_stonelamp', 'gd_rock', 'gd_torii', 'gd_fountain', 'gd_shelf', 'gd_board', 'gd_globe', 'gd_server', 'gd_telescope'],  // assets/territory/garden/{id}.png     例: 'gd_sakura'
  team: [],    // チーム色マスクがある ID（{id}_team.png）。建物・台座・庭のどれでも可
};
