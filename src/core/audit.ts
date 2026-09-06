import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { fetchUrlResource, parseHtml, parseMarkdown, type RedirectHop } from './scanner.js';
import type {
  AuditCheck,
  AuditEvidence,
  AuditEvidenceSource,
  AuditReport,
  AuditStatus,
  ParsedDocument,
  ScanTarget,
} from './types.js';

const AUDIT_CONTRACT_VERSION = '1.0' as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface AuditContext {
  target: AuditReport['target'];
  rendering: AuditReport['rendering'];
  http?: {
    status: number;
    statusText: string;
    redirects: RedirectHop[];
    contentType: string | null;
    xRobotsTag: string | null;
  };
}

function evidence(
  source: AuditEvidenceSource,
  observed: AuditEvidence['observed'],
): AuditEvidence {
  return { source, observed };
}

function sourceFor(context: AuditContext): AuditEvidenceSource {
  return context.rendering === 'markdown' ? 'markdown' : 'html';
}

function makeCheck(
  id: string,
  label: string,
  status: AuditStatus,
  checkEvidence: AuditEvidence[],
  explanation: string,
  remediation: string | null,
  validation: string,
): AuditCheck {
  return {
    id,
    label,
    status,
    evidence: checkEvidence,
    explanation,
    remediation,
    validation,
  };
}

function checkHttp(context: AuditContext): AuditCheck {
  if (!context.http) {
    return makeCheck(
      'http-status',
      'HTTP status and redirects',
      'N/A',
      [evidence('derived', { reason: 'Local files have no HTTP response.' })],
      'No network request was made for this local document.',
      null,
      'Serve the built page over HTTP and audit its public or staging URL.',
    );
  }

  const { status, statusText, redirects, contentType } = context.http;
  const statusResult: AuditStatus = status >= 200 && status < 300 ? 'PASS' : 'FAIL';
  const redirectChain = redirects.map((hop) => `${hop.status} ${hop.from} -> ${hop.to}`);

  return makeCheck(
    'http-status',
    'HTTP status and redirects',
    statusResult,
    [evidence('http', {
      status,
      statusText,
      finalUrl: context.target.finalUrl ?? context.target.input,
      redirectCount: redirects.length,
      redirectChain,
      contentType,
    })],
    statusResult === 'PASS'
      ? `The final response returned HTTP ${status}. Redirects are reported as observed facts and are not scored.`
      : `The final response returned HTTP ${status}, so the page was not retrieved as a successful document.`,
    statusResult === 'PASS'
      ? null
      : 'Restore a successful final response or intentionally return the correct removal status, then update links and sitemaps that still reference this URL.',
    'Request the URL again with redirects disabled and confirm every hop plus the final status.',
  );
}

function checkTitle(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const observedTitle = context.rendering === 'markdown' ? doc.title : (doc.documentTitle ?? '');
  const status: AuditStatus = observedTitle.trim() ? 'PASS' : 'FAIL';

  return makeCheck(
    'document-title',
    'Document title',
    status,
    [evidence(sourceFor(context), { title: observedTitle || null })],
    status === 'PASS'
      ? 'A document title was found. This check does not impose a fixed character count.'
      : 'No document title was found in the HTML title element or Markdown title source.',
    status === 'PASS'
      ? null
      : 'Add a concise, page-specific title that accurately describes the visible content.',
    'Inspect the rendered document title and verify that it remains page-specific after the build.',
  );
}

