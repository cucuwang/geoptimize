import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

// Evaluate the install command's actual template without importing the CLI entry
// point (which parses process.argv) or depending on a pre-existing dist build.
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const template = source.match(/const hookScript = (`[\s\S]*?`);/)?.[1];
if (!template) throw new Error('hook install template not found');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(minScore = 90, mode = '') {
  const root = mkdtempSync(join(tmpdir(), 'geoptimize-hook-test-'));
  roots.push(root);
  const temp = join(root, 'temp files');
  const bin = join(root, 'bin');
  mkdirSync(temp);
  mkdirSync(bin);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: temp, HOOK_TEST_MODE: mode };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    return result;
  };
  git('init', '-q');
  const script = runInNewContext(template, {
    minScore,
    HOOK_BEGIN_MARKER: '# BEGIN geoptimize',
    HOOK_END_MARKER: '# END geoptimize',
  }) as string;
  const hook = join(root, '.git', 'hooks', 'pre-commit');
  writeFileSync(hook, `#!/bin/sh\n${script}`, { mode: 0o755 });
  writeFileSync(join(bin, 'npx'), `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const [command, action, file, flag] = process.argv.slice(2);
if (command !== 'geoptimize' || action !== 'scan' || flag !== '--json' || !/\\.(html?|mdx?)$/.test(file)) {
  console.error('temporary filename lost its extension'); process.exit(1);
}
const mode = process.env.HOOK_TEST_MODE;
if (mode === 'failure') {
  console.error('scanner unavailable'); console.error('second stderr line');
  console.log(JSON.stringify({ overall: { total: 100 } })); process.exit(7);
}
if (mode === 'malformed') { console.log('not json'); process.exit(0); }
if (mode === 'missing') { console.log('{}'); process.exit(0); }
if (mode === 'string') { console.log(JSON.stringify({overall:{total:'82'}})); process.exit(0); }
if (mode === 'fraction') { console.log(JSON.stringify({overall:{total:82.5}})); process.exit(0); }
if (mode === 'range') { console.log(JSON.stringify({overall:{total:101}})); process.exit(0); }
// Both the original basename and staged content must reach the scanner.
const expected = { 'guide.html': 82, 'index.html': 90, 'read me.md': 45, 'notes.mdx': 70, 'page.htm': 75 };
const score = Number(fs.readFileSync(file, 'utf8'));
if (expected[path.basename(file)] !== score) { console.error('wrong basename or staged content'); process.exit(1); }
console.log(JSON.stringify({ overall: { total: score } }));
`, { mode: 0o755 });
  const stage = (file: string, content: string) => {
    writeFileSync(join(root, file), content);
    git('add', '--', file);
  };
  const run = () => spawnSync('/bin/sh', [hook], { cwd: root, env, encoding: 'utf8' });
  return { root, temp, stage, run };
}

describe('installed pre-commit hook script', () => {
  it('blocks low staged HTML scores, preserves basenames, and reports passing files', () => {
    const f = fixture();
    f.stage('guide.html', '82');
    f.stage('index.html', '90');
    writeFileSync(join(f.root, 'guide.html'), '100');
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('FAIL: guide.html scored 82/100 (minimum: 90)');
    expect(result.stdout).toContain('PASS: index.html scored 90/100');
    expect(result.stdout).toContain('git commit --no-verify');
    expect(result.stdout).not.toContain('WARN');
    expect(readdirSync(f.temp)).toEqual([]);
  });

  it('allows scores above a lower threshold', () => {
    const f = fixture(60);
    f.stage('guide.html', '82');
    f.stage('index.html', '90');
    expect(f.run().status).toBe(0);
  });

  it('scores Markdown with spaces in its original basename and supports htm/mdx', () => {
    const f = fixture(60);
    f.stage('read me.md', '45');
    f.stage('notes.mdx', '70');
    f.stage('page.htm', '75');
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('FAIL: read me.md scored 45/100 (minimum: 60)');
    expect(result.stdout).toContain('PASS: notes.mdx scored 70/100');
    expect(result.stdout).toContain('PASS: page.htm scored 75/100');
    expect(readdirSync(f.temp)).toEqual([]);
  });

  it('warns on scan failure with its first stderr line and allows the commit', () => {
    const f = fixture(90, 'failure');
    f.stage('guide.html', '82');
    const result = f.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WARN: Could not score guide.html (scan exited 7: scanner unavailable)');
    expect(result.stdout).not.toContain('second stderr line');
    expect(result.stdout).not.toContain('PASS:');
    expect(readdirSync(f.temp)).toEqual([]);
  });

  it.each(['malformed', 'missing', 'string', 'fraction', 'range'])('warns on %s scores instead of silently skipping', (mode) => {
    const f = fixture(90, mode);
    f.stage('guide.html', '82');
    const result = f.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WARN: Could not score guide.html (invalid or missing score)');
    expect(result.stderr).toBe('');
    expect(readdirSync(f.temp)).toEqual([]);
  });

  it('skips unrelated staged files', () => {
    const f = fixture();
    f.stage('other.txt', '82');
    const result = f.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(readdirSync(f.temp)).toEqual([]);
  });
});
