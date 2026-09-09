import type { Dimension, DimensionScores, PageAnalysis, ScanReport, SiteAuditReport } from './types.js';
import { summarizeSite, parseSiteReport } from './site-metrics.js';
import { compareReadiness, validateReadinessDetails } from './readiness-comparison.js';

const dimensions: readonly [Dimension, string, number][] = [
  ['structure', 'Structure', 25], ['citability', 'Citability', 25],
  ['schema', 'Schema', 20], ['aiMetadata', 'AI Metadata', 15],
  ['contentDensity', 'Content Density', 15],
];

const siteMetricKinds: Record<string, string> = {
  'missing-canonicals': 'missing-canonical',
  'broken-targets': 'broken-internal-target',
  'duplicate-titles': 'duplicate-title',
  'sitemap-omissions': 'sitemap-omission',
};

const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);

function signed(value: number | null | undefined): string {
  return value === null || value === undefined ? 'N/A' : `${value > 0 ? '+' : ''}${value}`;
}

function band(score: number): 'good' | 'review' | 'poor' {
  return score >= 70 ? 'good' : score >= 40 ? 'review' : 'poor';
}

function scoreBand(score: number): '70-100' | '40-69' | '0-39' {
  return score >= 70 ? '70-100' : score >= 40 ? '40-69' : '0-39';
}

function sourceLabel(target: string): string {
  try {
    return ['http:', 'https:'].includes(new URL(target).protocol) ? 'Affected URL' : 'Affected source group';
  } catch {
    return 'Affected source group';
  }
}

function captureLabel(capture: NonNullable<PageAnalysis['sourcePreview']>['capture']): string {
  return {
    'local-file': 'local file',
    'response-html': 'response HTML',
    'browser-rendered-html': 'browser-rendered HTML',
    'provided-html': 'provided HTML',
    markdown: 'Markdown',
  }[capture];
}

export function parseScanReport(value: unknown): ScanReport {
  const r = value as ScanReport;
  const scores = (s: ScanReport['overall']) => s && dimensions.every(([key, , max]) =>
    Number.isInteger(s[key]) && s[key] >= 0 && s[key] <= max) &&
    Number.isInteger(s.total) && s.total >= 0 && s.total <= 100 &&
    s.total === dimensions.reduce((sum, [key]) => sum + s[key], 0);
  if (!r || !Array.isArray(r.pages) || !scores(r.overall) || typeof r.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(r.timestamp)) || r.pages.some(p => !p || typeof p.url !== 'string' ||
        typeof p.title !== 'string' || !scores(p.scores) || !Array.isArray(p.issues) ||
        !Array.isArray(p.suggestions) || p.issues.some(i => !i || typeof i.message !== 'string' ||
          !['critical', 'warning', 'info'].includes(i.severity)) ||
        p.suggestions.some(s => !s || typeof s.action !== 'string' || typeof s.detail !== 'string'))) {
    throw new Error('Expected a scan --json report with valid page scores and findings.');
  }
  if (dimensions.some(([key]) => r.overall[key] !== (r.pages.length
    ? Math.round(r.pages.reduce((sum, p) => sum + p.scores[key], 0) / r.pages.length) : 0))) {
    throw new Error('Overall readiness must match the rounded page-score averages.');
  }
  validateReadinessDetails(r);
  return r;
}

export interface VisualReportOptions {
  /** Readiness scan used only after validation as a comparison baseline. */
  baseline?: ScanReport;
  site?: SiteAuditReport;
  baselineSite?: SiteAuditReport;
  /** Demo label must be explicit; ordinary reports are never labeled synthetic. */
  demo?: boolean;
}

function previewMarkup(page: PageAnalysis, side: 'Before' | 'Current'): string {
  const preview = page.sourcePreview;
  if (!preview) return `<div class="source-preview"><h4>${side} source</h4><p class="scope">Source preview unavailable. This report does not include bounded source details.</p></div>`;
  return `<div class="source-preview"><h4>${side} source <span class="badge">${escape(preview.format)}</span> <span class="badge" data-source-capture="${escape(preview.capture)}">Evaluated ${escape(captureLabel(preview.capture))}</span></h4>${preview.truncated ? '<p class="scope">Excerpt truncated by the scanner.</p>' : '<p class="scope">Complete bounded excerpt of the evaluated source.</p>'}<pre><code>${escape(preview.text)}</code></pre></div>`;
}

