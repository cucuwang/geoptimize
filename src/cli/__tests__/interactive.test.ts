import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scan } from '../../core/scanner.js';
import type { ScanOptions, ScanReport, ScanTarget } from '../../core/types.js';
import {
  runInteractive,
  shouldLaunchInteractive,
  type InteractiveDependencies,
  type InteractivePrompt,
} from '../interactive.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../../core/__tests__/fixtures/good-page.html');
const temporaryDirectories: string[] = [];

class ScriptedPrompt implements InteractivePrompt {
  readonly questions: string[] = [];
  closed = false;

  constructor(private readonly answers: Array<string | null>) {}

  question(prompt: string): Promise<string | null> {
    this.questions.push(prompt);
    return Promise.resolve(this.answers.length > 0 ? this.answers.shift()! : null);
  }

  close(): void {
    this.closed = true;
  }
}

function captureOutput(): { output: NodeJS.WritableStream; text: () => string } {
  const chunks: string[] = [];
  const output = {
    write(chunk: string | Uint8Array): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { output, text: () => chunks.join('') };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'geoptimize-interactive-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('interactive CLI routing', () => {
  it('enters only for an argument-free pair of TTY streams', () => {
    expect(shouldLaunchInteractive([], true, true)).toBe(true);
    expect(shouldLaunchInteractive([], false, true)).toBe(false);
    expect(shouldLaunchInteractive([], true, false)).toBe(false);
    expect(shouldLaunchInteractive(['scan', 'example.com'], true, true)).toBe(false);
    expect(shouldLaunchInteractive(['--help'], true, true)).toBe(false);
    expect(shouldLaunchInteractive(['--version'], true, true)).toBe(false);
  });
});

