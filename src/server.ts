import dotenv from 'dotenv';
dotenv.config();

import { configureOCIClient } from './oci/config';
import { serverConfig } from './config';
import logger from './utils/logger';
import { checkOCIDocsForUpdates } from './utils/doc-checker';
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

  // Non-blocking: check OCI docs for updates in the background
  checkOCIDocsForUpdates().catch((err) =>
    logger.warn('OCI docs version check failed', { err }),
  );
});
