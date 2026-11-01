import type { CheerioAPI } from 'cheerio';
import type { JsonLdDiagnostic, JsonLdObject } from './types.js';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isContext = (value: unknown): boolean => isString(value) || isObject(value)
  || (Array.isArray(value) && value.length > 0 && value.every(item => item === null || isString(item) || isObject(item)));
const isType = (value: unknown): boolean => isString(value)
  || (Array.isArray(value) && value.length > 0 && value.every(isString));

/** Structural hygiene for page entities, without fetching contexts or checking schema vocabulary. */
export function parseJsonLdBlocks(blocks: Array<{ source: string; line: number }>) {
  const jsonLd: JsonLdObject[] = [];
  const jsonLdErrors: string[] = [];
  const jsonLdDiagnostics: JsonLdDiagnostic[] = [];
  blocks.forEach(({ source, line }, index) => {
    const block = index + 1;
    const report = (message: string, path: string, severity: JsonLdDiagnostic['severity'] = 'critical', kind: JsonLdDiagnostic['kind'] = 'structure') => {
      jsonLdDiagnostics.push({ message, severity, kind, line, block, path });
    };
    const appendNodes = (value: unknown, path: string, inheritedContext?: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach((item, itemIndex) => {
          if (Array.isArray(item)) report('JSON-LD: expected an object, found a nested array.', `${path}[${itemIndex}]`, 'critical', path === '$' ? 'root' : 'structure');
          appendNodes(item, `${path}[${itemIndex}]`, inheritedContext);
        });
        return;
      }
      if (!isObject(value)) {
        // Retain the legacy normalized values and score contract.
        if (value !== null) jsonLd.push(value as JsonLdObject);
        jsonLdErrors.push(`JSON-LD block ${block}${path === '$' ? '' : ` ${path}`}: expected an object`);
        report('JSON-LD: expected an object.', path, 'critical', path === '$' || /^\$\[\d+\]$/.test(path) ? 'root' : 'structure');
        return;
      }

      const context = Object.hasOwn(value, '@context') ? value['@context'] : inheritedContext;
      const { '@graph': graph, ...fields } = value;
      const isEntity = graph === undefined || Object.keys(fields).some(key => key !== '@context' && key !== '@id');
      if (isEntity) {
        const node = { ...(context !== undefined ? { '@context': context } : {}), ...fields } as JsonLdObject;
        jsonLd.push(node);
        const missing = ['@context', '@type'].filter(key => !node[key]);
        if (missing.length > 0) {
          const type: unknown = node['@type'];
          const label = isString(type) ? type : Array.isArray(type) ? type.filter(isString).join(',') : 'unknown';
          report(`JSON-LD (${label || 'unknown'}) missing fields: ${missing.join(', ')}`, path, 'warning');
        }
        if (context !== undefined && context !== null && context !== '' && !isContext(context)) report('JSON-LD: @context must be a non-empty string, context object, or array of contexts.', `${path}.@context`);
        const type: unknown = node['@type'];
        if (type !== undefined && type !== null && type !== '' && !isType(type)) report('JSON-LD: @type must be a non-empty string or array of non-empty strings.', `${path}.@type`);
      } else if (context !== undefined && context !== null && !isContext(context)) {
        report('JSON-LD: @context must be a non-empty string, context object, or array of contexts.', `${path}.@context`);
      }
      if (graph !== undefined) appendNodes(graph, `${path}.@graph`, context);
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
      jsonLdErrors.push(`JSON-LD block ${block}: ${message}`);
      report(`JSON-LD block ${block}: malformed JSON (${message})`, '$', 'warning', 'syntax');
      return;
    }
    try {
      appendNodes(parsed, '$');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown structure error';
      jsonLdErrors.push(`JSON-LD block ${block}: ${message}`);
      report(`JSON-LD block ${block}: structure could not be inspected (${message})`, '$');
    }
  });

  return { jsonLd, jsonLdErrors, jsonLdDiagnostics, jsonLdBlockCount: blocks.length };
}

export function extractJsonLd($: CheerioAPI) {
  const scripts = $('script').filter((_, el) =>
    ($(el).attr('type') || '').trim().toLowerCase() === 'application/ld+json');
  return parseJsonLdBlocks(scripts.map((_, el) => ({
    source: $(el).html() || '',
    line: el.sourceCodeLocation?.startLine ?? 1,
  })).get());
}

export function formatJsonLdDiagnostic(diagnostic: JsonLdDiagnostic): string {
  return `Line ${diagnostic.line}, block ${diagnostic.block}, ${diagnostic.path}: ${diagnostic.message}`;
}
