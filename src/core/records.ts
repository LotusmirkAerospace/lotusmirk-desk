import type { ConnectionView, HistoryView, RepoState, SmokeView } from '../shared/types';

export type ConnectionRecord = ConnectionView;

export interface RepoRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface PersistedSettings {
  onboardingComplete: boolean;
  autostart: boolean;
  checkIntervalSec: number;
  autoInstallInbox: boolean;
  appName: string;
  accentColor: string;
  logoFile?: string;
  markdownHub: string;
  webhookUrl: string;
  hasWebhookSecret: boolean;
}

export const DEFAULT_APP_NAME = 'Desk';
export const DEFAULT_ACCENT = '#2f5d8c';

export function defaultSettings(): PersistedSettings {
  return {
    onboardingComplete: false,
    autostart: false,
    checkIntervalSec: 60,
    autoInstallInbox: true,
    appName: DEFAULT_APP_NAME,
    accentColor: DEFAULT_ACCENT,
    markdownHub: '',
    webhookUrl: '',
    hasWebhookSecret: false,
  };
}
