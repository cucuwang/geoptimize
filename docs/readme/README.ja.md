# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**旧称 aeoptimize。** バージョン `0.8.0` から `geoptimize` に改名し、同じプロジェクト履歴を継続しています。既存ユーザーは[移行ガイド](../migrating-from-aeoptimize.md)を参照してください。

`geoptimize` は、静的サイトと技術文書向けの決定論的なコンテンツ準備状況リンターです。文書構造、数値主張の出典シグナル、構造化データ、インデックス制御、metadata の品質、重複表現をローカル、CI、pre-commit で検査します。

## インストールとクイックスタート

Node.js 22.12 以降が必要です。

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` はバージョン管理されたコンテンツ準備状況スコアを返します。同じプロジェクト内の回帰検出に使う指標であり、検索順位、インデックス登録、rich result、AI からの引用確率を示すものではありません。

## 証拠を伴うサイト監査

`audit` は公開 URL またはローカルの HTML、Markdown ファイルを 1 件検査します。`audit-site` は明示したページ上限の範囲で、同一オリジンのリンク、robots、sitemap、canonical、リダイレクト、重複タイトルを検査します。`audit-build` はデプロイ前の生成済み HTML を検査します。

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

各結果には観測証拠と `PASS`、`WARNING`、`FAIL`、`N/A` が含まれます。適用範囲は、実際に読み取ったファイル、URL、ページ数に限定されます。

## SEO Experiment Ledger

SEO 実験台帳はコンテンツ準備状況スコアから独立しています。クエリ、測定条件、ページ変更、レビューを保存し、1 つの repository で同時に監視できる実験を 1 件に制限します。

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

台帳は `data/seo/queries.json`、`observations.json`、`experiments.json` に保存されます。監視期間を始める前にページをデプロイし、公開内容を確認してください。詳しくは [SEO experiment ledger](../seo-experiment-ledger.md) を参照してください。

## CI と GitHub Action

GitHub Action は既定で助言のみを行います。チームが基準値を確認した後、最低スコアを設定して回帰をブロックできます。

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON が安定した自動化インターフェースです。ルール、証拠区分、既知の制限は[方法論](../methodology.md)に記載されています。

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

パッケージには `/geo-scan`、`/geo-generate`、`/geo-transform`、`/seo-experiment-ledger` が含まれます。

## ライセンスと完全版ドキュメント

MIT License で提供します。すべてのコマンド、レポート、plugin、Action contract、方法上の制限、release integrity については英語版 [README](../../README.md) を参照してください。
