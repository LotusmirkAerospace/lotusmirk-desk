import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { npmRepoAdapter } from '../src/adapters/repo/npm';
import { pipRepoAdapter } from '../src/adapters/repo/pip';
import { DeskLogger } from '../src/core/logger';
import type { ProcessRunner, RunResult } from '../src/core/runner';
import { MemorySecretStore } from '../src/core/secrets';

describe('npm repo adapter', () => {
  it('installs with scripts disabled inside the sandbox and then loads the package', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'desk-npm-'));
    const calls: string[][] = [];
    const runner: ProcessRunner = {
      async run(command, args) {
        calls.push([command, ...args]);
        if (command === 'npm' || command === 'npm.cmd') {
          const prefix = args[args.indexOf('--prefix') + 1];
          await mkdir(path.join(prefix, 'node_modules', 'is-odd'), { recursive: true });
          await writeFile(
            path.join(prefix, 'node_modules', 'is-odd', 'package.json'),
            JSON.stringify({ name: 'is-odd', version: '3.0.1' }),
          );
          return ok('added');
        }
        return ok('loaded is-odd');
      },
      async spawnDetached() {
        return undefined;
      },
    };

    const installed = await npmRepoAdapter.install(
      { locator: 'is-odd', version: '3.0.1', sandboxDir: sandbox },
      context(runner),
    );
    expect(installed.resolvedVersion).toBe('3.0.1');
    expect(calls[0]).toContain('--ignore-scripts');
    expect(calls[0]).toContain(sandbox);
    const smoke = await npmRepoAdapter.smoke({ locator: 'is-odd', version: '3.0.1', sandboxDir: sandbox }, context(runner));
    expect(smoke.ok).toBe(true);
    const manifest = await readFile(path.join(sandbox, 'package.json'), 'utf8');
    expect(manifest).toContain('desk-sandbox');
    await rm(sandbox, { recursive: true, force: true });
  });
});

describe('pip repo adapter', () => {
  it('installs with --target pointed at the sandbox', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'desk-pip-'));
    const calls: string[][] = [];
    const runner: ProcessRunner = {
      async run(command, args) {
        calls.push([command, ...args]);
        if (args.some((arg) => arg.includes('importlib'))) return fail('No module named dateutil');
        return ok('installed');
      },
      async spawnDetached() {
        return undefined;
      },
    };
    await pipRepoAdapter.install(
      { locator: 'python-dateutil:dateutil', version: '2.9.0', sandboxDir: sandbox },
      context(runner),
    );
    expect(calls[0]).toContain('--target');
    expect(calls[0]).toContain(sandbox);
    expect(calls[0]).toContain('python-dateutil==2.9.0');
    const smoke = await pipRepoAdapter.smoke(
      { locator: 'python-dateutil:dateutil', sandboxDir: sandbox },
      context(runner),
    );
    expect(smoke.ok).toBe(false);
    expect(calls[1]).toContain('dateutil');
    await rm(sandbox, { recursive: true, force: true });
  });
});

function ok(stdout: string): RunResult {
  return { code: 0, stdout, stderr: '', timedOut: false };
}

function fail(stderr: string): RunResult {
  return { code: 1, stdout: '', stderr, timedOut: false };
}

function context(runner: ProcessRunner) {
  return {
    fetchImpl: fetch,
    runner,
    secrets: new MemorySecretStore(),
    clock: () => new Date(),
    logger: new DeskLogger(path.join(tmpdir(), 'desk-repo-test.log'), () => new Date()),
  };
}
