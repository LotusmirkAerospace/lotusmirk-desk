import type { ConnectionAdapter } from '../adapters/types';
import type { AdapterContext } from '../adapters/types';
import { AdapterRegistry } from '../adapters/registry';
import type { HealthView } from '../shared/types';

export interface ConnectorFailure {
  id: string;
  name: string;
  adapterId: string;
  status: string;
  message: string;
}
import { AlertList } from './alerts';
import { DeskError } from './errors';
import type { Logger } from './logger';
import type { ConnectionRecord } from './records';
import { secretAccount, type SecretStore } from './secrets';
import { cleanName, readConfig } from './validate';

export class ConnectionService {
  private readonly adapters: AdapterRegistry<ConnectionAdapter>;

  constructor(
    private readonly records: ConnectionRecord[],
    adapters: ConnectionAdapter[],
    private readonly context: AdapterContext,
    private readonly alerts: AlertList,
    private readonly logger: Logger,
    private readonly clock: () => Date,
    private readonly createId: () => string,
    private readonly persist: () => void,
    private readonly secrets: SecretStore,
    private readonly onFailure?: (failure: ConnectorFailure) => Promise<void>,
  ) {
    this.adapters = new AdapterRegistry(adapters);
  }

  list(): ConnectionRecord[] {
    return this.records;
  }

  summaries() {
    return this.adapters.list().map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      description: adapter.description,
      implemented: adapter.implemented,
      fields: adapter.fields,
      secret: adapter.secret,
    }));
  }

  async add(input: {
    name: string;
    adapterId: string;
    config: Record<string, string>;
    secret?: string;
  }): Promise<void> {
    const adapter = this.requireAdapter(input.adapterId);
    const config = readConfig(adapter.fields, input.config);
    adapter.validate?.(config);
    const record: ConnectionRecord = {
      id: this.createId(),
      name: cleanName(input.name),
      adapterId: adapter.id,
      config,
      hasSecret: false,
      enabled: true,
      createdAt: this.clock().toISOString(),
    };
    if (input.secret) {
      await this.secrets.set(secretAccount(record.id), input.secret);
      record.hasSecret = true;
    }
    this.records.push(record);
    this.persist();
    await this.check(record.id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const record = this.must(id);
    record.enabled = enabled;
    this.persist();
  }

  async remove(id: string): Promise<void> {
    const index = this.records.findIndex((record) => record.id === id);
    if (index === -1) throw new DeskError('That connection is not in Desk.', 'not_found');
    const [record] = this.records.splice(index, 1);
    if (record.hasSecret) await this.secrets.delete(secretAccount(record.id));
    this.alerts.resolve(record.id);
    this.persist();
  }

  async check(id: string): Promise<void> {
    const record = this.must(id);
    const started = this.clock().getTime();
    try {
      const adapter = this.requireAdapter(record.adapterId);
      const report = await adapter.check(record, this.context);
      await this.applyReport(record, report);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed.';
      await this.applyReport(record, {
        status: 'error',
        checkedAt: this.clock().toISOString(),
        latencyMs: Math.max(0, this.clock().getTime() - started),
        message,
      });
    }
  }

  async reconnect(id: string): Promise<void> {
    const record = this.must(id);
    const adapter = this.requireAdapter(record.adapterId);
    const started = this.clock().getTime();
    try {
      const report = adapter.reconnect
        ? await adapter.reconnect(record, this.context)
        : await adapter.check(record, this.context);
      await this.applyReport(record, report);
      this.logger.info(`Reconnect finished for ${record.name}: ${report.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reconnect failed.';
      await this.applyReport(record, {
        status: 'error',
        checkedAt: this.clock().toISOString(),
        latencyMs: Math.max(0, this.clock().getTime() - started),
        message,
      });
    }
  }

  async checkAll(): Promise<void> {
    for (const record of [...this.records]) {
      if (!record.enabled) continue;
      await this.check(record.id);
    }
  }

  private async applyReport(record: ConnectionRecord, report: HealthView): Promise<void> {
    record.lastReport = report;
    this.persist();
    if (report.status === 'healthy') {
      this.alerts.resolve(record.id);
      return;
    }
    const raised = this.alerts.raise({
      level: 'error',
      message: `${record.name}: ${report.message}`,
      source: record.id,
    });
    if (!raised) return;
    this.logger.error(`${record.name}: ${report.message}`);
    await this.onFailure?.({
      id: record.id,
      name: record.name,
      adapterId: record.adapterId,
      status: report.status,
      message: `${record.name}: ${report.message}`,
    });
  }

  private must(id: string): ConnectionRecord {
    const record = this.records.find((item) => item.id === id);
    if (!record) throw new DeskError('That connection is not in Desk.', 'not_found');
    return record;
  }

  private requireAdapter(id: string): ConnectionAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter || !adapter.implemented) {
      throw new DeskError(`Desk does not have a connection adapter named "${id}".`, 'bad_adapter');
    }
    return adapter;
  }
}
