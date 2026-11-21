import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectAvailableCLIs,
  scoreWithAllAvailable,
  scoreWithExternalCLI,
} from '../external-scorers.js';

const temporaryDirectories: string[] = [];

async function fakeBin(scripts: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-fake-cli-'));
  temporaryDirectories.push(directory);
  for (const [name, body] of Object.entries(scripts)) {
    const path = join(directory, name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
  }
  return directory;
}

async function emptyPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-empty-path-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const VALID_JSON = '{"score": 70, "structure": 20, "citability": 18, "schema": 12, "aiMetadata": 10, "contentDensity": 10, "insight": "fake cli ok"}';

describe('detectAvailableCLIs', () => {
  it('reports both CLIs missing when PATH has neither', async () => {
    vi.stubEnv('PATH', await emptyPath());
    expect(await detectAvailableCLIs()).toEqual({ gemini: false, copilot: false });
  });

  it('detects only the CLIs present on PATH', async () => {
    const bin = await fakeBin({ gemini: 'exit 0' });
    vi.stubEnv('PATH', bin);
    expect(await detectAvailableCLIs()).toEqual({ gemini: true, copilot: false });
  });

  it('detects both CLIs when both exist on PATH', async () => {
    const bin = await fakeBin({ gemini: 'exit 0', copilot: 'exit 0' });
    vi.stubEnv('PATH', bin);
    expect(await detectAvailableCLIs()).toEqual({ gemini: true, copilot: true });
  });
});

describe('scoreWithExternalCLI', () => {
  it('returns parsed scores when the CLI answers with valid JSON', async () => {
    const bin = await fakeBin({
      gemini: `/bin/cat >/dev/null\n/bin/echo '${VALID_JSON}'`,
    });
    vi.stubEnv('PATH', bin);
    const result = await scoreWithExternalCLI('gemini', '<p>hi</p>', 'https://example.com/');
    expect(result).toEqual({
      source: 'gemini',
      score: 70,
      dimensions: { structure: 20, citability: 18, schema: 12, aiMetadata: 10, contentDensity: 10, total: 70 },
      insight: 'fake cli ok',
      available: true,
    });
  });

  it('pipes the scoring prompt to the CLI stdin', async () => {
    const captureDir = await mkdtemp(join(tmpdir(), 'geoptimize-stdin-'));
    temporaryDirectories.push(captureDir);
    const capture = join(captureDir, 'prompt.txt');
    const bin = await fakeBin({
      gemini: `/bin/cat > '${capture}'\n/bin/echo '${VALID_JSON}'`,
    });
    vi.stubEnv('PATH', bin);
    await scoreWithExternalCLI('gemini', '<p>page body</p>', 'https://example.com/page');
    const prompt = await readFile(capture, 'utf8');
    expect(prompt).toContain('URL: https://example.com/page');
    expect(prompt).toContain('---BEGIN UNTRUSTED PAGE CONTENT---');
    expect(prompt).toContain('page body');
  });

  it('keeps available=true but reports a parse failure on non-JSON output', async () => {
    const bin = await fakeBin({ gemini: `/bin/cat >/dev/null\n/bin/echo 'not json'` });
    vi.stubEnv('PATH', bin);
    const result = await scoreWithExternalCLI('gemini', '<p>hi</p>', 'https://x');
    expect(result.available).toBe(true);
    expect(result.score).toBe(0);
    expect(result.insight).toBe('Failed to parse AI response');
    expect(result.dimensions.total).toBe(0);
  });

  it('treats an exit-0 CLI with no output as a parse failure', async () => {
    const bin = await fakeBin({ copilot: 'exit 0' });
    vi.stubEnv('PATH', bin);
    const result = await scoreWithExternalCLI('copilot', '<p>hi</p>', 'https://x');
    expect(result.available).toBe(true);
    expect(result.insight).toBe('Failed to parse AI response');
  });

  it('marks the scorer unavailable when the CLI exits non-zero', async () => {
    const bin = await fakeBin({ gemini: `/bin/echo 'boom' >&2\nexit 3` });
    vi.stubEnv('PATH', bin);
    const result = await scoreWithExternalCLI('gemini', '<p>hi</p>', 'https://x');
    expect(result.available).toBe(false);
    expect(result.insight).toBe('gemini CLI timed out or errored');
    expect(result.dimensions).toEqual({ structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 });
  });

  it('marks the scorer unavailable when the binary does not exist', async () => {
    vi.stubEnv('PATH', await emptyPath());
    const result = await scoreWithExternalCLI('copilot', '<p>hi</p>', 'https://x');
    expect(result.available).toBe(false);
    expect(result.insight).toBe('copilot CLI timed out or errored');
  });

  it('does not spawn anything for the claude source', async () => {
    const bin = await fakeBin({ gemini: 'exit 1', copilot: 'exit 1' });
    vi.stubEnv('PATH', bin);
    const result = await scoreWithExternalCLI('claude', '<p>hi</p>', 'https://x');
    expect(result).toEqual({
      source: 'claude',
      score: 0,
      dimensions: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      insight: 'CLI not available',
      available: false,
    });
  });
});

describe('scoreWithAllAvailable', () => {
  it('returns an empty list when no CLI is flagged available', async () => {
    const bin = await fakeBin({ gemini: `/bin/echo '${VALID_JSON}'`, copilot: `/bin/echo '${VALID_JSON}'` });
    vi.stubEnv('PATH', bin);
    expect(await scoreWithAllAvailable('<p>hi</p>', 'https://x', { gemini: false, copilot: false })).toEqual([]);
  });

  it('queries only the CLIs flagged available', async () => {
    const bin = await fakeBin({
      gemini: `/bin/cat >/dev/null\n/bin/echo '${VALID_JSON}'`,
      copilot: `/bin/echo 'should not run'`,
    });
    vi.stubEnv('PATH', bin);
    const results = await scoreWithAllAvailable('<p>hi</p>', 'https://x', { gemini: true, copilot: false });
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('gemini');
    expect(results[0].score).toBe(70);
  });

  it('returns one result per available CLI in a stable gemini-then-copilot order', async () => {
    const copilotJson = '{"score": 50, "insight": "copilot says hi"}';
    const bin = await fakeBin({
      gemini: `/bin/cat >/dev/null\n/bin/echo '${VALID_JSON}'`,
      copilot: `/bin/cat >/dev/null\n/bin/echo '${copilotJson}'`,
    });
    vi.stubEnv('PATH', bin);
    const results = await scoreWithAllAvailable('<p>hi</p>', 'https://x', { gemini: true, copilot: true });
    expect(results.map((r) => r.source)).toEqual(['gemini', 'copilot']);
    expect(results.map((r) => r.score)).toEqual([70, 50]);
  });

  it('keeps a result row for a CLI that fails while others succeed', async () => {
    const bin = await fakeBin({
      gemini: `/bin/cat >/dev/null\n/bin/echo '${VALID_JSON}'`,
      copilot: 'exit 9',
    });
    vi.stubEnv('PATH', bin);
    const results = await scoreWithAllAvailable('<p>hi</p>', 'https://x', { gemini: true, copilot: true });
    expect(results).toHaveLength(2);
    expect(results[0].available).toBe(true);
    expect(results[1]).toMatchObject({ source: 'copilot', available: false, score: 0 });
  });
});
