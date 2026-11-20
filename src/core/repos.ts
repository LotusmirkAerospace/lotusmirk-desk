import { rm } from 'node:fs/promises';
import path from 'node:path';
import { AdapterRegistry } from '../adapters/registry';
import type { AdapterContext, RepoSourceAdapter } from '../adapters/types';
import type { AdapterSummary, RepoView } from '../shared/types';
import { AlertList } from './alerts';
import { DeskError } from './errors';
import type { Logger } from './logger';
import type { RepoRecord } from './records';
import { cleanVersion } from './validate';

export class RepoService {
  private readonly adapters: AdapterRegistry<RepoSourceAdapter>;
  private readonly busy = new Set<string>();

  constructor(
    private readonly records: RepoRecord[],
    adapters: RepoSourceAdapter[],
    private readonly context: AdapterContext,
    private readonly alerts: AlertList,
    private readonly logger: Logger,
    private readonly clock: () => Date,
    private readonly createId: () => string,
    private readonly persist: () => void,
    private readonly sandboxesDir: string,
  ) {
    this.adapters = new AdapterRegistry(adapters);
  }

  list(): RepoView[] {
    return this.records.map((record) => this.toView(record));
  }

  summaries(): AdapterSummary[] {
    return this.adapters.list().map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      description: adapter.description,
      implemented: adapter.implemented,
      fields: [],
      locatorLabel: adapter.locatorLabel,
      versionLabel: adapter.versionLabel,
      versionHelp: adapter.versionHelp,
    }));
  }

  addCandidate(sourceId: string, locator: string, version?: string): string {
    const adapter = this.requireAdapter(sourceId);
    const cleanLocator = locator.trim();
    const clean = cleanVersion(version);
    adapter.validate?.(cleanLocator, clean);
    const existing = this.findOpen(adapter.id, cleanLocator);
    if (existing) return existing.id;
    const now = this.clock().toISOString();
    const record: RepoRecord = {
      id: this.createId(),
      sourceId: adapter.id,
      locator: cleanLocator,
      requestedVersion: clean,
      state: 'candidate',
      inUse: false,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    this.persist();
    return record.id;
  }

  async addAndInstall(sourceId: string, locator: string, version?: string): Promise<void> {
    const adapter = this.requireAdapter(sourceId);
    const cleanLocator = locator.trim();
    const clean = cleanVersion(version);
    adapter.validate?.(cleanLocator, clean);
    const existing = this.findOpen(adapter.id, cleanLocator);
    if (
      existing &&
      existing.state === 'ready' &&
      (!clean || clean === existing.resolvedVersion || clean === existing.requestedVersion)
    ) {
      this.alerts.raise({
        level: 'info',
        message: `${cleanLocator} is already installed and passed its smoke test.`,
        source: existing.id,
      });
      return;
    }
    if (existing) {
      existing.requestedVersion = clean;
      await this.installAndTest(existing.id);
      return;
    }
    const id = this.addCandidate(sourceId, cleanLocator, clean);
    await this.installAndTest(id);
  }

  async installAndTest(id: string): Promise<void> {
    const entry = this.must(id);
    if (this.busy.has(id)) throw new DeskError('That package is already being installed.', 'busy');
    const adapter = this.requireAdapter(entry.sourceId);
    this.busy.add(id);
    const previous = {
      state: entry.state,
      sandboxDir: entry.sandboxDir,
      resolvedVersion: entry.resolvedVersion,
    };
    try {
      entry.state = 'installing';
      entry.error = undefined;
      entry.updatedAt = this.clock().toISOString();
      this.persist();
      const version = entry.requestedVersion;
      const sandboxDir = this.sandboxFor(entry.id, version ?? 'latest');
      const request = { locator: entry.locator, version, sandboxDir };
      let installed;
      try {
        installed = await adapter.install(request, this.context);
      } catch (error) {
        this.failInstall(entry, previous, error instanceof Error ? error.message : 'Install failed.');
        return;
      }
      const smoke = await adapter.smoke({ ...request, version: installed.resolvedVersion }, this.context);
      const at = this.clock().toISOString();
      entry.history.push({
        version: installed.resolvedVersion,
        state: smoke.ok ? 'ready' : 'smoke-failed',
        at,
      });
      entry.history = entry.history.slice(-20);
      entry.smoke = { ...smoke, at };
      entry.updatedAt = at;
      if (!smoke.ok) {
        if (previous.state === 'ready' && previous.sandboxDir) {
          entry.state = 'ready';
          entry.sandboxDir = previous.sandboxDir;
          entry.resolvedVersion = previous.resolvedVersion;
          entry.error = smoke.message;
          this.persist();
          this.alerts.raise({
            level: 'error',
            message: `${entry.locator} failed its smoke test. Desk kept the last working copy. ${smoke.message}`,
            source: entry.id,
          });
          return;
        }
        entry.state = 'smoke-failed';
        entry.sandboxDir = sandboxDir;
        entry.resolvedVersion = installed.resolvedVersion;
        entry.inUse = false;
        entry.error = smoke.message;
        this.persist();
        this.alerts.raise({
          level: 'error',
          message: `${entry.locator} installed but failed its smoke test. ${smoke.message}`,
          source: entry.id,
        });
        this.logger.error(`${entry.locator} smoke test failed.`);
        return;
      }
      entry.state = 'ready';
      entry.sandboxDir = sandboxDir;
      entry.resolvedVersion = installed.resolvedVersion;
      entry.requestedVersion = version ?? installed.resolvedVersion;
      entry.error = undefined;
      this.persist();
      this.logger.info(`Smoke test passed for ${entry.locator}@${installed.resolvedVersion}.`);
    } finally {
      this.busy.delete(id);
    }
  }

  setInUse(id: string, inUse: boolean): void {
    const entry = this.must(id);
    if (inUse && entry.state !== 'ready') {
      throw new DeskError('Only a package that passed its smoke test can be marked in use.', 'not_ready');
    }
    entry.inUse = inUse;
    entry.updatedAt = this.clock().toISOString();
    this.persist();
    this.logger.info(inUse ? `Marked ${entry.locator} in use.` : `Marked ${entry.locator} not in use.`);
  }

  async uninstall(id: string): Promise<void> {
    const entry = this.must(id);
    const parent = path.join(this.sandboxesDir, entry.id);
    await rm(parent, { recursive: true, force: true });
    entry.sandboxDir = undefined;
    entry.inUse = false;
    entry.state = 'uninstalled';
    entry.updatedAt = this.clock().toISOString();
    entry.error = undefined;
    this.persist();
    this.logger.info(`Uninstalled ${entry.locator}.`);
  }

  async rollback(id: string): Promise<void> {
    const entry = this.must(id);
    const prior = [...entry.history]
      .reverse()
      .find((item) => item.state === 'ready' && item.version !== entry.resolvedVersion);
    if (!prior) {
      throw new DeskError('There is no earlier working version to roll back to.', 'no_rollback');
    }
    entry.requestedVersion = prior.version;
    this.logger.info(`Rolling ${entry.locator} back to ${prior.version}.`);
    await this.installAndTest(entry.id);
  }

  private failInstall(
    entry: RepoRecord,
    previous: { state: RepoRecord['state']; sandboxDir?: string; resolvedVersion?: string },
    message: string,
  ): void {
    if (previous.state === 'ready' && previous.sandboxDir) {
      entry.state = 'ready';
      entry.sandboxDir = previous.sandboxDir;
      entry.resolvedVersion = previous.resolvedVersion;
    } else {
      entry.state = entry.history.some((item) => item.state === 'ready') ? 'smoke-failed' : 'candidate';
      if (entry.state === 'candidate') entry.resolvedVersion = undefined;
    }
    entry.error = message;
    entry.updatedAt = this.clock().toISOString();
    this.persist();
    this.alerts.raise({ level: 'error', message: `${entry.locator}: ${message}`, source: entry.id });
    this.logger.error(`${entry.locator}: ${message}`);
  }

  private sandboxFor(id: string, version: string): string {
    const safe = version.replace(/[^A-Za-z0-9._+-]/g, '_') || 'latest';
    return path.join(this.sandboxesDir, id, safe);
  }

  private findOpen(sourceId: string, locator: string): RepoRecord | undefined {
    return this.records.find(
      (record) => record.sourceId === sourceId && record.locator === locator && record.state !== 'uninstalled',
    );
  }

  private must(id: string): RepoRecord {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new DeskError('That package is not in the registry.', 'not_found');
    return record;
  }

  private requireAdapter(id: string): RepoSourceAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new DeskError(`Desk does not have a repo source named "${id}".`, 'bad_adapter');
    if (!adapter.implemented) {
      throw new DeskError(adapter.description, 'not_implemented');
    }
    return adapter;
  }

  private toView(record: RepoRecord): RepoView {
    return {
      ...record,
      canRollback: record.history.some(
        (item) => item.state === 'ready' && item.version !== record.resolvedVersion,
      ),
    };
  }
}
