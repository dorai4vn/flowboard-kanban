import type { IncomingMessage } from 'node:http';
import { loadEnv, type Plugin } from 'vite';

const ROUTES: Record<string, string> = {
  '/api/agent/chat': '/api/agent/chat.ts',
  '/api/agent/approval': '/api/agent/approval.ts',
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Dev-server only (`vite` / E2E): serves the same Vercel Function handlers from `api/agent/*` so the assistant
 * works locally. Not part of `vite build`. Server-side env (e.g. OPENAI_API_KEY) is read from the shell or
 * .env.local into process.env of the dev server only — never into the browser bundle (no VITE_ prefix).
 */
export function agentApiDev(): Plugin {
  return {
    name: 'flowboard-agent-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined && !k.startsWith('VITE_')) process.env[k] = v;
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const file = ROUTES[path];
        if (!file) return next();
        try {
          const mod = (await server.ssrLoadModule(file)) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const body = req.method === 'POST' ? await readBody(req) : undefined;
          const response = await handler(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.config.logger.error(`[agent-api] ${(err as Error).message}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Lỗi máy chủ cục bộ.' }));
        }
      });
    },
  };
}
