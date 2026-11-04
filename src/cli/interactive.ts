import { createInterface } from 'node:readline/promises';
import { extname, resolve } from 'node:path';
import { lstat, writeFile } from 'node:fs/promises';
import { scan } from '../core/scanner.js';
import { renderVisualReport } from '../core/visual-report.js';
import type { ScanOptions, ScanReport, ScanTarget } from '../core/types.js';

/** The supported local source extensions for the interactive file choice. */
const LOCAL_FILE_EXTENSIONS = new Set(['.html', '.htm', '.md', '.mdx']);

/** The filename used when the interactive user accepts the default. */
export const DEFAULT_INTERACTIVE_OUTPUT_FILENAME = 'geoptimize-report.html';

export interface InteractivePrompt {
  /** Return null when input is closed or interrupted. */
  question(prompt: string): Promise<string | null>;
  close(): void;
}

export interface InteractiveDependencies {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  prompt?: InteractivePrompt;
  scan?: (target: ScanTarget, options?: ScanOptions) => Promise<ScanReport>;
  renderReport?: (report: ScanReport) => string;
  resolveTarget?: (target: string, isDir?: boolean) => ScanTarget;
  writeReport?: (outputPath: string, html: string) => Promise<void>;
  cwd?: string;
}

export type InteractiveStatus = 'completed' | 'cancelled' | 'error';

export interface InteractiveResult {
  status: InteractiveStatus;
  outputPath?: string;
  pages?: number;
  error?: Error;
}

/**
 * Decide whether the bare CLI invocation may enter the interactive flow.
 * Explicit commands and help/version flags always retain Commander behaviour.
 */
export function shouldLaunchInteractive(args: readonly string[], stdinIsTTY: boolean, stdoutIsTTY: boolean): boolean {
  if (!stdinIsTTY || !stdoutIsTTY || args.length !== 0) return false;
  return true;
}

/**
 * Resolve the same target forms used by the explicit scan/audit commands.
 * Keeping this helper here lets the interactive and Commander paths share the
 * target rules without adding a second URL/path interpretation.
 */
export function resolveTarget(target: string, isDir?: boolean): ScanTarget {
  if (isDir) {
    return { type: 'directory', path: target };
  }
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return { type: 'url', path: target };
  }
  const extension = extname(target).toLowerCase();
  if (LOCAL_FILE_EXTENSIONS.has(extension)) {
    return { type: 'file', path: target };
  }
  // Bare domain (contains a dot, no path separator) -> treat as URL.
  if (target.includes('.') && !target.includes('/') && !target.includes('\\')) {
    return { type: 'url', path: `https://${target}` };
  }
  // Looks like a local path - hint the user.
  if (target.startsWith('./') || target.startsWith('/') || target.startsWith('..')) {
    throw new Error(`"${target}" looks like a local path. Use --dir flag: npx geoptimize scan ${target} --dir`);
  }
  // Fallback: assume URL with https, preserving the explicit command's legacy behaviour.
  return { type: 'url', path: `https://${target}` };
}

/** Create a readline-backed prompt that resolves cleanly on EOF and Ctrl-C. */
export function createReadlinePrompt(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): InteractivePrompt {
  const readline = createInterface({ input, output, terminal: true, crlfDelay: Infinity });
  let closed = false;
  let interrupted = false;
  const closeWaiters = new Set<() => void>();

  readline.on('close', () => {
    closed = true;
    for (const waiter of closeWaiters) waiter();
    closeWaiters.clear();
  });
  readline.on('SIGINT', () => {
    interrupted = true;
    readline.close();
  });

  return {
    question(query: string): Promise<string | null> {
      if (closed || interrupted) return Promise.resolve(null);

      const controller = new AbortController();
      return new Promise<string | null>((resolveQuestion) => {
        let settled = false;
        const finish = (answer: string | null): void => {
          if (settled) return;
          settled = true;
          closeWaiters.delete(onClose);
          controller.abort();
          resolveQuestion(answer);
        };
        const onClose = (): void => finish(null);
        closeWaiters.add(onClose);

        try {
          void readline.question(query, { signal: controller.signal })
            .then((answer) => finish(answer))
            .catch(() => finish(null));
        } catch {
          finish(null);
        }
      });
    },
    close(): void {
      if (!closed) readline.close();
    },
  };
}

