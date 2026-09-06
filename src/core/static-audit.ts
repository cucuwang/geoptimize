import * as cheerio from 'cheerio';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

export type StaticAuditStatus = 'PASS' | 'WARNING' | 'FAIL' | 'N/A';

export interface StaticAuditOptions {
  expectIndexable?: boolean;
  /** Absolute deployed page URL, or deployment root when auditing a directory. */
  baseUrl?: string;
}

export interface StaticAuditCheck {
  id: string;
  status: StaticAuditStatus;
  evidence: string[];
  message: string;
  remediation: string | null;
  validation: string;
}

export interface StaticPageAudit {
  target: string;
  checks: StaticAuditCheck[];
}

export interface StaticAuditReport {
  contractVersion: '1.0';
  source: 'local-html';
  pages: StaticPageAudit[];
  summary: Record<StaticAuditStatus, number>;
  limitations: string[];
  timestamp: string;
}

function httpUrl(value: string, base?: string): URL {
  if (/[\u0000-\u0020\u007f]/.test(value)) throw new Error('URL contains whitespace or control characters');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Expected an HTTP(S) URL without credentials');
  }
  return url;
}

/** Audits observed source HTML only; it neither fetches URLs nor changes the readiness score. */
export function auditHtml(html: string, target: string, options: StaticAuditOptions = {}): StaticPageAudit {
  const $ = cheerio.load(html);
  const checks: StaticAuditCheck[] = [];
  const add = (id: string, status: StaticAuditStatus, evidence: string[], message: string,
    remediation: string | null, validation: string) => {
    checks.push({ id, status, evidence, message, remediation, validation });
  };

  const pageUrl = options.baseUrl ? httpUrl(options.baseUrl).href : undefined;
  const titles = $('title').map((_, el) => $(el).text().trim()).get();
  const titleOk = titles.length === 1 && titles[0].length > 0;
  add('document-title', titleOk ? 'PASS' : 'WARNING', titles,
    titleOk ? 'One non-empty title element found.' : 'Expected one non-empty title element.',
    titleOk ? null : 'Write one descriptive title in the document head; remove duplicate title elements.',
    'Rebuild and inspect the title element in the generated HTML.');

  const descriptions = $('meta').filter((_, el) =>
    ($(el).attr('name') || '').trim().toLowerCase() === 'description')
    .map((_, el) => $(el).attr('content')?.trim() || '').get();
  const descriptionOk = descriptions.length === 1 && descriptions[0].length > 0;
  add('meta-description', descriptionOk ? 'PASS' : 'WARNING', descriptions,
    descriptionOk ? 'One non-empty meta description found.' : 'Expected one non-empty meta description.',
    descriptionOk ? null : 'Write a page-specific description and remove duplicate description tags.',
    'Inspect the rebuilt meta description; search engines may select a different snippet.');

  const canonicals = $('link').filter((_, el) =>
    ($(el).attr('rel') || '').toLowerCase().split(/\s+/).includes('canonical'))
    .map((_, el) => $(el).attr('href')?.trim() || '').get();
  const canonicalValidation = 'Rebuild and check the canonical URL, then verify its HTTP response and indexability on the deployed site.';
  if (canonicals.length === 0) {
    add('canonical', 'WARNING', [], 'No HTML canonical declaration found; HTTP canonical headers were not checked.',
      'Review the intended canonical URL and declare it in HTML or the HTTP Link header where appropriate.', canonicalValidation);
  } else if (canonicals.length > 1 || !canonicals[0]) {
    add('canonical', 'FAIL', canonicals, 'Canonical declarations are multiple or empty.',
      'Emit one non-empty canonical declaration for the intended page.', canonicalValidation);
  } else {
    const href = canonicals[0];
    let base = pageUrl;
    const htmlBase = $('base[href]').first().attr('href');
    try {
      const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(href);
      if (htmlBase !== undefined && !isAbsolute) {
        const baseValue = htmlBase.trim();
        if (!pageUrl && !/^[a-z][a-z\d+.-]*:/i.test(baseValue)) {
          httpUrl(baseValue, 'https://audit.invalid/');
        } else {
          base = httpUrl(baseValue, pageUrl).href;
        }
      }
      if (!isAbsolute && !base) {
        // Validate the reference shape without inventing the deployed origin.
        httpUrl(href, 'https://audit.invalid/');
        add('canonical', 'N/A', [href], 'A relative canonical needs the deployed page URL for resolution.',
          'Supply --base-url or emit an absolute canonical URL.', canonicalValidation);
      } else {
        const url = httpUrl(href, base);
        const hadFragment = Boolean(url.hash);
        url.hash = '';
        add('canonical', hadFragment ? 'WARNING' : 'PASS', [url.href],
          hadFragment ? 'Canonical contains a fragment.' : 'One HTTP(S) canonical URL resolves; its destination was not fetched.',
          hadFragment ? 'Use a canonical URL without a fragment.' : null, canonicalValidation);
      }
    } catch {
      add('canonical', 'FAIL', canonicals, 'Canonical URL or HTML base cannot resolve to an HTTP(S) URL without credentials.',
        'Correct the canonical href and any HTML base href.', canonicalValidation);
    }
  }

  const robotTags = $('meta').filter((_, el) =>
    ['robots', 'googlebot'].includes(($(el).attr('name') || '').trim().toLowerCase()));
  const robotEvidence: string[] = [];
  let blocksIndexing = false;
  robotTags.each((_, el) => {
    const name = ($(el).attr('name') || '').trim().toLowerCase();
    const content = $(el).attr('content') || '';
    robotEvidence.push(`${name}: ${content}`);
    // Keep parameter values attached to their directive, e.g. max-image-preview: none.
    const tokens = content.toLowerCase().replace(/:\s+/g, ':').split(/[\s,]+/);
    if (tokens.includes('noindex') || tokens.includes('none')) blocksIndexing = true;
  });
  add('indexing-directives', blocksIndexing ? (options.expectIndexable ? 'FAIL' : 'WARNING') : 'PASS', robotEvidence,
    blocksIndexing
      ? 'An HTML robots or googlebot directive blocks standalone indexing; index does not override noindex.'
      : 'No noindex or none token found in HTML robots/googlebot meta tags. HTTP headers and actual indexing remain unverified.',
    blocksIndexing ? 'Confirm the page policy. Remove noindex/none only if this page should be indexed.' : null,
    'Inspect every robots/googlebot tag after rebuilding, then check deployed headers and Search Console URL Inspection.');

  const blocks = $('script').filter((_, el) =>
    ($(el).attr('type') || '').trim().toLowerCase() === 'application/ld+json');
  const jsonEvidence: string[] = [];
  let invalidJson = false;
  const isObject = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);
  blocks.each((index, el) => {
    try {
      const value: unknown = JSON.parse($(el).html() || '');
      if (!(isObject(value) || (Array.isArray(value) && value.every(isObject)))) {
        invalidJson = true;
        jsonEvidence.push(`Block ${index + 1}: expected an object or an array of objects.`);
      } else {
        jsonEvidence.push(`Block ${index + 1}: JSON parses with an object or object-array root.`);
      }
    } catch {
      invalidJson = true;
      jsonEvidence.push(`Block ${index + 1}: malformed JSON.`);
    }
  });
  add('jsonld-syntax', blocks.length === 0 ? 'N/A' : invalidJson ? 'FAIL' : 'PASS', jsonEvidence,
    blocks.length === 0 ? 'No JSON-LD present; structured data is optional.'
      : invalidJson ? 'JSON-LD has a syntax or root-shape error.'
        : 'JSON syntax and root shape pass. Schema vocabulary, visible-content consistency and rich-result eligibility were not validated.',
    invalidJson ? 'Fix the reported blocks and validate the appropriate schema against visible page content.' : null,
    'Re-run this audit, then use Schema Markup Validator and the applicable search-engine validation tool.');

  add('http-indexing', 'N/A', [],
    'Local HTML cannot establish HTTP status, X-Robots-Tag, robots.txt access, redirects, or actual search indexing.',
    'Check the deployed response and crawler policy; use Search Console for Google indexing evidence.',
    'Inspect the deployed HTTP response and Search Console URL Inspection.');
  return { target, checks };
}

