import dotenv from 'dotenv';
dotenv.config();

import { configureOCIClient } from './oci/config';
import { serverConfig } from './config';
import logger from './utils/logger';
import app from './index';
import { startClaudeBridge } from './claude/bridge';

try {
  configureOCIClient();
} catch (error) {
  logger.error('Failed to configure OCI client', { error });
  process.exit(1);
}

app.listen(serverConfig.port, () => {
  logger.info(`MCP OCI Server started on port ${serverConfig.port}`);
  logger.info(`Environment: ${serverConfig.nodeEnv}`);

  // Start the Claude Desktop bridge
  startClaudeBridge();
});
