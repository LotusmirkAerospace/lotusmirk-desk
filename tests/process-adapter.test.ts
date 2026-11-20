import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
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
    const portFile = path.join(dir, 'port');
    writeFileSync(binary, listenerScript());
    chmodSync(binary, 0o755);
    const report = await processConnectionAdapter.reconnect?.(
      record({ executable: binary, mode: 'running', arguments: portFile }),
      context(),
    );
    expect(report?.status).toBe('healthy');
    const port = await readPort(portFile, 5_000);
    await waitForListener(port, 5_000);
    const running = spawnSync('pgrep', ['-x', name]);
    expect(running.status).toBe(0);
    spawnSync('pkill', ['-x', name]);
  });
});

function listenerScript(): string {
  return [
    '#!/usr/bin/env node',
    "const http = require('node:http');",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'process.title = path.basename(process.argv[1]).slice(0, 15);',
    'const portFile = process.argv[2];',
    'const server = http.createServer((_req, res) => {',
    '  res.writeHead(200);',
    "  res.end('ok');",
    '});',
    "server.listen(0, '127.0.0.1', () => {",
    '  const address = server.address();',
    "  const port = address && typeof address === 'object' ? address.port : 0;",
    '  const tmp = portFile + ".tmp";',
    '  fs.writeFileSync(tmp, String(port));',
    '  fs.renameSync(tmp, portFile);',
    '});',
    '',
  ].join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPort(portFile: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const port = Number(readFileSync(portFile, 'utf8'));
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // The listener writes the port only after the socket is bound.
    }
    await delay(50);
  }
  throw new Error('listener did not report a port');
}

function onceOk(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet({ hostname: '127.0.0.1', port, path: '/', timeout: 400 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve(res.statusCode === 200 && Buffer.concat(chunks).toString('utf8') === 'ok');
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForListener(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await onceOk(port)) return;
    await delay(50);
  }
  throw new Error(`listener on port ${port} did not respond`);
}

function context() {
  return {
    fetchImpl: fetch,
    runner: createProcessRunner(),
    secrets: new MemorySecretStore(),
    clock: () => new Date(),
    logger: new DeskLogger(path.join(tmpdir(), 'desk-process-test.log'), () => new Date()),
  };
}
