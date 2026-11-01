import { describe, expect, it } from 'vitest';
import { auditDocument, type AuditContext } from '../audit.js';
import { parseHtml } from '../scanner.js';

function robotsCheck(directives: string, source: 'robots' | 'googlebot' | 'header') {
  const doc = parseHtml(source === 'header' ? '<title>Guide</title>' : `<meta name="${source}" content="${directives}">`, 'guide.html');
  const context: AuditContext = { target: { type: 'file', input: doc.url }, rendering: 'local-html' };
  if (source === 'header') {
    context.http = { status: 200, statusText: 'OK', redirects: [], contentType: 'text/html', xRobotsTag: directives };
  }
  return auditDocument(doc, context).checks.find(check => check.id === 'robots-directives');
}

describe('robots parameter whitespace (F5)', () => {
  for (const source of ['robots', 'googlebot', 'header'] as const) {
    it.each(['max-image-preview:none', 'max-image-preview: none', 'MAX-IMAGE-PREVIEW:\tNONE'])('keeps parameter values attached in %s from ' + source, (value) => {
      expect(robotsCheck(value, source)?.status).toBe('PASS');
    });

    it.each(['none', 'NoIndex', 'nofollow', 'max-image-preview: none, noindex', 'max-image-preview: none nofollow'])('detects standalone restrictions in %s from ' + source, (value) => {
      expect(robotsCheck(value, source)?.status).toBe('WARNING');
    });
  }

  it('detects a standalone header restriction after a user-agent prefix', () => {
    expect(robotsCheck('googlebot: noindex', 'header')?.status).toBe('WARNING');
  });
});