describe('interactive scan and report flow', () => {
  it('cancels from the goal menu without invoking the scanner', async () => {
    const prompt = new ScriptedPrompt(['2']);
    const captured = captureOutput();
    const runScan = vi.fn<NonNullable<InteractiveDependencies['scan']>>();

    const result = await runInteractive({ prompt, output: captured.output, scan: runScan });

    expect(result).toEqual({ status: 'cancelled' });
    expect(runScan).not.toHaveBeenCalled();
    expect(captured.text()).toContain('Cancelled. No report was created.');
    expect(prompt.closed).toBe(true);
  });

  it('treats EOF as cancellation and returns without waiting for more input', async () => {
    const prompt = new ScriptedPrompt([null]);
    const captured = captureOutput();

    const result = await runInteractive({ prompt, output: captured.output });

    expect(result.status).toBe('cancelled');
    expect(captured.text()).toContain('Input ended. No report was created.');
  });

  it('scans a local fixture with details and writes the rendered report', async () => {
    const directory = await temporaryDirectory();
    const prompt = new ScriptedPrompt(['1', '2', fixture, 'fixture-report']);
    const captured = captureOutput();
    const runScan = vi.fn(async (target: ScanTarget, options?: ScanOptions) => {
      expect(prompt.closed).toBe(true);
      return scan(target, options);
    });

    const result = await runInteractive({ prompt, output: captured.output, cwd: directory, scan: runScan });
    const outputPath = join(directory, 'fixture-report.html');

    expect(result).toMatchObject({ status: 'completed', outputPath, pages: 1 });
    expect(runScan).toHaveBeenCalledWith({ type: 'file', path: fixture }, { details: true });
    expect(await readFile(outputPath, 'utf8')).toContain('Content readiness');
    expect(captured.text()).toContain(`Visual report saved to ${outputPath}`);
  });

  it('leaves an existing report unchanged and does not scan into it', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'existing.html');
    await writeFile(outputPath, 'keep this report', 'utf8');
    const prompt = new ScriptedPrompt(['1', '2', fixture, outputPath]);
    const captured = captureOutput();
    const runScan = vi.fn<NonNullable<InteractiveDependencies['scan']>>();

    const result = await runInteractive({ prompt, output: captured.output, cwd: directory, scan: runScan });

    expect(result.status).toBe('cancelled');
    expect(runScan).not.toHaveBeenCalled();
    expect(await readFile(outputPath, 'utf8')).toBe('keep this report');
    expect(captured.text()).toContain('Output file already exists');
    expect(captured.text()).not.toContain('Visual report saved');
  });

  it('uses exclusive creation when the report appears during the scan', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'late.html');
    const prompt = new ScriptedPrompt(['1', '2', fixture, 'late']);
    const captured = captureOutput();
    const runScan = vi.fn(async (target: ScanTarget, options?: ScanOptions) => {
      await writeFile(outputPath, 'written by another process', 'utf8');
      return scan(target, options);
    });

    const result = await runInteractive({ prompt, output: captured.output, cwd: directory, scan: runScan });

    expect(result.status).toBe('error');
    expect(result.error?.message).toContain('already exists');
    expect(await readFile(outputPath, 'utf8')).toBe('written by another process');
    expect(captured.text()).toContain('Output file already exists');
    expect(captured.text()).not.toContain('Visual report saved');
  });

  it('asks for another filename after a collision and completes the report', async () => {
    const directory = await temporaryDirectory();
    const existingPath = join(directory, 'existing.html');
    await writeFile(existingPath, 'keep this report', 'utf8');
    const prompt = new ScriptedPrompt(['1', '2', fixture, 'existing', 'fresh-report']);
    const captured = captureOutput();
    const runScan = vi.fn(async (target: ScanTarget, options?: ScanOptions) => scan(target, options));

    const result = await runInteractive({ prompt, output: captured.output, cwd: directory, scan: runScan });
    const outputPath = join(directory, 'fresh-report.html');

    expect(result).toMatchObject({ status: 'completed', outputPath, pages: 1 });
    expect(runScan).toHaveBeenCalledTimes(1);
    expect(await readFile(existingPath, 'utf8')).toBe('keep this report');
    expect(await readFile(outputPath, 'utf8')).toContain('Content readiness');
    expect(captured.text()).toContain(`Output file already exists: ${existingPath}. Choose a new filename.`);
    expect(prompt.questions.filter(question => question.startsWith('Output HTML file'))).toHaveLength(2);
  });

  it('keeps back-navigation and cancellation at the output prompt after a collision', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'existing.html'), 'keep this report', 'utf8');
    const runScan = vi.fn<NonNullable<InteractiveDependencies['scan']>>();

    const backPrompt = new ScriptedPrompt(['1', '2', fixture, 'existing', 'b', 'c']);
    const backResult = await runInteractive({ prompt: backPrompt, output: captureOutput().output, cwd: directory, scan: runScan });
    expect(backResult).toEqual({ status: 'cancelled' });
    expect(backPrompt.questions.at(-1)).toContain('Local HTML or Markdown path');

    const cancelPrompt = new ScriptedPrompt(['1', '2', fixture, 'existing', 'c']);
    const cancelResult = await runInteractive({ prompt: cancelPrompt, output: captureOutput().output, cwd: directory, scan: runScan });
    expect(cancelResult).toEqual({ status: 'cancelled' });

    expect(runScan).not.toHaveBeenCalled();
    expect(await readFile(join(directory, 'existing.html'), 'utf8')).toBe('keep this report');
  });

  it('reports scan failures without rendering or claiming a saved report', async () => {
    const directory = await temporaryDirectory();
    const prompt = new ScriptedPrompt(['1', '2', fixture, 'failed-report']);
    const captured = captureOutput();
    const renderReport = vi.fn(() => '<html>should not be reached</html>');
    const writeReport = vi.fn(async () => undefined);
    const runScan = vi.fn(async () => {
      throw new Error('fixture scan failed');
    });

    const result = await runInteractive({
      prompt,
      output: captured.output,
      cwd: directory,
      scan: runScan,
      renderReport,
      writeReport,
    });

    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('fixture scan failed');
    expect(renderReport).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
    expect(captured.text()).toContain('Error: fixture scan failed');
    expect(captured.text()).not.toContain('Visual report saved');
  });

  it('rejects an empty scan before rendering an empty success report', async () => {
    const directory = await temporaryDirectory();
    const prompt = new ScriptedPrompt(['1', '2', fixture, 'empty-report']);
    const captured = captureOutput();
    const emptyReport: ScanReport = {
      pages: [],
      overall: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      summary: 'No HTML or Markdown files found in directory.',
      timestamp: '2026-09-13T00:00:00.000Z',
    };
    const renderReport = vi.fn(() => '<html>should not be reached</html>');
    const writeReport = vi.fn(async () => undefined);
    const runScan = vi.fn(async () => emptyReport);

    const result = await runInteractive({
      prompt,
      output: captured.output,
      cwd: directory,
      scan: runScan,
      renderReport,
      writeReport,
    });

    expect(result.status).toBe('error');
    expect(result.error?.message).toContain('returned no pages');
    expect(renderReport).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
    expect(captured.text()).toContain('no visual report was written');
  });
});
