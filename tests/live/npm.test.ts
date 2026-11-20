import { describe, expect, it } from 'vitest';
import { makeDesk } from '../helpers';

const live = process.env.DESK_LIVE === '1';

describe.skipIf(!live)('live npm sandbox', () => {
  it('installs is-odd, smoke-tests it, marks it in use, and uninstalls it', async () => {
    const { desk, cleanup } = await makeDesk();
    try {
      const installed = await desk.handle({
        type: 'addAndInstall',
        sourceId: 'npm',
        locator: 'is-odd',
        version: '3.0.1',
      });
      expect(installed.ok).toBe(true);
      if (!installed.ok) return;
      const repo = installed.snapshot.repos.find((item) => item.locator === 'is-odd');
      expect(repo?.state).toBe('ready');
      expect(repo?.resolvedVersion).toBe('3.0.1');
      expect(repo?.smoke?.ok).toBe(true);
      const used = await desk.handle({ type: 'setInUse', id: repo!.id, inUse: true });
      expect(used.ok).toBe(true);
      if (!used.ok) return;
      expect(used.snapshot.repos.find((item) => item.id === repo?.id)?.inUse).toBe(true);
      const removed = await desk.handle({ type: 'uninstallRepo', id: repo!.id });
      expect(removed.ok).toBe(true);
      if (!removed.ok) return;
      expect(removed.snapshot.repos.find((item) => item.id === repo?.id)?.state).toBe('uninstalled');
    } finally {
      await cleanup();
    }
  }, 120_000);
});
