import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RepoSourceAdapter } from '../src/adapters/types';
import { DeskError } from '../src/core/errors';
import { MemorySecretStore } from '../src/core/secrets';
import { makeDesk } from './helpers';

describe('desk registry', () => {
  it('keeps a working version when a newer smoke test fails, then rolls back', async () => {
    const { desk, cleanup } = await makeDesk({ repoAdapters: [fakeNpm()], connectionAdapters: [] });
    try {
      const first = await desk.handle({ type: 'addAndInstall', sourceId: 'npm', locator: 'left-pad', version: '1.0.0' });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.snapshot.repos[0]?.state).toBe('ready');

      const upgrade = await desk.handle({ type: 'addAndInstall', sourceId: 'npm', locator: 'left-pad', version: '2.0.0' });
      expect(upgrade.ok).toBe(true);
      if (!upgrade.ok) return;
      expect(upgrade.snapshot.repos[0]?.resolvedVersion).toBe('2.0.0');
      expect(upgrade.snapshot.repos[0]?.canRollback).toBe(true);

      const broken = await desk.handle({ type: 'addAndInstall', sourceId: 'npm', locator: 'left-pad', version: '0.0.1' });
      expect(broken.ok).toBe(true);
      if (!broken.ok) return;
      expect(broken.snapshot.repos[0]?.state).toBe('ready');
      expect(broken.snapshot.repos[0]?.resolvedVersion).toBe('2.0.0');
      expect(broken.snapshot.repos[0]?.error).toContain('boom');

      const rolled = await desk.handle({ type: 'rollbackRepo', id: broken.snapshot.repos[0]!.id });
      expect(rolled.ok).toBe(true);
      if (!rolled.ok) return;
      expect(rolled.snapshot.repos[0]?.resolvedVersion).toBe('1.0.0');
      expect(rolled.snapshot.repos[0]?.state).toBe('ready');
    } finally {
      await cleanup();
    }
  });

  it('records a failed first smoke test and refuses to mark it in use', async () => {
    const { desk, cleanup } = await makeDesk({ repoAdapters: [fakeNpm()], connectionAdapters: [] });
    try {
      const result = await desk.handle({ type: 'addAndInstall', sourceId: 'npm', locator: 'left-pad', version: '0.0.1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const repo = result.snapshot.repos[0];
      expect(repo?.state).toBe('smoke-failed');
      const marked = await desk.handle({ type: 'setInUse', id: repo!.id, inUse: true });
      expect(marked.ok).toBe(false);
      if (marked.ok) return;
      expect(marked.error).toMatch(/smoke test/);
    } finally {
      await cleanup();
    }
  });

  it('uninstalls the sandbox and keeps the registry row', async () => {
    const { desk, cleanup } = await makeDesk({ repoAdapters: [fakeNpm()], connectionAdapters: [] });
    try {
      const installed = await desk.handle({ type: 'addAndInstall', sourceId: 'npm', locator: 'left-pad', version: '1.0.0' });
      if (!installed.ok) throw new Error(installed.error);
      const id = installed.snapshot.repos[0]!.id;
      await desk.handle({ type: 'setInUse', id, inUse: true });
      const removed = await desk.handle({ type: 'uninstallRepo', id });
      expect(removed.ok).toBe(true);
      if (!removed.ok) return;
      expect(removed.snapshot.repos[0]?.state).toBe('uninstalled');
      expect(removed.snapshot.repos[0]?.inUse).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('does not write credentials into the connection file', async () => {
    const secret = 'Bearer desk-secret-value';
    let seen: string | undefined;
    const server = createServer((req, res) => {
      seen = req.headers.authorization;
      res.statusCode = seen === secret ? 200 : 401;
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const { desk, dataDir, cleanup } = await makeDesk();
    try {
      const added = await desk.handle({
        type: 'addConnection',
        name: 'Private endpoint',
        adapterId: 'http',
        config: { url: `http://127.0.0.1:${port}/` },
        secret,
      });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      expect(added.snapshot.connections[0]?.hasSecret).toBe(true);
      expect(added.snapshot.connections[0]?.lastReport?.status).toBe('healthy');
      expect(seen).toBe(secret);
      const stored = await readFile(path.join(dataDir, 'connections.json'), 'utf8');
      expect(stored).not.toContain(secret);
    } finally {
      server.close();
      await cleanup();
    }
  });

  it('refuses to store a secret when the keychain is unavailable', async () => {
    const { desk, dataDir, cleanup } = await makeDesk({ secrets: new MemorySecretStore('unavailable') });
    try {
      const added = await desk.handle({
        type: 'addConnection',
        name: 'Private endpoint',
        adapterId: 'http',
        config: { url: 'https://example.com' },
        secret: 'super-secret',
      });
      expect(added.ok).toBe(false);
      if (added.ok) return;
      expect(added.error).toMatch(/keychain/i);
      expect(added.snapshot.connections).toHaveLength(0);
      await expect(readFile(path.join(dataDir, 'connections.json'), 'utf8')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('imports an inbox file and installs it when auto-install is on', async () => {
    const { desk, dataDir, cleanup } = await makeDesk({ repoAdapters: [fakeNpm()], connectionAdapters: [] });
    try {
      await mkdir(path.join(dataDir, 'inbox'), { recursive: true });
      await writeFile(
        path.join(dataDir, 'inbox', 'one.json'),
        JSON.stringify({ sourceId: 'npm', locator: 'left-pad', version: '1.0.0' }),
      );
      const imported = await desk.handle({ type: 'importInbox' });
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      expect(imported.snapshot.repos[0]?.state).toBe('ready');
      await expect(readFile(path.join(dataDir, 'inbox', 'one.json'), 'utf8')).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });

  it('seeds sample connections during onboarding without calling the network', async () => {
    const fetchImpl: typeof fetch = async () => new Response('example', { status: 200 });
    const autostart = { enabled: false, supported: true, async get() { return this.enabled; }, async set(enabled: boolean) { this.enabled = enabled; } };
    const { desk, cleanup } = await makeDesk({ fetchImpl, autostart });
    try {
      const done = await desk.handle({ type: 'completeOnboarding', autostart: true, seedSample: true });
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      expect(done.snapshot.settings.onboardingComplete).toBe(true);
      expect(done.snapshot.settings.autostart).toBe(true);
      expect(done.snapshot.connections.map((item) => item.name)).toEqual([
        'Sample: Node on PATH',
        'Sample: example.com',
      ]);
      expect(done.snapshot.connections[0]?.lastReport?.status).toBe('healthy');
      expect(done.snapshot.connections[1]?.lastReport?.status).toBe('healthy');
    } finally {
      await cleanup();
    }
  });

  it('tells the user git installs are not available yet', async () => {
    const { desk, cleanup } = await makeDesk();
    try {
      const result = await desk.handle({ type: 'addAndInstall', sourceId: 'git', locator: 'https://example.com/repo.git' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/not available/i);
    } finally {
      await cleanup();
    }
  });

  it('rejects an unknown command', async () => {
    const { desk, cleanup } = await makeDesk();
    try {
      const result = await desk.handle({ type: 'explode' });
      expect(result.ok).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('repairs an interrupted upgrade back to the last working version', async () => {
    const { desk, dataDir, cleanup } = await makeDesk({ repoAdapters: [fakeNpm()], connectionAdapters: [] });
    try {
      await writeFile(
        path.join(dataDir, 'repos.json'),
        JSON.stringify([
          {
            id: 'pkg-1',
            sourceId: 'npm',
            locator: 'left-pad',
            requestedVersion: '2.0.0',
            resolvedVersion: '1.0.0',
            state: 'installing',
            inUse: true,
            sandboxDir: '/tmp/desk-old',
            history: [{ version: '1.0.0', state: 'ready', at: '2026-01-01T00:00:00.000Z' }],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      );
      const reloaded = (await makeDesk({ dataDir, repoAdapters: [fakeNpm()], connectionAdapters: [] })).desk;
      const snapshot = reloaded.snapshot();
      expect(snapshot.repos[0]?.state).toBe('ready');
      expect(snapshot.repos[0]?.error).toMatch(/interrupted/);
      expect(desk.snapshot().repos).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});

function fakeNpm(): RepoSourceAdapter {
  return {
    id: 'npm',
    label: 'npm package',
    description: 'Fake npm adapter for registry tests.',
    implemented: true,
    locatorLabel: 'Package name',
    versionLabel: 'Version',
    async install(request) {
      if (request.version === '9.9.9') throw new DeskError('no such version', 'install_failed');
      return { resolvedVersion: request.version ?? '1.0.0', detail: 'installed' };
    },
    async smoke(request) {
      if (request.version === '0.0.1') return { ok: false, message: 'boom', log: 'boom' };
      return { ok: true, message: 'loaded', log: 'loaded' };
    },
    async uninstall() {
      return undefined;
    },
  };
}
