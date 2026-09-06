# Methodology and limitations

This document describes the v0.6.0 scoring contract. `aeoptimize` is a deterministic content-readiness linter. Its score is not a forecast of ranking, indexing, rich-result eligibility, AI visibility, or citation.

## Evidence classes

Every rule belongs to one of four classes:

| Class | Meaning | Allowed use |
| --- | --- | --- |
| A — official requirement | A current first-party specification or product document defines the behavior. | A rule may report a technical error within the documented scope. |
| B — deterministic implementation check | The tool can reproduce the property, but the property may be optional or context-dependent. | A rule may guard regressions and must state when it does not apply. |
| C — content heuristic | A configurable proxy for readability or maintainability with known false positives. | A rule may suggest review; it must not claim search or citation effects. |
| D — experiment | Adoption or effect is not established by an authoritative source. | Informational output only; no readiness points. |

## Score contract

The total remains 0–100 for backward-compatible CI output. Compare scores only for the same project, aeoptimize version, configuration, and fixture set. A higher score means fewer findings under this rule set; it does not mean a higher probability of an external outcome.

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

The `audit-site` contract uses a same-origin, sequential queue with an explicit 1–200 page limit. It processes links in discovery order before sitemap-only seeds, reads applicable `aeoptimize` or wildcard robots rules, and does not follow subsequent redirects outside the audited origin.

The crawler uses response HTML without browser rendering. A Sitemap-only URL with no internal inlink is reported as an orphan candidate because JavaScript navigation, pages beyond the configured limit, and other discovery sources may still link to it. Broken-link findings require an observed failed response; queued but unfetched links remain warnings.

robots.txt matching covers applicable user-agent groups, `Allow`, `Disallow`, `*` wildcards, and `$` endings. Unusual policies need manual review. An unavailable robots.txt response that is not an ordinary 404 causes conservative skipping of subsequent matching URLs.

## Primary sources

- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google Search: structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google Search: snippets and meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google Search: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google Search: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [llms.txt proposal](https://llmstxt.org/)

Last reviewed: 2026-08-22.
