import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { AutostartController } from '../core/desk';
import { linuxAutostartEnabled, linuxAutostartPath, renderLinuxAutostart } from '../core/linux-autostart';
import { AUTOSTART_FLAG } from '../shared/app';

function configHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
}

function launchParts(): string[] {
  if (app.isPackaged) return [process.execPath, AUTOSTART_FLAG];
  return [process.execPath, process.argv[1] ?? '.', AUTOSTART_FLAG];
}

export function launchedAtLogin(): boolean {
  if (process.argv.includes(AUTOSTART_FLAG)) return true;
  if (process.platform === 'darwin') return app.getLoginItemSettings().wasOpenedAtLogin;
  return false;
}

export function createAutostart(): AutostartController {
  return {
    supported: true,
    async get() {
      if (process.platform !== 'linux') return app.getLoginItemSettings().openAtLogin;
      const file = linuxAutostartPath(configHome());
      if (!existsSync(file)) return false;
      return linuxAutostartEnabled(readFileSync(file, 'utf8'));
    },
    async set(enabled) {
      if (process.platform === 'linux') {
        const file = linuxAutostartPath(configHome());
        if (!enabled) {
          if (existsSync(file)) rmSync(file);
          return;
        }
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, renderLinuxAutostart(launchParts()));
        return;
      }
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? [AUTOSTART_FLAG] : [],
      });
    },
  };
}
