import type { SecretsMode } from '../shared/types';
import { DeskError } from './errors';

export interface SecretStore {
  readonly mode: SecretsMode;
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<void>;
}

export function secretAccount(connectionId: string): string {
  return `connection:${connectionId}`;
}

export function webhookAccount(): string {
  return 'webhook:authorization';
}

export class MemorySecretStore implements SecretStore {
  readonly mode: SecretsMode;
  private readonly values = new Map<string, string>();

  constructor(mode: SecretsMode = 'os-keychain') {
    this.mode = mode;
  }

  async get(account: string): Promise<string | null> {
    return this.values.get(account) ?? null;
  }

  async set(account: string, secret: string): Promise<void> {
    if (this.mode !== 'os-keychain') {
      throw new DeskError(
        'The OS keychain is not available, so Desk did not save that credential.',
        'no_keychain',
      );
    }
    this.values.set(account, secret);
  }

  async delete(account: string): Promise<void> {
    this.values.delete(account);
  }
}

export function unavailableSecretStore(): SecretStore {
  return new MemorySecretStore('unavailable');
}
