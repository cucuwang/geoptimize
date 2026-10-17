import type { ScoringRule, ParsedDocument, RuleResult, Issue, Suggestion } from './types.js';

// ── Structure Rules (25 pts) ───────────────────────────────────────

const headingHierarchy: ScoringRule = {
  id: 'heading-hierarchy',
  dimension: 'structure',
  weight: 10,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];
    const { headings } = doc;

    if (headings.length === 0) {
      issues.push({
        dimension: 'structure',
        severity: 'critical',
        message: 'No headings found. Descriptive headings help readers and parsers understand the page structure.',
      });
      return { score: 0, maxScore: 10, issues, suggestions };
    }

    let score = 10;

    // A clear main heading is useful, but multiple H1 elements are not an automatic SEO error.
    const h1s = headings.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      score -= 2;
      issues.push({
        dimension: 'structure',
        severity: 'warning',
        message: 'No H1 heading found. Add a descriptive main heading when the page does not expose an equivalent primary title.',
      });
    }

    // Check for skipped levels (e.g., H1 -> H3)
    let skipCount = 0;
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const curr = headings[i].level;
      if (curr > prev + 1) {
        skipCount++;
        if (skipCount <= 3) {
          issues.push({
            dimension: 'structure',
            severity: 'warning',
            message: `Heading level skipped: H${prev} → H${curr}. Review whether the document outline still communicates the intended hierarchy.`,
          });
        }
      }
    }
    if (skipCount > 0) score -= Math.min(3, skipCount);

    // Check heading count relative to content
    const wordCount = doc.rawText.split(/\s+/).length;
    if (wordCount > 500 && headings.length < 3) {
      score -= 1;
      suggestions.push({
        dimension: 'structure',
        action: 'Add more headings to break up long content',
        impact: 'medium',
        detail: `${wordCount} words with only ${headings.length} headings. Add sections where they improve navigation; no fixed heading-to-word ratio is required.`,
      });
    }

    return { score: Math.max(0, score), maxScore: 10, issues, suggestions };
  },
};

const paragraphLength: ScoringRule = {
  id: 'paragraph-length',
  dimension: 'structure',
  weight: 8,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];
    const { paragraphs } = doc;

    if (paragraphs.length === 0) {
      return { score: 0, maxScore: 8, issues: [{ dimension: 'structure', severity: 'warning', message: 'No paragraphs detected.' }], suggestions };
    }

    const longParagraphs = paragraphs.filter((p) => p.split(/\s+/).length > 150);
    const ratio = longParagraphs.length / paragraphs.length;

    let score = 8;
    if (ratio > 0.5) {
      score -= 5;
      issues.push({
        dimension: 'structure',
        severity: 'critical',
        message: `${longParagraphs.length}/${paragraphs.length} paragraphs exceed the configured 150-word readability heuristic.`,
      });
    } else if (ratio > 0.2) {
      score -= 3;
      issues.push({
        dimension: 'structure',
        severity: 'warning',
        message: `${longParagraphs.length} paragraphs exceed the configured 150-word readability heuristic.`,
      });
    }

    if (longParagraphs.length > 0) {
      suggestions.push({
        dimension: 'structure',
        action: 'Review long paragraphs for readability',
        impact: 'high',
        detail: 'Split only where it improves comprehension. Paragraph length is a configurable heuristic, not a ranking or citation factor.',
      });
    }

    return { score: Math.max(0, score), maxScore: 8, issues, suggestions };
  },
};

const faqPresence: ScoringRule = {
  id: 'faq-presence',
  dimension: 'structure',
  weight: 0,
  evaluate(_doc: ParsedDocument): RuleResult {
    return { score: 0, maxScore: 0, issues: [], suggestions: [] };
  },
};

const listUsage: ScoringRule = {
  id: 'list-usage',
  dimension: 'structure',
  weight: 7,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    // Check for list-like patterns in raw text
    const hasLists = /(?:<[ou]l>|^[-*]\s|^\d+\.\s)/m.test(doc.html || doc.markdown || '');
    const wordCount = doc.rawText.split(/\s+/).length;

    let score = 7;
    if (!hasLists && wordCount > 300) {
      score = 4;
      suggestions.push({
        dimension: 'structure',
        action: 'Add bullet or numbered lists for scannable content',
        impact: 'low',
        detail: 'Use a list when the content is genuinely a sequence or set; do not convert prose only to satisfy the score.',
      });
    }

    return { score, maxScore: 7, issues: [], suggestions };
  },
};

