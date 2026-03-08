import express from 'express';
import cors from 'cors';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { setupMCPTools, MCPServiceInstance } from './mcp/service';
import { serverConfig } from './config';
import logger from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const MODEL = 'claude-sonnet-4-6';

// Lazy MCP service instantiation — created on first request after configureOCIClient() has run
let configuredMCPService: MCPServiceInstance | null = null;
function getMCPService(): MCPServiceInstance {
  if (!configuredMCPService) {
    configuredMCPService = setupMCPTools();
  }
  return configuredMCPService;
}

// Lazy Anthropic client
let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Cached tool definitions — derived from static data, no need to rebuild per request
let _anthropicTools: Anthropic.Tool[] | null = null;
let _toolMap: Map<string, { tool: string; function: string }> | null = null;

function getAnthropicTools(): Anthropic.Tool[] {
  if (_anthropicTools) return _anthropicTools;
  const result: Anthropic.Tool[] = [];
  for (const tool of getMCPService().getTools()) {
    for (const fn of tool.getFunctions()) {
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];
      for (const [paramName, paramDef] of Object.entries(fn.parameters)) {
        properties[paramName] = { type: paramDef.type, description: paramDef.description };
        if (paramDef.required) required.push(paramName);
      }
      result.push({
        name: fn.mcpName,
        description: fn.description,
        input_schema: { type: 'object', properties, required },
      });
    }
  }
  _anthropicTools = result;
  return _anthropicTools;
}

function getToolMap(): Map<string, { tool: string; function: string }> {
  if (_toolMap) return _toolMap;
  const map = new Map<string, { tool: string; function: string }>();
  for (const tool of getMCPService().getTools()) {
    for (const fn of tool.getFunctions()) {
      map.set(fn.mcpName, { tool: tool.name, function: fn.name });
    }
  }
  _toolMap = map;
  return _toolMap;
}

const SYSTEM_PROMPT =
  'You are an assistant that helps manage Oracle Cloud Infrastructure (OCI) resources. ' +
  'Use the available tools to fulfill user requests and respond in plain English with the results.';

// POST /chat — main chat endpoint used by the browser UI
app.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body as {
      message: string;
      history: Anthropic.MessageParam[];
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in .env' });
    }

    const anthropic = getAnthropicClient();
    const tools = getAnthropicTools();
    const toolMap = getToolMap();

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: message },
    ];

    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Tool-use loop: execute tools and feed results back until Claude stops
    while (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const ociTool = toolMap.get(block.name);
          let resultContent: string;
          if (ociTool) {
            const result = await getMCPService().process({
              tool: ociTool.tool,
              function: ociTool.function,
              parameters: block.input as Record<string, unknown>,
            });
            resultContent = JSON.stringify(result.content ?? result.error);
          } else {
            resultContent = `Unknown tool: ${block.name}`;
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
        }
      }

      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });
    }

    // Push final assistant message so the client can replay the full history next time
    messages.push({ role: 'assistant', content: response.content });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return res.json({ reply, history: messages });
  } catch (error) {
    logger.error('Error processing /chat request', { error });
    return res.status(500).json({ error: (error as Error).message });
  }
});

// Legacy MCP protocol endpoint
app.post('/mcp', async (req, res) => {
  try {
    const { tool, function: fn, parameters } = req.body as {
      tool?: string;
      function?: string;
      parameters?: Record<string, unknown>;
    };

    if (!tool || !fn) {
      return res.status(400).json({ status: 'error', error: 'Missing required fields: tool, function' });
    }

    logger.info('Received MCP request', { tool, function: fn });
    const response = await getMCPService().process({ tool, function: fn, parameters: parameters ?? {} });
    logger.info('MCP response processed', { response });
    return res.json(response);
  } catch (error) {
    logger.error('Error processing MCP request', { error });
    return res.status(500).json({
      status: 'error',
      error: `Internal server error: ${(error as Error).message}`,
    });
  }
});

process.on('SIGTERM', () => { logger.info('SIGTERM signal received, shutting down gracefully'); process.exit(0); });
process.on('SIGINT', () => { logger.info('SIGINT signal received, shutting down gracefully'); process.exit(0); });
process.on('uncaughtException', (error) => { logger.error('Uncaught exception', { error }); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason }); process.exit(1); });

export { serverConfig };
export default app;
