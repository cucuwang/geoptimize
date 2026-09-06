import * as cheerio from 'cheerio';
import matter from 'gray-matter';
import { execSync } from 'node:child_process';
import { accessSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type {
  ParsedDocument,
  JsonLdObject,
  Heading,
  Link,
  PageAnalysis,
  ScanReport,
  DimensionScores,
  ScanTarget,
  Issue,
  Suggestion,
  Dimension,
} from './types.js';
import { allRules } from './rules.js';

// ── Parsers ────────────────────────────────────────────────────────

export function parseHtml(html: string, url: string): ParsedDocument {
  const $ = cheerio.load(html);

  // Extract title
  const documentTitle = $('title').first().text().trim();
  const title = documentTitle || $('h1').first().text().trim() || url;

  // Extract headings
  const headings: Heading[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = (el as { tagName: string }).tagName;
    headings.push({
      level: parseInt(tag.charAt(1), 10),
      text: $(el).text().trim(),
    });
  });

  // Extract paragraphs (from p, li, dd, and direct text in div/section)
  const paragraphs: string[] = [];
  $('p, li, dd').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) paragraphs.push(text);
  });

  // Extract JSON-LD
  const jsonLd: JsonLdObject[] = [];
  const jsonLdErrors: string[] = [];
  $('script[type="application/ld+json"]').each((index, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '');
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const [candidateIndex, candidate] of candidates.entries()) {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          jsonLd.push(candidate as JsonLdObject);
        } else {
          const location = Array.isArray(parsed) ? ` item ${candidateIndex + 1}` : '';
          jsonLdErrors.push(`JSON-LD block ${index + 1}${location}: expected an object`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
      jsonLdErrors.push(`JSON-LD block ${index + 1}: ${message}`);
    }
  });

  // Extract meta tags
  const metaTags: Record<string, string> = {};
  $('meta').each((_, el) => {
    const name = $(el).attr('name') || $(el).attr('property') || '';
    const content = $(el).attr('content') || '';
    if (name && content) metaTags[name] = content;
  });

  // Extract links
  const links: Link[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const rel = $(el).attr('rel') || undefined;
    if (href) links.push({ href, text, rel });
  });

  const images = $('img').map((_, el) => ({
    src: $(el).attr('src') || '',
    alt: $(el).attr('alt'),
    width: $(el).attr('width'),
    height: $(el).attr('height'),
    loading: $(el).attr('loading'),
  })).get();

  const language = $('html').attr('lang')?.trim() || undefined;
  const canonicalLinks = $('link[rel~="canonical"]').map((_, el) => $(el).attr('href') || '').get();

  // Extract raw text (content area preferred)
  const contentArea = $('main, article, [role="main"]').first();
  const rawText = (contentArea.length > 0 ? contentArea.text() : $('body').text()).replace(/\s+/g, ' ').trim();

  return {
    url,
    title,
    documentTitle,
    html,
    headings,
    paragraphs,
    jsonLd,
    jsonLdErrors,
    metaTags,
    links,
    images,
    language,
    canonicalLinks,
    rawText,
  };
}

