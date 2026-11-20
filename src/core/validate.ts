import type { AdapterField } from '../shared/types';
import { DeskError } from './errors';

export function cleanName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 80) {
    throw new DeskError('Name must be 1 to 80 characters.', 'bad_name');
  }
  return cleaned;
}

export function cleanVersion(version: string | undefined): string | undefined {
  if (version === undefined) return undefined;
  const trimmed = version.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 80 || !/^[A-Za-z0-9._+-]+$/.test(trimmed)) {
    throw new DeskError('Version must be a plain version or tag, such as 1.2.3.', 'bad_version');
  }
  return trimmed;
}

export function assertHttpUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DeskError('Enter a full URL that starts with http:// or https://.', 'bad_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DeskError('Enter a full URL that starts with http:// or https://.', 'bad_url');
  }
  return url.toString();
}

export function assertExecutable(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.length > 300 || /[\s"'`$;&|<>]/.test(trimmed)) {
    throw new DeskError(
      'Executable must be one program name or path, without spaces or shell characters. Put flags in Arguments.',
      'bad_executable',
    );
  }
  return trimmed;
}

export function readConfig(
  fields: AdapterField[],
  input: Record<string, string>,
): Record<string, string> {
  const config: Record<string, string> = {};
  for (const field of fields) {
    const raw = (input[field.key] ?? '').trim();
    if (!raw && field.required) {
      throw new DeskError(`${field.label} is required.`, 'bad_config');
    }
    if (field.input === 'select' && raw) {
      const allowed = field.options?.some((option) => option.value === raw) ?? false;
      if (!allowed) throw new DeskError(`${field.label} is not a valid choice.`, 'bad_config');
    }
    if (raw.length > 2000) throw new DeskError(`${field.label} is too long.`, 'bad_config');
    config[field.key] = raw;
  }
  return config;
}

export function assertId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new DeskError('That id is not valid.', 'bad_id');
  }
  return id;
}

export function tail(text: string, max = 400): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(flat.length - max);
}

export function splitArgs(input: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    args.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return args;
}
