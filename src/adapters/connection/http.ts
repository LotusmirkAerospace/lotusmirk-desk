import type { HealthView } from '../../shared/types';
import { DeskError } from '../../core/errors';
import { secretAccount } from '../../core/secrets';
import { assertHttpUrl } from '../../core/validate';
import type { AdapterContext, ConnectionAdapter } from '../types';
import { probeHttp, requireUrl } from './http-probe';

async function authorizationFor(
  recordId: string,
  hasSecret: boolean,
  ctx: AdapterContext,
): Promise<string | null> {
  if (!hasSecret) return null;
  const secret = await ctx.secrets.get(secretAccount(recordId));
  if (!secret) {
    throw new DeskError('The saved credential could not be read from the OS keychain.', 'no_keychain');
  }
  return secret;
}

export const httpConnectionAdapter: ConnectionAdapter = {
  id: 'http',
  label: 'HTTP endpoint',
  description: 'GET a URL and treat a 2xx response as healthy. Use this for a local MCP HTTP server or any health page.',
  implemented: true,
  fields: [
    {
      key: 'url',
      label: 'URL',
      placeholder: 'http://127.0.0.1:7331/health',
      required: true,
      input: 'text',
      help: 'Desk sends a GET and waits up to 5 seconds.',
    },
  ],
  secret: {
    label: 'Authorization header',
    help: 'Optional. Sent as the Authorization header and stored in the OS keychain.',
  },
  validate(config) {
    assertHttpUrl(config.url);
  },
  async check(record, ctx): Promise<HealthView> {
    const url = requireUrl(record.config);
    const authorization = await authorizationFor(record.id, record.hasSecret, ctx);
    return probeHttp({
      url,
      fetchImpl: ctx.fetchImpl,
      clock: ctx.clock,
      authorization,
      accept: (status) => status >= 200 && status < 300,
    });
  },
  reconnect(record, ctx) {
    return this.check(record, ctx);
  },
};
