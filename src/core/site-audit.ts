import * as cheerio from 'cheerio';
import { fetchUrlResource, parseHtml, type UrlResource } from './scanner.js';
import type {
  AuditCheck,
  AuditEvidence,
  AuditStatus,
  ParsedDocument,
  SiteAuditPage,
  SiteAuditReport,
  SiteAuditSitemap,
} from './types.js';

const SITE_AUDIT_CONTRACT_VERSION = '1.0' as const;
const DEFAULT_MAX_PAGES = 20;
const MAX_ALLOWED_PAGES = 200;
const MAX_SITEMAPS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const SITE_AUDIT_USER_AGENT = 'geoptimize-site-audit';

export interface SiteAuditOptions {
  maxPages?: number;
}

interface RobotsRule {
  directive: 'allow' | 'disallow';
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  sitemapUrls: string[];
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

interface SitemapParseResult {
  kind: SiteAuditSitemap['kind'];
  urls: string[];
}

interface CrawledPage {
  output: SiteAuditPage;
  document: ParsedDocument | null;
  internalTargets: string[];
  blocksIndexing: boolean;
}

function normalizeUrl(value: string, base?: string): string {
  const url = base ? new URL(value, base) : new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported scheme: ${url.protocol}`);
  }
  url.hash = '';
  return url.toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleMatches(rule: RobotsRule, pathAndQuery: string): boolean {
  if (!rule.pattern) return false;
  const anchored = rule.pattern.endsWith('$');
  const body = anchored ? rule.pattern.slice(0, -1) : rule.pattern;
  const expression = body.split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${expression}${anchored ? '$' : ''}`).test(pathAndQuery);
}

export function robotsAllows(urlValue: string, policy: RobotsPolicy): boolean {
  const url = new URL(urlValue);
  const pathAndQuery = `${url.pathname}${url.search}`;
  const matches = policy.rules
    .filter((rule) => ruleMatches(rule, pathAndQuery))
    .sort((left, right) => {
      const specificity = (rule: RobotsRule) => rule.pattern.replace(/[\*$]/g, '').length;
      const difference = specificity(right) - specificity(left);
      if (difference !== 0) return difference;
      return left.directive === 'allow' ? -1 : 1;
    });
  if (matches.length === 0) return true;
  return matches[0].directive === 'allow';
}

export function parseRobotsTxt(text: string, userAgent = SITE_AUDIT_USER_AGENT): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemapUrls.push(value);
      continue;
    }

    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && current) {
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ directive: field, pattern: value });
    }
  }

  const normalizedAgent = userAgent.toLowerCase();
  const specificGroups = groups.filter((group) =>
    group.agents.some((agent) => agent !== '*' && normalizedAgent.includes(agent)),
  );
  let selectedGroups: RobotsGroup[];
  if (specificGroups.length > 0) {
    const longestMatch = Math.max(...specificGroups.flatMap((group) =>
      group.agents
        .filter((agent) => agent !== '*' && normalizedAgent.includes(agent))
        .map((agent) => agent.length),
    ));
    selectedGroups = specificGroups.filter((group) =>
      group.agents.some((agent) => agent !== '*' && normalizedAgent.includes(agent) && agent.length === longestMatch),
    );
  } else {
    selectedGroups = groups.filter((group) => group.agents.includes('*'));
  }

  return {
    rules: selectedGroups.flatMap((group) => group.rules),
    sitemapUrls: [...new Set(sitemapUrls)],
  };
}

export function parseSitemapDocument(xml: string): SitemapParseResult {
  const $ = cheerio.load(xml, { xmlMode: true });
  if ($('sitemapindex').length > 0) {
    return {
      kind: 'index',
      urls: $('sitemap > loc').map((_, element) => $(element).text().trim()).get().filter(Boolean),
    };
  }
  if ($('urlset').length > 0) {
    return {
      kind: 'urlset',
      urls: $('url > loc').map((_, element) => $(element).text().trim()).get().filter(Boolean),
    };
  }
  return { kind: 'unknown', urls: [] };
}

function observed(source: AuditEvidence['source'], values: AuditEvidence['observed']): AuditEvidence {
  return { source, observed: values };
}

