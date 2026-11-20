import type { DeskCommand } from '../shared/types';
import { DeskError } from './errors';
import { assertId } from './validate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new DeskError(`${key} is required.`, 'bad_command');
  }
  return value.trim();
}

function optionalString(source: Record<string, unknown>, key: string): string | undefined {
  if (source[key] === undefined) return undefined;
  if (typeof source[key] !== 'string') throw new DeskError(`${key} must be a string.`, 'bad_command');
  const trimmed = (source[key] as string).trim();
  return trimmed || undefined;
}

function optionalPresentString(source: Record<string, unknown>, key: string): string | undefined {
  if (!(key in source)) return undefined;
  if (typeof source[key] !== 'string') throw new DeskError(`${key} must be a string.`, 'bad_command');
  return (source[key] as string).trim();
}

function requiredBoolean(source: Record<string, unknown>, key: string): boolean {
  if (typeof source[key] !== 'boolean') throw new DeskError(`${key} must be true or false.`, 'bad_command');
  return source[key] as boolean;
}

function optionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  if (source[key] === undefined) return undefined;
  return requiredBoolean(source, key);
}

function optionalInt(source: Record<string, unknown>, key: string): number | undefined {
  if (source[key] === undefined) return undefined;
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DeskError(`${key} must be a whole number.`, 'bad_command');
  }
  return value;
}

function stringMap(source: Record<string, unknown>, key: string): Record<string, string> {
  const value = source[key];
  if (!isRecord(value)) throw new DeskError(`${key} must be an object of strings.`, 'bad_command');
  const config: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string') {
      throw new DeskError(`${key}.${entryKey} must be a string.`, 'bad_command');
    }
    config[entryKey] = entryValue;
  }
  return config;
}

export function parseCommand(input: unknown): DeskCommand {
  if (!isRecord(input)) throw new DeskError('Command must be an object.', 'bad_command');
  const type = input.type;
  switch (type) {
    case 'getState':
    case 'checkAll':
    case 'importInbox':
    case 'sendTestAlert':
      return { type };
    case 'completeOnboarding':
      return {
        type,
        autostart: requiredBoolean(input, 'autostart'),
        seedSample: requiredBoolean(input, 'seedSample'),
        appName: optionalString(input, 'appName'),
        accentColor: optionalString(input, 'accentColor'),
        logoPath: optionalString(input, 'logoPath'),
      };
    case 'updateSettings':
      return {
        type,
        autostart: optionalBoolean(input, 'autostart'),
        checkIntervalSec: optionalInt(input, 'checkIntervalSec'),
        autoInstallInbox: optionalBoolean(input, 'autoInstallInbox'),
        appName: optionalString(input, 'appName'),
        accentColor: optionalString(input, 'accentColor'),
        logoPath: optionalString(input, 'logoPath'),
        clearLogo: optionalBoolean(input, 'clearLogo'),
        markdownHub: optionalPresentString(input, 'markdownHub'),
        webhookUrl: optionalPresentString(input, 'webhookUrl'),
        webhookSecret: optionalString(input, 'webhookSecret'),
        clearWebhookSecret: optionalBoolean(input, 'clearWebhookSecret'),
      };
    case 'addConnection':
      return {
        type,
        name: requiredString(input, 'name'),
        adapterId: requiredString(input, 'adapterId'),
        config: stringMap(input, 'config'),
        secret: optionalString(input, 'secret'),
      };
    case 'setConnectionEnabled':
      return { type, id: assertId(requiredString(input, 'id')), enabled: requiredBoolean(input, 'enabled') };
    case 'removeConnection':
    case 'checkConnection':
    case 'reconnectConnection':
    case 'installAndTest':
    case 'uninstallRepo':
    case 'rollbackRepo':
    case 'dismissAlert':
      return { type, id: assertId(requiredString(input, 'id')) };
    case 'addRepo':
    case 'addAndInstall':
      return {
        type,
        sourceId: requiredString(input, 'sourceId'),
        locator: requiredString(input, 'locator'),
        version: optionalString(input, 'version'),
      };
    case 'setInUse':
      return { type, id: assertId(requiredString(input, 'id')), inUse: requiredBoolean(input, 'inUse') };
    default: {
      throw new DeskError(`Unknown command: ${String(type)}`, 'bad_command');
    }
  }
}