export function parseMarkdown(md: string, url: string): ParsedDocument {
  const { data: frontmatter, content } = matter(md);

  const title = (frontmatter.title as string) || '';

  // Extract headings from markdown
  const headings: Heading[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  // Set title from first H1 if not in frontmatter
  const finalTitle = title || headings.find((h) => h.level === 1)?.text || url;

  // Extract paragraphs (non-empty lines that aren't headings, lists, or code blocks)
  const paragraphs: string[] = [];
  let inCodeBlock = false;
  const lines = content.split('\n');
  let currentParagraph = '';

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const trimmed = line.trim();
    if (trimmed === '') {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
    } else if (!trimmed.startsWith('#') && !trimmed.startsWith('-') && !trimmed.startsWith('*') && !trimmed.match(/^\d+\./)) {
      currentParagraph += ' ' + trimmed;
    }
  }
  if (currentParagraph.trim().length > 0) {
    paragraphs.push(currentParagraph.trim());
  }

  // Raw text (strip markdown syntax roughly)
  const rawText = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[#*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const links: Link[] = [];
  const images = [];
  for (const match of content.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    const [, imageMarker, text, href] = match;
    if (imageMarker) {
      images.push({ src: href, alt: text });
    } else {
      links.push({ href, text });
    }
  }

  const canonicalValue = frontmatter.canonical;
  const canonicalLinks = typeof canonicalValue === 'string' ? [canonicalValue] : [];
  const languageValue = frontmatter.lang ?? frontmatter.language;
  const language = typeof languageValue === 'string' ? languageValue : undefined;

  return {
    url,
    title: finalTitle,
    documentTitle: typeof frontmatter.title === 'string' ? frontmatter.title : undefined,
    markdown: md,
    frontmatter: frontmatter as Record<string, unknown>,
    headings,
    paragraphs,
    jsonLd: [],
    metaTags: {},
    links,
    images,
    language,
    canonicalLinks,
    rawText,
  };
}

// ── Scoring ────────────────────────────────────────────────────────

function aggregateScores(doc: ParsedDocument): { scores: DimensionScores; issues: Issue[]; suggestions: Suggestion[] } {
  const dimensionTotals: Record<Dimension, { score: number; maxScore: number }> = {
    structure: { score: 0, maxScore: 0 },
    citability: { score: 0, maxScore: 0 },
    schema: { score: 0, maxScore: 0 },
    aiMetadata: { score: 0, maxScore: 0 },
    contentDensity: { score: 0, maxScore: 0 },
  };

  const allIssues: Issue[] = [];
  const allSuggestions: Suggestion[] = [];

  for (const rule of allRules) {
    const result = rule.evaluate(doc);
    dimensionTotals[rule.dimension].score += result.score;
    dimensionTotals[rule.dimension].maxScore += result.maxScore;
    allIssues.push(...result.issues);
    allSuggestions.push(...result.suggestions);
  }

  // Derive dimension max points from actual rule weights (not hardcoded)
  const dimensionMaxPoints: Record<Dimension, number> = { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0 };
  for (const rule of allRules) {
    dimensionMaxPoints[rule.dimension] += rule.weight;
  }

  const scores: DimensionScores = {
    structure: 0,
    citability: 0,
    schema: 0,
    aiMetadata: 0,
    contentDensity: 0,
    total: 0,
  };

  for (const dim of Object.keys(dimensionTotals) as Dimension[]) {
    const { score, maxScore } = dimensionTotals[dim];
    scores[dim] = maxScore > 0 ? Math.round((score / maxScore) * dimensionMaxPoints[dim]) : 0;
  }

  scores.total = scores.structure + scores.citability + scores.schema + scores.aiMetadata + scores.contentDensity;

  return { scores, issues: allIssues, suggestions: allSuggestions };
}

// ── Public API ─────────────────────────────────────────────────────

export function scanDocument(doc: ParsedDocument): PageAnalysis {
  const { scores, issues, suggestions } = aggregateScores(doc);
  return {
    url: doc.url,
    title: doc.title,
    scores,
    issues,
    suggestions,
  };
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function scanFile(filePath: string): Promise<PageAnalysis> {
  const fileStats = await stat(filePath);
  if (fileStats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(fileStats.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`);
  }
  const content = await readFile(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  let doc: ParsedDocument;
  if (ext === '.html' || ext === '.htm') {
    doc = parseHtml(content, filePath);
  } else if (ext === '.md' || ext === '.mdx') {
    doc = parseMarkdown(content, filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  return scanDocument(doc);
}

export async function scanDirectory(dirPath: string): Promise<ScanReport> {
  const pages: PageAnalysis[] = [];
  await walkDir(dirPath, pages);

  if (pages.length === 0) {
    return {
      pages: [],
      overall: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      summary: 'No HTML or Markdown files found in directory.',
      timestamp: new Date().toISOString(),
    };
  }

  const overall = averageScores(pages.map((p) => p.scores));
  const summary = generateSummary(overall, pages.length);

  return { pages, overall, summary, timestamp: new Date().toISOString() };
}

function validateUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`Unsupported scheme: ${u.protocol}. Only http and https are allowed.`);
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error('Scanning private/loopback addresses is not allowed.');
  }
  return u;
}

function isBlockedHostname(hostname: string): boolean {
  const blocked = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|localhost$)/i;
  return blocked.test(hostname);
}

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface UrlResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  statusText: string;
  redirects: RedirectHop[];
  contentType: string | null;
  xRobotsTag: string | null;
  html: string;
  renderedWithBrowser: boolean;
}

export interface UrlFetchOptions {
  render?: boolean;
  init?: RequestInit;
  allowedOrigin?: string;
}

async function fetchWithSafeRedirects(
  input: string | URL,
  init?: RequestInit,
  maxRedirects = 10,
  allowedOrigin?: string,
): Promise<{ response: Response; finalUrl: string; redirects: RedirectHop[] }> {
  let currentUrl = typeof input === 'string' ? validateUrl(input) : validateUrl(input.toString());
  const redirects: RedirectHop[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: currentUrl.toString(), redirects };
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`Too many redirects while fetching ${currentUrl.toString()}`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`Redirect response from ${currentUrl.toString()} missing Location header`);
    }

    const nextUrl = validateUrl(new URL(location, currentUrl).toString());
    if (allowedOrigin && nextUrl.origin !== allowedOrigin) {
      throw new Error(`Redirect left the allowed origin: ${nextUrl.origin}`);
    }
    redirects.push({
      from: currentUrl.toString(),
      to: nextUrl.toString(),
      status: response.status,
    });
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects while fetching ${currentUrl.toString()}`);
}

function findChromePath(): string | null {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];

  for (const p of candidates) {
    try { accessSync(p); return p; } catch { /* next */ }
  }
  // Try `which`
  try { return execSync('which google-chrome || which chromium', { encoding: 'utf-8' }).trim() || null; } catch { return null; }
}

async function fetchWithPuppeteer(url: string): Promise<{ html: string; rendered: boolean }> {
  const chromePath = findChromePath();
  if (!chromePath) return { html: '', rendered: false };

  try {
    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const html = await page.content();
      return { html, rendered: true };
    } finally {
      await browser.close();
    }
  } catch {
    return { html: '', rendered: false };
  }
}

function isSpaLikely(html: string): boolean {
  // Heuristic: very few content tags relative to file size suggests SPA
  const contentTags = (html.match(/<(?:p|h[1-6]|li|article|main)[>\s]/gi) || []).length;
  const scripts = (html.match(/<script/gi) || []).length;
  return contentTags < 10 && scripts > 3;
}

export async function fetchUrlResource(url: string, options: UrlFetchOptions = {}): Promise<UrlResource> {
  validateUrl(url);
  const { response, finalUrl, redirects } = await fetchWithSafeRedirects(
    url,
    options.init,
    10,
    options.allowedOrigin,
  );

  let html = await response.text();
  let renderedWithBrowser = false;

  if (options.render !== false && response.ok && isSpaLikely(html)) {
    const result = await fetchWithPuppeteer(finalUrl);
    if (result.rendered) {
      html = result.html;
      renderedWithBrowser = true;
    }
  }

  return {
    requestedUrl: url,
    finalUrl,
    status: response.status,
    statusText: response.statusText,
    redirects,
    contentType: response.headers.get('content-type'),
    xRobotsTag: response.headers.get('x-robots-tag'),
    html,
    renderedWithBrowser,
  };
}

export async function scanUrl(url: string): Promise<ScanReport> {
  const resource = await fetchUrlResource(url);
  if (resource.status < 200 || resource.status >= 300) {
    throw new Error(`Failed to fetch ${url}: ${resource.status} ${resource.statusText}`);
  }

  if (isSpaLikely(resource.html) && !resource.renderedWithBrowser) {
    console.warn('[aeoptimize] This page appears to be a JavaScript-rendered SPA.');
    console.warn('[aeoptimize] Install Chrome/Chromium for accurate scoring of JS-rendered sites.');
    console.warn('[aeoptimize] Without a browser, scores may be lower than actual content quality.\n');
  }

  const doc = parseHtml(resource.html, url);

  const analysis = scanDocument(doc);

  return {
    pages: [analysis],
    overall: analysis.scores,
    summary: generateSummary(analysis.scores, 1),
    timestamp: new Date().toISOString(),
  };
}

export async function scan(target: ScanTarget): Promise<ScanReport> {
  switch (target.type) {
    case 'url':
      return scanUrl(target.path);
    case 'file': {
      const analysis = await scanFile(target.path);
      return {
        pages: [analysis],
        overall: analysis.scores,
        summary: generateSummary(analysis.scores, 1),
        timestamp: new Date().toISOString(),
      };
    }
    case 'directory':
      return scanDirectory(target.path);
  }
}

// ── Helpers ────────────────────────────────────────────────────────

async function walkDir(dirPath: string, pages: PageAnalysis[]): Promise<void> {
  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      await walkDir(fullPath, pages);
    } else {
      const ext = extname(entry).toLowerCase();
      if (['.html', '.htm', '.md', '.mdx'].includes(ext)) {
        try {
          const analysis = await scanFile(fullPath);
          pages.push(analysis);
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }
}

function averageScores(scores: DimensionScores[]): DimensionScores {
  const avg: DimensionScores = { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 };
  const dims: (keyof DimensionScores)[] = ['structure', 'citability', 'schema', 'aiMetadata', 'contentDensity'];

  for (const dim of dims) {
    avg[dim] = Math.round(scores.reduce((sum, s) => sum + s[dim], 0) / scores.length);
  }
  avg.total = avg.structure + avg.citability + avg.schema + avg.aiMetadata + avg.contentDensity;

  return avg;
}

function generateSummary(scores: DimensionScores, pageCount: number): string {
  const grade = scores.total >= 80 ? 'Excellent' : scores.total >= 60 ? 'Good' : scores.total >= 40 ? 'Needs Work' : 'Poor';
  return `Content readiness: ${grade} (${scores.total}/100) across ${pageCount} page${pageCount > 1 ? 's' : ''}`;
}
