import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDesk, type DeskOptions } from '../src/core/desk';
import { MemorySecretStore } from '../src/core/secrets';

export async function makeDesk(options: Partial<DeskOptions> = {}) {
  const owned = options.dataDir === undefined;
  const dataDir = options.dataDir ?? (await mkdtemp(path.join(tmpdir(), 'desk-')));
  const secrets = options.secrets ?? new MemorySecretStore();
  const desk = createDesk({ ...options, dataDir, secrets });
  return {
    desk,
    dataDir,
    secrets,
    async cleanup() {
      if (owned) await rm(dataDir, { recursive: true, force: true });
    },
  };
}