function markDuplicates(pages: StaticPageAudit[], sourceId: string, id: string, normalize: (value: string) => string): void {
  const groups = new Map<string, StaticPageAudit[]>();
  for (const page of pages) {
    const check = page.checks.find((item) => item.id === sourceId);
    if (!check || (check.status !== 'PASS' && !(sourceId === 'canonical' && check.status === 'WARNING'))
      || check.evidence.length !== 1) continue;
    const value = normalize(check.evidence[0]);
    if (value) groups.set(value, [...(groups.get(value) || []), page]);
  }
  for (const [value, matches] of groups) {
    if (matches.length < 2) continue;
    for (const page of matches) {
      page.checks.push({
        id, status: 'WARNING', evidence: [value, ...matches.map((match) => match.target)],
        message: sourceId === 'canonical'
          ? 'Multiple audited files point to the same canonical. This may be an intentional consolidation.'
          : 'Multiple audited files share a title. Review whether they serve distinct page purposes.',
        remediation: 'Review the listed files and correct template reuse only where the duplication is unintended.',
        validation: 'Rebuild and rerun the directory audit; confirm any intentional duplicates manually.',
      });
    }
  }
}

/** Recursively audits local HTML files. Read/parse failures stop the run rather than silently omitting pages. */
export async function auditPath(input: string, options: StaticAuditOptions = {}): Promise<StaticAuditReport> {
  if (options.baseUrl) httpUrl(options.baseUrl);
  const root = resolve(input);
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink()) throw new Error('Symbolic link targets are not supported.');
  const files: string[] = [];
  async function collect(path: string): Promise<void> {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      const entries = await readdir(path);
      for (const entry of entries.sort()) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;
        await collect(join(path, entry));
      }
    } else if (info.isFile() && ['.html', '.htm'].includes(extname(path).toLowerCase())) {
      files.push(path);
    }
  }
  if (!rootStat.isDirectory() && !['.html', '.htm'].includes(extname(root).toLowerCase())) {
    throw new Error('Static audit supports .html and .htm files or directories containing HTML.');
  }
  await collect(root);
  if (!files.length) throw new Error('No HTML files found to audit.');
  const pages: StaticPageAudit[] = [];
  for (const file of files.sort()) {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Input changed during audit: ${file}`);
    if (info.size > 5 * 1024 * 1024) throw new Error(`HTML file exceeds the 5 MB audit limit: ${file}`);
    let baseUrl = options.baseUrl;
    if (rootStat.isDirectory() && baseUrl) {
      const rootUrl = httpUrl(baseUrl);
      if (rootUrl.search || rootUrl.hash) throw new Error('A directory --base-url must not contain a query or fragment.');
      if (!rootUrl.pathname.endsWith('/')) rootUrl.pathname += '/';
      const deployedPath = relative(root, file).split(sep).map(encodeURIComponent).join('/');
      baseUrl = new URL(deployedPath, rootUrl).href;
    }
    pages.push(auditHtml(await readFile(file, 'utf8'), file, { ...options, baseUrl }));
  }
  markDuplicates(pages, 'document-title', 'duplicate-document-title', (value) => value.replace(/\s+/g, ' ').trim().toLowerCase());
  markDuplicates(pages, 'canonical', 'duplicate-canonical', (value) => value);
  const summary: Record<StaticAuditStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, 'N/A': 0 };
  for (const page of pages) for (const check of page.checks) summary[check.status]++;
  return {
    contractVersion: '1.0', source: 'local-html', pages, summary,
    limitations: [
      'Source HTML only. No browser rendering, network requests, HTTP headers, robots.txt, sitemap or search-performance data were inspected.',
      'PASS applies to the named check only; it does not establish crawlability, indexing, ranking, AI citation or rich-result eligibility.',
      'Cross-page findings cover only audited files. Symbolic links, hidden entries and node_modules are excluded.',
      'Directory base URLs map relative file paths directly; hosting-specific clean-URL rewrites are not inferred.',
    ],
    timestamp: new Date().toISOString(),
  };
}