function checkDescription(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const frontmatterDescription = typeof doc.frontmatter?.description === 'string'
    ? doc.frontmatter.description
    : '';
  const description = doc.metaTags.description || frontmatterDescription;

  if (!description && context.rendering === 'markdown') {
    return makeCheck(
      'meta-description',
      'Meta description',
      'N/A',
      [evidence('markdown', { description: null })],
      'The source Markdown has no description field. Its final HTML template was not inspected.',
      null,
      'Audit the rendered HTML and inspect its meta description.',
    );
  }

  const status: AuditStatus = description ? 'PASS' : 'WARNING';
  return makeCheck(
    'meta-description',
    'Meta description',
    status,
    [evidence(sourceFor(context), { description: description || null })],
    status === 'PASS'
      ? 'A page-specific description candidate is present. Search engines may still choose another snippet.'
      : 'No meta description was found. This is a review item, not proof of a search-performance problem.',
    status === 'PASS'
      ? null
      : 'Add an accurate page-specific description when the template should provide one. Do not pad it to a fixed length.',
    'Inspect the built HTML and compare the description with the visible page purpose.',
  );
}

function checkHeadings(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const h1Count = doc.headings.filter((heading) => heading.level === 1).length;
  const skippedLevels: string[] = [];
  for (let index = 1; index < doc.headings.length; index += 1) {
    const previous = doc.headings[index - 1].level;
    const current = doc.headings[index].level;
    if (current > previous + 1) skippedLevels.push(`H${previous} -> H${current}`);
  }

  let status: AuditStatus = 'PASS';
  let explanation = 'The document exposes a main heading and no skipped heading levels were detected.';
  let remediation: string | null = null;

  if (doc.headings.length === 0) {
    status = 'FAIL';
    explanation = 'No headings were found in the inspected document.';
    remediation = 'Add descriptive headings that reflect the document hierarchy and visible content.';
  } else if (h1Count === 0 || skippedLevels.length > 0) {
    status = 'WARNING';
    explanation = 'The heading outline needs review. Multiple H1 elements are reported as evidence but are not an automatic failure.';
    remediation = 'Review the primary heading and skipped levels, then adjust only where the visual and semantic hierarchy is unclear.';
  }

  return makeCheck(
    'heading-structure',
    'Heading structure',
    status,
    [evidence(sourceFor(context), {
      headingCount: doc.headings.length,
      h1Count,
      skippedLevels,
      outline: doc.headings.slice(0, 20).map((heading) => `H${heading.level}: ${heading.text}`),
    })],
    explanation,
    remediation,
    'Inspect the rendered outline and verify that headings match the visible section hierarchy.',
  );
}

function checkLanguage(doc: ParsedDocument, context: AuditContext): AuditCheck {
  if (!doc.language && context.rendering === 'markdown') {
    return makeCheck(
      'document-language',
      'Document language',
      'N/A',
      [evidence('markdown', { language: null })],
      'No language field was found in Markdown frontmatter, and the rendered HTML was not inspected.',
      null,
      'Audit the rendered HTML and compare its html lang value with the visible language.',
    );
  }

  const status: AuditStatus = doc.language ? 'PASS' : 'WARNING';
  return makeCheck(
    'document-language',
    'Document language',
    status,
    [evidence(sourceFor(context), { language: doc.language ?? null })],
    status === 'PASS'
      ? 'An html lang or Markdown language value was found. Language-content agreement still needs human review.'
      : 'The HTML document does not declare a language.',
    status === 'PASS' ? null : 'Add the appropriate html lang value to the document template.',
    'Compare the declared language with the primary visible language and test representative localized pages.',
  );
}

