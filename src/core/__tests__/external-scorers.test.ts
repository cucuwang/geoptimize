import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectAvailableCLIs,
  scoreWithExternalCLI,
  scoreWithAllAvailable,
} from '../external-scorers.js';

const tempDirs: string[] = [];
let fakeBin: string;

const SCORE_JSON = '{"score": 80, "structure": 20, "citability": 18, "schema": 15, "aiMetadata": 12, "contentDensity": 10, "insight": "solid"}';

async function writeFakeCli(name: string, body: string): Promise<string> {
  const path = join(fakeBin, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  fakeBin = await mkdtemp(join(tmpdir(), 'geoptimize-fake-bin-'));
  tempDirs.push(fakeBin);
  vi.stubEnv('PATH', fakeBin);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('detectAvailableCLIs', () => {
  it('detects both CLIs when present on PATH', async () => {
    await writeFakeCli('gemini', 'exit 0');
    await writeFakeCli('copilot', 'exit 0');
    expect(await detectAvailableCLIs()).toEqual({ gemini: true, copilot: true });
  });

  it('reports CLIs missing from PATH as unavailable', async () => {
    expect(await detectAvailableCLIs()).toEqual({ gemini: false, copilot: false });
  });

  it('detects a partially available set', async () => {
    await writeFakeCli('gemini', 'exit 0');
    expect(await detectAvailableCLIs()).toEqual({ gemini: true, copilot: false });
  });
});

describe('scoreWithExternalCLI', () => {
  it('returns a parsed gemini score when the CLI answers with JSON', async () => {
    await writeFakeCli('gemini', `/bin/cat >/dev/null\nprintf '%s' '${SCORE_JSON}'`);
    const result = await scoreWithExternalCLI('gemini', '<p>x</p>', 'https://example.com');
    expect(result).toMatchObject({ source: 'gemini', score: 80, available: true, insight: 'solid' });
    expect(result.dimensions).toMatchObject({ structure: 20, citability: 18, schema: 15, total: 80 });
  });

  it('returns a parsed copilot score when the CLI answers with JSON', async () => {
    await writeFakeCli('copilot', `/bin/cat >/dev/null\nprintf '%s' '${SCORE_JSON}'`);
    const result = await scoreWithExternalCLI('copilot', '<p>x</p>', 'https://example.com');
    expect(result.source).toBe('copilot');
    expect(result.score).toBe(80);
    expect(result.available).toBe(true);
  });

  it('returns unavailable for claude without invoking any CLI', async () => {
    const marker = join(fakeBin, 'claude-ran');
    await writeFakeCli('claude', `printf x > '${marker}'`);
    const result = await scoreWithExternalCLI('claude', '<p>x</p>', 'https://example.com');
    expect(result.available).toBe(false);
    expect(result.score).toBe(0);
    expect(result.insight).toBe('CLI not available');
    expect(await fileExists(marker)).toBe(false);
  });

  it('reports a parse failure when the CLI outputs non-JSON', async () => {
    await writeFakeCli('gemini', '/bin/cat >/dev/null\nprintf "%s" "not json at all"');
    const result = await scoreWithExternalCLI('gemini', '<p>x</p>', 'https://example.com');
    expect(result.available).toBe(true);
    expect(result.score).toBe(0);
    expect(result.insight).toBe('Failed to parse AI response');
  });

  it('reports an error when the CLI exits non-zero', async () => {
    await writeFakeCli('gemini', '/bin/cat >/dev/null\nprintf "%s" "boom" >&2\nexit 3');
    const result = await scoreWithExternalCLI('gemini', '<p>x</p>', 'https://example.com');
    expect(result.available).toBe(false);
    expect(result.score).toBe(0);
    expect(result.insight).toContain('timed out or errored');
  });

  it('passes the built scoring prompt to the CLI over stdin', async () => {
    const capture = join(fakeBin, 'stdin.txt');
    await writeFakeCli('gemini', `/bin/cat > '${capture}'\nprintf '%s' '${SCORE_JSON}'`);
    await scoreWithExternalCLI('gemini', '<p>hello</p>', 'https://example.com/page');
    const sent = await readFile(capture, 'utf8');
    expect(sent).toContain('https://example.com/page');
    expect(sent).toContain('BEGIN UNTRUSTED PAGE CONTENT');
  });

  it('does not crash on EPIPE when the CLI exits before reading a large prompt', async () => {
    // The fake closes stdin immediately; the prompt is ~1 MB, far larger than
    // the OS pipe buffer, so writing it without an stdin error handler raises
    // an uncaught EPIPE instead of settling the promise.
    await writeFakeCli('gemini', `exec 0<&-\nprintf '%s' '${SCORE_JSON}'`);
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => { uncaught.push(err); };
    process.on('uncaughtException', onUncaught);
    try {
      const bigUrl = `https://example.com/${'a'.repeat(1_000_000)}`;
      const result = await scoreWithExternalCLI('gemini', '<p>x</p>', bigUrl);
      // Let any pending stdin error events surface before asserting.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(uncaught).toEqual([]);
      expect(result.available).toBe(true);
      expect(result.score).toBe(80);
    } finally {
      process.removeListener('uncaughtException', onUncaught);
    }
  });
});

describe('scoreWithAllAvailable', () => {
  it('returns an empty list when no CLI is available', async () => {
    const geminiMarker = join(fakeBin, 'gemini-ran');
    const copilotMarker = join(fakeBin, 'copilot-ran');
    await writeFakeCli('gemini', `printf x > '${geminiMarker}'`);
    await writeFakeCli('copilot', `printf x > '${copilotMarker}'`);
    const results = await scoreWithAllAvailable('<p>x</p>', 'https://example.com', { gemini: false, copilot: false });
    expect(results).toEqual([]);
    expect(await fileExists(geminiMarker)).toBe(false);
    expect(await fileExists(copilotMarker)).toBe(false);
  });

  it('invokes only the CLIs marked available', async () => {
    const copilotMarker = join(fakeBin, 'copilot-ran');
    await writeFakeCli('gemini', `/bin/cat >/dev/null\nprintf '%s' '${SCORE_JSON}'`);
    await writeFakeCli('copilot', `printf x > '${copilotMarker}'`);
    const results = await scoreWithAllAvailable('<p>x</p>', 'https://example.com', { gemini: true, copilot: false });
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('gemini');
    expect(await fileExists(copilotMarker)).toBe(false);
  });

  it('scores with both CLIs and tolerates one failing', async () => {
    await writeFakeCli('gemini', `/bin/cat >/dev/null\nprintf '%s' '${SCORE_JSON}'`);
    await writeFakeCli('copilot', 'exit 9');
    const results = await scoreWithAllAvailable('<p>x</p>', 'https://example.com', { gemini: true, copilot: true });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ source: 'gemini', available: true, score: 80 });
    expect(results[1]).toMatchObject({ source: 'copilot', available: false });
  });

  it('keeps result order aligned with invocation order', async () => {
    await writeFakeCli('gemini', 'exit 9');
    await writeFakeCli('copilot', `/bin/cat >/dev/null\nprintf '%s' '${SCORE_JSON}'`);
    const results = await scoreWithAllAvailable('<p>x</p>', 'https://example.com', { gemini: true, copilot: true });
    expect(results.map((r) => r.source)).toEqual(['gemini', 'copilot']);
    expect(results[1].score).toBe(80);
  });
});
