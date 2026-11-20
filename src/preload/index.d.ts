import type { DeskCommand, DeskResponse } from '../shared/types';

declare global {
  interface Window {
    desk?: {
      handle(command: DeskCommand): Promise<DeskResponse>;
    };
  }
}

export {};
