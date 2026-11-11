# Methodology and limitations

This document describes the v0.6.0 scoring contract. `geoptimize` is a deterministic content-readiness linter. Its score is not a forecast of ranking, indexing, rich-result eligibility, AI visibility, or citation.

## Evidence classes

Every rule belongs to one of four classes:

| Class | Meaning | Allowed use |
| --- | --- | --- |
| A — official requirement | A current first-party specification or product document defines the behavior. | A rule may report a technical error within the documented scope. |
| B — deterministic implementation check | The tool can reproduce the property, but the property may be optional or context-dependent. | A rule may guard regressions and must state when it does not apply. |
| C — content heuristic | A configurable proxy for readability or maintainability with known false positives. | A rule may suggest review; it must not claim search or citation effects. |
| D — experiment | Adoption or effect is not established by an authoritative source. | Informational output only; no readiness points. |

## Score contract

The total remains 0–100 for backward-compatible CI output. Compare scores only for the same project, geoptimize version, configuration, and fixture set. A higher score means fewer findings under this rule set; it does not mean a higher probability of an external outcome.

| Rule | Points | Class | What is actually checked |
| --- | ---: | --- | --- |
| `heading-hierarchy` | 10 | C | Presence of headings, skipped levels, and a review hint when no H1 is exposed. Multiple H1 elements are not an automatic error. |
| `paragraph-length` | 8 | C | Paragraphs above a 150-word review threshold. The threshold is not a ranking factor. |
| `faq-presence` | 0 | D | Optional question-and-answer structure; no score impact. |
| `list-usage` | 7 | C | Long pages without list markup receive a review suggestion. Lists should be used only for genuine sets or sequences. |
| `self-contained-statements` | 8 | C | Paragraphs beginning with selected pronouns or transition words. Context can make these starts correct. |
| `data-stats-presence` | 7 | B/C | Quantitative claims are not rewarded for existing. Claims without a detectable source signal are flagged. |
| `clear-definitions` | 5 | C | Simple definition-language patterns. This cannot judge factual accuracy. |
| `attribution` | 5 | C | Author, date, and source signals. These fields are not applicable to every page type. |
| `json-ld-presence` | 8 | B | Presence of JSON-LD. Absence is informational and receives no penalty because structured data is optional. |
| `json-ld-completeness` | 12 | B | Universal `@context` and `@type` structure plus article-specific review hints. Feature-specific validation remains manual. |
| `ai-relevant-schema-types` | 0 | D | Schema type count has no score impact. More types are not inherently better. |
| `llms-txt-presence` | 0 | D | Presence of the llms.txt proposal; no score impact. |
| `robots-txt-ai-config` | 8 | A/B | Page-level `noindex`. Site robots rules, CDN controls, and crawler identities require separate verification. |
| `meta-description-quality` | 7 | B/C | Missing, generic, or keyword-list descriptions. There is no fixed 50–160 character rule. |
| `content-boilerplate-ratio` | 5 | C | Ratio of extracted paragraph text to total text. Templates and non-article pages can be false positives. |
| `keyword-stuffing-detection` | 5 | C | Vocabulary diversity plus repeated terms across adjacent sentences. Language and domain terminology affect results. |
| `content-uniqueness-signals` | 5 | C | Presence of selected original-data language or code examples. Absence is not proof of low quality. |

### JSON-LD structural diagnostics

`scan`, `audit` and `audit-build` share JSON-LD syntax and structure checks.
They report malformed JSON, non-object roots or graph entries, missing entity
`@context`/`@type`, invalid contexts and invalid type values. A context can be a
non-empty string, an object, or a non-empty array of contexts. A type can be a
non-empty string or non-empty array of strings. Graph entities inherit context;
graph envelopes need no entity type, and nested property objects such as `author`
are not independently required to declare context or type. Severity in `scan`
and `audit`: malformed JSON and missing `@context`/`@type` (including empty
strings and `null`, which count as missing) are warnings; non-object roots or
graph entries and context or type values of the wrong kind are critical. In
`audit-build`, malformed JSON and invalid roots fail the check and the other
structural diagnostics are warnings. No contexts are fetched
and no schema vocabulary or feature-specific property rules are inferred.

