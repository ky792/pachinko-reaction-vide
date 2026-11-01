# なおしてナビ（Phase 1 デモ）

鹿児島市の飲食店・食品販売店向け、業務用冷蔵庫・冷凍庫・コールドテーブルの修理業者マッチングサービス。

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

1. `/request` で依頼（STEP3 の「ダミーの連絡先を入力する」を使用）
2. `/vendor` で「（デモ）さくら冷機サービス」を選び、新着案件を受諾 → 対応開始 → 完了報告
3. `/request/...` の進捗画面に担当業者が表示される（別タブで開いておくと自動反映）
4. `/admin` で依頼・業者審査・手数料を確認。「デモデータを初期化」で元に戻せます

## 構成

```
src/
  app/                 画面（App Router）
  components/          共通UI
  lib/domain/          業務ロジック（純粋関数・Phase 2 でも再利用）
    config.ts          料率・上限・設備・地域などの設定値
    matching.ts        業者候補の抽出
    workflow.ts        状態遷移・二重マッチング防止・権限検査
    access.ts          役割別の表示データ（個人情報の絞り込み・マスク）
    fee.ts             手数料計算
    validation.ts      入力検証（zod）
  lib/demo/            【ダミー】ブラウザ内ストアとシードデータ（Phase 2 で置換）
tests/                 ユニットテスト
e2e/                   Playwright スモークテスト
supabase/migrations/   DB スキーマ・RLS ドラフト（未適用）
```
