import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { DeskError } from '../core/errors';
import type { SecretStore } from '../core/secrets';

function readMap(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return Object.fromEntries(entries);
}

function writeMap(filePath: string, data: Record<string, string>): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data), { mode: 0o600 });
}

export function createKeychainStore(filePath: string): SecretStore {
  const available = safeStorage.isEncryptionAvailable();
  return {
    mode: available ? 'os-keychain' : 'unavailable',
    async get(account) {
      if (!available) return null;
      const encoded = readMap(filePath)[account];
      if (!encoded) return null;
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    },
    async set(account, secret) {
      if (!available) {
        throw new DeskError(
          'The OS keychain is not available, so Desk did not save that credential.',
          'no_keychain',
        );
      }
      const data = readMap(filePath);
      data[account] = safeStorage.encryptString(secret).toString('base64');
      writeMap(filePath, data);
    },
    async delete(account) {
      if (!available) return;
      const data = readMap(filePath);
      delete data[account];
      writeMap(filePath, data);
    },
  };
}
