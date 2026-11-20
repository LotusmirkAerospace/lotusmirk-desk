import type { ConnectionAdapter } from '../types';
import { httpConnectionAdapter } from './http';
import { mcpConnectionAdapter } from './mcp';
import { processConnectionAdapter } from './process';

export function builtinConnectionAdapters(): ConnectionAdapter[] {
  return [httpConnectionAdapter, processConnectionAdapter, mcpConnectionAdapter];
}

export { httpConnectionAdapter, mcpConnectionAdapter, processConnectionAdapter };