function check(
  id: string,
  label: string,
  status: AuditStatus,
  values: AuditEvidence['observed'],
  explanation: string,
  remediation: string | null,
  validation: string,
  source: AuditEvidence['source'] = 'derived',
): AuditCheck {
  return {
    id,
    label,
    status,
    evidence: [observed(source, values)],
    explanation,
    remediation,
    validation,
  };
}

function isHtmlResource(resource: UrlResource): boolean {
  return resource.contentType?.toLowerCase().includes('html') === true ||
    /^\s*(?:<!doctype\s+html|<html\b)/i.test(resource.html);
}

function blocksIndexing(document: ParsedDocument, xRobotsTag: string | null): boolean {
  const metaValues = document.metaTagValues;
  const directives = [
    ...(metaValues?.robots ?? (document.metaTags.robots ? [document.metaTags.robots] : [])),
    ...(metaValues?.googlebot ?? (document.metaTags.googlebot ? [document.metaTags.googlebot] : [])),
    xRobotsTag,
  ]
    .filter(Boolean)
    .join(', ');
  return /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(directives);
}

function internalUrl(href: string, baseUrl: string, origin: string): string | null {
  try {
    const resolved = normalizeUrl(href, baseUrl);
    return new URL(resolved).origin === origin ? resolved : null;
  } catch {
    return null;
  }
}

async function fetchForSite(url: string, allowedOrigin?: string): Promise<UrlResource> {
  return fetchUrlResource(url, {
    render: false,
    init: {
      headers: { 'user-agent': SITE_AUDIT_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
    allowedOrigin,
  });
}

async function loadRobots(origin: string): Promise<{
  url: string;
  status: number;
  policy: RobotsPolicy;
}> {
  const url = `${origin}/robots.txt`;
  try {
    const resource = await fetchForSite(url, origin);
    if (resource.status === 200) {
      return { url, status: 200, policy: parseRobotsTxt(resource.html, SITE_AUDIT_USER_AGENT) };
    }
    if (resource.status === 401 || resource.status === 403 || resource.status === 429 || resource.status >= 500) {
      return {
        url,
        status: resource.status,
        policy: { rules: [{ directive: 'disallow', pattern: '/' }], sitemapUrls: [] },
      };
    }
    return { url, status: resource.status, policy: { rules: [], sitemapUrls: [] } };
  } catch {
    return {
      url,
      status: 0,
      policy: { rules: [{ directive: 'disallow', pattern: '/' }], sitemapUrls: [] },
    };
  }
}

async function loadSitemaps(origin: string, initialUrls: string[]): Promise<{
  reports: SiteAuditSitemap[];
  pageUrls: string[];
}> {
  const reports: SiteAuditSitemap[] = [];
  const pageUrls: string[] = [];
  const queue = initialUrls.length > 0 ? [...initialUrls] : [`${origin}/sitemap.xml`];
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_SITEMAPS) {
    const rawUrl = queue.shift()!;
    let url: string;
    try {
      url = normalizeUrl(rawUrl, `${origin}/`);
    } catch {
      continue;
    }
    if (new URL(url).origin !== origin || visited.has(url)) continue;
    visited.add(url);

    try {
      const resource = await fetchForSite(url, origin);
      if (resource.status !== 200) {
        reports.push({ url, status: resource.status, kind: 'unknown', urlCount: 0 });
        continue;
      }
      const parsed = parseSitemapDocument(resource.html);
      reports.push({ url, status: resource.status, kind: parsed.kind, urlCount: parsed.urls.length });
      for (const location of parsed.urls) {
        try {
          const normalized = normalizeUrl(location, url);
          if (new URL(normalized).origin !== origin) continue;
          if (parsed.kind === 'index') queue.push(normalized);
          if (parsed.kind === 'urlset') pageUrls.push(normalized);
        } catch {
          // Invalid sitemap locations are ignored and surfaced through the unknown/missing coverage checks.
        }
      }
    } catch {
      reports.push({ url, status: 0, kind: 'unknown', urlCount: 0 });
    }
  }

  return { reports, pageUrls: [...new Set(pageUrls)] };
}

function validateMaxPages(value: number | undefined): number {
  const maxPages = value ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_ALLOWED_PAGES) {
    throw new Error(`--max-pages must be an integer from 1 to ${MAX_ALLOWED_PAGES}.`);
  }
  return maxPages;
}

