import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebhookPayload } from '../src/core/webhook';
import { makeDesk } from './helpers';

describe('white label, markdown hub, and alerts', () => {
  it('stores a custom name and accent, and rejects a bad colour', async () => {
    const { desk, cleanup } = await makeDesk();
    try {
      const named = await desk.handle({
        type: 'completeOnboarding',
        autostart: false,
        seedSample: false,
        appName: 'Northwind',
        accentColor: '#abcdef',
      });
      expect(named.ok).toBe(true);
      if (!named.ok) return;
      expect(named.snapshot.settings.appName).toBe('Northwind');
      expect(named.snapshot.settings.accentColor).toBe('#abcdef');

      const bad = await desk.handle({ type: 'updateSettings', accentColor: 'blue' });
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.snapshot.settings.accentColor).toBe('#abcdef');
    } finally {
      await cleanup();
    }
  });

  it('copies a logo into the app data folder', async () => {
    const { desk, dataDir, cleanup } = await makeDesk();
    const logo = path.join(dataDir, 'source.png');
    await writeFile(logo, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const saved = await desk.handle({ type: 'updateSettings', logoPath: logo });
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.snapshot.settings.hasLogo).toBe(true);
      expect(desk.logoFilePath()).toBe(path.join(dataDir, 'branding', 'logo.png'));
    } finally {
      await cleanup();
    }
  });

  it('writes assistant instructions for a local folder and a Drive link, without secrets', async () => {
    const fetchImpl: typeof fetch = async () => new Response('ok', { status: 200 });
    const { desk, dataDir, cleanup } = await makeDesk({ fetchImpl });
    const notes = path.join(dataDir, 'notes');
    await mkdir(notes);
    const secret = 'super-secret-token';
    try {
      await desk.handle({
        type: 'addConnection',
        name: 'Private MCP',
        adapterId: 'http',
        config: { url: 'https://example.com/mcp' },
        secret,
      });
      const local = await desk.handle({ type: 'updateSettings', markdownHub: notes, appName: 'Studio' });
      expect(local.ok).toBe(true);
      if (!local.ok) return;
      expect(local.snapshot.settings.markdownHubKind).toBe('local-path');
      const markdown = await readFile(path.join(notes, 'DESK.md'), 'utf8');
      const canonical = await readFile(path.join(dataDir, 'ai', 'desk.json'), 'utf8');
      expect(markdown).toContain('Studio');
      expect(markdown).toContain(notes);
      expect(markdown).not.toContain(secret);
      expect(canonical).not.toContain(secret);
      expect(JSON.parse(canonical).schema).toBe('desk.instructions.v1');

      const drive = await desk.handle({
        type: 'updateSettings',
        markdownHub: 'https://drive.google.com/drive/folders/abc',
      });
      expect(drive.ok).toBe(true);
      if (!drive.ok) return;
      expect(drive.snapshot.settings.markdownHubKind).toBe('google-drive');
    } finally {
      await cleanup();
    }
  });

  it('posts a connector failure and a test alert, and keeps the auth header out of settings.json', async () => {
    const posts: WebhookPayload[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://alerts.example/hook')) {
        posts.push(JSON.parse(String(init?.body)) as WebhookPayload);
        const header = new Headers(init?.headers).get('authorization');
        if (header !== 'Bearer hook-secret') return new Response(null, { status: 401 });
        return new Response(null, { status: 204 });
      }
      return new Response('down', { status: 500 });
    };
    const { desk, dataDir, cleanup } = await makeDesk({ fetchImpl });
    const secret = 'Bearer hook-secret';
    try {
      const saved = await desk.handle({
        type: 'updateSettings',
        webhookUrl: 'https://alerts.example/hook',
        webhookSecret: secret,
      });
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.snapshot.settings.hasWebhookSecret).toBe(true);
      const settingsFile = await readFile(path.join(dataDir, 'settings.json'), 'utf8');
      expect(settingsFile).not.toContain('hook-secret');

      const failed = await desk.handle({
        type: 'addConnection',
        name: 'Broken MCP',
        adapterId: 'http',
        config: { url: 'http://127.0.0.1:9/health' },
      });
      expect(failed.ok).toBe(true);
      expect(posts.some((post) => post.kind === 'connector-failure')).toBe(true);

      const again = await desk.handle({ type: 'checkAll' });
      expect(again.ok).toBe(true);
      expect(posts.filter((post) => post.kind === 'connector-failure')).toHaveLength(1);

      const test = await desk.handle({ type: 'sendTestAlert' });
      expect(test.ok).toBe(true);
      expect(posts.some((post) => post.kind === 'test')).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
