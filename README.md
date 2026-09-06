# aeoptimize

[![npm version](https://img.shields.io/npm/v/aeoptimize.svg)](https://www.npmjs.com/package/aeoptimize)
[![CI](https://github.com/cucuwang/aeoptimize/actions/workflows/ci.yml/badge.svg)](https://github.com/cucuwang/aeoptimize/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/aeoptimize.svg)](https://github.com/cucuwang/aeoptimize/blob/main/LICENSE)

**AI crawlers read your pages before humans do. Lint them like code.**

`aeoptimize` is a deterministic content-readiness lint for static websites and documentation. It checks reproducible properties such as document structure, sourced quantitative claims, structured-data hygiene, indexing controls, metadata quality, and repetitive wording — locally, in CI, or pre-commit.

![aeoptimize terminal demo](docs/assets/demo.gif)

It does **not** predict ranking, indexing, rich results, Google AI Overviews, or citation by ChatGPT, Perplexity, or another AI system. Google states that its AI search features need no special AI text file or schema, and valid structured data does not guarantee a search feature. See [methodology and limitations](docs/methodology.md).

## Quick start

Requires Node.js 22.12 or newer.

```bash
npm install --save-dev aeoptimize
```

```bash
npx aeoptimize scan https://example.com
npx aeoptimize scan ./dist --dir
npx aeoptimize scan ./dist --dir --json
npx aeoptimize audit https://example.com --json
```

Example output:

```text
Content Readiness Report
Score: 71/100

Structure        20/25
Citability       18/25
Schema           16/20
AI Metadata      10/15
Content Density   7/15
```

The score is a versioned heuristic for catching regressions within the same project. Do not treat it as a percentage chance of search or AI visibility, and do not compare unrelated sites as if it were an outcome metric.

## What is scored

| Dimension | Max | Scope |
| --- | ---: | --- |
| Structure | 25 | Document outline and readability heuristics |
| Citability | 25 | Claim specificity, source signals, definitions, attribution |
| Schema | 20 | JSON-LD structural hygiene when present; absence is not penalized |
| AI Metadata | 15 | Page-level indexing control and description quality |
| Content Density | 15 | Content/boilerplate and repetition heuristics |

Two often-promoted AEO signals are deliberately excluded from the score:

- FAQ content and `FAQPage` schema are optional. The generator does not infer FAQ schema from question headings.
- `llms.txt` is an experimental proposal. Generating or publishing it does not add points.

Every rule, its evidence class, and known false-positive boundary is documented in [docs/methodology.md](docs/methodology.md) and exercised by the [versioned public fixture corpus](fixtures/v0.6/rule-corpus.ts).

## Evidence-backed page audit

`audit` inspects one public URL or one local HTML/Markdown file. It is a separate, versioned contract and does not change the v0.6 readiness score or `scan --json` output.

```bash
npx aeoptimize audit https://example.com
npx aeoptimize audit ./dist/index.html --json
```

The first audit contract checks:

- HTTP status, final URL, and redirect evidence for URL targets;
- document title, meta description, headings, language, canonical, and page-level robots directives;
- discovered links, image alt attributes, and JSON-LD structural validity.

Each check returns `PASS`, `WARNING`, `FAIL`, or `N/A`, the observed evidence, an explanation, an optional remediation, and a validation step. `PASS` is bounded to the inspected evidence. It does not establish ranking, indexing, rich-result display, traffic, conversion, or AI citation.

The command intentionally reports unavailable site-wide and external measurements as limitations. It does not infer robots.txt policy, sitemap membership, hreflang reciprocity, broken-link status, Core Web Vitals, analytics, or actual search-engine index state from one page.

## How it compares

| | aeoptimize | Lighthouse-style SEO audits | Hosted AEO/GEO platforms |
| --- | --- | --- | --- |
| Question it answers | Is this content machine-readable and citable? | Does the page pass classic SEO checks? | Did my AI visibility change this week? |
| Deterministic | Yes — versioned rules, fixture-tested | Partially | No — model output varies run to run |
| Runs where | Local CLI, CI, pre-commit hook, Vite/Next plugins | Browser / DevTools | Vendor cloud |
| Blocks regressions in CI | Yes, via a stable `--json` contract | Possible with extra wiring | Rarely |
| Cost | Free, MIT | Free | Typically $95+/mo |

Visibility trackers answer "did rankings change?". aeoptimize answers the question you can act on in a pull request: "is this page ready?". The two compose rather than compete.

## CI contract

`--json` is the stable automation surface. A non-zero threshold is useful only after your team reviews the baseline and accepts the current methodology version.

```bash
npx aeoptimize scan ./dist --dir --json > aeoptimize-report.json
node -e "const r=require('./aeoptimize-report.json'); process.exit(r.overall.total < 60 ? 1 : 0)"
```

The v0.6 GitHub Action is advisory by default. Consume it from the repository pin until it appears on GitHub Marketplace (Marketplace listing is a checkbox on a GitHub Release, not an extra package). It reports findings without blocking the workflow:

```yaml
- uses: cucuwang/aeoptimize@v0.6.2
  with:
    path: dist
```

Projects can explicitly choose blocking mode after accepting a baseline:

```yaml
- uses: cucuwang/aeoptimize@v0.6.2
  with:
    path: dist
    fail-on-low-score: 'true'
    min-score: '60'
```

The Action exposes `score` and `report` outputs in both modes. Its release is reproducible only when the Action tag and matching npm package version both exist. Before pinning a version, verify both artifacts; if either is missing, use the CLI directly.

A copyable advisory workflow and controlled input are available in the [end-to-end Action sample](examples/github-action-sample/README.md).

## Audit built HTML before deployment

The `audit-build` command checks a local HTML file or build directory and reports evidence,
remediation and validation for each finding. It leaves the existing `scan` score and
JSON contract unchanged.

```bash
npx aeoptimize audit-build ./dist --json
npx aeoptimize audit-build ./dist --base-url https://example.com/ --expect-indexable --fail-on-error --json > audit.json
```

Malformed JSON-LD and invalid or multiple canonical declarations produce `FAIL`.
HTML `noindex` and `none` are warnings unless `--expect-indexable` is supplied.
Missing or repeated titles/descriptions and cross-page title/canonical reuse are
advisory. Shared canonicals can be intentional; they are never automatically rewritten.

`--fail-on-error` exits with code 1 when a `FAIL` is present, while still writing the
complete report. Input errors also exit 1. Without it, a completed audit is advisory.
Use `--expect-indexable` only for pages intended for standalone search indexing.

This command reads source HTML without fetching URLs or launching a browser.
HTTP headers, robots.txt and actual indexing are explicitly unassessed. JSON-LD
checks cover JSON syntax and root shape; schema semantics and visible-content
consistency require separate validation. Missing JSON-LD is `N/A`.

For a file, `--base-url` is its deployed page URL. For a directory, it is the
deployment root; relative file paths are appended without inferring hosting rewrites.
An HTML `base` element is respected. Relative canonicals without a resolvable base
are `N/A`. Hidden entries, `node_modules` and symlinks are excluded from traversal;
an explicit symlink input is rejected. Unreadable files and files over 5 MB stop
the audit instead of silently dropping pages.

Rules follow the [robots meta specification](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
and [canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
A syntax pass does not establish eligibility under the
[structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## Optional generators

```bash
npx aeoptimize generate ./dist --dry-run
npx aeoptimize generate ./dist
```

The generator can create:

- `llms.txt` and `llms-full.txt` as experimental outputs based on the [llms.txt proposal](https://llmstxt.org/);
- candidate `Article` and `BreadcrumbList` JSON-LD for manual review;
- crawler-specific `robots.txt` suggestions, printed but never applied automatically.

Generated structured data must be reviewed against visible content and the applicable search-engine documentation. The generator intentionally does not create `FAQPage` from headings alone.

## Framework integrations

### Vite

```ts
import { defineConfig } from 'vite';
import { aeoPlugin } from 'aeoptimize/vite';

export default defineConfig({
  plugins: [aeoPlugin()],
});
```

### Next.js

```js
import { withAeo } from 'aeoptimize/next';

export default withAeo({});
```

Both integrations scan the build output and generate the same optional artifacts as the CLI. Options: `{ silent?: boolean; outDir?: string }`.

## Experimental AI review

```bash
npx aeoptimize scan https://example.com --multi-ai
```

When supported local AI CLIs are available, this adds a subjective review and reports an experimental blend. Model output can vary and is not ground truth. The deterministic rule score remains visible separately.

## Pre-commit hook

```bash
npx aeoptimize hook install
npx aeoptimize hook install --min-score 60
npx aeoptimize hook uninstall
```

The hook checks staged `.html`, `.htm`, `.md`, and `.mdx` content. Review the baseline before using a threshold to block commits; `git commit --no-verify` remains an explicit escape hatch.

## Claude Code skills

```bash
claude plugin marketplace add cucuwang/aeoptimize
```

Or install the same reusable skills through the cross-agent Agent Skills CLI (skills.sh indexes installs from this command; there is no separate submit form):

```bash
npx skills add cucuwang/aeoptimize
```

- `/aeo-scan` — deterministic readiness audit with optional experimental review
- `/aeo-generate` — preview optional discovery artifacts
- `/aeo-transform` — propose content edits without inventing claims

## Project status

The v0.6 evidence baseline focuses on methodology, reproducible fixtures, CI compatibility, packaging, and external adoption—not more scoring rules. Release acceptance and rollback are documented in [docs/release-v0.6.md](docs/release-v0.6.md); longer-term adoption work remains in [ROADMAP.md](ROADMAP.md).

Contributions are welcome. Rule changes require an evidence note and positive/negative fixtures; see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## License

MIT

If aeoptimize catches something real in your build, a star helps other teams find it.
