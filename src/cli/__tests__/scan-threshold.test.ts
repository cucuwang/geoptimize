import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanFile } from '../../core/scanner.js';

vi.mock('../../core/external-scorers.js', () => ({
  detectAvailableCLIs: vi.fn(async () => ({ gemini: true, copilot: false })),
  scoreWithAllAvailable: vi.fn(async () => [{
    source: 'gemini', score: 100, available: true, insight: 'Synthetic test review',
    dimensions: { structure: 25, citability: 25, schema: 20, aiMetadata: 15, contentDensity: 15, total: 100 },
  }]),
}));

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../../core/__tests__/fixtures/bad-page.html');
const ownedDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(ownedDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

/** Exercise Commander and the real command handler without invoking an installed CLI. */
async function runCli(args: string[]) {
  vi.resetModules();
  const previousArgv = process.argv;
  const previousExitCode = process.exitCode;
  const exit = new Error('Intercepted CLI exit');
  let code = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...parts) => { stdout.push(parts.join(' ')); });
  const error = vi.spyOn(console, 'error').mockImplementation((...parts) => { stderr.push(parts.join(' ')); });
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { stderr.push(String(chunk)); return true; });
  const stop = vi.spyOn(process, 'exit').mockImplementation(value => { code = Number(value ?? 0); throw exit; });
  process.argv = [process.execPath, 'geoptimize', ...args];
  process.exitCode = undefined;
  try {
    await import('../index.js');
    code = Number(process.exitCode ?? code);
  } catch (caught) {
    if (caught !== exit) throw caught;
  } finally {
    process.argv = previousArgv;
    process.exitCode = previousExitCode;
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    stop.mockRestore();
  }
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('scan CI exit contract', () => {
  it('keeps completed low-scoring scans advisory by default', async () => {
    const result = await runCli(['scan', fixture, '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).overall.total).toBeLessThan(100);
    expect(result.stderr).toBe('');
  });

  it('writes the complete JSON report before failing below the threshold', async () => {
    const result = await runCli(['scan', fixture, '--json', '--details', '--fail-under', '100']);
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].ruleResults.length).toBeGreaterThan(0);
    expect(result.stderr).toContain(`Score ${report.overall.total}/100 is below --fail-under 100`);
  });

  it('uses a strict less-than comparison including fractional thresholds', async () => {
    const score = (await scanFile(fixture)).scores.total;
    expect((await runCli(['scan', fixture, '--fail-under', String(score)])).code).toBe(0);
    expect((await runCli(['scan', fixture, '--fail-under', String(score + 0.5)])).code).toBe(1);
    expect((await runCli(['scan', fixture, '--fail-under', '0'])).code).toBe(0);
  });

  it.each(['-1', '101', 'NaN', 'Infinity', '60junk', ' '])('rejects invalid threshold %j before scanning', async value => {
    const result = await runCli(['scan', fixture, '--json', '--fail-under', value]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Expected a finite score from 0 to 100');
    expect(result.stdout).toBe('');
  });

  it('rejects a missing threshold argument', async () => {
    const result = await runCli(['scan', fixture, '--fail-under']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('argument missing');
  });

  it('retains exit 1 for invalid scan inputs', async () => {
    const result = await runCli(['scan', join(fixture, 'missing.html'), '--fail-under', '0']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Error:');
  });

  it('gates a directory average and keeps an empty directory advisory unless gated', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-threshold-'));
    ownedDirectories.push(directory);
    expect((await runCli(['scan', directory, '--dir', '--json'])).code).toBe(0);
    expect((await runCli(['scan', directory, '--dir', '--json', '--fail-under', '1'])).code).toBe(1);
    await writeFile(join(directory, 'index.html'), '<h1>Fixture</h1>');
    const advisory = JSON.parse((await runCli(['scan', directory, '--dir', '--json'])).stdout);
    expect((await runCli(['scan', directory, '--dir', '--json', '--fail-under', String(advisory.overall.total)])).code).toBe(0);
    expect((await runCli(['scan', directory, '--dir', '--json', '--fail-under', String(advisory.overall.total + 0.5)])).code).toBe(1);
  });

  it('reports positioned JSON-LD findings and keeps new structural warnings advisory in strict build audits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geoptimize-jsonld-cli-'));
    ownedDirectories.push(directory);
    const file = join(directory, 'broken.html');
    await writeFile(file, '<head>\n<script type="application/ld+json">{"@type":42}</script>\n</head>');
    const scan = await runCli(['scan', file]);
    expect(scan.code).toBe(0);
    expect(scan.stdout).toContain(`${file}:2:`);
    expect(scan.stdout).toContain('@type must be');
    const strict = await runCli(['audit-build', file, '--fail-on-error', '--json']);
    expect(strict.code).toBe(0);
    expect(JSON.parse(strict.stdout).pages[0].checks.find((check: { id: string }) => check.id === 'jsonld-syntax').status).toBe('WARNING');
    await writeFile(file, '<script type="application/ld+json">{</script>');
    const malformed = await runCli(['audit-build', file, '--fail-on-error', '--json']);
    expect(malformed.code).toBe(1);
    expect(JSON.parse(malformed.stdout).pages[0].checks.find((check: { id: string }) => check.id === 'jsonld-syntax').status).toBe('FAIL');
  });

  it('gates the deterministic score when an experimental AI blend exceeds the threshold', async () => {
    const html = '<h1>Fixture</h1><p>A short synthetic page for checking the deterministic score gate.</p>';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(html));
    const result = await runCli(['scan', 'https://example.com/', '--multi-ai', '--json', '--fail-under', '88']);
    const report = JSON.parse(result.stdout);
    expect(report.ruleScore).toBeLessThan(88);
    expect(report.consensusScore).toBeGreaterThanOrEqual(88);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Score ${report.ruleScore}/100`);
  });
});
