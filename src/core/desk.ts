import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { builtinConnectionAdapters } from '../adapters/connection';
import { builtinRepoAdapters } from '../adapters/repo';
import type { ConnectionAdapter, RepoSourceAdapter } from '../adapters/types';
import type { AlertView, DeskCommand, DeskResponse, DeskSnapshot } from '../shared/types';
import { AlertList } from './alerts';
import { cleanAccent, cleanAppName, cleanMarkdownHub, cleanWebhookUrl, hubKind, installLogo } from './branding';
import { parseCommand } from './command';
import { ConnectionService } from './connections';
import { DeskError } from './errors';
import { inboxFiles, moveInboxFile, readInboxFile } from './inbox';
import { instructionsDir, writeAssistantInstructions } from './instructions';
import { loadAlerts, loadConnections, loadRepos, loadSettings } from './load';
import { DeskLogger, type Logger } from './logger';
import type { ConnectionRecord, PersistedSettings, RepoRecord } from './records';
import { RepoService } from './repos';
import { createProcessRunner, type ProcessRunner } from './runner';
import { unavailableSecretStore, webhookAccount, type SecretStore } from './secrets';
import { JsonFileStore } from './store';
import { postWebhook, type WebhookPayload } from './webhook';

export interface AutostartController {
  readonly supported: boolean;
  get(): Promise<boolean>;
  set(enabled: boolean): Promise<void>;
}

export interface DeskOptions {
  dataDir: string;
  runner?: ProcessRunner;
  fetchImpl?: typeof fetch;
  secrets?: SecretStore;
  autostart?: AutostartController;
  clock?: () => Date;
  createId?: () => string;
  connectionAdapters?: ConnectionAdapter[];
  repoAdapters?: RepoSourceAdapter[];
}

const unsupportedAutostart: AutostartController = {
  supported: false,
  async get() {
    return false;
  },
  async set() {
    throw new DeskError('This environment cannot start Desk at login.', 'no_autostart');
  },
};

export class Desk {
  private readonly settings: PersistedSettings;
  private readonly store: JsonFileStore;
  private readonly logger: Logger;
  private readonly alerts: AlertList;
  private readonly connections: ConnectionService;
  private readonly repos: RepoService;
  private readonly autostart: AutostartController;
  private readonly secrets: SecretStore;
  private readonly clock: () => Date;
  private readonly inboxDir: string;
  private readonly fetchImpl: typeof fetch;
  private apiPort: number | null = null;
  private inboxRunning = false;

  constructor(options: DeskOptions) {
    this.clock = options.clock ?? (() => new Date());
    const createId = options.createId ?? (() => randomUUID());
    this.store = new JsonFileStore(options.dataDir);
    this.logger = new DeskLogger(path.join(options.dataDir, 'logs', 'desk.log'), this.clock);
    this.secrets = options.secrets ?? unavailableSecretStore();
    this.autostart = options.autostart ?? unsupportedAutostart;
    this.inboxDir = path.join(options.dataDir, 'inbox');
    mkdirSync(this.inboxDir, { recursive: true });
    mkdirSync(path.join(options.dataDir, 'sandboxes'), { recursive: true });
    this.settings = this.readSettings();
    const alertItems = this.readAlerts();
    this.alerts = new AlertList(alertItems, () => this.store.write('alerts.json', alertItems), this.clock, createId);
    const connectionRecords = this.readConnections();
    const repoRecords = this.readRepos();
    this.fetchImpl = options.fetchImpl ?? fetch;
    const runner = options.runner ?? createProcessRunner();
    const context = {
      fetchImpl: this.fetchImpl,
      runner,
      secrets: this.secrets,
      clock: this.clock,
      logger: this.logger,
    };
    this.connections = new ConnectionService(
      connectionRecords,
      options.connectionAdapters ?? builtinConnectionAdapters(),
      context,
      this.alerts,
      this.logger,
      this.clock,
      createId,
      () => this.store.write('connections.json', connectionRecords),
      this.secrets,
      (failure) => this.notifyConnectorFailure(failure),
    );
    this.repos = new RepoService(
      repoRecords,
      options.repoAdapters ?? builtinRepoAdapters(),
      context,
      this.alerts,
      this.logger,
      this.clock,
      createId,
      () => this.store.write('repos.json', repoRecords),
      path.join(options.dataDir, 'sandboxes'),
    );
    this.publishInstructions();
  }

  setApiPort(port: number | null): void {
    this.apiPort = port;
    this.store.write('api-port.json', { port });
  }

  getLoopSettings(): { onboardingComplete: boolean; checkIntervalSec: number } {
    return {
      onboardingComplete: this.settings.onboardingComplete,
      checkIntervalSec: this.settings.checkIntervalSec,
    };
  }