Diagnostics identify the source page and one-based script start line. Audit
evidence also identifies the block number and object/graph path. Missing JSON-LD
remains optional. These are Class B implementation checks. The existing
`json-ld-completeness` field-presence points and `readiness-v0.6.1-details-v1`
scoring version remain unchanged; new syntax and field-type diagnostics add
findings without additional point deductions.

`scan --fail-under <score>` gates the deterministic overall score (the directory
average), with exit 1 strictly below the threshold and exit 0 at or above it.
Completed ungated scans remain advisory. `audit` remains advisory;
`audit-build --fail-on-error` exits 1 for malformed JSON or invalid root shapes,
independently of the readiness score. Missing context or type and other new
structural diagnostics are `WARNING` and do not trigger that exit. The existing `jsonld-syntax` build-audit check ID is retained
and now covers the shared structure checks as well as syntax.

## Explicit exclusions

- Google says its AI search features require no special AI text file, special markup, or additional schema beyond established Search requirements. `llms.txt` therefore carries zero points.
- llmstxt.org describes `llms.txt` as a proposal and does not define how clients must process it.
- Structured data can make a page eligible for a supported search feature; valid markup does not guarantee display.
- Google does not specify a meta-description length limit. Snippets may come from page content and can vary by query.
- The tool does not treat exactly one H1, FAQ count, a fixed keyword density, or the number of schema types as outcome factors.
- AI CLI reviews are subjective experiments. The legacy `consensusScore` field remains for compatibility but is presented as an experimental blend, not consensus or ground truth.

## Generator safety

Generated output is a candidate for review, not deployment-ready truth.

- `FAQPage` is never inferred from question headings.
- Candidate JSON-LD must agree with visible content and the applicable feature documentation.
- `llms.txt` and `llms-full.txt` are experimental adapters.
- Crawler suggestions distinguish search, user-initiated browsing, and model-training controls. Allowing a bot does not guarantee crawling, indexing, or citation.

### JSON-LD review checklist

[`generateJsonLd`](../src/core/generator.ts) returns candidates for one parsed
document. The only types it can add are `Article` and `BreadcrumbList`, at most
one of each. It does not emit `FAQPage`. Question headings are not a source for
that type. The `generate` command and the Vite and Next.js plugins, when any
candidates exist, write them to `_geo/generated-schemas.json` in the output
directory. Page HTML is left unchanged. The file is a flat list of the
candidates returned for the parsed pages, and each object omits its source
path. Copying a candidate onto a published page is optional. A page with no
JSON-LD is valid, and writing the candidate file does not change the readiness
score.