function resolveCanonical(value: string, baseUrl?: string): string | null {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function withoutHash(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

function checkCanonical(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const canonicals = doc.canonicalLinks ?? [];
  if (canonicals.length === 0) {
    const isMarkdown = context.rendering === 'markdown';
    return makeCheck(
      'canonical-link',
      'Canonical link',
      isMarkdown ? 'N/A' : 'WARNING',
      [evidence(sourceFor(context), { canonicals: [] })],
      isMarkdown
        ? 'No canonical field was found in Markdown frontmatter, and the rendered template was not inspected.'
        : 'No canonical link was found. Canonical markup is context-dependent, so absence is a review item.',
      isMarkdown ? null : 'Add one canonical link when the page participates in a duplicate or URL-normalization strategy.',
      'Inspect the final HTML, resolve the canonical URL, and confirm that it matches the intended indexable URL.',
    );
  }

  const baseUrl = context.target.finalUrl;
  if (canonicals.length > 1) {
    return makeCheck(
      'canonical-link',
      'Canonical link',
      'FAIL',
      [evidence(sourceFor(context), {
        canonicals,
        resolved: canonicals.map((value) => resolveCanonical(value, baseUrl) ?? 'INVALID'),
      })],
      'Multiple canonical links were found, so the canonical signal is ambiguous.',
      'Emit exactly one valid canonical link that represents the intended indexable URL.',
      'Fetch the built page and verify one canonical element plus its resolved destination.',
    );
  }

  const declared = canonicals[0];
  const canonical = resolveCanonical(declared, baseUrl);
  if (!baseUrl && declared.trim() !== '' && canonical === null && !/^[a-z][a-z\d+.-]*:/i.test(declared)) {
    return makeCheck(
      'canonical-link',
      'Canonical link',
      'N/A',
      [evidence(sourceFor(context), { declared, resolved: null, finalUrl: null })],
      'A relative canonical was found, but a local-file audit has no deployed base URL for resolution.',
      null,
      'Audit the deployed URL and verify the resolved canonical destination.',
    );
  }
  if (canonical === null) {
    return makeCheck(
      'canonical-link',
      'Canonical link',
      'FAIL',
      [evidence(sourceFor(context), { declared, resolved: 'INVALID' })],
      'The canonical value could not be resolved to an HTTP or HTTPS URL.',
      'Emit exactly one valid canonical link that represents the intended indexable URL.',
      'Fetch the built page and verify one canonical element plus its resolved destination.',
    );
  }
  if (!baseUrl) {
    return makeCheck(
      'canonical-link',
      'Canonical link',
      'WARNING',
      [evidence(sourceFor(context), { declared: canonicals[0], resolved: canonical, finalUrl: null })],
      'One valid canonical link was found, but a local-file audit cannot compare it with the deployed final URL.',
      'Confirm that the deployed page resolves to the intended canonical URL.',
      'Audit the deployed URL and compare its final response URL with the rendered canonical element.',
    );
  }

  const differsFromFinal = baseUrl ? withoutHash(canonical) !== withoutHash(baseUrl) : false;
  return makeCheck(
    'canonical-link',
    'Canonical link',
    differsFromFinal ? 'WARNING' : 'PASS',
    [evidence(sourceFor(context), { declared: canonicals[0], resolved: canonical, finalUrl: baseUrl ?? null })],
    differsFromFinal
      ? 'The canonical resolves to a different URL than the final response. This can be intentional and needs review.'
      : 'One valid canonical link was found and it resolves to the inspected final URL.',
    differsFromFinal ? 'Confirm the intended primary URL and update the canonical or serving URL if they conflict.' : null,
    'Request both URLs, confirm their final status, and inspect the rendered canonical element.',
  );
}

function checkRobots(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const valuesFor = (name: string): string[] => doc.metaTagValues?.[name]
    ?? (doc.metaTags[name] ? [doc.metaTags[name]] : []);
  const metaRobots = [...valuesFor('robots'), ...valuesFor('googlebot')].join(', ');
  const xRobotsTag = context.http?.xRobotsTag ?? '';
  const combined = `${metaRobots}, ${xRobotsTag}`;
  const blocksIndexing = /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(combined);
  const blocksFollowing = /(?:^|[,\s])nofollow(?:$|[,\s])/i.test(combined);
  const status: AuditStatus = blocksIndexing || blocksFollowing ? 'WARNING' : 'PASS';

  return makeCheck(
    'robots-directives',
    'Page-level robots directives',
    status,
    [
      evidence(sourceFor(context), { metaRobots: metaRobots || null }),
      context.http
        ? evidence('http', { xRobotsTag: xRobotsTag || null })
        : evidence('derived', { xRobotsTag: null, reason: 'Local files have no HTTP response headers.' }),
    ],
    status === 'PASS'
      ? 'No page-level noindex or nofollow directive was detected. robots.txt, authentication, CDN policy, and actual index state were not checked.'
      : 'A page-level indexing or following restriction was detected. Its intent cannot be inferred automatically.',
    status === 'PASS'
      ? null
      : 'Confirm whether the directive is intentional. Remove or narrow it only when the page should be indexable or its links should be followed.',
    'Inspect both the response headers and rendered meta robots tags, then verify the intended policy with the responsible owner.',
  );
}

function checkLinks(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const links = doc.links;
  const emptyText = links.filter((link) => !link.text.trim()).length;
  const scriptLinks = links.filter((link) => /^javascript:/i.test(link.href)).length;
  const status: AuditStatus = links.length === 0 || emptyText > 0 || scriptLinks > 0 ? 'WARNING' : 'PASS';

  return makeCheck(
    'link-discovery',
    'Link discovery',
    status,
    [evidence(sourceFor(context), {
      linkCount: links.length,
      emptyTextCount: emptyText,
      javascriptLinkCount: scriptLinks,
      sample: links.slice(0, 20).map((link) => `${link.text || '[empty]'} -> ${link.href}`),
    })],
    links.length === 0
      ? 'No links were discovered in the inspected document.'
      : 'Links were extracted from the document. Their destination status and site-graph role were not fetched in this single-page audit.',
    status === 'PASS'
      ? null
      : 'Review missing link text and script-only navigation. Add crawlable links when they match the intended navigation and content relationships.',
    'Fetch link destinations separately and compare the rendered navigation with the extracted link sample.',
  );
}

function checkImages(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const images = doc.images ?? [];
  if (images.length === 0) {
    return makeCheck(
      'image-alternatives',
      'Image alternative text',
      'N/A',
      [evidence(sourceFor(context), { imageCount: 0 })],
      'No images were found in the inspected document.',
      null,
      'Inspect representative rendered templates if images are inserted after build or hydration.',
    );
  }

  const missingAlt = images.filter((image) => image.alt === undefined).length;
  const emptyAlt = images.filter((image) => image.alt === '').length;
  const status: AuditStatus = missingAlt > 0 ? 'WARNING' : 'PASS';

  return makeCheck(
    'image-alternatives',
    'Image alternative text',
    status,
    [evidence(sourceFor(context), {
      imageCount: images.length,
      missingAltAttributeCount: missingAlt,
      emptyAltCount: emptyAlt,
      sample: images.slice(0, 20).map((image) => `${image.src || '[missing src]'} | alt=${image.alt ?? '[missing]'}`),
    })],
    status === 'PASS'
      ? 'Every discovered image has an alt attribute. Empty alt values can be correct for decorative images and need contextual review.'
      : 'One or more images lack an alt attribute. The audit does not infer the correct description from pixels.',
    status === 'PASS'
      ? null
      : 'Add accurate alt text for informative images and an explicit empty alt value for images that are purely decorative.',
    'Inspect each image in context with assistive-technology semantics and verify the built HTML attributes.',
  );
}

function checkJsonLd(doc: ParsedDocument, context: AuditContext): AuditCheck {
  const errors = doc.jsonLdErrors ?? [];
  const parsedObjects = doc.jsonLd.filter((value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value));
  const invalidValueCount = doc.jsonLd.length - parsedObjects.length;

  if (errors.length > 0 || invalidValueCount > 0) {
    return makeCheck(
      'json-ld-structure',
      'JSON-LD structure',
      'FAIL',
      [evidence(sourceFor(context), {
        blockCount: doc.jsonLdBlockCount ?? doc.jsonLd.length,
        parsedObjectCount: parsedObjects.length,
        invalidValueCount,
        parseErrors: errors,
      })],
      'Malformed JSON-LD or a non-object top-level value was detected. Feature-specific eligibility and visible-content agreement remain outside this structural check.',
      'Correct the JSON syntax and top-level structure, then validate the specific schema type against the applicable primary documentation and visible content.',
      'Parse every JSON-LD block again and run the relevant structured-data validator for the page type.',
    );
  }

  if (doc.jsonLd.length === 0) {
    return makeCheck(
      'json-ld-structure',
      'JSON-LD structure',
      'N/A',
      [evidence(sourceFor(context), { blockCount: 0, schemaTypes: [] })],
      'No JSON-LD was found. Structured data is optional and absence is not treated as an error.',
      null,
      'Add structured data only for a defined feature or entity need, then validate it against visible content.',
    );
  }

  return makeCheck(
    'json-ld-structure',
    'JSON-LD structure',
    'PASS',
    [evidence(sourceFor(context), {
      blockCount: doc.jsonLdBlockCount ?? doc.jsonLd.length,
      schemaTypes: parsedObjects.map((value) => value['@type'] || '[unknown]'),
    })],
    'Every JSON-LD value parsed to an object. Context, type, feature eligibility, and visible-content agreement require schema-specific validation.',
    null,
    'Compare each structured-data field with visible content and the current documentation for its intended feature.',
  );
}

export function auditDocument(doc: ParsedDocument, context: AuditContext): AuditReport {
  const checks = [
    checkHttp(context),
    checkTitle(doc, context),
    checkDescription(doc, context),
    checkHeadings(doc, context),
    checkLanguage(doc, context),
    checkCanonical(doc, context),
    checkRobots(doc, context),
    checkLinks(doc, context),
    checkImages(doc, context),
    checkJsonLd(doc, context),
  ];

  const summary: Record<AuditStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, 'N/A': 0 };
  for (const check of checks) summary[check.status] += 1;

  return {
    contractVersion: AUDIT_CONTRACT_VERSION,
    target: context.target,
    rendering: context.rendering,
    checks,
    summary,
    limitations: [
      'This command reports deterministic observations from one document. It does not claim ranking, indexing, rich-result display, traffic, conversion, or citation outcomes.',
      'Destination status, robots.txt, sitemap membership, hreflang reciprocity, site-wide duplication, orphan pages, Core Web Vitals, and analytics require separate evidence.',
      'PASS means the bounded check found no issue in the inspected evidence. It is not a guarantee of search-engine behavior.',
    ],
    timestamp: new Date().toISOString(),
  };
}

async function auditFile(filePath: string): Promise<AuditReport> {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error('Audit target must be an HTML, HTM, Markdown, or MDX file.');
  if (fileStats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(fileStats.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`);
  }

  const content = await readFile(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.html' || extension === '.htm') {
    return auditDocument(parseHtml(content, filePath), {
      target: { type: 'file', input: filePath },
      rendering: 'local-html',
    });
  }
  if (extension === '.md' || extension === '.mdx') {
    return auditDocument(parseMarkdown(content, filePath), {
      target: { type: 'file', input: filePath },
      rendering: 'markdown',
    });
  }
  throw new Error(`Unsupported file type: ${extension}`);
}

async function auditUrl(url: string): Promise<AuditReport> {
  const resource = await fetchUrlResource(url);
  const doc = parseHtml(resource.html, resource.finalUrl);
  return auditDocument(doc, {
    target: { type: 'url', input: resource.requestedUrl, finalUrl: resource.finalUrl },
    rendering: resource.renderedWithBrowser ? 'browser' : 'response-html',
    http: {
      status: resource.status,
      statusText: resource.statusText,
      redirects: resource.redirects,
      contentType: resource.contentType,
      xRobotsTag: resource.xRobotsTag,
    },
  });
}

export async function audit(target: ScanTarget): Promise<AuditReport> {
  if (target.type === 'directory') {
    throw new Error('Evidence-backed audit currently supports one URL or one HTML/Markdown file.');
  }
  return target.type === 'url' ? auditUrl(target.path) : auditFile(target.path);
}