// ── Citability Rules (25 pts) ──────────────────────────────────────

const selfContainedStatements: ScoringRule = {
  id: 'self-contained-statements',
  dimension: 'citability',
  weight: 8,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    if (doc.paragraphs.length === 0) {
      return { score: 0, maxScore: 8, issues, suggestions };
    }

    // Heuristic: paragraphs starting with pronouns or relative references are not self-contained
    // Only flag strong dangling references (pronouns/demonstratives), not conjunctions
    const danglingStarts = /^(this|that|these|those|it|they|he|she|however|moreover|furthermore|additionally)\b/i;
    const danglingParagraphs = doc.paragraphs.filter((p) => danglingStarts.test(p.trim()));
    const ratio = danglingParagraphs.length / doc.paragraphs.length;

    let score = 8;
    if (ratio > 0.4) {
      score -= 5;
      issues.push({
        dimension: 'citability',
        severity: 'warning',
        message: `${danglingParagraphs.length}/${doc.paragraphs.length} paragraphs start with pronouns or conjunctions, making them hard to cite in isolation.`,
      });
    } else if (ratio > 0.2) {
      score -= 3;
    }

    if (danglingParagraphs.length > 0) {
      suggestions.push({
        dimension: 'citability',
        action: 'Rewrite paragraphs to be self-contained',
        impact: 'high',
        detail: 'Each paragraph should make sense without reading the previous one. Replace "This feature..." with "[Product name] feature...".',
      });
    }

    return { score: Math.max(0, score), maxScore: 8, issues, suggestions };
  },
};

const dataStatsPresence: ScoringRule = {
  id: 'data-stats-presence',
  dimension: 'citability',
  weight: 7,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    // Look for numbers, percentages, dates, monetary values
    const dataPatterns = /(\d+%|\$[\d,.]+|€[\d,.]+|\d{4}[-/]\d{2}[-/]\d{2}|\d+\s*(users|customers|companies|countries|years|months|hours|minutes|seconds|ms|GB|MB|TB|requests|transactions))/gi;
    const matches = doc.rawText.match(dataPatterns) || [];

    if (matches.length === 0) {
      return { score: 7, maxScore: 7, issues, suggestions };
    }

    const hasSourceLanguage = /(?:according to|source:|reference:|cited from|data from)/i.test(doc.rawText);
    const hasExternalLink = doc.links.some((link) => /^https?:\/\//i.test(link.href));

    if (!hasSourceLanguage && !hasExternalLink) {
      issues.push({
        dimension: 'citability',
        severity: 'warning',
        message: `Found ${matches.length} quantitative claim${matches.length === 1 ? '' : 's'} without a detectable source reference.`,
      });
      suggestions.push({
        dimension: 'citability',
        action: 'Cite the source for quantitative claims',
        impact: 'high',
        detail: 'Do not add statistics merely to improve a score. Link each material number to a reliable source or explain the measurement method.',
      });
      return { score: 3, maxScore: 7, issues, suggestions };
    }

    return { score: 7, maxScore: 7, issues, suggestions };
  },
};

const clearDefinitions: ScoringRule = {
  id: 'clear-definitions',
  dimension: 'citability',
  weight: 5,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    // Look for "X is Y" patterns, definition lists
    const definitionPatterns = /\b\w+\s+(?:is|are|refers to|means|defines?|defined as)\s+/gi;
    const matches = doc.rawText.match(definitionPatterns) || [];

    const hasDlElements = /<dl/i.test(doc.html || '');

    let score = 0;
    if (matches.length >= 3 || hasDlElements) score = 5;
    else if (matches.length >= 1) score = 3;
    else {
      score = 1;
      suggestions.push({
        dimension: 'citability',
        action: 'Add clear definitions for key terms',
        impact: 'medium',
        detail: 'Define unfamiliar terms where readers need them. This is a clarity heuristic, not a featured-snippet guarantee.',
      });
    }

    return { score, maxScore: 5, issues: [], suggestions };
  },
};