Compare every value with content visible on that page and with the current
requirements of the target search feature. `scan`, `audit`, and `audit-build`
do not decide that agreement. The
[Rich Results Test](https://search.google.com/test/rich-results) and the
[Schema Markup Validator](https://validator.schema.org/) are optional external
checks. A passing result still needs the visible-content review below. Valid
markup does not mean a search feature will be displayed.

#### Article conditions

An `Article` object is emitted only when all of the following are true. The
duplicate check reads `@type` on each object in `doc.jsonLd`, including
entities that [`parseJsonLdBlocks`](../src/core/json-ld.ts) lifts out of `@graph`.
[`parseHtml`](../src/core/scanner.ts) fills `doc.metaTags` from a meta `name`
or, when `name` is absent, from `property`. When several meta tags share a key,
the last `content` value is kept. The description and date values below are
read from that same map.

- No `@type` is the case-sensitive string `Article`, `TechArticle`, or
  `BlogPosting`. The comparison uses the whole `@type` value, so an array
  `@type` does not suppress the candidate. Other strings, such as
  `NewsArticle`, do not either.
- `doc.html` matches `/<article\b/i`, a case-insensitive text search for
  `<article` at a word boundary. The Markdown parser leaves `html` unset, so a
  Markdown page does not receive an `Article` candidate.
- `doc.metaTags.author` is non-empty.
- `doc.metaTags['article:published_time']` is non-empty, or else
  `doc.metaTags.date` is non-empty.
- `doc.headings.length` is at least 2 and `doc.paragraphs.length` is at least 3.
  Counts cover the whole document, not only the `<article>` element. In HTML,
  headings are every `h1`–`h6`, including empty text. Paragraphs are trimmed
  `p`, `li`, and `dd` texts longer than 20 characters.

The object contains only these fields:

- `@context` is `https://schema.org`, and `@type` is `Article`.
- `name` is `doc.title`.
- `description` is `doc.metaTags.description` when that value is non-empty.
  Otherwise it is the first 160 characters of the first paragraph
  (`slice(0, 160)`), or `""` when that result is empty.
- `author` is a `Person` whose `name` is the `author` meta value.
- `datePublished` is `article:published_time` when that meta value is non-empty,
  and the `date` meta value otherwise.

#### BreadcrumbList conditions

A `BreadcrumbList` object is emitted only when no `doc.jsonLd` `@type` is the
case-sensitive string `BreadcrumbList` (the same comparison as above, including
`@graph` entities) and at least two `doc.links` entries have text with length
greater than 0 and an `href` that starts with `/`. That test includes
root-relative paths and protocol-relative URLs such as `//host/path`. The first
five matches are kept, in `doc.links` order. In HTML, `doc.links` is every `a`
element that has an `href`, in document order, with trimmed text, so header,
footer, and in-content links are eligible on the same rule. Markdown pages use
the inline links that [`parseMarkdown`](../src/core/scanner.ts) collects
outside fenced code.

The object contains `@context` `https://schema.org`, `@type` `BreadcrumbList`,
and `itemListElement`. Each kept link becomes a `ListItem` with `position` set
to its 1-based index in that filtered list, `name` set to the link text, and
`item` set to the raw `href`.

#### Checklist

1. For an `Article` candidate, match `name`, `description`, `author.name`, and
   `datePublished` to the visible title, summary, byline, and publication date.
   Author and date are copied from meta tags. Leave the candidate unpublished
   when the page is not an article, the author is not a person, or the date
   differs from the page.
2. For a `BreadcrumbList` candidate, match each entry to the breadcrumb trail
   visible on that page. Leave the candidate unpublished when the list is site
   navigation or another group of links. Confirm each `item` is the URL the
   target feature expects.
3. Look for an existing `Article`, `TechArticle`, `BlogPosting`, or
   `BreadcrumbList`. A candidate is suppressed only when `@type` is exactly
   that string.
4. Leave question headings as headings. `FAQPage` is not inferred from them.
5. Publish a candidate only after it matches visible content and the target
   feature's documentation. Omitting it is a valid result.

## Validation policy

A scoring-rule change must include:

1. the evidence class and primary source or explicit heuristic rationale;
2. at least one positive fixture, one negative fixture, and one false-positive boundary;
3. the expected JSON change and migration impact;
4. no claim that the rule improves ranking or citation without a preregistered outcome study and public data.

The v0.6 fixture corpus is published in [`fixtures/v0.6/rule-corpus.ts`](../fixtures/v0.6/rule-corpus.ts) and is enforced by the release-contract tests. Outcome research, if added later, will be reported separately from the readiness score.

## Evidence-backed audit contract

The `audit` command is separate from the v0.6 score contract. It reports one of four statuses for each bounded check:

| Status | Meaning |
| --- | --- |
| `PASS` | The inspected evidence satisfies the check's documented condition. This is not an external-outcome guarantee. |
| `WARNING` | A deterministic observation needs contextual review or may be intentional. |
| `FAIL` | The inspected evidence confirms a structural or retrieval failure within the check's scope. |
| `N/A` | The required evidence is unavailable or the check does not apply to this source type. |

Each check includes observed evidence, an explanation, optional remediation, and a validation step. The contract does not derive robots.txt policy, sitemap membership, hreflang reciprocity, site-wide duplication, orphan status, Core Web Vitals, analytics, or search-engine index state from a single document.

### Bounded site audit

The `audit-site` contract uses a same-origin, sequential queue with an explicit 1–200 page limit. It processes links in discovery order before sitemap-only seeds, reads applicable `geoptimize` or wildcard robots rules, and does not follow subsequent redirects outside the audited origin.

The crawler uses response HTML without browser rendering. A Sitemap-only URL with no internal inlink is reported as an orphan candidate because JavaScript navigation, pages beyond the configured limit, and other discovery sources may still link to it. Broken-link findings require an observed failed response; queued but unfetched links remain warnings.

Same-origin HTML links whose resolved pathname is exactly `/cdn-cgi/l/email-protection` are skipped before page discovery and internal-target counting, including links with fragments or query strings. Cloudflare uses this endpoint for browser-decoded email addresses. When links are skipped, the existing JSON `limitations` array records their total occurrence count across crawled HTML pages, before URL deduplication. These endpoint URLs are excluded from orphan candidates; sitemap entries still undergo the usual HTTP requests and sitemap checks. Other `/cdn-cgi/` paths remain subject to the usual crawl rules.

robots.txt matching covers applicable user-agent groups, `Allow`, `Disallow`, `*` wildcards, and `$` endings. Unusual policies need manual review. An unavailable robots.txt response that is not an ordinary 404 causes conservative skipping of subsequent matching URLs.

## Primary sources

- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google Search: structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google Search: snippets and meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google Search: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google Search: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [llms.txt proposal](https://llmstxt.org/)

Last reviewed: 2026-08-22.

## Site metric evidence version 1.1

`audit-site` adds optional `metricEvidenceVersion` and complete `findings` fields to
its 1.0 report, plus complete numeric counts alongside existing capped URL samples.
Existing fields and readiness scoring remain unchanged. Consumers that assert an
exact top-level key set must accept these additive fields. The `metrics` command
accepts older 1.0 reports, but missing counts stay null and unversioned evidence
cannot produce comparison deltas.

Evidence version 1.1 groups pages by a single same-origin canonical whose target
was crawled and returned HTTP 200 HTML directly, with no redirects. The declared
target URL must match the final URL, and the target must be indexable according to
its meta robots and X-Robots-Tag directives and have exactly one self-referencing
canonical. These verified consolidations do not create
non-self or shared-canonical findings. Duplicate titles and sitemap omissions use
the canonical target URL; missing, failed, external, malformed, noindex, redirected,
or non-self-canonical targets retain the usual findings, including canonical chains
and cycles. Noindex targets are excluded from sitemap inclusion requirements. A
verified canonical target omitted from the sitemap still creates an
omission, counted once per target.

Shared titles among different language pages are accepted when every pair has
reciprocal HTML hreflang links matching the other page's declared HTML language.
One-way links, equal language declarations, and incomplete groups retain duplicate
title warnings. Directory audits apply the same language check when a deployed
base URL establishes the file URLs. For hreflang comparison only, a trailing
`index.html` or `index.htm` is equivalent to the directory URL ending in `/`.
Hosting rewrites are not inferred; other checks retain their existing URL handling
and evidence.

The metrics reader accepts evidence versions 1.0 and 1.1. Comparisons across these
versions withhold deltas and finding differences because their semantics differ.

Metric units distinguish pages, target URLs, canonical entries, and duplicate groups.
Canonical review observations and orphan candidates are contextual findings, not
confirmed faults. All counts apply to the bounded response-HTML crawl. No ranking,
AI citation outcome, or entire-site denominator is inferred.

A comparison requires the same metric evidence version, start URL, origin, page
limit and requested URL set, completed queues, no robots skips or unavailable page
responses, and chronological timestamps. Findings match by kind and observed target;
changes in a grouped title/canonical observation can create both an added and an
absent observation. An absent finding does not prove a fix, since content or response
type may have changed. Bump the metric evidence version when measurement semantics
change. Store reports produced by the same tool build for controlled comparisons.
