import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { DeskError } from './errors';

export interface InboxItem {
  sourceId: string;
  locator: string;
  version?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function inboxFiles(inboxDir: string): string[] {
  mkdirSync(inboxDir, { recursive: true });
  return readdirSync(inboxDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(inboxDir, entry.name));
}

export function readInboxFile(file: string): InboxItem {
  const name = path.basename(file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch {
    throw new DeskError(`${name} is not valid JSON.`, 'bad_inbox');
  }
  if (!isRecord(parsed) || typeof parsed.sourceId !== 'string' || typeof parsed.locator !== 'string') {
    throw new DeskError(`${name} needs sourceId and locator strings.`, 'bad_inbox');
  }
  if (parsed.version !== undefined && typeof parsed.version !== 'string') {
    throw new DeskError(`${name} version must be a string.`, 'bad_inbox');
  }
  return {
    sourceId: parsed.sourceId,
    locator: parsed.locator,
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
  };
}

export function moveInboxFile(file: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });
  renameSync(file, path.join(destinationDir, `${Date.now()}-${path.basename(file)}`));
}
