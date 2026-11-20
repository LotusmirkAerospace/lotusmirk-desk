import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import type { LogView } from '../shared/types';

export interface Logger {
  info(message: string): void;
  error(message: string): void;
  recent(limit: number): LogView[];
}

export class DeskLogger implements Logger {
  private lines: LogView[] = [];

  constructor(
    private readonly filePath: string,
    private readonly clock: () => Date,
  ) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.hydrate();
  }

  info(message: string): void {
    this.write('info', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  recent(limit: number): LogView[] {
    return this.lines.slice(-limit);
  }

  private hydrate(): void {
    if (!existsSync(this.filePath)) return;
    const rows = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean).slice(-80);
    for (const row of rows) {
      const match = /^(\S+) (INFO|ERROR) (.*)$/.exec(row);
      if (!match) continue;
      this.lines.push({
        at: match[1],
        level: match[2] === 'INFO' ? 'info' : 'error',
        message: match[3],
      });
    }
  }

  private write(level: LogView['level'], message: string): void {
    const line: LogView = {
      at: this.clock().toISOString(),
      level,
      message: message.slice(0, 500),
    };
    this.lines.push(line);
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
    try {
      if (existsSync(this.filePath) && statSync(this.filePath).size > 1_000_000) {
        renameSync(this.filePath, `${this.filePath}.1`);
      }
      appendFileSync(this.filePath, `${line.at} ${level.toUpperCase()} ${line.message}\n`);
    } catch {
      // A full disk should not take down a health check.
    }
  }
}
