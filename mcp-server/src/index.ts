#!/usr/bin/env node
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RuneClient } from './client.js';
import { registerTools } from './tools.js';

/**
 * Rune MCP server.
 *
 *   stdio (default) - one user: local MCP clients such as desktop assistants and code editors.
 *       RUNE_API_TOKEN=rune_pat_...  RUNE_BASE_URL=http://localhost:3000  node dist/index.js
 *
 *   --http - many users behind one endpoint (chat bots): every request must carry that
 *       user's own `Authorization: Bearer rune_pat_...`; nothing is stored between requests.
 *       RUNE_BASE_URL=https://rune.example.com  PORT=3333  node dist/index.js --http
 */

const BASE_URL = process.env.RUNE_BASE_URL || 'http://localhost:3000';

function createServer(client: RuneClient): McpServer {
  const server = new McpServer({ name: 'rune-mcp-server', version: '1.0.0' });
  registerTools(server, client);
  return server;
}

async function runStdio(): Promise<void> {
  const token = process.env.RUNE_API_TOKEN;
  if (!token) {
    console.error('RUNE_API_TOKEN is required in stdio mode. Create one in Rune under Settings > Integrations and API tokens.');
    process.exit(1);
  }
  await createServer(new RuneClient(BASE_URL, token)).connect(new StdioServerTransport());
  console.error(`rune-mcp-server (stdio) connected to ${BASE_URL}`);
}

function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(body));
}

function runHttp(): void {
  const port = Number(process.env.PORT || 3333);
  const host = process.env.HOST || '127.0.0.1';

  const httpServer = http.createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    if (path === '/healthz') return sendJson(res, 200, { ok: true });
    if (path !== '/mcp') return sendJson(res, 404, { error: 'Not found. The MCP endpoint is POST /mcp.' });
    if (req.method !== 'POST') {
      return sendJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server is stateless: use POST.' }, id: null }, { Allow: 'POST' });
    }

    const auth = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!auth) {
      return sendJson(res, 401, { error: 'Missing Authorization: Bearer <Rune API token>' }, { 'WWW-Authenticate': 'Bearer' });
    }

    try {
      const body = await readBody(req);
      // Stateless: a fresh server + transport per request, bound to this caller's token only.
      const server = createServer(new RuneClient(BASE_URL, auth[1]));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error('request failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Bad request' }, id: null });
    }
  });

  httpServer.listen(port, host, () => console.error(`rune-mcp-server (http) listening on http://${host}:${port}/mcp -> ${BASE_URL}`));
}

if (process.argv.includes('--http') || process.env.RUNE_MCP_TRANSPORT === 'http') runHttp();
else runStdio().catch((err) => { console.error('Fatal:', err); process.exit(1); });