export async function auditSite(startUrl: string, options: SiteAuditOptions = {}): Promise<SiteAuditReport> {
  const maxPages = validateMaxPages(options.maxPages);
  const requestedStartUrl = normalizeUrl(startUrl);
  const startResource = await fetchForSite(requestedStartUrl);
  const origin = new URL(startResource.finalUrl).origin;
  const normalizedStartUrl = normalizeUrl(startResource.finalUrl);

  const robotsResult = await loadRobots(origin);
  const sitemapResult = await loadSitemaps(origin, robotsResult.policy.sitemapUrls);
  const sitemapUrls = new Set(sitemapResult.pageUrls);
  const discoverySources = new Map<string, Set<string>>();
  const inlinks = new Map<string, Set<string>>();
  const allInternalTargets = new Set<string>();
  const robotsSkipped = new Set<string>();
  const visited = new Set<string>();
  const linkQueue: string[] = [];
  const sitemapQueue = [...sitemapUrls];
  const linkScheduled = new Set<string>();
  const pages: CrawledPage[] = [];

  const addSource = (url: string, source: string): void => {
    const sources = discoverySources.get(url) ?? new Set<string>();
    sources.add(source);
    discoverySources.set(url, sources);
  };

  addSource(normalizedStartUrl, 'start');
  for (const url of sitemapUrls) addSource(url, 'sitemap');

  const scheduleLink = (url: string, from: string): void => {
    addSource(url, `link:${from}`);
    const sources = inlinks.get(url) ?? new Set<string>();
    sources.add(from);
    inlinks.set(url, sources);
    allInternalTargets.add(url);
    if (!visited.has(url) && !linkScheduled.has(url)) {
      linkScheduled.add(url);
      linkQueue.push(url);
    }
  };

  const processResource = (requestedUrl: string, resource: UrlResource): void => {
    visited.add(requestedUrl);
    visited.add(normalizeUrl(resource.finalUrl));
    const htmlDocument = resource.status >= 200 && resource.status < 300 && isHtmlResource(resource)
      ? parseHtml(resource.html, resource.finalUrl)
      : null;
    const internalTargets: string[] = [];
    let externalLinkCount = 0;

    if (htmlDocument) {
      for (const link of htmlDocument.links) {
        const internal = internalUrl(link.href, resource.finalUrl, origin);
        if (internal) {
          internalTargets.push(internal);
          scheduleLink(internal, normalizeUrl(resource.finalUrl));
        } else {
          try {
            const target = new URL(link.href, resource.finalUrl);
            if (target.protocol === 'http:' || target.protocol === 'https:') externalLinkCount += 1;
          } catch {
            // Non-URL link targets are omitted from the external count.
          }
        }
      }
    }

    const combinedSources = new Set([
      ...(discoverySources.get(requestedUrl) ?? []),
      ...(discoverySources.get(normalizeUrl(resource.finalUrl)) ?? []),
    ]);
    pages.push({
      output: {
        requestedUrl,
        finalUrl: resource.finalUrl,
        status: resource.status,
        statusText: resource.statusText,
        redirects: resource.redirects.map((hop) => `${hop.status} ${hop.from} -> ${hop.to}`),
        contentType: resource.contentType,
        title: htmlDocument?.documentTitle || null,
        language: htmlDocument?.language || null,
        canonicalLinks: htmlDocument?.canonicalLinks ?? [],
        internalLinkCount: internalTargets.length,
        externalLinkCount,
        discoveredFrom: [...combinedSources].sort(),
      },
      document: htmlDocument,
      internalTargets,
      blocksIndexing: htmlDocument ? blocksIndexing(htmlDocument, resource.xRobotsTag) : false,
    });
  };

  if (robotsAllows(normalizedStartUrl, robotsResult.policy)) {
    processResource(normalizedStartUrl, startResource);
  } else {
    robotsSkipped.add(normalizedStartUrl);
  }

  while (pages.length < maxPages) {
    let nextUrl: string | undefined;
    while (linkQueue.length > 0 && !nextUrl) {
      const candidate = linkQueue.shift()!;
      if (!visited.has(candidate)) nextUrl = candidate;
    }
    while (!nextUrl && sitemapQueue.length > 0) {
      const candidate = sitemapQueue.shift()!;
      if (!visited.has(candidate)) nextUrl = candidate;
    }
    if (!nextUrl) break;

    if (!robotsAllows(nextUrl, robotsResult.policy)) {
      robotsSkipped.add(nextUrl);
      visited.add(nextUrl);
      continue;
    }

    try {
      const resource = await fetchForSite(nextUrl, origin);
      processResource(nextUrl, resource);
    } catch (error) {
      visited.add(nextUrl);
      pages.push({
        output: {
          requestedUrl: nextUrl,
          finalUrl: nextUrl,
          status: 0,
          statusText: error instanceof Error ? error.message : 'Request failed',
          redirects: [],
          contentType: null,
          title: null,
          language: null,
          canonicalLinks: [],
          internalLinkCount: 0,
          externalLinkCount: 0,
          discoveredFrom: [...(discoverySources.get(nextUrl) ?? [])].sort(),
        },
        document: null,
        internalTargets: [],
        blocksIndexing: false,
      });
    }
  }

  for (const page of pages) {
    const sources = new Set([
      ...(discoverySources.get(page.output.requestedUrl) ?? []),
      ...(discoverySources.get(normalizeUrl(page.output.finalUrl)) ?? []),
    ]);
    page.output.discoveredFrom = [...sources].sort();
  }

  const remainingUrls = [...linkQueue, ...sitemapQueue]
    .filter((url) => !visited.has(url) && robotsAllows(url, robotsResult.policy));
  const truncated = remainingUrls.length > 0;
  const pageLookup = new Map<string, CrawledPage>();
  for (const page of pages) {
    pageLookup.set(page.output.requestedUrl, page);
    pageLookup.set(normalizeUrl(page.output.finalUrl), page);
  }

  const failedPages = pages.filter((page) => page.output.status >= 400);
  const unavailablePages = pages.filter((page) => page.output.status === 0);
  const longRedirectChains = pages.filter((page) => page.output.redirects.length > 1);
  const brokenInternalTargets = [...allInternalTargets].filter((url) => {
    const page = pageLookup.get(url);
    return page ? page.output.status >= 400 : false;
  });
  const uncheckedInternalTargets = [...allInternalTargets].filter((url) =>
    (!pageLookup.has(url) || pageLookup.get(url)?.output.status === 0) && !robotsSkipped.has(url),
  );

  const htmlPages = pages.filter((page) => page.document !== null);
  const missingCanonicals: string[] = [];
  const malformedCanonicals: string[] = [];
  const nonSelfCanonicals: string[] = [];
  const canonicalOwners = new Map<string, string[]>();
  for (const page of htmlPages) {
    const canonicals = page.document!.canonicalLinks ?? [];
    if (canonicals.length === 0) {
      missingCanonicals.push(page.output.finalUrl);
      continue;
    }
    if (canonicals.length > 1) malformedCanonicals.push(page.output.finalUrl);
    for (const value of canonicals) {
      try {
        const resolved = normalizeUrl(value, page.output.finalUrl);
        const owners = canonicalOwners.get(resolved) ?? [];
        owners.push(page.output.finalUrl);
        canonicalOwners.set(resolved, owners);
        if (resolved !== normalizeUrl(page.output.finalUrl)) {
          nonSelfCanonicals.push(`${page.output.finalUrl} -> ${resolved}`);
        }
      } catch {
        malformedCanonicals.push(`${page.output.finalUrl} -> ${value}`);
      }
    }
  }
  const duplicateCanonicals = [...canonicalOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([canonical, owners]) => `${canonical} <= ${[...new Set(owners)].join(', ')}`);

  const titleOwners = new Map<string, string[]>();
  for (const page of htmlPages) {
    const title = page.output.title?.trim();
    if (!title) continue;
    const owners = titleOwners.get(title.toLocaleLowerCase()) ?? [];
    owners.push(page.output.finalUrl);
    titleOwners.set(title.toLocaleLowerCase(), owners);
  }
  const duplicateTitles = [...titleOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([title, owners]) => `${title} <= ${[...new Set(owners)].join(', ')}`);

  const brokenSitemapPages = [...sitemapUrls].filter((url) => {
    const page = pageLookup.get(url);
    return page ? page.output.status >= 400 : false;
  });
  const unavailableSitemapPages = [...sitemapUrls].filter((url) =>
    pageLookup.get(url)?.output.status === 0,
  );
  const failedSitemaps = sitemapResult.reports.filter((sitemap) =>
    sitemap.status !== 0 && sitemap.status !== 200 && sitemap.status !== 404,
  );
  const unavailableSitemaps = sitemapResult.reports.filter((sitemap) => sitemap.status === 0);
  const invalidSitemaps = sitemapResult.reports.filter((sitemap) =>
    sitemap.status === 200 && sitemap.kind === 'unknown',
  );
  const indexableCrawledUrls = pages
    .filter((page) => page.document && page.output.status >= 200 && page.output.status < 300 && !page.blocksIndexing)
    .map((page) => normalizeUrl(page.output.finalUrl));
  const missingFromSitemap = sitemapUrls.size > 0
    ? indexableCrawledUrls.filter((url) => !sitemapUrls.has(url))
    : [];
  const orphanCandidates = [...sitemapUrls].filter((url) => {
    if (url === normalizedStartUrl || robotsSkipped.has(url)) return false;
    const sources = [...(inlinks.get(url) ?? [])].filter((source) => source !== url);
    return sources.length === 0;
  });

  const robotsStatus: AuditStatus = robotsResult.status === 200
    ? 'PASS'
    : robotsResult.status === 404
      ? 'N/A'
      : 'WARNING';
  const canonicalStatus: AuditStatus = htmlPages.length === 0
    ? 'N/A'
    : malformedCanonicals.length > 0
      ? 'FAIL'
      : missingCanonicals.length > 0 || nonSelfCanonicals.length > 0 || duplicateCanonicals.length > 0
        ? 'WARNING'
        : 'PASS';
  const sitemapStatus: AuditStatus = failedSitemaps.length > 0 || invalidSitemaps.length > 0 || brokenSitemapPages.length > 0
      ? 'FAIL'
      : unavailableSitemaps.length > 0 || unavailableSitemapPages.length > 0 || missingFromSitemap.length > 0
        ? 'WARNING'
        : sitemapUrls.size === 0
          ? 'N/A'
          : 'PASS';

  const checks: AuditCheck[] = [
    check(
      'crawl-coverage',
      'Bounded crawl coverage',
      pages.length === 0 ? 'FAIL' : truncated ? 'WARNING' : 'PASS',
      { crawledPages: pages.length, maxPages, queuedButUnchecked: remainingUrls.slice(0, 20), truncated },
      truncated
        ? 'The page limit was reached while same-origin URLs remained in the deterministic queue.'
        : 'The deterministic queue completed within the configured page limit.',
      truncated ? 'Increase --max-pages only after reviewing the queued URL patterns and crawl cost.' : null,
      'Repeat the audit with the same start URL and limit, then compare the queue and page count.',
    ),
    check(
      'robots-policy',
      'robots.txt policy',
      robotsStatus,
      {
        url: robotsResult.url,
        status: robotsResult.status,
        applicableRules: robotsResult.policy.rules.map((rule) => `${rule.directive}: ${rule.pattern}`),
        skippedUrls: [...robotsSkipped].slice(0, 20),
      },
      robotsResult.status === 200
        ? 'Applicable geoptimize or wildcard rules were evaluated before subsequent page requests.'
        : robotsResult.status === 404
          ? 'No robots.txt file was found. Absence is not an error.'
          : 'robots.txt could not be used reliably, so the crawler conservatively avoided matching subsequent URLs.',
      robotsStatus === 'WARNING' ? 'Restore a readable robots.txt response and review the intended crawler policy.' : null,
      'Fetch robots.txt directly and compare the applicable user-agent group with the skipped URL sample.',
      'http',
    ),
    check(
      'site-http-status',
      'Page HTTP status',
      failedPages.length > 0 ? 'FAIL' : unavailablePages.length > 0 ? 'WARNING' : pages.length > 0 ? 'PASS' : 'N/A',
      {
        failedCount: failedPages.length,
        failedPages: failedPages.slice(0, 20).map((page) => `${page.output.status} ${page.output.requestedUrl}`),
        unavailableCount: unavailablePages.length,
        unavailablePages: unavailablePages.slice(0, 20).map((page) => page.output.requestedUrl),
      },
      failedPages.length > 0
        ? 'One or more crawled URLs failed to return a successful final response.'
        : unavailablePages.length > 0
          ? 'One or more page requests did not yield an HTTP response, so their status is unavailable.'
        : 'Every crawled page returned a successful final response.',
      failedPages.length > 0
        ? 'Repair, remove, or intentionally retire failed URLs and update links or sitemap entries that reference them.'
        : unavailablePages.length > 0
          ? 'Retry unavailable URLs and diagnose request or redirect-policy failures before classifying them.'
          : null,
      'Request each failed URL with redirects disabled and confirm the intended final status.',
      'http',
    ),
    check(
      'redirect-chains',
      'Redirect chains',
      pages.length === 0 ? 'N/A' : longRedirectChains.length > 0 ? 'WARNING' : 'PASS',
      {
        longChainCount: longRedirectChains.length,
        samples: longRedirectChains.slice(0, 20).map((page) => page.output.redirects.join(' | ')),
      },
      longRedirectChains.length > 0
        ? 'One or more requested URLs required multiple redirect hops.'
        : 'No multi-hop redirect chain was observed among crawled pages.',
      longRedirectChains.length > 0 ? 'Update internal links and redirect rules to target the final URL directly where appropriate.' : null,
      'Request each sample with redirects disabled and verify every hop plus the final destination.',
      'http',
    ),
    check(
      'internal-link-targets',
      'Internal link targets',
      brokenInternalTargets.length > 0
        ? 'FAIL'
        : uncheckedInternalTargets.length > 0
          ? 'WARNING'
          : allInternalTargets.size > 0
            ? 'PASS'
            : 'N/A',
      {
        discoveredTargetCount: allInternalTargets.size,
        brokenTargets: brokenInternalTargets.slice(0, 20),
        uncheckedTargets: uncheckedInternalTargets.slice(0, 20),
      },
      brokenInternalTargets.length > 0
        ? 'Confirmed internal link targets returned a failed response.'
        : uncheckedInternalTargets.length > 0
          ? 'Some discovered internal targets were not fetched within the current crawl boundary.'
          : 'Every discovered internal target within the crawl boundary returned a successful response.',
      brokenInternalTargets.length > 0
        ? 'Update links to a valid destination or restore the intended page.'
        : uncheckedInternalTargets.length > 0
          ? 'Review the unchecked URL patterns before increasing the page limit.'
          : null,
      'Re-run the bounded crawl and request each reported target independently.',
    ),
    check(
      'canonical-consistency',
      'Canonical consistency',
      canonicalStatus,
      {
        htmlPageCount: htmlPages.length,
        missingCanonicals: missingCanonicals.slice(0, 20),
        malformedCanonicals: malformedCanonicals.slice(0, 20),
        nonSelfCanonicals: nonSelfCanonicals.slice(0, 20),
        duplicateCanonicals: duplicateCanonicals.slice(0, 20),
      },
      canonicalStatus === 'PASS'
        ? 'Each inspected HTML page exposes one valid self-referencing canonical.'
        : canonicalStatus === 'N/A'
          ? 'No successful HTML page was available for canonical inspection.'
          : 'Canonical observations require repair or contextual review. A non-self canonical can be intentional.',
      canonicalStatus === 'FAIL'
        ? 'Emit one valid canonical URL per page.'
        : canonicalStatus === 'WARNING'
          ? 'Review missing, shared, and non-self canonicals against the intended URL strategy.'
          : null,
      'Fetch each affected final URL and compare its rendered canonical with the intended indexable URL.',
      'html',
    ),
    check(
      'sitemap-consistency',
      'Sitemap consistency',
      sitemapStatus,
      {
        sitemapCount: sitemapResult.reports.length,
        sitemapUrlCount: sitemapUrls.size,
        failedSitemaps: failedSitemaps.map((sitemap) => `${sitemap.status} ${sitemap.url}`).slice(0, 20),
        invalidSitemaps: invalidSitemaps.map((sitemap) => sitemap.url).slice(0, 20),
        unavailableSitemaps: unavailableSitemaps.map((sitemap) => sitemap.url).slice(0, 20),
        brokenSitemapPages: brokenSitemapPages.slice(0, 20),
        unavailableSitemapPages: unavailableSitemapPages.slice(0, 20),
        crawledButMissing: missingFromSitemap.slice(0, 20),
      },
      sitemapStatus === 'N/A'
        ? 'No readable sitemap URL set was discovered. A sitemap is optional for small sites.'
        : sitemapStatus === 'PASS'
          ? 'No failed sitemap page or crawled indexable URL omission was observed within this bounded sample.'
          : 'Sitemap fetches, listed pages, or bounded crawl coverage contain discrepancies.',
      sitemapStatus === 'FAIL'
        ? 'Repair unreadable sitemap files and remove or restore failed listed URLs.'
        : sitemapStatus === 'WARNING'
          ? 'Retry unavailable URLs, review omissions, and keep canonical URL forms consistent.'
          : null,
      'Fetch every reported sitemap, validate its XML, and request affected page URLs independently.',
      'http',
    ),
    check(
      'orphan-candidates',
      'Sitemap-only orphan candidates',
      sitemapUrls.size === 0 ? 'N/A' : orphanCandidates.length > 0 ? 'WARNING' : 'PASS',
      { candidateCount: orphanCandidates.length, candidates: orphanCandidates.slice(0, 20) },
      sitemapUrls.size === 0
        ? 'A sitemap/link comparison was unavailable.'
        : orphanCandidates.length > 0
          ? 'These sitemap URLs received no internal inlink in the bounded crawl. They are candidates, not confirmed orphan pages.'
          : 'Every sitemap URL in the bounded sample received an internal inlink or was the start URL.',
      orphanCandidates.length > 0 ? 'Confirm the intended page value and add a relevant crawlable link, merge it, or remove it from the sitemap.' : null,
      'Run a larger crawl and compare sitemap, rendered navigation, and server-log discovery before confirming orphan status.',
    ),
    check(
      'duplicate-titles',
      'Duplicate document titles',
      htmlPages.length === 0 ? 'N/A' : duplicateTitles.length > 0 ? 'WARNING' : 'PASS',
      { duplicateGroupCount: duplicateTitles.length, groups: duplicateTitles.slice(0, 20) },
      duplicateTitles.length > 0
        ? 'Multiple crawled pages expose the same non-empty document title. Shared titles need intent and template review.'
        : 'No duplicate non-empty document title was found in the bounded HTML sample.',
      duplicateTitles.length > 0 ? 'Give pages distinct titles when they serve different content or consolidate pages that serve the same purpose.' : null,
      'Inspect the affected pages and verify their rendered titles after the template build.',
      'html',
    ),
  ];

  const summary: Record<AuditStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, 'N/A': 0 };
  for (const item of checks) summary[item.status] += 1;

  return {
    contractVersion: SITE_AUDIT_CONTRACT_VERSION,
    startUrl: requestedStartUrl,
    origin,
    maxPages,
    crawledPages: pages.length,
    truncated,
    robots: {
      url: robotsResult.url,
      status: robotsResult.status,
      applicableRules: robotsResult.policy.rules.map((rule) => `${rule.directive}: ${rule.pattern}`),
      sitemapUrls: robotsResult.policy.sitemapUrls,
      skippedUrls: [...robotsSkipped].sort(),
    },
    sitemaps: sitemapResult.reports,
    pages: pages.map((page) => page.output),
    checks,
    summary,
    limitations: [
      'The crawl is same-origin, sequential, response-HTML only, and bounded by --max-pages. JavaScript-inserted links are not discovered.',
      'robots.txt matching supports applicable user-agent groups, Allow, Disallow, * wildcards, and $ endings. Review unusual policies manually.',
      'Sitemap-only pages are orphan candidates until a sufficiently complete crawl or server-log evidence confirms their link discovery state.',
      'The report does not claim actual search-engine crawl, index state, ranking, traffic, conversion, or AI citation outcomes.',
    ],
    timestamp: new Date().toISOString(),
  };
}