/**
 * Run the first interactive vertical slice. The collaborators are injectable
 * so tests can exercise the real flow without starting a shell or network.
 */
export async function runInteractive(dependencies: InteractiveDependencies = {}): Promise<InteractiveResult> {
  const input = dependencies.input ?? process.stdin;
  const output = dependencies.output ?? process.stdout;
  const prompt = dependencies.prompt ?? createReadlinePrompt(input, output);
  const runScan = dependencies.scan ?? scan;
  const renderReport = dependencies.renderReport ?? renderVisualReport;
  const targetResolver = dependencies.resolveTarget ?? resolveTarget;
  const writeReport = dependencies.writeReport ?? writeInteractiveReport;
  const cwd = dependencies.cwd ?? process.cwd();
  let promptClosed = false;
  const closePrompt = (): void => {
    if (promptClosed) return;
    promptClosed = true;
    prompt.close();
  };

  try {
    writeLine(output, '\ngeoptimize interactive\n');

    while (true) {
      writeLine(output, 'Goal');
      writeLine(output, '  1. Scan a target and create an HTML report');
      writeLine(output, '  2. Exit');
      const goal = await prompt.question('Select [1/2]: ');

      if (goal === null) return cancelled(output, 'Input ended');
      const goalChoice = normalizeChoice(goal);
      if (goalChoice === '2' || isCancel(goalChoice)) return cancelled(output);
      if (goalChoice !== '1' && goalChoice !== 'scan') {
        writeLine(output, 'Please choose 1 to scan or 2 to exit.');
        continue;
      }

      while (true) {
        writeLine(output, '\nTarget type');
        writeLine(output, '  1. Website URL');
        writeLine(output, '  2. Local HTML or Markdown file');
        writeLine(output, '  3. Local directory');
        writeLine(output, '  b. Return to goals');
        const sourceChoice = await prompt.question('Select [1/2/3/b]: ');

        if (sourceChoice === null) return cancelled(output, 'Input ended');
        const source = normalizeChoice(sourceChoice);
        if (isCancel(source)) return cancelled(output);
        if (isBack(source)) break;
        if (!['1', '2', '3'].includes(source)) {
          writeLine(output, 'Please choose 1, 2, 3, or b to return.');
          continue;
        }

        const sourceKind: InteractiveSourceKind = source === '1' ? 'url' : source === '2' ? 'file' : 'directory';
        while (true) {
          const targetInput = await prompt.question(`${sourcePrompt(sourceKind)} (b to return, c to cancel): `);
          if (targetInput === null) return cancelled(output, 'Input ended');
          const targetValue = normalizeInput(targetInput);
          if (isCancel(targetValue)) return cancelled(output);
          if (isBack(targetValue)) break;
          if (!targetValue) {
            writeLine(output, 'A target is required.');
            continue;
          }

          let target: ScanTarget;
          try {
            target = resolveInteractiveTarget(sourceKind, targetValue, targetResolver);
          } catch (error) {
            writeLine(output, `Error: ${errorMessage(error)}`);
            continue;
          }

          while (true) {
            const outputInput = await prompt.question(`Output HTML file [${DEFAULT_INTERACTIVE_OUTPUT_FILENAME}] (b to return, c to cancel): `);
            if (outputInput === null) return cancelled(output, 'Input ended');
            const outputValue = normalizeInput(outputInput);
            if (isCancel(outputValue)) return cancelled(output);
            if (isBack(outputValue)) break;
            const outputPath = normalizeInteractiveOutputPath(outputValue, cwd);
            if (await outputPathExists(outputPath)) {
              writeLine(output, `Error: ${existingOutputMessage(outputPath)}`);
              continue;
            }

            closePrompt();
            writeLine(output, `\nScanning ${target.path}...`);
            try {
              const report = await runScan(target, { details: true });
              if (!Array.isArray(report.pages) || report.pages.length === 0) {
                throw new Error('The scan returned no pages; no visual report was written.');
              }
              const html = renderReport(report);
              await writeReport(outputPath, html);
              writeLine(output, `Visual report saved to ${outputPath}`);
              writeLine(output, `Scanned ${report.pages.length} page${report.pages.length === 1 ? '' : 's'}.`);
              return { status: 'completed', outputPath, pages: report.pages.length };
            } catch (error) {
              const message = isExistingFileError(error)
                ? existingOutputMessage(outputPath)
                : errorMessage(error);
              writeLine(output, `Error: ${message}`);
              return { status: 'error', error: toError(error, message) };
            }
          }
        }
      }
    }
  } finally {
    closePrompt();
  }
}

