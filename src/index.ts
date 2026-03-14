import express from 'express';
import cors from 'cors';
import path from 'path';
import { serverConfig } from './config';
import logger from './utils/logger';
import { mcpServer } from './mcp/service';
import { handleChat, PendingTool } from './chat/handler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── Static web UI ────────────────────────────────────────────────────────────

// STATIC_DIR is set by the Electron main when running as a bundled desktop app
// (esbuild collapses all __dirname to the bundle's output dir, so the relative
// path must be overridden).  Falls back to the standard compiled location for
// CLI / dev-server usage.
app.use(express.static(process.env.STATIC_DIR ?? path.join(__dirname, '../public')));

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
  const { message, history, pendingTool } = req.body as {
    message?: unknown;
    history?: unknown;
    pendingTool?: PendingTool;
  };

  // __CONFIRM__ / __CANCEL__ are internal sentinel values sent by the UI when
  // the user clicks Confirm or Cancel on a pending write operation.
  const isResume = message === '__CONFIRM__' || message === '__CANCEL__';

  if (!message || typeof message !== 'string' || (!isResume && message.trim().length === 0)) {
    res.status(400).json({ error: 'message must be a non-empty string' });
    return;
  }

  const safeHistory = Array.isArray(history) ? history : [];

  // Validate pendingTool shape to prevent injection of arbitrary input.
  const safePendingTool: PendingTool | undefined =
    pendingTool &&
    typeof pendingTool === 'object' &&
    typeof pendingTool.id === 'string' &&
    typeof pendingTool.name === 'string' &&
    typeof pendingTool.input === 'object'
      ? pendingTool
      : undefined;

  if (isResume) {
    logger.info('Chat resume', { action: message, tool: safePendingTool?.name });
  } else {
    logger.info('Chat request', { preview: (message as string).slice(0, 80) });
  }

  await handleChat(message.trim(), safeHistory, res, safePendingTool);
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
