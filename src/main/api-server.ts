import { readFileSync } from 'node:fs';
import http from 'node:http';
import { logoContentType } from '../core/branding';
import type { Desk } from '../core/desk';
import { DEV_RENDERER_PORT } from '../shared/app';

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return (
    origin === `http://127.0.0.1:${DEV_RENDERER_PORT}` ||
    origin === `http://localhost:${DEV_RENDERER_PORT}`
  );
}

export function startApiServer(desk: Desk, host: string, preferredPort: number): Promise<number> {
  const server = http.createServer(async (req, res) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (!originAllowed(origin)) {
      send(res, 403, { ok: false, error: 'Origin is not allowed.' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.statusCode = 204;
      res.end();
      return;
    }
    try {
      const requestPath = req.url?.split('?')[0];
      if (req.method === 'GET' && requestPath === '/api/health') {
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === 'GET' && requestPath === '/api/logo') {
        const logo = desk.logoFilePath();
        if (!logo) {
          send(res, 404, { ok: false, error: 'No logo has been set.' });
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', logoContentType(logo));
        res.setHeader('cache-control', 'no-store');
        res.end(readFileSync(logo));
        return;
      }
      if (req.method === 'POST' && requestPath === '/api/command') {
        const command: unknown = JSON.parse(await readBody(req));
        send(res, 200, await desk.handle(command));
        return;
      }
      send(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bad request.';
      send(res, 400, { ok: false, error: message });
    }
  });

  return listen(server, host, preferredPort, 8);
}

function listen(server: http.Server, host: string, port: number, attemptsLeft: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
        resolve(listen(server, host, port + 1, attemptsLeft - 1));
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}
