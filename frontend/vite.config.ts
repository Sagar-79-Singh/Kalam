import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Development-only same-origin bridge. The desktop build uses gateway.go instead.
function previewGateway(): Plugin {
  return {
    name: 'preview-gateway',
    configureServer(server) {
      server.middlewares.use('/api', async (req: IncomingMessage, res: ServerResponse) => {
        const controller = new AbortController();
        res.on('close', () => controller.abort());
        try {
          const config = JSON.parse(decodeURIComponent(String(req.headers['x-kalam-config'] || '%7B%7D'))) as Record<string, string>;
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
          const rawBody = Buffer.concat(chunks).toString();
          const path = req.url?.split('?')[0];
          let target = ''; let method = req.method || 'POST'; let body: string | undefined = rawBody || undefined;
          const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
          if (path === '/omniroute' || path === '/models') {
            const base = new URL(config.baseUrl);
            if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Use an HTTP(S) OmniRoute Base URL.');
            let root = base.pathname.replace(/\/$/, '').replace(/\/(chat\/completions|messages|models)$/, '') || '/v1';
            const format = String(req.headers['x-kalam-format'] || config.apiFormat || 'chat');
            root += path === '/models' ? '/models' : format === 'messages' ? '/messages' : '/chat/completions';
            base.pathname = root; target = base.toString();
            if (path === '/models') { method = 'GET'; body = undefined; }
            if (config.apiKey) { headers.Authorization = `Bearer ${config.apiKey}`; headers['x-api-key'] = config.apiKey; }
            if (format === 'messages') headers['anthropic-version'] = '2023-06-01';
          } else if (path === '/search') {
            if (!config.searchEndpoint) throw new Error('Set a search endpoint in Settings first.');
            const { query } = JSON.parse(rawBody) as { query: string };
            target = config.searchEndpoint.replaceAll('{query}', encodeURIComponent(query));
            method = config.searchMethod || 'GET';
            if (method === 'GET') { body = undefined; if (!config.searchEndpoint.includes('{query}')) { const u = new URL(target); u.searchParams.set('q', query); target = u.toString(); } }
            else body = JSON.stringify({ q: query, query });
            if (config.searchApiKey) headers.Authorization = `Bearer ${config.searchApiKey}`;
          } else if (path?.startsWith('/mcp/')) {
            target = config.connectorUrl;
            if (config.authHeader && config.authValue) headers[config.authHeader] = config.authValue;
            for (const key of ['mcp-session-id', 'mcp-protocol-version', 'last-event-id']) if (req.headers[key]) headers[key] = String(req.headers[key]);
          } else { res.writeHead(404); res.end(); return; }
          if (!/^https?:\/\//i.test(target)) throw new Error('Configure a valid HTTP(S) endpoint in Settings.');
          const upstream = await fetch(target, { method, body, headers, signal: controller.signal, redirect: 'error' });
          for (const key of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) { const value = upstream.headers.get(key); if (value) res.setHeader(key, value); }
          res.setHeader('Cache-Control', 'no-store'); res.writeHead(upstream.status);
          if (upstream.body) for await (const chunk of upstream.body) { if (!res.write(chunk)) await new Promise<void>(resolve => res.once('drain', resolve)); }
          res.end();
        } catch (error) {
          if (res.destroyed) return;
          if (!res.headersSent) { res.setHeader('Content-Type', 'application/json'); res.writeHead(502); }
          res.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : 'Endpoint could not be reached.' } }));
        }
      });
    }
  };
}
export default defineConfig({
  plugins: [react(), previewGateway()],
  clearScreen: false,
  server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800, rollupOptions: { output: { manualChunks: { markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight'] } } } }
});
