# geoptimize 0.12.0

## Readiness scoring corrections

- Recognizes JSON-LD `@graph` and array structures with inherited context, including graph completeness and attribution.
- Handles CJK descriptions and sentence boundaries around Chinese punctuation and numeric versions.
- Excludes SVG `<title>` elements from document-title checks.
- Recognizes bounded Traditional and Simplified Chinese term definitions, with public regression coverage for Chinese definitions and descriptions.

## Site audit corrections

- Consolidates parameter URLs through a verified canonical target that returns HTTP 200 directly, is indexable, has no redirects, and declares a single self-canonical. Chains, cycles, noindex targets, and redirecting targets retain warnings.
- Avoids duplicate-title warnings for different-language pages with reciprocal hreflang links in `audit-site` and `audit-build`. Build audits also support directory `index.html` and `index.htm` layouts.
- Skips Cloudflare email-protection links that previously caused false HTTP and broken-internal-target failures in `audit-site`. Reports record skipped link occurrences in `limitations`.

## Compatibility and documentation

- Readiness scoring advances to `readiness-v0.6.1-details-v1`. Detailed reports from `readiness-v0.6.0-details-v1` remain readable, and previous scoring baselines are reported as non-comparable.
- Audit metric evidence advances to `metricEvidenceVersion` `1.1`. Version `1.0` reports remain readable; cross-version comparisons produce no metric deltas.
- Documentation positions geoptimize as content quality lint for CI and pre-commit, with GEO and AI search as secondary uses.
- Node.js 22.12 and newer remain supported. The guided terminal flow, explicit CLI commands, and offline HTML reports remain available.

## Install

```bash
npm install --save-dev geoptimize@0.12.0
npx geoptimize
```

To use the Action in a workflow:

```yaml
- uses: cucuwang/geoptimize@v0.12.0
  with:
    path: dist
```
