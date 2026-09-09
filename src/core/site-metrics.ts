import type { SiteAuditReport, SiteFinding } from './types.js';

export interface SiteMetric {
  id: string;
  label: string;
  value: number | null;
  unit: 'pages' | 'urls' | 'groups';
}

export interface SiteMetricsReport {
  contractVersion: '1.0';
  startUrl: string;
  timestamp: string;
  scope: string;
  metrics: SiteMetric[];
  comparison: null | {
    baselineTimestamp: string;
    comparable: boolean;
    reasons: string[];
    findings: null | { added: SiteFinding[]; noLongerObserved: SiteFinding[]; persisting: SiteFinding[] };
    changes: { id: string; before: number | null; after: number | null; delta: number | null }[];
  };
}

/** Validate imported evidence before displaying counts or computing differences. */
export function parseSiteReport(value: unknown): SiteAuditReport {
  const r = value as SiteAuditReport;
  const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  if (!r || r.contractVersion !== '1.0' || (r.metricEvidenceVersion !== undefined && r.metricEvidenceVersion !== '1.0') || typeof r.startUrl !== 'string' ||
      typeof r.origin !== 'string' || typeof r.timestamp !== 'string' || !Number.isFinite(Date.parse(r.timestamp)) ||
      !count(r.maxPages) || r.maxPages < 1 || r.maxPages > 200 ||
      !count(r.crawledPages) || r.crawledPages > r.maxPages || typeof r.truncated !== 'boolean' ||
      !Array.isArray(r.pages) || r.pages.length !== r.crawledPages ||
      !r.robots || !Array.isArray(r.robots.skippedUrls) ||
      !Array.isArray(r.checks)) throw new Error('Expected an audit-site JSON report with contractVersion 1.0.');
  const url = (v: unknown) => {
    if (typeof v !== 'string') return false;
    try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; }
  };
  if (!url(r.startUrl) || !url(r.origin) ||
      r.pages.some(p => !p || !url(p.requestedUrl) || !url(p.finalUrl) || !count(p.status) || p.status > 599 ||
        !Array.isArray(p.redirects)) ||
      new Set(r.pages.map(p => p.requestedUrl)).size !== r.pages.length ||
      r.robots.skippedUrls.some(v => !url(v)) ||
      r.checks.some(c => !c || typeof c.id !== 'string' || !['PASS', 'WARNING', 'FAIL', 'N/A'].includes(c.status) ||
        !Array.isArray(c.evidence) || c.evidence.some(e => !e || !e.observed || typeof e.observed !== 'object')) ||
      new Set(r.checks.map(c => c.id)).size !== r.checks.length) {
    throw new Error('Invalid site-audit evidence.');
  }
  if (r.findings !== undefined && (!Array.isArray(r.findings) || r.findings.some(f =>
    !f || typeof f.kind !== 'string' || typeof f.target !== 'string'))) throw new Error('Invalid site findings.');
  return r;
}

