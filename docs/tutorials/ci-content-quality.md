# Add content quality lint to a static site's CI

A documentation build can succeed while publishing an unintended `noindex` directive or malformed JSON-LD. This tutorial uses geoptimize 0.12.0 to inspect two local HTML pages, read a JSON report, and choose which checks should block CI.

The example is for documentation teams and frontend engineers maintaining static or documentation sites. The HTML files stand in for the output of a site generator. No server or browser is required.

## 1. Prepare the example

Use a checkout containing this tutorial and geoptimize 0.12.0, with the repository dependencies already installed. Node.js 22.12 or newer is required. Run every command below from the repository root. The walkthrough was tested with Node.js 24.21.0 and the repository's TypeScript build.

Build the CLI with the existing script.

```bash
npm run build
```

The build completed with exit code `0`. Actual script output follows.

```text
npm notice run geoptimize@0.12.0 build
npm notice run tsc
```

The [sample site](../../examples/tutorial-static-site/) contains two ready-to-scan HTML files. There is no separate site build or package installation for this example.

| File | Purpose |
| --- | --- |
| [`index.html`](../../examples/tutorial-static-site/index.html) | A documentation home page with a title, description, canonical, and headings. JSON-LD is optional and omitted here. |
| [`guide.html`](../../examples/tutorial-static-site/guide.html) | A preview guide with two deliberate regressions, a robots `noindex` tag and a trailing comma in its JSON-LD. |

The `docs.example.com` canonical URLs are placeholders. The local commands below do not fetch them. In a real build, use your deployment URLs.

## 2. Scan the directory

```bash
node dist/cli/index.js scan examples/tutorial-static-site --dir
```

Exit code `0`. This is an excerpt of the actual terminal output, with the closing skill suggestion omitted.

```text
  Content Readiness Report
  2026-10-19T06:27:33.209Z
  2 pages scanned

  Score: 86/100  Content readiness: Excellent (86/100) across 2 pages

  Structure        ████████████████████ 25/25
  Citability       ██████████████░░░░░░ 18/25
  Schema           ████████████████████ 20/20
  AI Metadata      ███████████████░░░░░ 11/15
  Content Density  ████████████████░░░░ 12/15

  Critical Issues:
  ✗ Page has a noindex meta tag. Search engines may exclude it from results; review whether that is intentional.

  Per-Page Scores:
   82 Preview guide | Field Notes
   90 Field Notes documentation
```

The report flags `noindex`, but the scan still succeeds. `scan` uses exit code `0` for completed scans regardless of the score. Command or input errors can still fail.

The 86/100 score is a versioned heuristic. Review the individual findings before choosing a project baseline. In this version, malformed JSON-LD is omitted by the scoring parser, so this page still receives full schema points. The build audit below detects the syntax error explicitly.

## 3. Read the JSON output

```bash
node dist/cli/index.js scan examples/tutorial-static-site --dir --json
```

Exit code `0`. The report contains per-page `scores`, `issues`, and `suggestions`, followed by an overall score. The following is the verbatim ending of the actual output. The preceding `pages` array is omitted, so this excerpt is not a standalone JSON document.

```text
  "overall": {
    "structure": 25,
    "citability": 18,
    "schema": 20,
    "aiMetadata": 11,
    "contentDensity": 12,
    "total": 86
  },
  "summary": "Content readiness: Excellent (86/100) across 2 pages",
  "timestamp": "2026-10-19T06:27:33.329Z"
}
```

Use `--json` for automation. Timestamps change between runs. Compare scores under the same tool version, configuration, and set of pages. Review context-sensitive suggestions, such as author metadata, before treating them as project requirements.

## 4. Make specific build errors fail

For this exercise, both pages are intended for public indexing. Run a separate static HTML audit with that expectation enabled.

```bash
node dist/cli/index.js audit-build examples/tutorial-static-site --expect-indexable --fail-on-error
```

Exit code `1`, as intended. Actual summary output follows.

```text
Static HTML Audit
2 pages | 2 failed | 0 warnings | 7 passed | 3 not assessed
```

