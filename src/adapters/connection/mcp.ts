import type { HealthView } from '../../shared/types';
import { DeskError } from '../../core/errors';
import type { ConnectionRecord } from '../../core/records';
import { assertExecutable, assertHttpUrl, splitArgs } from '../../core/validate';
import type { ConnectionAdapter } from '../types';
import { probeHttp } from './http-probe';
import { processConnectionAdapter } from './process';

function asProcess(record: ConnectionRecord): ConnectionRecord {
  return {
    ...record,
    config: {
      executable: record.config.command,
      mode: 'running',
      arguments: record.config.arguments ?? '',
    },
  };
}

export const mcpConnectionAdapter: ConnectionAdapter = {
  id: 'mcp',
  label: 'MCP server',
  description:
    'A generic MCP connection. HTTP checks that the endpoint answers. stdio checks that the command is running and can start it again.',
  implemented: true,
  fields: [
    {
      key: 'transport',
      label: 'Transport',
      required: true,
      input: 'select',
      options: [
        { value: 'http', label: 'HTTP' },
        { value: 'stdio', label: 'stdio' },
      ],
    },
    {
      key: 'url',
      label: 'URL',
      placeholder: 'http://127.0.0.1:7331/mcp',
      input: 'text',
      help: 'Required for HTTP. Any response below 500 counts as up.',
    },
    {
      key: 'command',
      label: 'Command',
      placeholder: 'uvx',
      input: 'text',
      help: 'Required for stdio. One program name or path, without spaces.',
    },
    {
      key: 'arguments',
      label: 'Arguments',
      placeholder: 'some-mcp-server',
      input: 'text',
    },
  ],
  validate(config) {
    if (config.transport === 'http') {
      assertHttpUrl(config.url);
      return;
    }
    if (config.transport === 'stdio') {
      assertExecutable(config.command);
      return;
    }
    throw new DeskError('Choose HTTP or stdio.', 'bad_config');
  },
  async check(record, ctx): Promise<HealthView> {
    if (record.config.transport === 'http') {
      return probeHttp({
        url: record.config.url ?? '',
        fetchImpl: ctx.fetchImpl,
        clock: ctx.clock,
        accept: (status) => status < 500,
      });
    }
    if (record.config.transport === 'stdio') {
      return processConnectionAdapter.check(asProcess(record), ctx);
    }
    throw new DeskError('Choose HTTP or stdio.', 'bad_config');
  },
  async reconnect(record, ctx): Promise<HealthView> {
    if (record.config.transport === 'http') return this.check(record, ctx);
    if (record.config.transport === 'stdio') {
      const command = assertExecutable(record.config.command);
      try {
        await ctx.runner.spawnDetached(command, splitArgs(record.config.arguments ?? ''));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Desk could not start the MCP server.';
        return {
          status: 'error',
          checkedAt: ctx.clock().toISOString(),
          latencyMs: 0,
          message,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      return this.check(record, ctx);
    }
    throw new DeskError('Choose HTTP or stdio.', 'bad_config');
  },
};