function metrics(r: SiteAuditReport): SiteMetric[] {
  const result: SiteMetric[] = [];
  const add = (id: string, label: string, value: number | null, unit: SiteMetric['unit'] = 'urls') =>
    result.push({ id, label, value, unit });
  const evidence = (id: string, field: string): number | null => {
    const check = r.checks.find(c => c.id === id);
    if (!check || check.status === 'N/A') return null;
    const value = check.evidence.find(e => field in e.observed)?.observed[field];
    if (value === undefined) return null; // Older reports have samples, not complete counts.
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid count for ${id}.${field}.`);
    }
    return value;
  };
  add('crawled-pages', 'Crawled pages', r.crawledPages, 'pages');
  add('successful-pages', 'HTTP 2xx pages', r.pages.filter(p => p.status >= 200 && p.status < 300).length, 'pages');
  add('failed-pages', 'HTTP 4xx/5xx pages', r.pages.filter(p => p.status >= 400).length, 'pages');
  add('unavailable-pages', 'Requests without response', r.pages.filter(p => p.status === 0).length, 'pages');
  add('redirected-pages', 'Pages with redirects', r.pages.filter(p => p.redirects.length > 0).length, 'pages');
  add('long-redirects', 'Multi-hop redirects', r.pages.filter(p => p.redirects.length > 1).length, 'pages');
  add('robots-skipped', 'URLs skipped by robots policy', new Set(r.robots.skippedUrls).size);
  const fields: [string, string, string, string, SiteMetric['unit']][] = [
    ['queued-urls', 'Queued URLs not crawled', 'crawl-coverage', 'queuedUrlCount', 'urls'],
    ['internal-targets', 'Discovered internal targets', 'internal-link-targets', 'discoveredTargetCount', 'urls'],
    ['broken-targets', 'Confirmed broken internal targets', 'internal-link-targets', 'brokenTargetCount', 'urls'],
    ['unchecked-targets', 'Unverified internal targets', 'internal-link-targets', 'uncheckedTargetCount', 'urls'],
    ['missing-canonicals', 'Pages missing canonical', 'canonical-consistency', 'missingCanonicalCount', 'pages'],
    ['malformed-canonicals', 'Malformed canonical entries', 'canonical-consistency', 'malformedCanonicalCount', 'urls'],
    ['nonself-canonicals', 'Non-self canonical entries', 'canonical-consistency', 'nonSelfCanonicalCount', 'urls'],
    ['shared-canonicals', 'Shared canonical groups', 'canonical-consistency', 'sharedCanonicalGroupCount', 'groups'],
    ['sitemap-urls', 'Discovered sitemap URLs', 'sitemap-consistency', 'sitemapUrlCount', 'urls'],
    ['sitemap-omissions', 'Crawled URLs missing from sitemap', 'sitemap-consistency', 'crawledButMissingCount', 'urls'],
    ['orphan-candidates', 'Sitemap-only orphan candidates', 'orphan-candidates', 'candidateCount', 'urls'],
    ['duplicate-titles', 'Duplicate title groups', 'duplicate-titles', 'duplicateGroupCount', 'groups'],
  ];
  for (const [id, label, check, field, unit] of fields) add(id, label, evidence(check, field), unit);
  return result;
}

export function summarizeSite(current: SiteAuditReport, baseline?: SiteAuditReport): SiteMetricsReport {
  parseSiteReport(current);
  const values = metrics(current);
  let comparison: SiteMetricsReport['comparison'] = null;
  if (baseline) {
    parseSiteReport(baseline);
    const before = metrics(baseline);
    const reasons: string[] = [];
    const sameSet = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
    if (!current.metricEvidenceVersion || current.metricEvidenceVersion !== baseline.metricEvidenceVersion) reasons.push('Metric evidence version is missing or changed.');
    if (current.startUrl !== baseline.startUrl || current.origin !== baseline.origin) reasons.push('Start URL or origin changed.');
    if (current.maxPages !== baseline.maxPages) reasons.push('Page limit changed.');
    if (current.truncated || baseline.truncated) reasons.push('At least one crawl reached its page limit.');
    if (!sameSet(current.pages.map(p => p.requestedUrl), baseline.pages.map(p => p.requestedUrl))) reasons.push('Crawled URL set changed.');
    if (current.robots.skippedUrls.length || baseline.robots.skippedUrls.length) reasons.push('Robots policy left URLs uninspected.');
    if (current.pages.some(p => p.status === 0) || baseline.pages.some(p => p.status === 0)) reasons.push('At least one request has no response.');
    if (Date.parse(current.timestamp) < Date.parse(baseline.timestamp)) reasons.push('Baseline is newer than the current report.');
    comparison = {
      baselineTimestamp: baseline.timestamp,
      comparable: reasons.length === 0,
      reasons,
      findings: null,
      changes: values.map((metric, i) => ({
        id: metric.id, before: before[i].value, after: metric.value,
        delta: reasons.length || metric.value === null || before[i].value === null ? null : metric.value - before[i].value!,
      })),
    };
  }
  if (comparison?.comparable && current.findings && baseline?.findings) {
    const key = (f: SiteFinding) => JSON.stringify([f.kind, f.target]);
    const previous = new Map(baseline.findings.map(f => [key(f), f]));
    const next = new Map(current.findings.map(f => [key(f), f]));
    comparison.findings = {
      added: [...next].filter(([id]) => !previous.has(id)).map(([, f]) => f),
      noLongerObserved: [...previous].filter(([id]) => !next.has(id)).map(([, f]) => f),
      persisting: [...next].filter(([id]) => previous.has(id)).map(([, f]) => f),
    };
  }
  return {
    contractVersion: '1.0', startUrl: current.startUrl, timestamp: current.timestamp,
    scope: `Response HTML; ${current.crawledPages} crawled pages; limit ${current.maxPages}; ${current.truncated ? 'partial queue' : 'queue completed'}. Counts describe this crawl, not the entire indexed site.`,
    metrics: values, comparison,
  };
}
