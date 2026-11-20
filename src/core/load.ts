import type { AlertView, HealthView } from '../shared/types';
import type { Logger } from './logger';
import { cleanAccent, cleanAppName, cleanMarkdownHub, cleanWebhookUrl } from './branding';
import { defaultSettings, type ConnectionRecord, type PersistedSettings, type RepoRecord } from './records';
import { assertId } from './validate';

function readHistoryState(value: unknown): 'ready' | 'smoke-failed' | undefined {
  if (value === 'ready' || value === 'smoke-failed') return value;
  return undefined;
}

const STATUSES = new Set(['healthy', 'unreachable', 'error']);
const REPO_STATES = new Set(['candidate', 'installing', 'smoke-failed', 'ready', 'uninstalled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const config: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return undefined;
    config[key] = entry;
  }
  return config;
}

export function loadSettings(raw: unknown, logger: Logger): PersistedSettings {
  const settings = defaultSettings();
  if (raw === undefined) return settings;
  if (!isRecord(raw)) {
    logger.error('Could not read settings.json. Desk is using default settings.');
    return settings;
  }
  if (typeof raw.onboardingComplete === 'boolean') settings.onboardingComplete = raw.onboardingComplete;
  if (typeof raw.autostart === 'boolean') settings.autostart = raw.autostart;
  if (typeof raw.autoInstallInbox === 'boolean') settings.autoInstallInbox = raw.autoInstallInbox;
  if (typeof raw.checkIntervalSec === 'number' && raw.checkIntervalSec >= 15 && raw.checkIntervalSec <= 3600) {
    settings.checkIntervalSec = raw.checkIntervalSec;
  }
  if (typeof raw.appName === 'string') {
    try {
      settings.appName = cleanAppName(raw.appName);
    } catch {
      settings.appName = defaultSettings().appName;
    }
  }
  if (typeof raw.accentColor === 'string') {
    try {
      settings.accentColor = cleanAccent(raw.accentColor);
    } catch {
      settings.accentColor = defaultSettings().accentColor;
    }
  }
  if (typeof raw.logoFile === 'string' && /^logo\.(png|jpe?g|webp|gif|svg)$/.test(raw.logoFile)) {
    settings.logoFile = raw.logoFile;
  }
  if (typeof raw.markdownHub === 'string') {
    try {
      settings.markdownHub = cleanMarkdownHub(raw.markdownHub);
    } catch {
      settings.markdownHub = '';
    }
  }
  if (typeof raw.webhookUrl === 'string') {
    try {
      settings.webhookUrl = cleanWebhookUrl(raw.webhookUrl);
    } catch {
      settings.webhookUrl = '';
    }
  }
  settings.hasWebhookSecret = raw.hasWebhookSecret === true;
  return settings;
}

export function loadConnections(raw: unknown, logger: Logger): ConnectionRecord[] {
  return loadList(raw, 'connections.json', logger, (value): ConnectionRecord | undefined => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
    if (typeof value.adapterId !== 'string') return undefined;
    try {
      assertId(value.id);
    } catch {
      return undefined;
    }
    const config = stringMap(value.config);
    if (!config) return undefined;
    const last = isRecord(value.lastReport) ? value.lastReport : undefined;
    const status = last && typeof last.status === 'string' && STATUSES.has(last.status) ? last.status : undefined;
    const lastReport: HealthView | undefined =
      last && status && typeof last.checkedAt === 'string' && typeof last.message === 'string'
        ? {
            status: status as HealthView['status'],
            checkedAt: last.checkedAt,
            latencyMs: typeof last.latencyMs === 'number' ? last.latencyMs : 0,
            message: last.message,
          }
        : undefined;
    return {
      id: value.id,
      name: value.name,
      adapterId: value.adapterId,
      config,
      hasSecret: value.hasSecret === true,
      enabled: value.enabled !== false,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
      lastReport,
    };
  });
}

export function loadRepos(raw: unknown, logger: Logger): RepoRecord[] {
  return loadList(raw, 'repos.json', logger, (value): RepoRecord | undefined => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.locator !== 'string') return undefined;
    if (typeof value.sourceId !== 'string' || typeof value.state !== 'string' || !REPO_STATES.has(value.state)) {
      return undefined;
    }
    try {
      assertId(value.id);
    } catch {
      return undefined;
    }
    const history = Array.isArray(value.history)
      ? value.history.flatMap((item) => {
          if (!isRecord(item) || typeof item.version !== 'string' || typeof item.at !== 'string') return [];
          const state = readHistoryState(item.state);
          if (!state) return [];
          return [{ version: item.version, state, at: item.at }];
        })
      : [];
    const record: RepoRecord = {
      id: value.id,
      sourceId: value.sourceId,
      locator: value.locator,
      requestedVersion: typeof value.requestedVersion === 'string' ? value.requestedVersion : undefined,
      resolvedVersion: typeof value.resolvedVersion === 'string' ? value.resolvedVersion : undefined,
      state: value.state as RepoRecord['state'],
      inUse: value.inUse === true,
      sandboxDir: typeof value.sandboxDir === 'string' ? value.sandboxDir : undefined,
      error: typeof value.error === 'string' ? value.error : undefined,
      history,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    };
    if (record.state === 'installing') {
      const kept = record.history.some((item) => item.state === 'ready' && item.version === record.resolvedVersion);
      if (kept && record.sandboxDir) {
        record.state = 'ready';
        record.error = 'An upgrade was interrupted. Desk kept the last working version.';
      } else {
        record.state = 'candidate';
        record.error = 'Install was interrupted before it finished.';
      }
    }
    if (record.state !== 'ready') record.inUse = false;
    return record;
  });
}

export function loadAlerts(raw: unknown, logger: Logger): AlertView[] {
  return loadList(raw, 'alerts.json', logger, (value): AlertView | undefined => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.message !== 'string') return undefined;
    if (value.level !== 'info' && value.level !== 'warning' && value.level !== 'error') return undefined;
    try {
      assertId(value.id);
    } catch {
      return undefined;
    }
    return {
      id: value.id,
      level: value.level,
      message: value.message,
      at: typeof value.at === 'string' ? value.at : new Date(0).toISOString(),
      source: typeof value.source === 'string' ? value.source : undefined,
    };
  });
}

function loadList<T>(raw: unknown, file: string, logger: Logger, map: (value: unknown) => T | undefined): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    logger.error(`Could not read ${file}. Desk is starting that list empty.`);
    return [];
  }
  return raw.flatMap((item) => {
    const mapped = map(item);
    return mapped ? [mapped] : [];
  });
}
