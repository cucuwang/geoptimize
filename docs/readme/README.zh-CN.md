# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**原名 aeoptimize。** 项目从 `0.8.0` 起更名为 `geoptimize`，并延续同一份开发历史。现有用户可参考[迁移指南](../migrating-from-aeoptimize.md)。

`geoptimize` 是面向静态网站和技术文档的确定性内容就绪度检查工具。它可以在本地、CI 或 pre-commit 阶段检查文档结构、量化主张的来源信号、结构化数据、索引控制、metadata 质量和重复用语。

## 安装与快速开始

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

`scan` 会生成版本化的内容就绪度分数。该分数适合跟踪同一项目的回归，不能用作搜索排名、收录、rich result 或 AI 引用概率。

## 可验证的网站审计

`audit` 检查单个公开网址或本地 HTML、Markdown 文件。`audit-site` 按明确的页数上限检查同域链接、robots、sitemap、canonical、重定向和重复标题。`audit-build` 在部署前检查构建后的 HTML。

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

每项结果都会返回观测证据以及 `PASS`、`WARNING`、`FAIL` 或 `N/A`。检查范围以实际读取到的文件、网址和页数为准。

## SEO Experiment Ledger

SEO 实验账本与内容就绪度分数分开运行。它保存查询、测量条件、页面修改和后续复盘，并限制同一个 repository 同时只有一项实验进入监测期。

```bash
geo seo init .
geo seo add . --keyword "能源管理系统集成" --page /services/ems/ --priority high
geo seo status .
```

账本数据位于 `data/seo/queries.json`、`observations.json` 和 `experiments.json`。开始监测前应先部署页面并读回公开内容。完整流程请参阅 [SEO experiment ledger](../seo-experiment-ledger.md)。

## CI 与 GitHub Action

GitHub Action 默认提供建议性检查。团队接受基准后，可以设置最低分数来阻止回归。

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON 是稳定的自动化接口。规则、证据分类和已知限制记录在[方法文档](../methodology.md)中。

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

软件包提供 `/geo-scan`、`/geo-generate`、`/geo-transform` 和 `/seo-experiment-ledger`。

## 许可证与完整文档

项目使用 MIT License。英文 [README](../../README.md) 保留完整命令、报表、plugin、Action contract、方法限制和 release integrity 说明。
