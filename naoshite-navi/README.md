# なおしてナビ（Phase 1 デモ）

鹿児島市の飲食店・食品販売店向け、業務用冷蔵・冷凍設備と製氷機の修理業者マッチングサービス（MVP v1.1）。

> **Phase 1 はデモです。** データはブラウザの localStorage にのみ保存され、送信・外部通知・課金は一切行いません。
> 実在の個人情報は入力しないでください。

- 計画・実装区分・未実装・必要な設定 → [docs/PLAN.md](docs/PLAN.md)
- DB 設計ドラフト（未適用）→ [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)

## 起動

```bash
cd naoshite-navi
npm ci
npm run dev        # http://localhost:3000
```

環境変数は Phase 1 では不要です（Phase 2 用のひな形は `.env.example`）。

## 確認コマンド

```bash
npm run typecheck  # 型チェック
npm run lint       # ESLint
npm test           # ユニットテスト（vitest）
npm run build      # 本番ビルド
npm run check      # 上記すべて

# スマホ幅の E2E（Playwright が必要）
npm run build && npx next start -p 3000 &
BASE_URL=http://localhost:3000 npm run e2e
```

## デモの試し方

1. トップで「製氷機」→「氷ができない」をタップ（検索結果が出る）
2. 地域・メーカーで絞り込み、「比較に追加」で2〜3社を選んで「比較する」
3. 業者名からプロフィールを開き、「この業者に依頼する」（指名）か、結果画面の「おまかせで依頼する」
4. フォームで「ダミーの連絡先を入力する」→ 確認 → 同意して送信 → 受付状況画面へ
5. `/vendor` で業者を選び、案件を受諾・辞退・完了報告（指名を辞退すると、受付状況画面で「おまかせ」に切り替えられます）
6. `/admin` で状況変更・業者審査・手数料を確認。「デモデータを初期化」で元に戻せます

## プレビュー

ローカル：上記「起動」のとおり `npm run dev` → スマホ実機で見る場合は同じ Wi-Fi で `npx next dev -H 0.0.0.0` を実行し、`http://<PCのIP>:3000` を開く。

Vercel（プレビュー）：Vercel で本リポジトリを Import し、**Root Directory を `naoshite-navi`** にして Deploy。
環境変数は不要です。作業ブランチへのプッシュで Preview URL が発行されます（本番ドメインの設定は承認後）。

## 専用リポジトリへの移行

```bash
# 元リポジトリで naoshite-navi/ の履歴だけを切り出す
git subtree split --prefix=naoshite-navi -b naoshite-navi-only
# 空の新リポジトリ（例: ky792/naoshite-navi）を GitHub で作成してから
git push https://github.com/ky792/naoshite-navi.git naoshite-navi-only:main
```
移行後は `.github/workflows/naoshite-navi.yml` の `working-directory` と `paths` を外してルートで動かします。

## 構成

```
src/
  app/                 画面（App Router）
  components/          共通UI
  lib/domain/          業務ロジック（純粋関数・Phase 2 でも再利用）
    config.ts          料率・上限・設備カテゴリ・症状・メーカー・地域
    matching.ts        おまかせマッチングの候補抽出
    search.ts          店舗向けの業者検索（公開情報のみ）
    workflow.ts        状態遷移・二重マッチング防止・権限検査
    access.ts          役割別の表示データ（個人情報の絞り込み・マスク）
    fee.ts             手数料計算
    validation.ts      入力検証（zod）
  lib/demo/            【ダミー】ブラウザ内ストア・シードデータ・画面状態の保持（Phase 2 で置換）
  content/articles.ts  お役立ち記事
tests/                 ユニットテスト
e2e/                   Playwright スモークテスト
supabase/migrations/   DB スキーマ・RLS ドラフト（未適用）
```
