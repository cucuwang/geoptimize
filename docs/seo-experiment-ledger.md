# SEO experiment ledger

`geo seo` records controlled search experiments alongside a website repository. It keeps observations, page changes, and reviews inspectable without changing geoptimize's deterministic content-readiness score.

The command accepts measurements supplied by the operator. It does not authenticate to Search Console, collect Google results, predict rankings, or infer index status.

## Data contract

Initialize three versioned JSON files.

```bash
geo seo init .
```

- `data/seo/queries.json` maps each exact query to one target page and records its priority and lifecycle state.
- `data/seo/observations.json` appends measurements with their source, date window, and search segment.
- `data/seo/experiments.json` records the search intent, content gap, deployed change, review date, and review outcome.

Commit these files with the related page change. Keep Search Console credentials, cookies, OAuth tokens, and service-account keys outside the repository.

## Record a baseline

Add an exact query and its intended page.

```bash
geo seo add . --keyword "能源管理系統整合" --page /platform/ --priority high
```

Record a fixed Search Console segment. Later comparisons should retain the same query, page, country, device, search type, and measurement method.

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

Use `--source serp` only for a manually observed organic result. Record a missing position as `null`. Zero impressions and a null position do not prove that a page is absent from the index.

## Run one experiment

`select` ranks eligible queries from the recorded observations and declared priority. Inspect the current result set, describe the searcher's need, and choose one concrete content gap.

```bash
geo seo select .
```

Complete and deploy the page change before starting the monitoring period. Confirm the public page reflects the intended content, then record the verified publication date.

```bash
geo seo start . \
  --keyword "能源管理系統整合" \
  --date 2026-09-11 \
  --intent "A facilities manager is comparing integration scope and support for existing equipment." \
  --gap "The page does not answer implementation scope near the main service description." \
  --change "Added a visible implementation-scope section with relevant internal links."
```

The selected query moves from `eligible` to `monitoring` for seven days. A local commit, preview, or successful build is insufficient publication evidence. The repository can have only one monitoring experiment at a time.

## Review comparable evidence

After the due date, record a post-change observation and review the experiment with that observation ID.

```bash
geo seo review . \
  --keyword "能源管理系統整合" \
  --outcome improved \
  --observation 0123456789abcdef \
  --note "The same TWN desktop segment moved from 7.2 to 4.8."
```

Use `goal_met` when the query has reached the declared objective. That outcome moves it to `completed`. The other outcomes return it to `eligible`, where a later experiment can test a different gap. Search Console average position remains an aggregate over the selected segment and date window.

## Operating boundaries

- Use Search Console as the primary performance source.
- Keep earlier observations intact. Corrections should be appended with a new observation and explained in the review note.
- Add information that answers the search need. Avoid repetitive keyword insertion.
- Review `noindex`, canonical, redirect, and major information-architecture changes separately.
- Report local implementation, public deployment, and measured outcome as distinct states.
