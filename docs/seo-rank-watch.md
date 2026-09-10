# SEO rank watch

`geo seo` keeps ranking experiments separate from geoptimize's deterministic content-readiness score. It records what was observed, which single query was changed, and whether a comparable post-change measurement moved. It does not scrape Google, authenticate to Search Console, or predict ranking.

## Data contract

Initialize three reviewable files in a website repository:

```bash
geo seo init .
```

- `data/seo/watchwords.json` stores exact queries, target pages, priorities, and experiment status.
- `data/seo/rank-history.json` is append-only measurement history.
- `data/seo/improvement-log.json` stores search intent, the observed content gap, the completed change, the seven-day review date, and review outcomes.

Commit these files with the page change. Never commit Search Console credentials, cookies, OAuth tokens, or service-account keys.

## Workflow

Add exact query and page pairs. Keep brand queries separate from service queries.

```bash
geo seo add . --keyword "能源管理系統整合" --page /platform/ --priority high
```

Record a fixed Search Console segment. The date window, country, device, and search type are required so later observations can be compared honestly.

```bash
geo seo record . \
  --keyword "能源管理系統整合" \
  --page /platform/ \
  --source gsc \
  --start-date 2026-08-13 \
  --end-date 2026-09-09 \
  --country TWN \
  --device DESKTOP \
  --position 7.2 \
  --impressions 41 \
  --clicks 2
```

Use `--source serp` only for an observed organic result. Keep its country, device, and one-day window explicit. A missing position with zero impressions is recorded as `null`; it is not labeled unindexed.

Select one candidate, compare the target page with current leading results, define the searcher's need, and make one focused page change.

```bash
geo seo select .
geo seo start . \
  --keyword "能源管理系統整合" \
  --date 2026-09-11 \
  --intent "A facilities manager is comparing what an EMS integration includes and whether existing devices can remain." \
  --gap "The page explains architecture but does not answer implementation scope near the main content." \
  --change "Added a visible implementation-scope section and direct links to system evidence."
```

Deploy the page, read the public URL back, and then call `start` with the verified publication date. `start` allows only the selected query and moves it to `observing` for seven days. A local commit, preview, or green build does not start the cooldown. While one query is observing, another experiment cannot start in that repository.

After the cooldown, record a comparable seven-day Search Console observation and review it:

```bash
geo seo review . \
  --keyword "能源管理系統整合" \
  --outcome improved \
  --observation 0123456789abcdef \
  --note "The same TWN desktop segment moved from 7.2 to 4.8."
```

`achieved` ends active changes for the query. Other outcomes return it to `active`; the next action should test a different content gap. Use adjacent complete 28-day windows for trend reporting and a post-change seven-day window for the scheduled review. Search Console average position remains an aggregate, not a universal live rank.

## Guardrails

- Use Search Console as the primary performance source. Do not automate Google result scraping.
- Keep the query, page, country, device, search type, and date window fixed when comparing observations.
- Add information that satisfies the search need. Do not pad the page or repeat keywords mechanically.
- Treat `noindex`, canonical changes, redirects, and large information-architecture changes as separate reviewed changes.
- Report the local implementation, public deployment, and measured outcome separately. A readiness score change is not ranking evidence.
