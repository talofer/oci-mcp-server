import express from 'express';
import cors from 'cors';
import path from 'path';
import { serverConfig } from './config';
import logger from './utils/logger';
import { mcpServer } from './mcp/service';
import { handleChat } from './chat/handler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── Static web UI ────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '../public')));

// ─── Service info ─────────────────────────────────────────────────────────────

app.get('/api', (_req, res) => {
  res.json({
    name: 'MCP Oracle Cloud Infrastructure Server',
    version: '0.1.0',
    description: 'Natural language OCI management via Claude + MCP',
    endpoints: {
      'GET /':        'OCI Assistant web UI',
      'GET /api':     'Service info',
      'POST /mcp':    'MCP Streamable HTTP endpoint (for MCP clients)',
      'POST /chat':   'Natural language chat with OCI (SSE stream)',
    },
  });
});

// ─── MCP Streamable HTTP endpoint ─────────────────────────────────────────────
// Allows external MCP clients (e.g. Claude Desktop, other agents) to connect.

app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error('MCP HTTP request error', { error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP server error' });
    }
  }
});

// ─── Natural language chat endpoint (SSE) ─────────────────────────────────────

app.post('/chat', async (req, res) => {
  const { message, history } = req.body as { message?: unknown; history?: unknown };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'message must be a non-empty string' });
    return;
  }

  const safeHistory = Array.isArray(history) ? history : [];

  logger.info('Chat request', { preview: message.slice(0, 80) });
  await handleChat(message.trim(), safeHistory, res);
});

// ─── Graceful shutdown (registered here so all entry points get it) ───────────

process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT received, shutting down');  process.exit(0); });
process.on('uncaughtException',  (err)    => { logger.error('Uncaught exception',   { err });    process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason }); process.exit(1); });

// ─── Export app — entry points (cli.ts / server.ts) call app.listen() ─────────
// Do NOT call app.listen() here; importing this module must be side-effect free
// so that server.ts and cli.ts can each own the bind step.

export default app;
