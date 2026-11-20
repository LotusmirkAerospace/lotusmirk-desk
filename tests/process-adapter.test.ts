import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { processConnectionAdapter } from '../src/adapters/connection/process';
import { DeskLogger } from '../src/core/logger';
import type { ConnectionRecord } from '../src/core/records';
import { createProcessRunner } from '../src/core/runner';
import { MemorySecretStore } from '../src/core/secrets';

const NAMES: string[] = [];

afterEach(() => {
  for (const name of NAMES.splice(0)) spawnSync('pkill', ['-x', name]);
});

function record(config: Record<string, string>): ConnectionRecord {
  return {
    id: 'conn-proc',
    name: 'Process',
    adapterId: 'process',
    config,
    hasSecret: false,
    enabled: true,
    createdAt: new Date(0).toISOString(),
  };
}

describe('process connection adapter', () => {
  it('finds node on PATH', async () => {
    const report = await processConnectionAdapter.check(
      record({ executable: 'node', mode: 'on-path', arguments: '' }),
      context(),
    );
    expect(report.status).toBe('healthy');
  });

  it('reports a missing program', async () => {
    const report = await processConnectionAdapter.check(
      record({ executable: 'desk-missing-bin-zz', mode: 'on-path', arguments: '' }),
      context(),
    );
    expect(report.status).toBe('unreachable');
  });

  it('starts a stopped program on reconnect', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'desk-proc-'));
    const name = 'deskproctest';
    NAMES.push(name);
    const binary = path.join(dir, name);
    copyFileSync('/bin/sleep', binary);
    chmodSync(binary, 0o755);
    const report = await processConnectionAdapter.reconnect?.(
      record({ executable: binary, mode: 'running', arguments: '30' }),
      context(),
    );
    expect(report?.status).toBe('healthy');
    const running = spawnSync('pgrep', ['-x', name]);
    expect(running.status).toBe(0);
    execFileSync('pkill', ['-x', name]);
  });
});

function context() {
  return {
    fetchImpl: fetch,
    runner: createProcessRunner(),
    secrets: new MemorySecretStore(),
    clock: () => new Date(),
    logger: new DeskLogger(path.join(tmpdir(), 'desk-process-test.log'), () => new Date()),
  };
}
