import type { HealthView } from '../../shared/types';
import { DeskError } from '../../core/errors';
import { assertHttpUrl } from '../../core/validate';

export async function probeHttp(options: {
  url: string;
  fetchImpl: typeof fetch;
  clock: () => Date;
  timeoutMs?: number;
  authorization?: string | null;
  accept: (status: number) => boolean;
}): Promise<HealthView> {
  const url = assertHttpUrl(options.url);
  const timeoutMs = options.timeoutMs ?? 5000;
  const started = options.clock();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { accept: '*/*', 'user-agent': 'Desk' };
  if (options.authorization) headers.authorization = options.authorization;

  try {
    const response = await options.fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
    const latencyMs = Math.max(0, options.clock().getTime() - started.getTime());
    const healthy = options.accept(response.status);
    return {
      status: healthy ? 'healthy' : 'unreachable',
      checkedAt: options.clock().toISOString(),
      latencyMs,
      message: healthy
        ? `Responded with HTTP ${response.status} in ${latencyMs}ms.`
        : `Responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    const latencyMs = Math.max(0, options.clock().getTime() - started.getTime());
    const aborted = error instanceof Error && error.name === 'AbortError';
    const reason = aborted
      ? `Timed out after ${timeoutMs}ms.`
      : error instanceof Error
        ? error.message
        : 'The request failed.';
    return {
      status: 'unreachable',
      checkedAt: options.clock().toISOString(),
      latencyMs,
      message: `Could not reach the endpoint. ${reason}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function requireUrl(config: Record<string, string>): string {
  if (!config.url) throw new DeskError('URL is required.', 'bad_url');
  return assertHttpUrl(config.url);
}
