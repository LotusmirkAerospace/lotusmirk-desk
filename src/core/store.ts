import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class JsonFileStore {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  read(name: string): unknown {
    const file = path.join(this.directory, name);
    if (!existsSync(file)) return undefined;
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  }

  write(name: string, value: unknown): void {
    const file = path.join(this.directory, name);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2));
    renameSync(tmp, file);
  }
}