  async handle(input: unknown): Promise<DeskResponse> {
    try {
      const command = parseCommand(input);
      await this.dispatch(command);
      return { ok: true, snapshot: this.snapshot() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      if (!(error instanceof DeskError) || error.code !== 'bad_command') this.logger.error(message);
      return { ok: false, error: message, snapshot: this.snapshot() };
    }
  }

  snapshot(): DeskSnapshot {
    this.publishInstructions();
    return {
      settings: {
        onboardingComplete: this.settings.onboardingComplete,
        autostart: this.settings.autostart,
        autostartSupported: this.autostart.supported,
        checkIntervalSec: this.settings.checkIntervalSec,
        autoInstallInbox: this.settings.autoInstallInbox,
        appName: this.settings.appName,
        accentColor: this.settings.accentColor,
        hasLogo: this.logoFilePath() !== null,
        markdownHub: this.settings.markdownHub,
        markdownHubKind: hubKind(this.settings.markdownHub),
        instructionsPath: path.join(instructionsDir(this.store.directory), 'DESK.md'),
        webhookUrl: this.settings.webhookUrl,
        hasWebhookSecret: this.settings.hasWebhookSecret,
        dataDir: this.store.directory,
        inboxDir: this.inboxDir,
        secretsMode: this.secrets.mode,
        apiPort: this.apiPort,
      },
      connectionAdapters: this.connections.summaries(),
      repoAdapters: this.repos.summaries(),
      connections: this.connections.list(),
      repos: this.repos.list(),
      alerts: this.alerts.visible(),
      logs: this.logger.recent(80),
    };
  }

  private async dispatch(command: DeskCommand): Promise<void> {
    switch (command.type) {
      case 'getState':
        return;
      case 'completeOnboarding':
        await this.completeOnboarding(command);
        return;
      case 'updateSettings':
        await this.updateSettings(command);
        return;
      case 'sendTestAlert':
        await this.sendTestAlert();
        return;
      case 'addConnection':
        await this.connections.add(command);
        return;
      case 'setConnectionEnabled':
        this.connections.setEnabled(command.id, command.enabled);
        return;
      case 'removeConnection':
        await this.connections.remove(command.id);
        return;
      case 'checkConnection':
        await this.connections.check(command.id);
        return;
      case 'reconnectConnection':
        await this.connections.reconnect(command.id);
        return;
      case 'checkAll':
        await this.connections.checkAll();
        return;
      case 'addRepo':
        this.repos.addCandidate(command.sourceId, command.locator, command.version);
        return;
      case 'addAndInstall':
        await this.repos.addAndInstall(command.sourceId, command.locator, command.version);
        return;
      case 'installAndTest':
        await this.repos.installAndTest(command.id);
        return;
      case 'setInUse':
        this.repos.setInUse(command.id, command.inUse);
        return;
      case 'uninstallRepo':
        await this.repos.uninstall(command.id);
        return;
      case 'rollbackRepo':
        await this.repos.rollback(command.id);
        return;
      case 'importInbox':
        await this.importInbox();
        return;
      case 'dismissAlert':
        this.alerts.dismiss(command.id);
        return;
      default: {
        const neverCommand: never = command;
        throw new DeskError(`Unknown command: ${JSON.stringify(neverCommand)}`, 'bad_command');
      }
    }
  }

  logoFilePath(): string | null {
    if (!this.settings.logoFile) return null;
    const full = path.join(this.store.directory, 'branding', this.settings.logoFile);
    return existsSync(full) ? full : null;
  }

  private async completeOnboarding(command: Extract<DeskCommand, { type: 'completeOnboarding' }>): Promise<void> {
    if (this.settings.onboardingComplete) return;
    const { autostart, seedSample } = command;
    this.applyBranding(command);
    if (autostart) {
      if (!this.autostart.supported) {
        this.alerts.raise({
          level: 'warning',
          message: 'This environment cannot start Desk at login.',
          source: 'autostart',
        });
        this.settings.autostart = false;
      } else {
        await this.autostart.set(true);
        this.settings.autostart = true;
      }
    } else if (this.autostart.supported) {
      await this.autostart.set(false);
      this.settings.autostart = false;
    }
    this.settings.onboardingComplete = true;
    this.store.write('settings.json', this.settings);
    this.logger.info('Onboarding finished.');
    if (!seedSample) return;
    await this.connections.add({
      name: 'Sample: Node on PATH',
      adapterId: 'process',
      config: { executable: 'node', mode: 'on-path', arguments: '' },
    });
    await this.connections.add({
      name: 'Sample: example.com',
      adapterId: 'http',
      config: { url: 'https://example.com' },
    });
  }

  private async updateSettings(command: Extract<DeskCommand, { type: 'updateSettings' }>): Promise<void> {
    if (command.checkIntervalSec !== undefined) {
      if (command.checkIntervalSec < 15 || command.checkIntervalSec > 3600) {
        throw new DeskError('Check interval must be between 15 and 3600 seconds.', 'bad_settings');
      }
      this.settings.checkIntervalSec = command.checkIntervalSec;
    }
    if (command.autoInstallInbox !== undefined) this.settings.autoInstallInbox = command.autoInstallInbox;
    this.applyBranding(command);
    if (command.markdownHub !== undefined) this.settings.markdownHub = cleanMarkdownHub(command.markdownHub);
    if (command.webhookUrl !== undefined) this.settings.webhookUrl = cleanWebhookUrl(command.webhookUrl);
    if (command.autostart !== undefined) {
      if (command.autostart && !this.autostart.supported) {
        throw new DeskError('This environment cannot start Desk at login.', 'no_autostart');
      }
      if (this.autostart.supported) await this.autostart.set(command.autostart);
      this.settings.autostart = command.autostart;
    }
    this.store.write('settings.json', this.settings);
    if (command.clearWebhookSecret) {
      await this.secrets.delete(webhookAccount());
      this.settings.hasWebhookSecret = false;
    }
    if (command.webhookSecret) {
      await this.secrets.set(webhookAccount(), command.webhookSecret);
      this.settings.hasWebhookSecret = true;
    }
    if (command.clearWebhookSecret || command.webhookSecret) {
      this.store.write('settings.json', this.settings);
    }
    this.publishInstructions();
  }

  private applyBranding(input: { appName?: string; accentColor?: string; logoPath?: string; clearLogo?: boolean }): void {
    if (input.appName !== undefined) this.settings.appName = cleanAppName(input.appName);
    if (input.accentColor !== undefined) this.settings.accentColor = cleanAccent(input.accentColor);
    if (input.clearLogo) this.settings.logoFile = undefined;
    if (input.logoPath) this.settings.logoFile = installLogo(this.store.directory, input.logoPath);
  }

  private publishInstructions(): void {
    writeAssistantInstructions(this.store.directory, this.settings, this.connections.list());
  }

  private async authorizationHeader(): Promise<string | null> {
    if (!this.settings.hasWebhookSecret) return null;
    return this.secrets.get(webhookAccount());
  }

  private async notifyConnectorFailure(failure: {
    id: string;
    name: string;
    adapterId: string;
    status: string;
    message: string;
  }): Promise<void> {
    try {
      await this.deliverWebhook({
        source: 'desk',
        kind: 'connector-failure',
        appName: this.settings.appName,
        at: this.clock().toISOString(),
        message: failure.message,
        connector: {
          id: failure.id,
          name: failure.name,
          adapterId: failure.adapterId,
          status: failure.status,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook failed.';
      this.logger.error(message);
    }
  }

  private async sendTestAlert(): Promise<void> {
    if (!this.settings.webhookUrl) {
      throw new DeskError('Add a webhook URL before sending a test alert.', 'no_webhook');
    }
    await this.deliverWebhook({
      source: 'desk',
      kind: 'test',
      appName: this.settings.appName,
      at: this.clock().toISOString(),
      message: `Test alert from ${this.settings.appName}.`,
    });
    this.logger.info('Sent a test alert.');
  }

  private async deliverWebhook(body: WebhookPayload): Promise<void> {
    if (!this.settings.webhookUrl) return;
    await postWebhook({
      fetchImpl: this.fetchImpl,
      url: this.settings.webhookUrl,
      authorization: await this.authorizationHeader(),
      body,
    });
  }

  private async importInbox(): Promise<void> {
    if (this.inboxRunning) return;
    this.inboxRunning = true;
    try {
      const files = inboxFiles(this.inboxDir);
      for (const file of files) {
        const failedDir = path.join(this.inboxDir, 'failed');
        const doneDir = path.join(this.inboxDir, 'processed');
        try {
          const item = readInboxFile(file);
          if (this.settings.autoInstallInbox) {
            await this.repos.addAndInstall(item.sourceId, item.locator, item.version);
          } else {
            this.repos.addCandidate(item.sourceId, item.locator, item.version);
          }
          moveInboxFile(file, doneDir);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not import an inbox file.';
          this.alerts.raise({ level: 'error', message, source: 'inbox' });
          this.logger.error(message);
          try {
            moveInboxFile(file, failedDir);
          } catch {
            // Leave the file in place if it cannot be moved.
          }
        }
      }
    } finally {
      this.inboxRunning = false;
    }
  }

  private readSettings(): PersistedSettings {
    try {
      return loadSettings(this.store.read('settings.json'), this.logger);
    } catch {
      this.logger.error('Could not read settings.json. Desk is using default settings.');
      return loadSettings(undefined, this.logger);
    }
  }

  private readConnections(): ConnectionRecord[] {
    try {
      return loadConnections(this.store.read('connections.json'), this.logger);
    } catch {
      this.logger.error('Could not read connections.json. Desk is starting that list empty.');
      return [];
    }
  }

  private readRepos(): RepoRecord[] {
    let raw: unknown;
    try {
      raw = this.store.read('repos.json');
    } catch {
      this.logger.error('Could not read repos.json. Desk is starting that list empty.');
      return [];
    }
    const records = loadRepos(raw, this.logger);
    if (raw !== undefined) this.store.write('repos.json', records);
    return records;
  }

  private readAlerts(): AlertView[] {
    try {
      return loadAlerts(this.store.read('alerts.json'), this.logger);
    } catch {
      this.logger.error('Could not read alerts.json. Desk is starting that list empty.');
      return [];
    }
  }
}

export function createDesk(options: DeskOptions): Desk {
  return new Desk(options);
}
