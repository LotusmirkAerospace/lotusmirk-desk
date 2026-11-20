import path from 'node:path';
import { APP_ID } from '../shared/app';

export function linuxAutostartPath(configHome: string): string {
  return path.join(configHome, 'autostart', `${APP_ID}.desktop`);
}

function quoteArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function renderLinuxAutostart(execParts: string[]): string {
  const exec = execParts.map(quoteArg).join(' ');
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=Desk
Comment=Local companion for connection health and package trials
Exec=${exec}
Terminal=false
Categories=Utility;
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;
}

export function linuxAutostartEnabled(contents: string): boolean {
  return !/X-GNOME-Autostart-enabled\s*=\s*false/i.test(contents);
}
