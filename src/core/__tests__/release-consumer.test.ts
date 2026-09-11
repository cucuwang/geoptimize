import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../..');
const helper = join(repositoryRoot, 'scripts/prepare-release-consumer.mjs');
const sourceLockPath = join(repositoryRoot, 'package-lock.json');
const packageManifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as Record<string, any>;
const packageVersion = packageManifest.version as string;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolveResult({ code, stdout, stderr }));
  });
}

async function makeTarball(testRoot: string, manifest = packageManifest): Promise<string> {
  const packageRoot = join(testRoot, 'package');
  await mkdir(packageRoot);
  await writeFile(join(packageRoot, 'package.json'), `${JSON.stringify(manifest)}\n`, 'utf8');
  if (manifest.bin) {
    await writeFile(
      join(packageRoot, 'cli.js'),
      `#!/usr/bin/env node\nprocess.stdout.write(process.argv.includes('--version') ? '${packageVersion}\\n' : 'fixture\\n');\n`,
      { encoding: 'utf8', mode: 0o755 },
    );
  }
  const tarballPath = join(testRoot, `geoptimize-${packageVersion}.tgz`);
  const result = spawnSync('tar', ['-czf', tarballPath, 'package'], {
    cwd: testRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Could not create tarball fixture: ${result.stderr}`);
  return tarballPath;
}

async function makeFixtureLock(testRoot: string, manifest: Record<string, any>): Promise<string> {
  const lockPath = join(testRoot, 'package-lock.json');
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
        dependencies: manifest.dependencies,
        bin: manifest.bin,
      },
    },
  };
  await writeFile(lockPath, `${JSON.stringify(lock)}\n`, 'utf8');
  return lockPath;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha512(path: string): string {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
}

function productionEntry(lock: Record<string, any>): string {
  const entry = Object.keys(lock.packages).find((location) => location.startsWith('node_modules/') && lock.packages[location].dev !== true);
  if (!entry) throw new Error('Canonical lock has no production package entry');
  return entry;
}

describe('release consumer preparation', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = realpathSync(await mkdtemp(join(tmpdir(), 'geoptimize-release-consumer-test-')));
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('prepares a v3 lock that npm ci installs from a packed tarball', async () => {
    const fixtureManifest = {
      name: 'geoptimize',
      version: packageVersion,
      license: 'MIT',
      bin: { geoptimize: 'cli.js', geo: 'cli.js', 'geo-cli': 'cli.js' },
      dependencies: {},
    };
    const tarballPath = await makeTarball(testRoot, fixtureManifest);
    const fixtureLockPath = await makeFixtureLock(testRoot, fixtureManifest);
    const consumerPath = join(testRoot, 'consumer');
    const expectedHash = sha256(tarballPath);
    const prepareResult = await run(
      process.execPath,
      [helper, tarballPath, consumerPath, fixtureLockPath, expectedHash],
      testRoot,
    );
    expect(prepareResult.code, prepareResult.stderr).toBe(0);

    const consumerPackage = JSON.parse(await readFile(join(consumerPath, 'package.json'), 'utf8')) as Record<string, any>;
    const consumerLock = JSON.parse(await readFile(join(consumerPath, 'package-lock.json'), 'utf8')) as Record<string, any>;
    expect(consumerLock.lockfileVersion).toBe(3);
    expect(consumerPackage.dependencies.geoptimize).toBe(`file:${tarballPath}`);
    expect(consumerLock.packages[''].dependencies.geoptimize).toBe(`file:${tarballPath}`);
    expect(consumerLock.packages['node_modules/geoptimize'].integrity).toBe(`sha512-${sha512(tarballPath)}`);
    for (const [location, entry] of Object.entries(consumerLock.packages)) {
      if (location === '') continue;
      expect(entry).not.toHaveProperty('dev');
      expect(entry).toHaveProperty('integrity');
      expect(entry).toHaveProperty('resolved');
    }
    const installResult = await run(
      'npm',
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(testRoot, 'npm-cache'), '--prefix', consumerPath],
      testRoot,
    );
    expect(installResult.code, installResult.stderr).toBe(0);
    for (const binary of ['geoptimize', 'geo', 'geo-cli']) {
      const versionResult = spawnSync(join(consumerPath, 'node_modules/.bin', binary), ['--version'], { encoding: 'utf8' });
      expect(versionResult.status, versionResult.stderr).toBe(0);
      expect(versionResult.stdout.trim()).toBe(packageVersion);
    }
  });

  it('rejects a mismatched SHA-256 before creating consumer metadata', async () => {
    const tarballPath = join(testRoot, 'candidate.tgz');
    await writeFile(tarballPath, 'not a tarball', 'utf8');
    const consumerPath = join(testRoot, 'consumer');
    const result = await run(
      process.execPath,
      [helper, tarballPath, consumerPath, sourceLockPath, '0'.repeat(64)],
      repositoryRoot,
    );

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('SHA-256');
    expect(existsSync(consumerPath)).toBe(false);
  });

  it('rejects packed dependency drift against the canonical lock root', async () => {
    const driftedManifest = JSON.parse(JSON.stringify(packageManifest)) as Record<string, any>;
    driftedManifest.dependencies.chalk = '^5.2.0';
    const tarballPath = await makeTarball(testRoot, driftedManifest);
    const consumerPath = join(testRoot, 'consumer');
    const result = await run(
      process.execPath,
      [helper, tarballPath, consumerPath, sourceLockPath, sha256(tarballPath)],
      repositoryRoot,
    );

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('dependency contract');
    expect(existsSync(consumerPath)).toBe(false);
  });

  it('rejects a canonical production lock entry without integrity', async () => {
    const lock = JSON.parse(await readFile(sourceLockPath, 'utf8')) as Record<string, any>;
    delete lock.packages[productionEntry(lock)].integrity;
    const invalidLockPath = join(testRoot, 'package-lock.json');
    await writeFile(invalidLockPath, `${JSON.stringify(lock)}\n`, 'utf8');
    const tarballPath = await makeTarball(testRoot);
    const consumerPath = join(testRoot, 'consumer');
    const result = await run(
      process.execPath,
      [helper, tarballPath, consumerPath, invalidLockPath, sha256(tarballPath)],
      repositoryRoot,
    );

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('integrity');
    expect(existsSync(consumerPath)).toBe(false);
  });
});
