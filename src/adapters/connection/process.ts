import type { HealthView } from '../../shared/types';
import { DeskError } from '../../core/errors';
import { assertExecutable, splitArgs } from '../../core/validate';
import type { AdapterContext, ConnectionAdapter } from '../types';
import type { ConnectionRecord } from '../../core/records';

const MODE_OPTIONS = [
  { value: 'running', label: 'Process is running' },
  { value: 'on-path', label: 'Program is on PATH' },
];

function basename(executable: string): string {
  const parts = executable.split(/[\\/]/);
  return parts[parts.length - 1] || executable;
}

function report(ctx: AdapterContext, started: number, status: HealthView['status'], message: string): HealthView {
  return {
    status,
    checkedAt: ctx.clock().toISOString(),
    latencyMs: Math.max(0, ctx.clock().getTime() - started),
    message,
  };
}

async function isOnPath(executable: string, ctx: AdapterContext): Promise<boolean> {
  if (process.platform === 'win32') {
    const result = await ctx.runner.run('where', [executable], { timeoutMs: 8000 });
    return result.code === 0;
  }
  const result = await ctx.runner.run('which', [executable], { timeoutMs: 8000 });
  return result.code === 0 && result.stdout.trim().length > 0;
}

async function isRunning(executable: string, ctx: AdapterContext): Promise<{ running: boolean; detail: string }> {
  const base = basename(executable);
  if (process.platform === 'win32') {
    const image = base.toLowerCase().endsWith('.exe') ? base : `${base}.exe`;
    const result = await ctx.runner.run('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
      timeoutMs: 8000,
    });
    if (result.code === 127) return { running: false, detail: 'tasklist is not available.' };
    return {
      running: result.stdout.toLowerCase().includes(image.toLowerCase()),
      detail: result.stderr.trim(),
    };
  }
  const result = await ctx.runner.run('pgrep', ['-x', base], { timeoutMs: 8000 });
  if (result.code === 127) return { running: false, detail: 'pgrep is not available.' };
  return { running: result.code === 0, detail: '' };
}

async function inspect(record: ConnectionRecord, ctx: AdapterContext): Promise<HealthView> {
  const started = ctx.clock().getTime();
  const executable = assertExecutable(record.config.executable);
  const mode = record.config.mode || 'running';
  if (mode === 'on-path') {
    const found = await isOnPath(executable, ctx);
    return report(
      ctx,
      started,
      found ? 'healthy' : 'unreachable',
      found ? `${executable} is on PATH.` : `${executable} is not on PATH.`,
    );
  }
  if (mode === 'running') {
    const result = await isRunning(executable, ctx);
    if (result.detail && !result.running) {
      return report(ctx, started, 'error', result.detail);
    }
    return report(
      ctx,
      started,
      result.running ? 'healthy' : 'unreachable',
      result.running ? `${basename(executable)} is running.` : `${basename(executable)} is not running.`,
    );
  }
  throw new DeskError('Choose whether to look for a running process or a program on PATH.', 'bad_config');
}

export const processConnectionAdapter: ConnectionAdapter = {
  id: 'process',
  label: 'Local process',
  description: 'Check that a program is on PATH, or that its process is running. Reconnect starts it again.',
  implemented: true,
  fields: [
    {
      key: 'executable',
      label: 'Executable',
      placeholder: 'node',
      required: true,
      input: 'text',
      help: 'A program name or a path without spaces.',
    },
    {
      key: 'mode',
      label: 'Check',
      required: true,
      input: 'select',
      options: MODE_OPTIONS,
    },
    {
      key: 'arguments',
      label: 'Arguments',
      placeholder: '--port 7331',
      input: 'text',
      help: 'Used only when Desk starts the program again. Quotes are supported.',
    },
  ],
  validate(config) {
    assertExecutable(config.executable);
    if (config.mode !== 'running' && config.mode !== 'on-path') {
      throw new DeskError('Choose whether to look for a running process or a program on PATH.', 'bad_config');
    }
  },
  check(record, ctx) {
    return inspect(record, ctx);
  },
  async reconnect(record, ctx) {
    const executable = assertExecutable(record.config.executable);
    const args = splitArgs(record.config.arguments ?? '');
    try {
      await ctx.runner.spawnDetached(executable, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Desk could not start the program.';
      return report(ctx, ctx.clock().getTime(), 'error', message);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return inspect(record, ctx);
  },
};
