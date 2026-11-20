import type { AdapterField, HealthView } from '../shared/types';
import type { Logger } from '../core/logger';
import type { ConnectionRecord } from '../core/records';
import type { ProcessRunner } from '../core/runner';
import type { SecretStore } from '../core/secrets';

export interface AdapterContext {
  fetchImpl: typeof fetch;
  runner: ProcessRunner;
  secrets: SecretStore;
  clock: () => Date;
  logger: Logger;
}

export interface ConnectionAdapter {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
  fields: AdapterField[];
  secret?: { label: string; help?: string };
  validate?(config: Record<string, string>): void;
  check(record: ConnectionRecord, ctx: AdapterContext): Promise<HealthView>;
  reconnect?(record: ConnectionRecord, ctx: AdapterContext): Promise<HealthView>;
}

export interface RepoInstallRequest {
  locator: string;
  version?: string;
  sandboxDir: string;
}

export interface RepoInstallResult {
  resolvedVersion: string;
  detail: string;
}

export interface RepoSmokeResult {
  ok: boolean;
  message: string;
  log: string;
}

export interface RepoSourceAdapter {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
  locatorLabel: string;
  versionLabel: string;
  versionHelp?: string;
  validate?(locator: string, version?: string): void;
  install(request: RepoInstallRequest, ctx: AdapterContext): Promise<RepoInstallResult>;
  smoke(request: RepoInstallRequest, ctx: AdapterContext): Promise<RepoSmokeResult>;
  uninstall(sandboxDir: string): Promise<void>;
}
