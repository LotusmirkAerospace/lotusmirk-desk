import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DeskError } from './errors';

const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

export function cleanAppName(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 80) {
    throw new DeskError('App name must be 1 to 80 characters.', 'bad_name');
  }
  return cleaned;
}

export function cleanAccent(value: string): string {
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new DeskError('Accent colour must be a hex value like #2f5d8c.', 'bad_accent');
  }
  return trimmed.toLowerCase();
}

export function cleanMarkdownHub(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new DeskError('That markdown link is not a valid URL.', 'bad_hub');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new DeskError('A markdown link must start with http:// or https://.', 'bad_hub');
    }
    return url.toString();
  }
  if (trimmed.length > 500) throw new DeskError('That markdown path is too long.', 'bad_hub');
  return trimmed;
}

export function cleanWebhookUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DeskError('Webhook URL must start with http:// or https://.', 'bad_webhook');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DeskError('Webhook URL must start with http:// or https://.', 'bad_webhook');
  }
  return url.toString();
}

export type HubKind = 'unset' | 'google-drive' | 'remote-link' | 'local-path';

export function hubKind(location: string): HubKind {
  if (!location) return 'unset';
  if (/^https?:\/\//i.test(location)) {
    try {
      const host = new URL(location).hostname;
      if (host === 'drive.google.com' || host === 'docs.google.com') return 'google-drive';
    } catch {
      return 'remote-link';
    }
    return 'remote-link';
  }
  return 'local-path';
}

export function installLogo(dataDir: string, sourcePath: string): string {
  const ext = path.extname(sourcePath).toLowerCase();
  if (!LOGO_EXTENSIONS.has(ext)) {
    throw new DeskError('Logo must be a PNG, JPG, WEBP, GIF, or SVG file.', 'bad_logo');
  }
  if (!existsSync(sourcePath)) throw new DeskError('That logo file was not found.', 'bad_logo');
  const destDir = path.join(dataDir, 'branding');
  mkdirSync(destDir, { recursive: true });
  const file = `logo${ext === '.jpeg' ? '.jpg' : ext}`;
  copyFileSync(sourcePath, path.join(destDir, file));
  return file;
}

export function logoContentType(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}