The failing checks on `guide.html` are shown below. Intervening remediation and verification lines are omitted.

```text
  [FAIL] indexing-directives: An HTML robots or googlebot directive blocks standalone indexing; index does not override noindex.
    Evidence: robots: noindex
  [FAIL] jsonld-syntax: JSON-LD has a syntax or root-shape error.
    Evidence: Block 1: malformed JSON.
```

`--expect-indexable` treats an HTML `noindex` or `none` directive as a failure for the inspected target. Without it, that directive is a warning. Malformed JSON-LD is a failure independently of that indexing expectation. `--fail-on-error` makes any `FAIL` check produce exit code `1`; warnings remain advisory. Without `--fail-on-error`, reported audit failures do not set a failing exit code.

For machine-readable audit evidence, use the JSON form.

```bash
node dist/cli/index.js audit-build examples/tutorial-static-site --expect-indexable --fail-on-error --json
```

This command also returned exit code `1`. Its report includes check IDs, statuses, evidence, remediation, and validation instructions. The contract version was `1.0`. The actual summary excerpt follows, with surrounding fields omitted.

```text
  "summary": {
    "PASS": 7,
    "WARNING": 0,
    "FAIL": 2,
    "N/A": 3
  },
```

### Repair and verify

In `guide.html`, remove the robots `noindex` meta tag if the page should be indexable. Then remove the comma after `"TechArticle"` in the JSON-LD object. Keep structured data only when it accurately describes the visible page. Removing an unnecessary JSON-LD block is also a valid project decision.

Rerun the same strict audit command from this section. After removing the tag and fixing the comma in a temporary copy, the actual output began with the following lines and returned exit code `0`.

```text
Static HTML Audit
2 pages | 0 failed | 0 warnings | 9 passed | 3 not assessed
```

The bundled example retains both intentional errors so the failing case remains reproducible. For private previews or intentionally excluded pages, choose the audit target and indexing expectation to match that policy.

## 5. Add the GitHub Action

In a workflow that already checks out the repository and builds the site, add this step after the build. Point `path` at the generated HTML directory. For this repository's unmodified tutorial fixture, use the path shown below.

```yaml
- name: Review content quality
  uses: cucuwang/geoptimize@v0.12.0
  with:
    path: examples/tutorial-static-site
```

For your own site, replace `examples/tutorial-static-site` with its output directory, such as `dist` or `docs/.vitepress/dist`. The Action installs geoptimize 0.12.0 by default and exposes `score` and `report` outputs. The tag pins this example to the v0.12.0 release; see [Action reproducibility](../action-reproducibility.md) for dependency and pinning details.

The Action is advisory by default. It does not enable the strict `audit-build` command demonstrated above. Installation and scan execution errors can still fail the job.

After reviewing a baseline, optionally enable a score threshold.

```yaml
- name: Enforce a reviewed content baseline
  uses: cucuwang/geoptimize@v0.12.0
  with:
    path: examples/tutorial-static-site
    fail-on-low-score: 'true'
    min-score: '60'
```

Choose one of these steps for the workflow. `60` is an example threshold, not a universal quality target. Setting `min-score` alone does not enable blocking. The fixture scores 86, so a threshold of 60 would pass despite the two audit failures. Run the explicit strict build audit as a separate CI command when those failures should block publication.

The local CLI commands and repair result above were executed against a CLI built from this repository. The Action snippets match the release's input contract; execution on a GitHub-hosted runner is Unverified in this walkthrough.

## Limits

geoptimize scores are versioned heuristics for reviewing content regressions within a project. They do not predict ranking, indexing, rich results, or AI citations. GEO and AI search are secondary contexts for these checks.

The build audit inspects local HTML. It does not render JavaScript or inspect deployed HTTP headers, robots.txt, or actual search indexing. JSON-LD syntax checks cover parsing and root shape; schema vocabulary and agreement with visible content require separate review. A passing audit establishes the named checks within this scope.

Read the [methodology and limitations](../methodology.md) and the [v0.12.0 release notes](../release-notes-v0.12.md) before adopting a blocking policy.