export function normalizeInteractiveOutputPath(input: string, cwd = process.cwd()): string {
  const value = input.trim() || DEFAULT_INTERACTIVE_OUTPUT_FILENAME;
  const extension = extname(value).toLowerCase();
  const filename = extension === '.html' || extension === '.htm' ? value : `${value}.html`;
  return resolve(cwd, filename);
}

type InteractiveSourceKind = 'url' | 'file' | 'directory';

function sourcePrompt(kind: InteractiveSourceKind): string {
  switch (kind) {
    case 'url': return 'Website URL';
    case 'file': return 'Local HTML or Markdown path';
    case 'directory': return 'Local directory path';
  }
}

function resolveInteractiveTarget(
  kind: InteractiveSourceKind,
  value: string,
  resolver: (target: string, isDir?: boolean) => ScanTarget,
): ScanTarget {
  if (kind === 'directory') {
    return resolver(value, true);
  }
  if (kind === 'file') {
    if (!LOCAL_FILE_EXTENSIONS.has(extname(value).toLowerCase())) {
      throw new Error('Local files must end in .html, .htm, .md, or .mdx.');
    }
    const target = resolver(value);
    if (target.type !== 'file') throw new Error('The selected local file could not be resolved as a local file.');
    return target;
  }

  const target = resolver(value);
  if (target.type !== 'url') throw new Error('The selected target could not be resolved as a website URL.');
  return target;
}

async function writeInteractiveReport(outputPath: string, html: string): Promise<void> {
  await writeFile(outputPath, html, { encoding: 'utf8', flag: 'wx' });
}

function normalizeInput(value: string): string {
  return value.trim();
}

function normalizeChoice(value: string): string {
  return normalizeInput(value).toLowerCase();
}

function isBack(value: string): boolean {
  return value === 'b' || value === 'back' || value === '返回';
}

function isCancel(value: string): boolean {
  return value === 'c' || value === 'cancel' || value === '取消' || value === 'q' || value === 'quit' || value === 'exit' || value === '離開';
}

function writeLine(output: NodeJS.WritableStream, line: string): void {
  output.write(`${line}\n`);
}

function cancelled(output: NodeJS.WritableStream, label = 'Cancelled'): InteractiveResult {
  writeLine(output, `${label}. No report was created.`);
  return { status: 'cancelled' };
}

/**
 * Check the chosen path before scanning so a collision can be answered with
 * another filename while the prompt is still open. lstat matches what the
 * exclusive write rejects, including a dangling symlink. Any other lstat
 * failure is left to the write, which reports it.
 */
async function outputPathExists(outputPath: string): Promise<boolean> {
  try {
    await lstat(outputPath);
    return true;
  } catch {
    return false;
  }
}

function existingOutputMessage(outputPath: string): string {
  return `Output file already exists: ${outputPath}. Choose a new filename.`;
}

function isExistingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'EEXIST');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown, message = errorMessage(error)): Error {
  return error instanceof Error && error.message === message ? error : new Error(message);
}
