import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { httpConnectionAdapter } from '../src/adapters/connection/http';
import { DeskLogger } from '../src/core/logger';
import { createProcessRunner } from '../src/core/runner';
import { MemorySecretStore, secretAccount } from '../src/core/secrets';
import type { ConnectionRecord } from '../src/core/records';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function listen(status: number, onRequest?: (authorization?: string) => void): Promise<string> {
  const server = createServer((req, res) => {
    onRequest?.(req.headers.authorization);
    res.statusCode = status;
    res.end('ok');
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}/health`);
    });
  });
}

function record(url: string, hasSecret = false): ConnectionRecord {
  return {
    id: 'conn-http',
    name: 'HTTP',
    adapterId: 'http',
    config: { url },
    hasSecret,
    enabled: true,
    createdAt: new Date(0).toISOString(),
  };
}

describe('http connection adapter', () => {
  it('treats a 2xx response as healthy', async () => {
    const url = await listen(204);
    const report = await httpConnectionAdapter.check(record(url), context());
    expect(report.status).toBe('healthy');
    expect(report.message).toContain('204');
  });

  it('treats a 500 response as unreachable', async () => {
    const url = await listen(500);
    const report = await httpConnectionAdapter.check(record(url), context());
    expect(report.status).toBe('unreachable');
  });

  it('sends a keychain credential as Authorization', async () => {
    let seen: string | undefined;
    const url = await listen(200, (authorization) => {
      seen = authorization;
    });
    const secrets = new MemorySecretStore();
    await secrets.set(secretAccount('conn-http'), 'Bearer desk-test');
    const report = await httpConnectionAdapter.check(record(url, true), context(secrets));
    expect(report.status).toBe('healthy');
    expect(seen).toBe('Bearer desk-test');
  });

  it('reports a closed port as unreachable', async () => {
    const report = await httpConnectionAdapter.check(record('http://127.0.0.1:9/'), context());
    expect(report.status).toBe('unreachable');
  });
});

function context(secrets = new MemorySecretStore()) {
  return {
    fetchImpl: fetch,
    runner: createProcessRunner(),
    secrets,
    clock: () => new Date(),
    logger: new DeskLogger('/tmp/desk-http-test.log', () => new Date()),
  };
}
