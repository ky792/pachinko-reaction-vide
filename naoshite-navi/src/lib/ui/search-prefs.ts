import type { AreaId } from "@/lib/domain/config";
import type { SortKey } from "@/lib/domain/search";

/** 検索結果画面の選択状態（sessionStorage に保存し、戻る操作で復元する） */
export interface SearchPrefs {
  area: AreaId | "";
  maker: string;
  nowOnly: boolean;
  sort: SortKey;
  compare: string[];
}

export const searchPrefsKey = (category: string) => `search:${category}`;
export const defaultPrefs = (): SearchPrefs => ({
  area: "",
  maker: "",
  nowOnly: false,
  sort: "recommended",
  compare: [],
});

