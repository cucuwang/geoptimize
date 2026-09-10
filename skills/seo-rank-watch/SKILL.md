---
name: seo-rank-watch
description: Use when maintaining a measured Google Search ranking experiment with one keyword, one target page, and a seven-day cooldown
---

# SEO Rank Watch

Use geoptimize's SEO ledger for a controlled ranking experiment. This workflow is separate from GEO readiness scoring and does not promise a ranking outcome.

## Workflow

1. Run `geo seo status <repository>` and read all three `data/seo` files.
2. Record a fixed Search Console observation with `geo seo record`. Prefer the exact query plus page, country, device, search type, and complete date window. Use an observed web result only when current SERP context is needed.
3. Review an `observing` query only when `nextReviewDate` is due. Use a comparable post-action observation and `geo seo review`.
4. Run `geo seo select <repository>`. Improve only the returned keyword. If it returns no candidate, report the state and stop.
5. Define in one or two sentences who searched and what they need. Inspect current leading pages and identify one information gap on the target page.
6. Make one focused improvement that answers the need. Internal links should lead to the visitor's likely next question or action.
7. Run the site's normal tests and a geoptimize build audit. Then call `geo seo start` with the exact intent, gap, and completed change.
8. Commit the page change and `data/seo` files together. Report the next review date without predicting the outcome.

## Boundaries

- Do not scrape Google result pages with a custom script.
- Do not reinterpret `position: null` and zero impressions as proof that a page is unindexed.
- Do not modify another keyword while one is `observing`.
- Do not change `noindex`, canonicals, redirects, or major site structure without explicit review of the exact scope.
- Do not overwrite or edit earlier rank-history entries.
- Do not output or commit credentials, tokens, cookies, or service-account keys.
- Do not describe a geoptimize score increase as ranking evidence.
