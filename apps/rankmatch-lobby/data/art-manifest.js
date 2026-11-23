/* 本番の絵の登録表。画像を assets/territory/ に置いたら、ここに ID を足す（ART_SPEC.md 参照）。
 * 登録されていない ID は、コードで描いた仮の絵で表示される（404 を出さないため、存在する画像だけを登録する）。 */
window.ART_MANIFEST = {
  skin: ['skin_ja_goju', 'skin_ja_std', 'skin_ma_std', 'skin_en_std', 'skin_sc_std', 'skin_so_std', 'skin_ja_shoin', 'skin_ja_library', 'skin_ma_crystal', 'skin_ma_mobius', 'skin_ma_stairs', 'skin_en_castle', 'skin_en_bridge', 'skin_en_torch', 'skin_sc_obs', 'skin_sc_tesla', 'skin_sc_rocket', 'skin_so_tenshu', 'skin_so_arch', 'skin_so_light'],    // assets/territory/skins/{id}.webp      例: 'skin_ja_goju'
  base: ['base_std', 'base_garden', 'base_neon', 'base_marble', 'base_float', 'base_snow', 'base_desert', 'base_water'],    // assets/territory/bases/{id}.webp      例: 'base_water'
  garden: ['gd_sakura', 'gd_pine', 'gd_bamboo', 'gd_palm', 'gd_maple', 'gd_stonelamp', 'gd_rock', 'gd_torii', 'gd_fountain', 'gd_shelf', 'gd_board', 'gd_globe', 'gd_server', 'gd_telescope', 'gd_ja_suzuri', 'gd_ja_scroll', 'gd_ja_tanzaku', 'gd_ma_compass', 'gd_ma_solids', 'gd_ma_abacus', 'gd_en_mailbox', 'gd_en_dict', 'gd_en_sign', 'gd_sc_tubes', 'gd_sc_fossil', 'gd_sc_microscope', 'gd_so_armor', 'gd_so_cannon', 'gd_so_map'],  // assets/territory/garden/{id}.webp     例: 'gd_sakura'
  team: [],    // チーム色マスクがある ID（{id}_team.webp）。建物・台座・庭のどれでも可
};
