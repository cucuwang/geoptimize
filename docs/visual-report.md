# Visual report

The offline report extends the existing dark and mint visual language in
`docs/assets/social-card.svg`. Its purpose is to inspect content readiness and
website health without replacing the five-dimension scoring contract.

## Components and evidence

- Overall score and five labeled meter bars use the exact `scan` values and existing maxima.
- Page distribution groups observed scores into 0–39, 40–69 and 70–100 bands; the denominator is the scored page count.
- Severity segments use counts of scoring observations, including repeated observations on different pages.
- HTTP bars use crawled page requests as their denominator. Non-2xx/non-error responses remain visible in the complete metric table.
- Site comparisons inherit the metric evidence version and comparability gates. Each pair has its own labeled scale.
- Page search and severity filters operate locally. Native disclosure controls expose escaped evidence and recommendations.

The readiness scan and site crawl may have different targets and timestamps; their
scope is displayed separately. No outcome metrics or trend history are invented.

## Layout and accessibility

The report uses the platform sans family, dark neutral surfaces, mint readiness
bars, amber review observations, red failures and blue informational observations.
The primary score and dimensions precede supporting charts. On narrow screens,
columns stack and only data tables scroll horizontally. Buttons and native controls
retain visible keyboard focus; status labels accompany colors.

## Output contract

`geo report` takes a `scan --json` file, optional `--site` and `--baseline-site`
inputs, and a required new `--output` path. It creates a self-contained HTML file
using exclusive creation. Source text is escaped before insertion; no source HTML
is executed. There are no remote assets or outbound requests.

`prepare-metrics-demo.mjs` uses synthetic fixtures through the actual scanner and
site auditor, then creates both before/after JSON and HTML. Browser verification
covers desktop/mobile overflow, original score bars, search, filters, disclosures,
comparison charts and the complete 19-row site-metric table.

## Detailed readiness and baseline comparisons

`geo scan --details --json` opts into all 17 raw rule results, the scoring version,
and up to 6000 characters of each page's evaluated HTML or Markdown. Capture labels
distinguish local files, HTTP response HTML, browser-rendered DOM, provided HTML
and Markdown. Source
previews are captured content and should be reviewed before sharing the report.
Standard scans retain their existing JSON keys and scores.

`geo report current.json --baseline previous.json --output report.html` compares
the original total and five dimensions only when both detailed scans have the same
scoring version, identical page URL sets and chronological timestamps. Unknown
versions, empty scans and different target sets cannot produce score deltas.
Each imported rule roster is validated, and its weighted aggregate must reproduce
the original page scores. Raw rule points are shown separately from the rounded
page and site aggregates; zero-weight rules remain informational.

Matched pages show captured source excerpts side by side with page scores.
Missing excerpts remain unavailable; truncated excerpts are explicitly labeled.
These are observations of two scans, not automatically generated fixes or a claim
that the source excerpts explain the entire score difference.

Score-distribution controls filter the scored page table. Severity controls filter
scoring evidence. Site finding controls use complete site findings and expose
site audit targets separately, since a readiness scan may cover different URLs.
