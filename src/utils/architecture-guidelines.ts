/**
 * Architecture Guidelines Loader
 *
 * Reads the locally-cached OCI best practices reference at startup and injects
 * it into the Claude system prompt. This avoids per-request API calls and
 * minimises Claude token usage.
 *
 * The reference is updated in the background when Oracle docs change
 * (detected by doc-checker.ts). No Claude API calls are made for guidelines.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

const GUIDELINES_PATH = path.join(__dirname, '..', '..', 'data', 'oci-best-practices-reference.md');

let _cached: string | null = null;

/**
 * Synchronously read the best-practices reference from disk.
 * Returns empty string if the file doesn't exist yet (first run before refresh).
 * Result is cached in memory for the lifetime of the process.
 */
export function loadArchitectureGuidelines(): string {
  if (_cached !== null) return _cached;
  try {
    if (fs.existsSync(GUIDELINES_PATH)) {
      _cached = fs.readFileSync(GUIDELINES_PATH, 'utf8');
      logger.info('Architecture guidelines loaded from cache', {
        chars: _cached.length,
        path: GUIDELINES_PATH,
      });
    } else {
      logger.warn('Architecture guidelines cache not found — using built-in defaults', {
        path: GUIDELINES_PATH,
      });
      _cached = '';
    }
  } catch (err) {
    logger.warn('Failed to read architecture guidelines cache', { err });
    _cached = '';
  }
  return _cached;
}

/**
 * Invalidate the in-memory cache so the next call re-reads from disk.
 * Called by doc-checker when it detects updated Oracle docs.
 */
export function invalidateGuidelinesCache(): void {
  _cached = null;
  logger.info('Architecture guidelines cache invalidated — will reload on next access');
}
