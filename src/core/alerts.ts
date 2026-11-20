import type { AlertLevel, AlertView } from '../shared/types';

export class AlertList {
  private readonly quiet = new Set<string>();

  constructor(
    private readonly items: AlertView[],
    private readonly persist: () => void,
    private readonly clock: () => Date,
    private readonly createId: () => string,
  ) {}

  raise(input: { level: AlertLevel; message: string; source?: string }): boolean {
    const key = `${input.source ?? ''}::${input.message}`;
    if (this.quiet.has(key)) return false;
    this.quiet.add(key);
    this.items.unshift({
      id: this.createId(),
      level: input.level,
      message: input.message,
      at: this.clock().toISOString(),
      source: input.source,
    });
    this.items.splice(100);
    this.persist();
    return true;
  }

  resolve(source: string): void {
    for (const key of this.quiet) {
      if (key.startsWith(`${source}::`)) this.quiet.delete(key);
    }
  }

  dismiss(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.items.splice(index, 1);
    this.persist();
  }

  visible(): AlertView[] {
    return this.items.slice(0, 20);
  }

  all(): AlertView[] {
    return this.items;
  }
}
