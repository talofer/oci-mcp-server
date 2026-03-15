/**
 * Legacy Claude Desktop Bridge
 *
 * This file is superseded by the /chat SSE endpoint in src/index.ts, which
 * provides direct natural-language OCI management through the web UI.
 * Kept as a stub so the module reference compiles cleanly.
 */
import logger from '../utils/logger';

/** @deprecated Use the POST /chat SSE endpoint instead. */
export const startClaudeBridge = (): void => {
  logger.warn('Claude Desktop Bridge is deprecated. Use the /chat SSE endpoint instead.');
};

export default { startClaudeBridge };
