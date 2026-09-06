export type Dimension =
  | 'structure'
  | 'citability'
  | 'schema'
  | 'aiMetadata'
  | 'contentDensity';

export interface DimensionScores {
  structure: number;
  citability: number;
  schema: number;
  aiMetadata: number;
  contentDensity: number;
  total: number;
}

export type Severity = 'critical' | 'warning' | 'info';
export type Impact = 'high' | 'medium' | 'low';

export interface Issue {
  dimension: Dimension;
  severity: Severity;
  message: string;
  selector?: string;
  line?: number;
}

export interface Suggestion {
  dimension: Dimension;
  action: string;
  impact: Impact;
  detail: string;
}

export interface ScanTarget {
  type: 'url' | 'file' | 'directory';
  path: string;
}

export interface Heading {
  level: number;
  text: string;
}

export interface Link {
  href: string;
  text: string;
  rel?: string;
}

export interface ImageReference {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  loading?: string;
}

export interface JsonLdObject {
  '@type'?: string;
  '@context'?: string;
  [key: string]: unknown;
}

export interface ParsedDocument {
  url: string;
  title: string;
  documentTitle?: string;
  html?: string;
  markdown?: string;
  frontmatter?: Record<string, unknown>;
  headings: Heading[];
  paragraphs: string[];
  jsonLd: JsonLdObject[];
  jsonLdBlockCount?: number;
  jsonLdErrors?: string[];
  metaTags: Record<string, string>;
  metaTagValues?: Record<string, string[]>;
  links: Link[];
  images?: ImageReference[];
  language?: string;
  canonicalLinks?: string[];
  rawText: string;
}

export type AuditStatus = 'PASS' | 'WARNING' | 'FAIL' | 'N/A';

export type AuditEvidenceSource = 'http' | 'html' | 'markdown' | 'derived';

export type AuditEvidenceValue = string | number | boolean | null | string[];

export interface AuditEvidence {
  source: AuditEvidenceSource;
  observed: Record<string, AuditEvidenceValue>;
}

export interface AuditCheck {
  id: string;
  label: string;
  status: AuditStatus;
  evidence: AuditEvidence[];
  explanation: string;
  remediation: string | null;
  validation: string;
}

export interface AuditReport {
  contractVersion: '1.0';
  target: {
    type: 'url' | 'file';
    input: string;
    finalUrl?: string;
  };
  rendering: 'response-html' | 'browser' | 'local-html' | 'markdown';
  checks: AuditCheck[];
  summary: Record<AuditStatus, number>;
  limitations: string[];
  timestamp: string;
}

export interface SiteAuditPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  statusText: string;
  redirects: string[];
  contentType: string | null;
  title: string | null;
  language: string | null;
  canonicalLinks: string[];
  internalLinkCount: number;
  externalLinkCount: number;
  discoveredFrom: string[];
}

export interface SiteAuditSitemap {
  url: string;
  status: number;
  kind: 'urlset' | 'index' | 'unknown';
  urlCount: number;
}

export interface SiteAuditReport {
  contractVersion: '1.0';
  startUrl: string;
  origin: string;
  maxPages: number;
  crawledPages: number;
  truncated: boolean;
  robots: {
    url: string;
    status: number;
    applicableRules: string[];
    sitemapUrls: string[];
    skippedUrls: string[];
  };
  sitemaps: SiteAuditSitemap[];
  pages: SiteAuditPage[];
  checks: AuditCheck[];
  summary: Record<AuditStatus, number>;
  limitations: string[];
  timestamp: string;
}

export interface RuleResult {
  score: number;
  maxScore: number;
  issues: Issue[];
  suggestions: Suggestion[];
}

export interface ScoringRule {
  id: string;
  dimension: Dimension;
  weight: number;
  evaluate: (doc: ParsedDocument) => RuleResult;
}

export interface PageAnalysis {
  url: string;
  title: string;
  scores: DimensionScores;
  issues: Issue[];
  suggestions: Suggestion[];
}

export interface ScanReport {
  pages: PageAnalysis[];
  overall: DimensionScores;
  summary: string;
  timestamp: string;
}

export interface SiteInfo {
  name: string;
  description: string;
  baseUrl: string;
  language?: string;
}

export interface GenerateOutput {
  llmsTxt: string;
  llmsFullTxt: string;
  jsonLd: object[];
  robotsTxtSuggestions: string[];
}

// ── Multi-AI Scoring ───────────────────────────────────────────────

export type AiSource = 'claude' | 'gemini' | 'copilot';

export interface AiScorerResult {
  source: AiSource;
  score: number;
  dimensions: DimensionScores;
  insight: string;
  available: boolean;
}

export interface MultiAiReport extends ScanReport {
  ruleScore: number;
  aiScores: AiScorerResult[];
  consensusScore: number;
  methodology: string;
}
