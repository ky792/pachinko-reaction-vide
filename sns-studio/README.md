# SNSコンテンツ制作・承認システム（デモ）

記事・商品情報から SNS 投稿案を複数作り、**人が承認したものだけ**を投稿用の文章として出力するデモです。
副業の営業用ポートフォリオとして、このリポジトリの他のコード（ナギバク制作）とは独立して動きます。

- **無料**：既定はテンプレート生成。依存パッケージ・APIキー・サーバー不要（Node.js 18+ の標準機能のみ）
- **自動投稿しない**：SNSへ送信する機能を持たず、承認後に本文が変わった案は出力しない
- **スマホで操作**：Google Sheets アプリ（チェックとプルダウンだけ）／スマホ幅のWeb画面
- **AIは任意・費用を明示**：CLI で `--ai --confirm-cost` を付けたときだけ Claude API を使う（従量課金）

## すぐ試す

```bash
cd sns-studio
node cli.js demo     # サンプル2件 → 18案 → 承認・差戻し・修正 → 承認済だけ出力（work/demo/）
npm test             # 生成物の鮮度チェック＋テスト（Playwright があればスマホ幅のブラウザテストも）
```

Web画面は `web/index.html` を開くだけ。Google Sheets 版の設置は [docs/MANUAL.md](docs/MANUAL.md) の A を参照。

## 資料

| ファイル | 内容 |
|----------|------|
| [docs/PLAN.md](docs/PLAN.md) | 実装計画・要件との対応・不足機能・費用 |
| [docs/MANUAL.md](docs/MANUAL.md) | 利用マニュアル（Sheets／Web／CLI／AI） |
| [docs/SALES_ONE_PAGER.md](docs/SALES_ONE_PAGER.md) | 1ページの営業資料 |
| [docs/DEMO_STEPS.md](docs/DEMO_STEPS.md) | 商談でのデモ操作手順（5分） |

## 構成

```
core/sns-core.js     生成・チェック・承認・出力・CSV（通信なし。Node/ブラウザ/Apps Script共通）
core/templates.json  文面テンプレートとNGワード
core/ai-adapter.js   任意のAI生成（Node専用・費用確認必須）
cli.js               CLI
build.js             web/index.html と apps_script/Core.gs を生成（node build.js）
web/                 スマホ向けWeb画面（app.template.html → index.html）
apps_script/         Google Sheets 用（Code.gs ＋ 生成された Core.gs）
samples/             固定のサンプル入力（架空の店舗・商品）
test/                テスト（固定出力のスナップショット、Sheets の模擬実行、ブラウザ操作）
```

GitHub Actions：`.github/workflows/sns-studio.yml`（`sns-studio/` の変更時と手動実行のみ。シークレット不要）
