export type ConnectionStatus = 'healthy' | 'unreachable' | 'error';

export type RepoState =
  | 'candidate'
  | 'installing'
  | 'smoke-failed'
  | 'ready'
  | 'uninstalled';

export type AlertLevel = 'info' | 'warning' | 'error';

export interface AdapterField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  input: 'text' | 'select';
  options?: Array<{ value: string; label: string }>;
}

export interface AdapterSummary {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
  fields: AdapterField[];
  secret?: { label: string; help?: string };
  locatorLabel?: string;
  versionLabel?: string;
  versionHelp?: string;
}

export interface HealthView {
  status: ConnectionStatus;
  checkedAt: string;
  latencyMs: number;
  message: string;
}

export interface ConnectionView {
  id: string;
  name: string;
  adapterId: string;
  config: Record<string, string>;
  hasSecret: boolean;
  enabled: boolean;
  createdAt: string;
  lastReport?: HealthView;
}

export interface SmokeView {
  ok: boolean;
  message: string;
  log: string;
  at: string;
}

export interface HistoryView {
  version: string;
  state: 'ready' | 'smoke-failed';
  at: string;
}

export interface RepoView {
  id: string;
  sourceId: string;
  locator: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  state: RepoState;
  inUse: boolean;
  sandboxDir?: string;
  smoke?: SmokeView;
  error?: string;
  history: HistoryView[];
  canRollback: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertView {
  id: string;
  level: AlertLevel;
  message: string;
  at: string;
  source?: string;
}

export interface LogView {
  at: string;
  level: 'info' | 'error';
  message: string;
}

export type SecretsMode = 'os-keychain' | 'unavailable';

export type HubKind = 'unset' | 'google-drive' | 'remote-link' | 'local-path';

export interface SettingsView {
  onboardingComplete: boolean;
  autostart: boolean;
  autostartSupported: boolean;
  checkIntervalSec: number;
  autoInstallInbox: boolean;
  appName: string;
  accentColor: string;
  hasLogo: boolean;
  markdownHub: string;
  markdownHubKind: HubKind;
  instructionsPath: string;
  webhookUrl: string;
  hasWebhookSecret: boolean;
  dataDir: string;
  inboxDir: string;
  secretsMode: SecretsMode;
  apiPort: number | null;
}

export interface DeskSnapshot {
  settings: SettingsView;
  connectionAdapters: AdapterSummary[];
  repoAdapters: AdapterSummary[];
  connections: ConnectionView[];
  repos: RepoView[];
  alerts: AlertView[];
  logs: LogView[];
}

export type DeskCommand =
  | { type: 'getState' }
  | {
      type: 'completeOnboarding';
      autostart: boolean;
      seedSample: boolean;
      appName?: string;
      accentColor?: string;
      logoPath?: string;
    }
  | {
      type: 'updateSettings';
      autostart?: boolean;
      checkIntervalSec?: number;
      autoInstallInbox?: boolean;
      appName?: string;
      accentColor?: string;
      logoPath?: string;
      clearLogo?: boolean;
      markdownHub?: string;
      webhookUrl?: string;
      webhookSecret?: string;
      clearWebhookSecret?: boolean;
    }
  | { type: 'sendTestAlert' }
  | {
      type: 'addConnection';
      name: string;
      adapterId: string;
      config: Record<string, string>;
      secret?: string;
    }
  | { type: 'setConnectionEnabled'; id: string; enabled: boolean }
  | { type: 'removeConnection'; id: string }
  | { type: 'checkConnection'; id: string }
  | { type: 'reconnectConnection'; id: string }
  | { type: 'checkAll' }
  | { type: 'addRepo'; sourceId: string; locator: string; version?: string }
  | { type: 'addAndInstall'; sourceId: string; locator: string; version?: string }
  | { type: 'installAndTest'; id: string }
  | { type: 'setInUse'; id: string; inUse: boolean }
  | { type: 'uninstallRepo'; id: string }
  | { type: 'rollbackRepo'; id: string }
  | { type: 'importInbox' }
  | { type: 'dismissAlert'; id: string };

export type DeskResponse =
  | { ok: true; snapshot: DeskSnapshot }
  | { ok: false; error: string; snapshot: DeskSnapshot };
