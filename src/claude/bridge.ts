import express from 'express';
import cors from 'cors';
import { setupMCPTools, MCPServiceInstance, OciTool } from '../mcp/service';
import logger from '../utils/logger';

const PORT = process.env.CLAUDE_BRIDGE_PORT || 3001;

// Lazy service instantiation — created on first request after configureOCIClient() has run
let _mcpService: MCPServiceInstance | null = null;
function getMCPService(): MCPServiceInstance {
  if (!_mcpService) {
    _mcpService = setupMCPTools();
  }
  return _mcpService;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Claude Desktop - OCI MCP Bridge',
    version: '0.1.0',
    description: 'Bridge to connect Claude Desktop with Oracle Cloud Infrastructure using MCP',
    endpoints: {
      '/tools': 'Get available tools and functions',
      '/function': 'Execute functions',
    },
  });
});

// List all available tools and their functions
app.get('/tools', (req, res) => {
  try {
    const tools = getMCPService().getTools().reduce((acc, tool: OciTool) => {
      const functions = tool.getFunctions().reduce((funcAcc, func) => {
        const parameters: Record<string, string> = {};
        Object.entries(func.parameters || {}).forEach(([key, param]) => {
          parameters[key] = param.description;
        });
        funcAcc[func.name] = { description: func.description, parameters };
        return funcAcc;
      }, {} as Record<string, { description: string; parameters: Record<string, string> }>);

      acc[tool.name] = { description: tool.description, functions };
      return acc;
    }, {} as Record<string, { description: string; functions: Record<string, { description: string; parameters: Record<string, string> }> }>);

    res.json(tools);
  } catch (error) {
    logger.error('Error getting tools', { error });
    res.status(500).json({
      status: 'error',
      error: `Failed to get tools: ${(error as Error).message}`,
    });
  }
});

// Execute an MCP function
app.post('/function', async (req, res) => {
  try {
    const { tool, function: functionName, parameters } = req.body as {
      tool?: string;
      function?: string;
      parameters?: Record<string, unknown>;
    };

    logger.info('Function execution request', { tool, function: functionName });

    if (!tool || !functionName) {
      return res.status(400).json({ status: 'error', error: 'Missing tool or function name' });
    }

    const mcpResponse = await getMCPService().process({
      tool,
      function: functionName,
      parameters: parameters ?? {},
    });

    return res.json({
      status: mcpResponse.status,
      content: mcpResponse.content,
      error: mcpResponse.error,
    });
  } catch (error) {
    logger.error('Error executing function', { error });
    return res.status(500).json({
      status: 'error',
      error: `Failed to execute function: ${(error as Error).message}`,
    });
  }
});

export const startClaudeBridge = () => {
  app.listen(PORT, () => {
    logger.info(`Claude Desktop Bridge started on port ${PORT}`);
  });
};

export default app;