const attribution: ScoringRule = {
  id: 'attribution',
  dimension: 'citability',
  weight: 5,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    let score = 0;

    // Check for author metadata
    const hasAuthor = doc.metaTags['author'] || doc.metaTags['article:author'] || doc.jsonLd.some((ld) => ld.author);
    if (hasAuthor) score += 2;

    // Check for date
    const hasDate = doc.metaTags['article:published_time'] || doc.metaTags['date'] || doc.jsonLd.some((ld) => ld.datePublished);
    if (hasDate) score += 2;

    // Check for source citations in content
    const hasCitations = /(?:according to|source:|cited from|reference:|via\s)/i.test(doc.rawText);
    if (hasCitations) score += 1;

    if (score < 3) {
      suggestions.push({
        dimension: 'citability',
        action: 'Add author and publication date metadata',
        impact: 'medium',
        detail: 'For authored or time-sensitive content, add accurate author, publication date, and source references. Omit fields that do not apply.',
      });
    }

    return { score: Math.min(5, score), maxScore: 5, issues, suggestions };
  },
};

// ── Schema Rules (20 pts) ──────────────────────────────────────────

const jsonLdPresence: ScoringRule = {
  id: 'json-ld-presence',
  dimension: 'schema',
  weight: 8,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];

    if (doc.jsonLd.length === 0) {
      issues.push({
        dimension: 'schema',
        severity: 'info',
        message: 'No JSON-LD structured data found. Add a supported type only when it matches visible content and serves a defined search feature.',
      });
      return { score: 8, maxScore: 8, issues, suggestions: [] };
    }

    return { score: 8, maxScore: 8, issues, suggestions: [] };
  },
};

const jsonLdCompleteness: ScoringRule = {
  id: 'json-ld-completeness',
  dimension: 'schema',
  weight: 12,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    if (doc.jsonLd.length === 0) {
      return { score: 12, maxScore: 12, issues, suggestions };
    }

    const requiredFields = ['@context', '@type'];
    let totalScore = 0;
    let checked = 0;

    for (const ld of doc.jsonLd) {
      checked++;
      const missing = requiredFields.filter((f) => !ld[f]);

      if (missing.length === 0) {
        totalScore += 12;
      } else {
        totalScore += Math.max(0, 12 - missing.length * 6);
        issues.push({
          dimension: 'schema',
          severity: 'warning',
          message: `JSON-LD (${ld['@type'] || 'unknown'}) missing fields: ${missing.join(', ')}`,
        });
      }
    }

    const score = Math.round(totalScore / checked);

    // Check for author/datePublished on Article types
    const articles = doc.jsonLd.filter((ld) => /article/i.test(ld['@type'] || ''));
    for (const article of articles) {
      if (!article.author) {
        suggestions.push({
          dimension: 'schema',
          action: 'Add author field to Article schema',
          impact: 'medium',
          detail: 'Add an accurate author only when the visible article identifies that author.',
        });
      }
      if (!article.datePublished) {
        suggestions.push({
          dimension: 'schema',
          action: 'Add datePublished to Article schema',
          impact: 'medium',
          detail: 'Add the actual publication date only when it is visible or otherwise verifiable.',
        });
      }
    }

    return { score: Math.min(12, score), maxScore: 12, issues, suggestions };
  },
};

const aiRelevantSchemaTypes: ScoringRule = {
  id: 'ai-relevant-schema-types',
  dimension: 'schema',
  weight: 0,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    if (doc.jsonLd.length > 0) {
      suggestions.push({
        dimension: 'schema',
        action: 'Validate structured data against the applicable feature documentation',
        impact: 'low',
        detail: 'Schema type count has no score impact. Validate required properties and ensure every value matches visible page content.',
      });
    }

    return { score: 0, maxScore: 0, issues: [], suggestions };
  },
};

// ── AI Metadata Rules (15 pts) ─────────────────────────────────────

const llmsTxtPresence: ScoringRule = {
  id: 'llms-txt-presence',
  dimension: 'aiMetadata',
  weight: 0,
  evaluate(_doc: ParsedDocument): RuleResult {
    return { score: 0, maxScore: 0, issues: [], suggestions: [] };
  },
};

const robotsTxtAiConfig: ScoringRule = {
  id: 'robots-txt-ai-config',
  dimension: 'aiMetadata',
  weight: 8,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    // This rule checks meta robots and hints; actual robots.txt checking is done at directory/URL level
    const robotsMeta = doc.metaTags['robots'] || '';
    const hasNoindex = /noindex/i.test(robotsMeta);

    if (hasNoindex) {
      return {
        score: 0,
        maxScore: 8,
        issues: [{
          dimension: 'aiMetadata',
          severity: 'critical',
          message: 'Page has a noindex meta tag. Search engines may exclude it from results; review whether that is intentional.',
        }],
        suggestions,
      };
    }

    // Page-level noindex is deterministic. Site-level crawler access must be verified separately.
    suggestions.push({
      dimension: 'aiMetadata',
      action: 'Verify crawler access separately from the page score',
      impact: 'low',
      detail: 'robots.txt, CDN bot controls, and each service crawler have different effects. A permissive rule does not guarantee indexing or citation.',
    });

    return { score: 8, maxScore: 8, issues: [], suggestions };
  },
};

