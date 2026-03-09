import dotenv from 'dotenv';
dotenv.config();

import { configureOCIClient } from './oci/config';
import { serverConfig } from './config';
import logger from './utils/logger';
import app from './index';

// Validate OCI config eagerly at startup (better than failing on first request)
try {
  configureOCIClient();
} catch (error) {
  logger.error('Failed to configure OCI client', { error });
  process.exit(1);
}

app.listen(serverConfig.port, () => {
  logger.info(`OCI MCP Server running on port ${serverConfig.port}`);
  logger.info(`Web UI:          http://localhost:${serverConfig.port}`);
  logger.info(`MCP endpoint:    http://localhost:${serverConfig.port}/mcp`);
  logger.info(`Environment:     ${serverConfig.nodeEnv}`);
});
