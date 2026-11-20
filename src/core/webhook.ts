import { DeskError } from './errors';

export interface WebhookPayload {
  source: 'desk';
  kind: 'connector-failure' | 'test';
  appName: string;
  at: string;
  message: string;
  connector?: {
    id: string;
    name: string;
    adapterId: string;
    status: string;
  };
}

export async function postWebhook(options: {
  fetchImpl: typeof fetch;
  url: string;
  authorization: string | null;
  body: WebhookPayload;
}): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'Desk',
  };
  if (options.authorization) headers.authorization = options.authorization;
  let response: Response;
  try {
    response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The webhook request failed.';
    throw new DeskError(`Could not reach the webhook. ${message}`, 'webhook_failed');
  }
  if (!response.ok) {
    throw new DeskError(`Webhook responded with HTTP ${response.status}.`, 'webhook_failed');
  }
}