function ruleDiagnostics(page: PageAnalysis, dimension: Dimension): string {
  if (!page.ruleResults) {
    return '<p class="scope rule-unavailable">Rule details were not recorded in this report. Older reports remain valid for current readiness values.</p>';
  }
  const rows = page.ruleResults.filter(rule => rule.dimension === dimension).map(rule => {
    const diagnostics = [
      ...rule.issues.map(issue => `<li><span class="badge ${escape(issue.severity)}">${escape(issue.severity)}</span>${escape(issue.message)}</li>`),
      ...rule.suggestions.map(suggestion => `<li><span class="badge info">suggested</span><strong>${escape(suggestion.action)}</strong><span>${escape(suggestion.detail)}</span></li>`),
    ];
    return `<tr><td><code>${escape(rule.id)}</code></td><td>${rule.score}<small> / ${rule.maxScore}</small></td><td>${rule.weight}</td><td>${diagnostics.length ? `<ul class="diagnostics">${diagnostics.join('')}</ul>` : '<span class="scope">No rule diagnostics.</span>'}</td></tr>`;
  }).join('');
  if (!rows) return '<p class="scope">No rules in this dimension were recorded for this page.</p>';
  return `<section class="rule-page"><h4>${escape(page.title || 'Untitled page')}</h4><p class="source">${escape(page.url)}</p><div class="table-wrap"><table class="rule-table"><thead><tr><th>Rule</th><th>Original result</th><th>Weight</th><th>Diagnostic messages</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/** Self-contained, offline HTML. Source content is escaped and never executed. */
export function renderVisualReport(input: ScanReport, options: VisualReportOptions = {}): string {
  const report = parseScanReport(input);
  const baseline = options.baseline ? parseScanReport(options.baseline) : undefined;
  const readiness = baseline ? compareReadiness(report, baseline) : undefined;
  const readinessChanges = new Map(readiness?.changes.map(change => [change.key, change]) ?? []);
  const site = options.site ? parseSiteReport(options.site) : undefined;
  if (options.baselineSite && !site) throw new Error('A site report is required with a site baseline.');
  const metrics = site ? summarizeSite(site, options.baselineSite) : undefined;
  const issues = report.pages.flatMap(page => page.issues.map(issue => ({ ...issue, page: page.url })));
  const suggestions = report.pages.flatMap(page => page.suggestions.map(suggestion => ({ ...suggestion, page: page.url })));
  const total = report.pages.length ? report.overall.total : null;
  const totalChange = readinessChanges.get('total');
  const scoreBars = dimensions.map(([key, label, max]) => {
    const change = readinessChanges.get(key);
    const comparison = readiness?.comparable && change
      ? `<span class="dimension-baseline"><span>Baseline ${change.before} / ${change.max} <strong class="${change.delta && change.delta < 0 ? 'negative' : 'positive'}">${signed(change.delta)}</strong></span><span class="baseline-track" aria-label="Baseline ${change.before} of ${change.max}"><i style="width:${change.before / change.max * 100}%"></i></span></span>`
      : '';
    return `<details class="dimension" data-dimension="${key}"><summary><span class="dimension-label">${label}<small class="rule-affordance">View rules</small></span><strong>${report.pages.length ? report.overall[key] : '—'}<small> / ${max}</small></strong><meter min="0" max="${max}" value="${report.pages.length ? report.overall[key] : 0}" aria-label="${label}">${report.overall[key]} of ${max}</meter>${comparison}</summary><div class="rule-drilldown" data-rule-drilldown="${key}"><p class="scope">Dimension values are weighted, then rounded aggregates. The rule table shows original rule results; zero-point rules are diagnostic only and add no inferred contribution.</p>${report.pages.map(page => ruleDiagnostics(page, key)).join('')}</div></details>`;
  }).join('');
  const bins = [
    { id: '70-100', label: '70–100', count: report.pages.filter(page => page.scores.total >= 70).length, cls: 'good' },
    { id: '40-69', label: '40–69', count: report.pages.filter(page => page.scores.total >= 40 && page.scores.total < 70).length, cls: 'review' },
    { id: '0-39', label: '0–39', count: report.pages.filter(page => page.scores.total < 40).length, cls: 'poor' },
  ];
  const histogram = bins.map(bin => `<button type="button" class="histogram-row chart-button" data-score-bin="${bin.id}" aria-label="Show ${bin.label} readiness pages"><span>${bin.label}</span><span class="track"><i class="${bin.cls}" style="width:${report.pages.length ? bin.count / report.pages.length * 100 : 0}%"></i></span><strong>${bin.count}</strong></button>`).join('');
  const severityCounts = ['critical', 'warning', 'info'].map(label => ({ label, count: issues.filter(issue => issue.severity === label).length }));
  const severity = severityCounts.map(item => `<span class="segment ${item.label}" style="flex:${item.count || 0}" title="${item.label}: ${item.count}"></span>`).join('');
  const legend = severityCounts.map(item => `<button type="button" class="legend-button" data-severity-filter="${item.label}"><i class="dot ${item.label}"></i>${item.label} <strong>${item.count}</strong></button>`).join('');
  const metricValue = (id: string) => metrics?.metrics.find(metric => metric.id === id)?.value ?? null;
  const siteChanges = metrics?.comparison;
  const compared = ['missing-canonicals', 'broken-targets', 'duplicate-titles', 'sitemap-omissions'].map(id => {
    const metric = metrics?.metrics.find(item => item.id === id);
    if (!metric) return '';
    const change = siteChanges?.changes.find(item => item.id === id);
    const maximum = Math.max(change?.before ?? 0, metric.value ?? 0, 1);
    return `<div class="comparison-row"><button type="button" class="metric-drilldown" data-site-metric="${id}">${escape(metric.label)}<span>Show exact affected evidence</span></button><div class="pair">
${siteChanges?.comparable && change?.before !== null ? `<div class="bar-line"><span>Before</span><span class="track"><i class="previous" style="width:${(change?.before ?? 0) / maximum * 100}%"></i></span><b>${change?.before ?? 'N/A'}</b></div>` : ''}
      <div class="bar-line"><span>Current</span><span class="track"><i class="${metric.value ? 'review' : 'good'}" style="width:${(metric.value ?? 0) / maximum * 100}%"></i></span><b>${metric.value ?? 'N/A'}</b></div></div></div>`;
  }).join('');
  const siteEvidence = site ? Object.entries(siteMetricKinds).map(([metricId, kind]) => {
    const findings = site.findings;
    const matching = findings?.filter(finding => finding.kind === kind) ?? [];
    return `<div data-site-finding-for="${metricId}" hidden>${findings === undefined
      ? '<p class="scope">Exact affected evidence is unavailable because this older site audit has no complete findings collection.</p>'
      : matching.length
        ? `<ul class="site-finding-list">${matching.map(finding => `<li><strong>${sourceLabel(finding.target)}</strong><code>${escape(finding.target)}</code></li>`).join('')}</ul>`
        : '<p class="scope">No currently recorded findings of this kind.</p>'}</div>`;
  }).join('') : '';
  const siteHealth = metrics ? `<section class="section"><div class="section-title"><div><h2>Website health</h2><p>${escape(site!.startUrl)} · ${escape(site!.timestamp)}</p></div><span class="badge">${site!.crawledPages} crawled pages</span></div>
    <p class="scope">${escape(metrics.scope)}</p>
    <div class="health-layout"><div><h3>HTTP responses</h3>${[
      ['HTTP 2xx', 'successful-pages', 'good'], ['HTTP 4xx / 5xx', 'failed-pages', 'poor'], ['No response', 'unavailable-pages', 'review'],
    ].map(([label, id, cls]) => `<div class="histogram-row"><span>${label}</span><span class="track"><i class="${cls}" style="width:${site!.crawledPages ? (metricValue(id) ?? 0) / site!.crawledPages * 100 : 0}%"></i></span><strong>${metricValue(id) ?? 'N/A'}</strong></div>`).join('')}<p class="scope">Redirects and other response codes remain in the full metrics table.</p></div>
    <div><h3>${siteChanges?.comparable ? 'Before and current' : 'Current observations'}</h3><p class="scope">Each metric has its own scale. Select a metric to inspect its complete affected evidence.</p>${siteChanges && !siteChanges.comparable ? `<p class="scope">Comparison unavailable. ${escape(siteChanges.reasons.join(' '))}</p>` : ''}${compared}</div></div>
    <section id="site-findings-panel" class="site-findings" hidden aria-live="polite"><div class="section-title"><h3 id="site-findings-title">Affected evidence</h3><button type="button" id="clear-site-findings">Hide evidence</button></div>${siteEvidence}</section>
    <details class="metric-details"><summary>Explore all 19 site metrics</summary><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Current</th><th>Change</th></tr></thead><tbody>${metrics.metrics.map(metric => { const delta = siteChanges?.changes.find(change => change.id === metric.id)?.delta; return `<tr><td>${escape(metric.label)}</td><td>${metric.value === null ? 'Not measured' : `${metric.value} ${metric.unit}`}</td><td>${delta === null || delta === undefined ? 'N/A' : signed(delta)}</td></tr>`; }).join('')}</tbody></table></div></details></section>` : `<section class="section"><h2>Website health</h2><p>Add an audit-site JSON report with <code>--site</code> to see HTTP, link, canonical and sitemap charts alongside the readiness score.</p></section>`;
  const pageRows = report.pages.map(page => `<tr data-score-band="${scoreBand(page.scores.total)}"><td><strong>${escape(page.title || 'Untitled page')}</strong><small>${escape(page.url)}</small></td><td><span class="score-chip ${band(page.scores.total)}">${page.scores.total}</span></td>${dimensions.map(([key, , max]) => `<td>${page.scores[key]}<small> / ${max}</small></td>`).join('')}<td>${page.issues.length}</td></tr>`).join('');
  const issueRows = issues.map(issue => `<details class="finding" data-severity="${escape(issue.severity)}"><summary><span class="badge ${escape(issue.severity)}">${escape(issue.severity)}</span><strong>${escape(issue.message)}</strong></summary><div class="finding-body"><p class="source">${escape(issue.page)}</p>${issue.selector ? `<pre><code>${escape(issue.selector)}</code></pre>` : ''}${issue.line ? `<p>Source line ${escape(issue.line)}</p>` : ''}<p>Dimension · ${escape(issue.dimension)}</p></div></details>`).join('');
  const auditExamples = site?.checks.filter(check => check.status === 'FAIL' || check.status === 'WARNING').map(check => `<details class="finding"><summary><span class="badge ${check.status === 'FAIL' ? 'critical' : 'warning'}">${escape(check.status)}</span><strong>${escape(check.label)}</strong></summary><div class="finding-body"><p>${escape(check.explanation)}</p><h4>Observed evidence</h4><pre><code>${escape(JSON.stringify(check.evidence, null, 2))}</code></pre>${check.remediation ? `<h4>Suggested action</h4><p>${escape(check.remediation)}</p>` : ''}<h4>Verify</h4><p>${escape(check.validation)}</p></div></details>`).join('') ?? '';
  const sourceComparisons = baseline ? readiness?.comparable
    ? `<section id="source-comparisons" class="section"><h2>Matched source excerpts</h2><p class="scope">These are escaped source excerpts captured before and after the scan. They are not a line diff or an automatic fix.</p>${readiness.pages.map(pair => `<article class="source-pair"><div class="source-pair-heading"><div><h3>${escape(pair.after.title || 'Untitled page')}</h3><p class="source">${escape(pair.url)}</p></div><p><span class="score-chip ${band(pair.before.scores.total)}">Before ${pair.before.scores.total} / 100</span> <span class="score-chip ${band(pair.after.scores.total)}">Current ${pair.after.scores.total} / 100</span></p></div><div class="source-grid">${previewMarkup(pair.before, 'Before')}${previewMarkup(pair.after, 'Current')}</div></article>`).join('')}</section>`
    : `<section id="source-comparisons" class="section"><h2>Matched source excerpts</h2><p class="scope">Baseline comparison unavailable. ${escape(readiness?.reasons.join(' ') ?? 'No comparable baseline was supplied.')} Source examples are withheld until both scans are comparable.</p></section>`
    : '';
  const baselineStatus = baseline
    ? readiness?.comparable && totalChange
      ? `<p class="baseline-status">Baseline ${totalChange.before} / 100 <strong class="${totalChange.delta && totalChange.delta < 0 ? 'negative' : 'positive'}">${signed(totalChange.delta)}</strong></p>`
      : `<p class="baseline-status scope">Baseline comparison unavailable. ${escape(readiness?.reasons.join(' ') ?? '')}</p>`
    : '<p class="baseline-status scope">No readiness baseline supplied.</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>geoptimize · Content readiness</title><style>
:root{color-scheme:dark;--bg:#101218;--surface:#191d27;--line:#343b4c;--text:#edf0f6;--muted:#adb6c9;--green:#71e8b2;--amber:#f3c775;--red:#ff9c9c;--blue:#a2bdff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}::selection{background:var(--green);color:var(--bg)}a{color:var(--green);text-underline-offset:.2em}button,input,select{font:inherit}button,summary{cursor:pointer}button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--green);outline-offset:4px}button:hover,summary:hover{background:#242b38}header{border-bottom:1px solid var(--line)}.topbar,main{max-width:1240px;margin:auto;padding:24px 36px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-size:23px;font-weight:750;letter-spacing:-.03em}.brand span{color:var(--green)}.topbar>span,.scope,small,.source{color:var(--muted)}main{padding-top:36px;padding-bottom:60px}h1,h2,h3,h4,p{margin:0}h1{font-size:34px;letter-spacing:-.025em;line-height:1.2}h2{font-size:23px;letter-spacing:-.02em}h3{font-size:17px;margin-bottom:12px}h4{margin:0}p{max-width:75ch}h1+p{margin-top:10px;color:var(--muted)}nav{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0;border-bottom:1px solid var(--line);padding-bottom:10px}button{background:transparent;color:var(--muted);border:0;border-radius:6px;padding:10px 18px}button[aria-pressed=true]{background:var(--surface);color:var(--green)}[hidden]{display:none!important}.score-layout{display:grid;grid-template-columns:minmax(240px,.8fr) 1.5fr;gap:60px;border-bottom:1px solid var(--line);padding:12px 0 36px}.score-number{font-size:88px;letter-spacing:-.04em;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}.score-number small{font-size:24px;letter-spacing:0}.score-label{font-size:17px;margin-bottom:12px}.score-description{font-size:14px;max-width:34ch;margin-top:12px;color:var(--muted)}.baseline-status{margin-top:12px;font-size:14px}.positive{color:var(--green)}.negative{color:var(--red)}.dimension{border-bottom:1px solid var(--line);padding:11px 0}.dimension:first-child{padding-top:0}.dimension summary{display:grid;grid-template-columns:minmax(120px,1fr) auto;column-gap:18px;align-items:center;list-style:none}.dimension summary::-webkit-details-marker{display:none}.dimension strong{font-variant-numeric:tabular-nums;text-align:right}.dimension meter{grid-column:1/-1;display:block;width:100%;height:10px;margin-top:8px;border:0;border-radius:3px;background:#30384a}.dimension meter::-webkit-meter-bar{background:#30384a;border:0;border-radius:3px}.dimension meter::-webkit-meter-optimum-value{background:var(--green);border-radius:3px}.dimension meter::-moz-meter-bar{background:var(--green)}.dimension-comparison{display:flex;justify-content:space-between;gap:16px;margin:12px 0 0;font-size:13px;color:var(--muted)}.rule-drilldown{padding:16px 0 4px}.rule-page{padding:18px 0;border-top:1px solid var(--line)}.rule-page:first-of-type{margin-top:16px}.rule-page h4{font-size:15px}.rule-page .source{margin:4px 0 12px}.rule-unavailable{margin:16px 0}.section{padding:32px 0;border-bottom:1px solid var(--line)}.section-title{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:16px}.section-title p{color:var(--muted);font-size:14px;overflow-wrap:anywhere;margin-top:6px}.chart-layout,.health-layout{display:grid;grid-template-columns:1fr 1fr;gap:60px}.histogram-row{display:grid;grid-template-columns:110px minmax(20px,1fr) 30px;align-items:center;gap:12px;margin:16px 0;font-size:14px}.histogram-row strong{text-align:right;font-variant-numeric:tabular-nums}.chart-button{width:100%;padding:0;border-radius:4px;text-align:left}.chart-button:hover{background:var(--surface)}.track{display:block;background:#30384a;height:12px;border-radius:3px;overflow:hidden}.track i{display:block;height:100%}.good{background:var(--green);color:#09291d}.review,.warning{background:var(--amber);color:#3b2606}.poor,.critical{background:var(--red);color:#3f1111}.info{background:var(--blue);color:#142240}.previous{background:#78849e}.stack{display:flex;height:24px;background:#30384a;border-radius:4px;overflow:hidden;margin:22px 0 16px}.legend{display:flex;gap:8px;flex-wrap:wrap;font-size:14px}.legend-button{display:flex;align-items:center;gap:7px;padding:7px 9px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%}.scope{font-size:14px;margin:12px 0 22px}.badge{display:inline-block;white-space:nowrap;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:650;background:var(--surface);color:var(--muted)}.section-title>.badge{border:1px solid var(--line)}.comparison-row{margin:16px 0 24px;font-size:14px}.metric-drilldown{display:flex;align-items:baseline;gap:10px;padding:0 0 8px;color:var(--text);text-align:left}.metric-drilldown span{color:var(--green);font-size:12px}.bar-line{display:grid;grid-template-columns:55px minmax(20px,1fr) 30px;gap:12px;align-items:center;font-size:12px;color:var(--muted);margin:7px 0}.bar-line b{text-align:right}.site-findings{margin-top:26px;border-top:1px solid var(--line);padding-top:18px}.site-findings .section-title{margin-bottom:6px}.site-finding-list,.diagnostics{margin:0;padding:0;list-style:none}.site-finding-list li{padding:12px 0;border-bottom:1px solid var(--line)}.site-finding-list strong{display:block;font-size:12px;color:var(--muted);font-weight:500}.site-finding-list code{display:block;margin-top:3px;overflow-wrap:anywhere}.metric-details{margin-top:26px;border-top:1px solid var(--line);padding-top:16px}summary{padding:12px 0}.table-wrap{max-width:100%}table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;color:var(--muted);font-weight:500;white-space:nowrap}td,th{padding:15px 12px;border-bottom:1px solid var(--line)}td:first-child,th:first-child{padding-left:0}td small{display:block;max-width:360px;overflow-wrap:anywhere}td:not(:first-child){font-variant-numeric:tabular-nums;white-space:nowrap}.rule-table{min-width:720px}.rule-table td:last-child{white-space:normal}.diagnostics li{display:grid;grid-template-columns:auto 1fr;gap:7px;align-items:start;margin:6px 0}.diagnostics strong{grid-column:2;text-align:left}.diagnostics span:not(.badge){grid-column:2;white-space:normal}.score-chip{display:inline-block;padding:4px 9px;border-radius:4px;font-weight:700}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:22px 0}.controls label{display:flex;align-items:center;gap:10px;font-size:14px}.controls input,.controls select{padding:9px 12px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:6px;max-width:100%;caret-color:var(--green)}#page-filter-status{color:var(--muted);font-size:14px}.finding{border-bottom:1px solid var(--line)}.finding summary{display:flex;align-items:baseline;gap:14px;list-style:none}.finding summary::before{content:'+';color:var(--muted);font-size:20px}.finding[open] summary::before{content:'−'}.finding summary strong{font-weight:500}.finding-body{padding:8px 0 24px 30px}.source{font-size:14px;overflow-wrap:anywhere}.finding-body p{margin-top:8px}pre{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface);padding:20px;border-radius:8px;font-size:13px;margin:12px 0}code{font-family:ui-monospace,Menlo,monospace}.empty{padding:28px 0;color:var(--muted)}.recommendation{padding:20px 0;border-bottom:1px solid var(--line)}.recommendation h3{margin-bottom:8px}.recommendation p{color:var(--muted);font-size:14px}.source-pair{padding:28px 0;border-bottom:1px solid var(--line)}.source-pair:last-child{border-bottom:0}.source-pair-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:18px}.source-preview h4 .badge{margin-left:6px;text-transform:uppercase}.source-preview .scope{margin:6px 0}.footer{color:var(--muted);font-size:13px;margin-top:30px}.footer p+p{margin-top:8px}@media(max-width:760px){.topbar,main{padding-left:20px;padding-right:20px}.topbar{align-items:flex-start;flex-direction:column;gap:4px}.topbar>span{font-size:12px}h1{font-size:29px}.score-layout,.chart-layout,.health-layout,.source-grid{grid-template-columns:1fr;gap:30px}.score-number{font-size:68px}.score-description{max-width:65ch}.section-title,.source-pair-heading{align-items:flex-start;flex-direction:column;gap:10px}.dimension summary{grid-template-columns:minmax(0,1fr) auto}.histogram-row{grid-template-columns:100px minmax(20px,1fr) 25px}.finding summary{gap:9px;flex-wrap:wrap}.finding summary strong{flex-basis:100%}.finding-body{padding-left:0}.controls label{width:100%;flex-wrap:wrap}.controls input{width:100%}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{min-width:820px}.rule-table{min-width:720px}nav button{padding:9px 13px}th,td{padding:12px 9px}}@media print{nav,.controls,.site-findings button{display:none}[data-panel][hidden]{display:block!important}body{background:white;color:#111;overflow:visible}.section,.finding,.source-pair{break-inside:avoid}.scope,small,.source{color:#444}}
</style><style>.score-layout>*,.chart-layout>*,.health-layout>*,.source-grid>*,.source-pair-heading>*{min-width:0}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.dimension-baseline{grid-column:1/-1;display:grid;grid-template-columns:1fr;align-items:center;gap:6px;margin-top:9px;font-size:12px;color:var(--muted)}.dimension-baseline strong{margin-left:6px}.baseline-track{height:7px;background:#30384a;border-radius:3px;overflow:hidden}.baseline-track i{display:block;height:100%;background:#78849e}.rule-affordance{display:block;margin-top:2px;font-size:11px}</style></head><body><header><div class="topbar"><div class="brand"><span>&gt;_</span> geoptimize</div><span>${options.demo ? 'Synthetic demonstration · ' : ''}${escape(report.timestamp)}</span></div></header><main>
<h1>Content readiness</h1><p>Your five-dimension score, website observations and page-level evidence in one report.</p>
<nav aria-label="Report views"><button type="button" data-view="overview" aria-pressed="true">Overview</button><button type="button" data-view="pages" aria-pressed="false">Pages · ${report.pages.length}</button><button type="button" data-view="evidence" aria-pressed="false">Evidence · ${issues.length}</button>${baseline ? '<button type="button" data-view="sources" aria-pressed="false">Sources</button>' : ''}</nav>
<div data-panel="overview"><section class="score-layout" aria-label="Content readiness score"><div><p class="score-label">Overall readiness</p><div class="score-number">${total ?? 'N/A'}<small> / 100</small></div><p>${report.pages.length} ${report.pages.length === 1 ? 'page' : 'pages'} assessed</p>${baselineStatus}<p class="score-description">Heuristic readiness under the existing five-dimension rules. Search visibility and citation outcomes are measured separately.</p></div><div>${scoreBars}</div></section>
<section class="section chart-layout"><div><h2>Page score distribution</h2><p class="scope">Select a score band to filter the Pages view.</p>${histogram}</div><div><h2>Findings by severity</h2><p class="scope">${issues.length} observations across the scored pages. Select a severity to filter Evidence.</p><div class="stack" role="img" aria-label="${escape(severityCounts.map(item => `${item.count} ${item.label}`).join(', '))}">${severity}</div><div class="legend">${legend}</div>${issues.length === 0 ? '<p class="scope">No scoring issues were reported. Suggestions may still apply.</p>' : ''}</div></section>${siteHealth}</div>
<div data-panel="pages" hidden><h2>Page-by-page scores</h2><div class="controls"><label>Find a page <input id="page-search" type="search" placeholder="Search title or URL"></label><button type="button" id="clear-page-filter" hidden>Clear score filter</button><span id="page-filter-status" role="status" aria-live="polite"></span></div><div class="table-wrap"><table><thead><tr><th>Page</th><th>Total / 100</th>${dimensions.map(([, label]) => `<th>${label}</th>`).join('')}<th>Findings</th></tr></thead><tbody id="page-rows">${pageRows}</tbody></table></div><p id="no-pages" class="empty" ${report.pages.length ? 'hidden' : ''}>No matching pages. Clear the search or score filter, or scan a directory containing HTML files.</p></div>
<div data-panel="evidence" hidden><h2>Inspect the evidence</h2><p class="scope">Open an observation to inspect its source. Recommendations are shown separately.</p><div class="controls"><label>Scoring severity <select id="severity"><option value="all">All scoring observations</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select></label></div><div id="findings">${issueRows}</div><p id="no-findings" class="empty" ${issues.length ? 'hidden' : ''}>No scoring observations match this filter.</p>${site ? `<section class="section"><h2>Site audit examples</h2><p class="scope">${escape(site.startUrl)} · ${escape(site.timestamp)}</p>${auditExamples || '<p class="empty">No site audit warnings or failures were reported.</p>'}</section>` : ''}<section class="section"><h2>Suggested improvements</h2>${suggestions.map(suggestion => `<article class="recommendation"><h3>${escape(suggestion.action)}</h3><p>${escape(suggestion.detail)}</p><p class="source">${escape(suggestion.page)}</p></article>`).join('') || '<p class="empty">No suggestions in this scan.</p>'}</section></div>
${baseline ? `<div data-panel="sources" hidden>${sourceComparisons}</div>` : ''}<footer class="footer"><p>Readiness scan · ${escape(report.timestamp)} · ${report.pages.length} pages</p>${site ? `<p>Site audit · ${escape(site.startUrl)} · ${escape(site.timestamp)} · ${site.crawledPages} pages. Its scope can differ from the readiness scan.</p>` : ''}<p>AI mentions, citations, traffic and conversions · Not measured</p></footer></main><script>
const showPanel=view=>{for(const tab of document.querySelectorAll('[data-view]'))tab.setAttribute('aria-pressed',String(tab.dataset.view===view));for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==view;};
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>showPanel(button.dataset.view));
const pageSearch=document.querySelector('#page-search'),clearPageFilter=document.querySelector('#clear-page-filter'),pageStatus=document.querySelector('#page-filter-status'),noPages=document.querySelector('#no-pages');let selectedScoreBand='all';
const applyPageFilter=()=>{let count=0;const query=pageSearch.value.toLowerCase();for(const row of document.querySelectorAll('#page-rows tr')){const visible=(selectedScoreBand==='all'||row.dataset.scoreBand===selectedScoreBand)&&row.textContent.toLowerCase().includes(query);row.hidden=!visible;if(visible)count++;}const total=document.querySelectorAll('#page-rows tr').length;noPages.hidden=count>0;clearPageFilter.hidden=selectedScoreBand==='all';pageStatus.textContent=selectedScoreBand==='all'?'Showing '+count+' of '+total+' pages':'Showing '+count+' of '+total+' pages in '+selectedScoreBand.replace('-', '–');};
pageSearch.addEventListener('input',applyPageFilter);clearPageFilter.addEventListener('click',()=>{selectedScoreBand='all';applyPageFilter();});for(const button of document.querySelectorAll('[data-score-bin]'))button.addEventListener('click',()=>{selectedScoreBand=button.dataset.scoreBin;showPanel('pages');applyPageFilter();pageStatus.focus?.();});applyPageFilter();
const severity=document.querySelector('#severity'),noFindings=document.querySelector('#no-findings');const applySeverity=()=>{let count=0;for(const row of document.querySelectorAll('#findings details')){row.hidden=severity.value!=='all'&&row.dataset.severity!==severity.value;if(!row.hidden)count++;}noFindings.hidden=count>0;};severity.addEventListener('change',applySeverity);for(const button of document.querySelectorAll('[data-severity-filter]'))button.addEventListener('click',()=>{severity.value=button.dataset.severityFilter;showPanel('evidence');applySeverity();severity.focus();});applySeverity();
const sitePanel=document.querySelector('#site-findings-panel'),siteTitle=document.querySelector('#site-findings-title');for(const button of document.querySelectorAll('[data-site-metric]'))button.addEventListener('click',()=>{const metric=button.dataset.siteMetric;sitePanel.hidden=false;for(const block of document.querySelectorAll('[data-site-finding-for]'))block.hidden=block.dataset.siteFindingFor!==metric;siteTitle.textContent=button.textContent.trim().replace('Show exact affected evidence','').trim();sitePanel.scrollIntoView({block:'nearest'});});document.querySelector('#clear-site-findings')?.addEventListener('click',()=>{sitePanel.hidden=true;});
</script></body></html>`;
}