const metaDescriptionQuality: ScoringRule = {
  id: 'meta-description-quality',
  dimension: 'aiMetadata',
  weight: 7,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    const desc = doc.metaTags['description'] || doc.metaTags['og:description'] || '';

    if (!desc) {
      issues.push({
        dimension: 'aiMetadata',
        severity: 'warning',
        message: 'No meta description found. Search engines may generate a snippet from page content instead.',
      });
      return { score: 0, maxScore: 7, issues, suggestions };
    }

    const words = desc.trim().split(/\s+/).filter(Boolean);
    const cjkLength = (desc.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
    const looksGeneric = (words.length < 3 && cjkLength < 10) || /^(home|welcome|official site|website)$/i.test(desc.trim());
    const commaCount = (desc.match(/[,，、]/g) || []).length;
    const looksLikeKeywordList = commaCount >= 4 && !/[.!?。！？]/.test(desc);

    if (looksGeneric) {
      suggestions.push({
        dimension: 'aiMetadata',
        action: 'Write a page-specific meta description',
        impact: 'medium',
        detail: 'Describe the page accurately. Google does not impose a fixed meta-description length limit.',
      });
      return { score: 3, maxScore: 7, issues, suggestions };
    }

    if (looksLikeKeywordList) {
      suggestions.push({
        dimension: 'aiMetadata',
        action: 'Replace the keyword list with a readable page summary',
        impact: 'medium',
        detail: 'A descriptive sentence is more useful than comma-separated terms. Length alone does not determine quality.',
      });
      return { score: 3, maxScore: 7, issues, suggestions };
    }

    return { score: 7, maxScore: 7, issues, suggestions };
  },
};

// ── Content Density Rules (15 pts) ─────────────────────────────────

const contentBoilerplateRatio: ScoringRule = {
  id: 'content-boilerplate-ratio',
  dimension: 'contentDensity',
  weight: 5,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    // Simple heuristic: ratio of paragraph text to total text
    const paragraphText = doc.paragraphs.join(' ');
    const paragraphWords = paragraphText.split(/\s+/).filter(Boolean).length;
    const totalWords = doc.rawText.split(/\s+/).filter(Boolean).length;

    if (totalWords === 0) {
      return { score: 0, maxScore: 5, issues: [{ dimension: 'contentDensity', severity: 'warning', message: 'No text content found.' }], suggestions };
    }

    const ratio = paragraphWords / totalWords;

    let score: number;
    if (ratio >= 0.6) {
      score = 5;
    } else if (ratio >= 0.4) {
      score = 3;
    } else {
      score = 1;
      suggestions.push({
        dimension: 'contentDensity',
        action: 'Increase content-to-boilerplate ratio',
        impact: 'medium',
        detail: `Only ${Math.round(ratio * 100)}% of page text is in content paragraphs. Use semantic HTML (<main>, <article>) to help AI identify primary content.`,
      });
    }

    return { score, maxScore: 5, issues: [], suggestions };
  },
};

