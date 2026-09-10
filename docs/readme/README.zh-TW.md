# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**原名 aeoptimize。** 專案自 `0.8.0` 起改名為 `geoptimize` 並延續同一份開發歷史。既有使用者可參考[遷移指南](../migrating-from-aeoptimize.md)。

`geoptimize` 是給靜態網站與技術文件使用的確定性內容就緒度檢查工具。它可以在本機、CI 或 pre-commit 階段檢查文件結構、量化主張的來源訊號、結構化資料、索引控制、metadata 品質與重複用語。

## 安裝與快速開始

需要 Node.js 22.12 或更新版本。

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` 產生版本化的內容就緒度分數。這個分數適合用來追蹤同一專案的回歸，不能當成搜尋排名、收錄、rich result 或 AI 引用機率。

## 可驗證的網站稽核

`audit` 檢查單一公開網址或本機 HTML、Markdown 檔案。`audit-site` 依明確頁數上限檢查同網域連結、robots、sitemap、canonical、重新導向與重複標題。`audit-build` 在部署前檢查建置後的 HTML。

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

每一項結果都會回報觀察證據與 `PASS`、`WARNING`、`FAIL` 或 `N/A`。檢查範圍以實際讀到的檔案、網址與頁數為準。

## SEO Experiment Ledger

SEO 實驗帳本和內容就緒度分數分開運作。它保存查詢、量測條件、頁面變更與後續檢討，並限制同一個 repository 同時只有一項實驗進入監測期。

```bash
geo seo init .
geo seo add . --keyword "能源管理系統整合" --page /services/ems/ --priority high
geo seo status .
```

帳本資料位於 `data/seo/queries.json`、`observations.json` 與 `experiments.json`。開始監測前應先部署頁面並讀回公開內容。完整流程請見 [SEO experiment ledger](../seo-experiment-ledger.md)。

## CI 與 GitHub Action

GitHub Action 預設提供建議性檢查。團隊接受基準後，可設定最低分數來阻擋回歸。

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON 是穩定的自動化介面。規則、證據分類與已知限制記錄於[方法文件](../methodology.md)。

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

套件提供 `/geo-scan`、`/geo-generate`、`/geo-transform` 與 `/seo-experiment-ledger`。

## 授權與完整文件

專案採用 MIT License。英文 [README](../../README.md) 保留完整命令、報表、plugin、Action contract、方法限制與 release integrity 說明。
