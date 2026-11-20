import type { DeskCommand, DeskResponse } from '../../shared/types';

export interface DeskClient {
  handle(command: DeskCommand): Promise<DeskResponse>;
}

export function createDeskClient(): DeskClient {
  const bridge = window.desk;
  if (bridge) return { handle: (command) => bridge.handle(command) };
  return {
    async handle(command) {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error(`Desk's local service returned HTTP ${response.status}.`);
      return response.json() as Promise<DeskResponse>;
    },
  };
}
