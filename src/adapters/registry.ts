export class AdapterRegistry<T extends { id: string }> {
  private readonly map = new Map<string, T>();

  constructor(adapters: T[]) {
    for (const adapter of adapters) {
      if (this.map.has(adapter.id)) {
        throw new Error(`Duplicate adapter id "${adapter.id}".`);
      }
      this.map.set(adapter.id, adapter);
    }
  }

  get(id: string): T | undefined {
    return this.map.get(id);
  }

  list(): T[] {
    return [...this.map.values()];
  }
}
