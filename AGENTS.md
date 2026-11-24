# AGENTS.md

## 專案是什麼

`geoptimize` 是一個 deterministic 的內容品質 lint 工具：以 TypeScript 寫成的 CLI／npm 套件，在 CI 或 pre-commit 檢查文件與靜態網站的結構、引用訊號、JSON-LD、索引控制等問題，輸出 0–100 的 versioned readiness score。同時提供 GitHub composite Action（根目錄 `action.yml` + `action/`）、Vite／Next plugin（`src/plugins/`）與 Claude Code skills（`skills/`、`agents/`、`.claude-plugin/`）。分數是抓 regression 的啟發式指標，不預測排名或 AI 引用。

## 技術棧與目錄結構

- Node.js ≥22.12（engines），建議 Node 24；TypeScript strict、ESM（`"type": "module"`、`module: NodeNext`），本地 import 必須帶 `.js` 副檔名。
- `src/core/`：評分規則（`rules.ts`）、scanner、`audit`／`site-audit`／`static-audit`、generator、`visual-report`、SEO ledger、metrics／comparison、`types.ts`。
- `src/cli/`：commander CLI 入口（`index.ts`、互動模式 `interactive.ts`），建置後為 `dist/cli/index.js`（bin 名稱 `geoptimize`／`geo`／`geo-cli`）。
- `src/plugins/`：`vite.ts`、`next.ts` 整合，exports 為 `geoptimize/vite`、`geoptimize/next`。
- `action/`：composite Action 執行腳本 `run.sh` 與本地合約測試 `test-contract.sh`。
- `fixtures/v0.6/`：versioned rule corpus（`rule-corpus.ts`），release-contract 測試的依據。
- `examples/`：`github-action-sample`、`tutorial-static-site` 範例站。
- `scripts/`：release 驗證與打包腳本（`verify-*.sh`、`prepare-*.mjs`）及 `verify-visual-report.mjs`。
- `skills/`、`agents/`、`.claude-plugin/`：Claude Code 外掛的 SKILL.md 與 marketplace 中繼資料。
- `docs/`：方法論（`methodology.md`）、release notes、教學、多語 README；`.github/`：CI／release workflows 與 Action 測試 fixtures。

## 常用指令

以下皆在 macOS 沙箱（Node v24.21.0、npm 11.19.0）實跑過；括號為驗證結果。

- `npm ci`：安裝依賴。已實跑通過（102 packages、0 vulnerabilities）。
- `npm run build`（`tsc`，輸出 `dist/`）：已實跑通過。
- `npm test`（`vitest run`，583 tests）：已實跑失敗——581 通過、2 失敗，皆為環境因素而非程式缺陷：
  - `release-publication.test.ts` 的 `valid` 案例：子程序 `mktemp` 在 `/var/folders/.../T/` 被沙箱拒絕（`Operation not permitted`）。
  - `release-consumer.test.ts` 的 tarball 案例：完整套件並行跑時超過 5s timeout；單獨執行 `npx vitest run src/core/__tests__/release-consumer.test.ts` 通過。
- `npm run test:fuzz`（security-fuzz 測試）：已實跑通過（22 tests）。
- `npm run check`（`npm test && npm run build`）：已實跑失敗（同上 2 個測試）。
- `npm run dev`（`tsc --watch`）：已實跑失敗——`error starting FSEvents stream`，沙箱擋 macOS FSEvents；沙箱外應可用。
- `npm run release:check`（`scripts/verify-release-candidate.sh`）：已實跑失敗——第一步就是 `npm run check`，因上述測試而中止；腳本另要求乾淨 worktree（可用 `ALLOW_DIRTY_RELEASE_CHECK=1` 略過）與 `jq`。
- `bash action/test-contract.sh`：Action 合約測試，需先 `npm run build`；已實跑通過。
- `npm pack --dry-run`：已實跑通過（118 files，`geoptimize-0.12.0.tgz`）。
- `npm audit --audit-level=high`：已實跑通過（0 vulnerabilities）。
- `node dist/cli/index.js --version`：已實跑通過（輸出 `0.12.0`）。
- `node scripts/prepare-metrics-demo.mjs <空目錄>`：產生範例 JSON 與 HTML report；已實跑通過。
- `node scripts/verify-visual-report.mjs <目錄>`：沙箱無法驗證——透過 puppeteer-core 啟動 Chrome（可用 `GEO_CHROME` 指定路徑），本環境禁止啟動瀏覽器。
- `npm run test:watch`：watch 模式，未實跑（同受 FSEvents 限制）。
- `npm run prepublishOnly`：發布流程一環（跑 release 驗證腳本），不要手動執行。

## 修改慣例

- 檔名用 kebab-case（如 `site-metrics.ts`、`json-ld.ts`）；測試集中放在同層 `__tests__/` 目錄（`src/core/__tests__/`、`src/cli/__tests__/`），HTML／MD fixtures 放 `src/core/__tests__/fixtures/`。
- 新增評分規則必須依 `docs/methodology.md` 選 evidence class（A–D）：在 `src/core/rules.ts` 建穩定 rule ID 並註冊進 `allRules`，再到 `fixtures/v0.6/rule-corpus.ts` 補 `positive`／`negative`／`boundary` 案例（release-contract 測試會強制檢查）；Class D 不加進 scored corpus。
- 保持 deterministic 輸出；行為、相容性或方法論變更要更新 `CHANGELOG.md` 並在 PR 說明 JSON 契約影響（見 `CONTRIBUTING.md`）。
- 不可宣稱排名、引用、AI 可見度成效；fixture／範例不得放捏造的統計數字。
- `.github/workflows/` 與 `action.yml` 內的 action 依賴以 commit SHA pin 住並註解版本（如 `# v7.0.0`），新增時比照。

## 禁區與注意事項

- 發布管線勿擅自執行或修改：`.github/workflows/release.yml`（手動 publish、需 maintainer checklist）、`scripts/verify-*.sh`、`scripts/prepare-release-*.mjs`、`prepublishOnly` hook；`npm publish` 只能經由 GitHub workflow 由 maintainer 觸發。
- `action.yml`、`action/run.sh`、`.github/workflows/` 屬供應鏈敏感面，改動須過 `bash action/test-contract.sh` 與 CI 的 `action-contract` job。
- `docs/methodology.md` 與 `fixtures/v0.6/` 是 versioned 評分契約，規則更動需連同 evidence class 與 fixtures 一起改。
- `.gitignore` 已排除 `.env`、`.env.*`、`*.pem`、`*.key`、`dist/`、`node_modules/`、`*.tgz`；不要讀取或提交秘密檔與建置產物。
- 不得 commit `node_modules`、`dist`、tarball 或含私有 URL 的報告（`CONTRIBUTING.md`）。
- 掃描外部 URL 的 CLI 功能（`scan <url>`、`audit-site`）會發出網路請求；寫測試時優先用本地 fixture。

## 驗收方式

改完程式後依序確認：

1. `npm run build` 必須通過。
2. `npm test`；在本沙箱中前述 2 個環境性失敗可接受，其餘不得新增失敗。可用 `npx vitest run <測試檔>` 單跑。
3. `node dist/cli/index.js --version` 確認 CLI 可執行。
4. 動到 `action/` 或 `action.yml` 時跑 `bash action/test-contract.sh`。
5. 發布相關變更跑 `npm pack --dry-run` 與 `npm audit --audit-level=high`。
6. 新增／修改評分規則時，確認 `release-contract` 測試覆蓋新案例且文件（`docs/methodology.md`、`CHANGELOG.md`）同步。
