import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { AiScorerResult, AiSource, DimensionScores } from './types.js';
import { buildScoringPrompt, parseAiResponse } from './ai-prompt.js';

const execAsync = promisify(exec);

const TIMEOUT_MS = 60_000;

export interface AvailableCLIs {
  gemini: boolean;
  copilot: boolean;
}

export async function detectAvailableCLIs(): Promise<AvailableCLIs> {
  const [gemini, copilot] = await Promise.all([
    commandExists('gemini'),
    commandExists('copilot'),
  ]);
  return { gemini, copilot };
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${cmd}`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function scoreWithExternalCLI(
  source: AiSource,
  html: string,
  url: string,
): Promise<AiScorerResult> {
  const prompt = buildScoringPrompt(html, url);

  const unavailable: AiScorerResult = {
    source,
    score: 0,
    dimensions: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
    insight: 'CLI not available',
    available: false,
  };

  try {
    let raw: string;

    if (source === 'gemini') {
      raw = await runGemini(prompt);
    } else if (source === 'copilot') {
      raw = await runCopilot(prompt);
    } else {
      return unavailable;
    }

    const parsed = parseAiResponse(raw);
    if (!parsed) {
      return { ...unavailable, available: true, insight: 'Failed to parse AI response' };
    }

    const dimensions: DimensionScores = {
      structure: parsed.structure,
      citability: parsed.citability,
      schema: parsed.schema,
      aiMetadata: parsed.aiMetadata,
      contentDensity: parsed.contentDensity,
      total: parsed.score,
    };

    return {
      source,
      score: parsed.score,
      dimensions,
      insight: parsed.insight,
      available: true,
    };
  } catch {
    return { ...unavailable, insight: `${source} CLI timed out or errored` };
  }
}

function runWithStdin(cmd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 200)}`));
    });
    child.on('error', reject);
    // The child may exit before draining a large prompt; the close handler still
    // decides the outcome, so a stdin EPIPE is not itself a failure.
    child.stdin.on('error', () => {});
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function runGemini(prompt: string): Promise<string> {
  return runWithStdin('gemini', prompt);
}

async function runCopilot(prompt: string): Promise<string> {
  return runWithStdin('copilot', prompt);
}

export async function scoreWithAllAvailable(
  html: string,
  url: string,
  available: AvailableCLIs,
): Promise<AiScorerResult[]> {
  const tasks: { source: AiSource; promise: Promise<AiScorerResult> }[] = [];

  if (available.gemini) {
    tasks.push({ source: 'gemini', promise: scoreWithExternalCLI('gemini', html, url) });
  }
  if (available.copilot) {
    tasks.push({ source: 'copilot', promise: scoreWithExternalCLI('copilot', html, url) });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.promise));

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      source: tasks[i].source,
      score: 0,
      dimensions: { structure: 0, citability: 0, schema: 0, aiMetadata: 0, contentDensity: 0, total: 0 },
      insight: 'Scorer failed unexpectedly',
      available: false,
    };
  });
}