const keywordStuffingDetection: ScoringRule = {
  id: 'keyword-stuffing-detection',
  dimension: 'contentDensity',
  weight: 5,
  evaluate(doc: ParsedDocument): RuleResult {
    const issues: Issue[] = [];
    const suggestions: Suggestion[] = [];

    const words = doc.rawText.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (words.length < 50) {
      return { score: 5, maxScore: 5, issues, suggestions };
    }

    const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say', 'she', 'too', 'use', 'that', 'this', 'with', 'from', 'have', 'been', 'they', 'their', 'will', 'would', 'could', 'should', 'about', 'which', 'when', 'what', 'there', 'where', 'your', 'more', 'some', 'than', 'them', 'into', 'other', 'also', 'just', 'only', 'very', 'does', 'each']);
    const contentWords = words.filter((w) => !stopWords.has(w));
    if (contentWords.length < 20) {
      return { score: 5, maxScore: 5, issues, suggestions };
    }

    // Signal 1: Vocabulary diversity — natural writing has diverse word choice
    const uniqueWords = new Set(contentWords).size;
    const diversity = uniqueWords / contentWords.length; // 0-1, higher = more diverse

    // Signal 2: Consecutive repetition — same word appearing in adjacent sentences
    const sentences = doc.rawText.split(/(?<!\d)\.|\.(?!\d)|[!?。！？]+/).filter((s) => s.trim().length > 10);
    let consecutiveHits = 0;
    if (sentences.length >= 2) {
      const freq = new Map<string, number>();
      for (const word of contentWords) freq.set(word, (freq.get(word) || 0) + 1);
      // Find top 3 most frequent content words
      const topWords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

      for (const word of topWords) {
        let streak = 0;
        for (let i = 1; i < sentences.length; i++) {
          const prevHas = sentences[i - 1].toLowerCase().includes(word);
          const currHas = sentences[i].toLowerCase().includes(word);
          if (prevHas && currHas) streak++;
        }
        // If word appears in >60% of consecutive sentence pairs, it's stuffed
        if (streak / (sentences.length - 1) > 0.6) consecutiveHits++;
      }
    }

    let score = 5;

    // Low diversity + high consecutive repetition = stuffing
    if (diversity < 0.25 && consecutiveHits >= 2) {
      score = 0;
      issues.push({ dimension: 'contentDensity', severity: 'warning', message: `Low vocabulary diversity (${(diversity * 100).toFixed(0)}%) with repetitive phrasing. Review this as a possible keyword-stuffing pattern.` });
      suggestions.push({ dimension: 'contentDensity', action: 'Diversify vocabulary and vary sentence structure', impact: 'high', detail: 'Use synonyms, rephrase repeated concepts, and ensure each sentence adds unique value.' });
    } else if (diversity < 0.3 || consecutiveHits >= 2) {
      score = 2;
      issues.push({ dimension: 'contentDensity', severity: 'warning', message: `${diversity < 0.3 ? `Low vocabulary diversity (${(diversity * 100).toFixed(0)}%).` : ''} ${consecutiveHits >= 2 ? 'Repetitive keyword patterns detected across sentences.' : ''}`.trim() });
      suggestions.push({ dimension: 'contentDensity', action: 'Reduce keyword repetition', impact: 'medium', detail: 'Use synonyms and natural language variation instead of repeating the same terms.' });
    }

    return { score, maxScore: 5, issues, suggestions };
  },
};

const contentUniquenessSignals: ScoringRule = {
  id: 'content-uniqueness-signals',
  dimension: 'contentDensity',
  weight: 5,
  evaluate(doc: ParsedDocument): RuleResult {
    const suggestions: Suggestion[] = [];

    let score = 2; // Base score

    // Check for original data indicators
    const hasOriginalData = /(?:our\s+(?:data|research|analysis|survey|study)|we\s+(?:found|discovered|measured|tested|analyzed))/i.test(doc.rawText);
    if (hasOriginalData) score += 2;

    // Check for code examples
    const hasCode = /<code|<pre|```/i.test(doc.html || doc.markdown || '');
    if (hasCode) score += 1;

    if (score < 4) {
      suggestions.push({
        dimension: 'contentDensity',
        action: 'Add original data, examples, or unique insights',
        impact: 'medium',
        detail: 'Add verifiable original research, practical examples, or implementation details when they help the reader. Do not invent data to satisfy this heuristic.',
      });
    }

    return { score: Math.min(5, score), maxScore: 5, issues: [], suggestions };
  },
};

// ── Export all rules ───────────────────────────────────────────────

export const allRules: ScoringRule[] = [
  // Structure (25 pts)
  headingHierarchy,
  paragraphLength,
  faqPresence,
  listUsage,
  // Citability (25 pts)
  selfContainedStatements,
  dataStatsPresence,
  clearDefinitions,
  attribution,
  // Schema (20 pts)
  jsonLdPresence,
  jsonLdCompleteness,
  aiRelevantSchemaTypes,
  // AI Metadata (15 pts)
  llmsTxtPresence,
  robotsTxtAiConfig,
  metaDescriptionQuality,
  // Content Density (15 pts)
  contentBoilerplateRatio,
  keywordStuffingDetection,
  contentUniquenessSignals,
];

export function getRulesByDimension(dimension: string): ScoringRule[] {
  return allRules.filter((r) => r.dimension === dimension);
}
