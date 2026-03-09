#!/usr/bin/env node
/**
 * CLI entry-point for the OCI MCP Server.
 *
 * Usage:
 *   node dist/cli.js                 # loads .env from cwd
 *   node dist/cli.js /path/to/.env   # loads a custom .env file
 *   node dist/cli.js config.json     # loads a JSON config file
 *
 * All six OCI env vars must be set before the server starts:
 *   OCI_USER_OCID, OCI_TENANCY_OCID, OCI_REGION,
 *   OCI_FINGERPRINT, OCI_KEY_FILE, OCI_COMPARTMENT_ID
 *   ANTHROPIC_API_KEY
 */

// Use require() so config is loaded BEFORE index.ts is evaluated
// (TypeScript compiles import statements as hoisted requires, but plain
//  require() calls execute in source order).
/* eslint-disable @typescript-eslint/no-require-imports */
const dotenv  = require('dotenv')  as typeof import('dotenv');
const fs      = require('fs')      as typeof import('fs');
const path    = require('path')    as typeof import('path');

// ─── Load configuration ───────────────────────────────────────────────────────

const configArg  = process.argv[2] || '.env';
const configPath = path.resolve(configArg);

if (fs.existsSync(configPath)) {
  const ext = path.extname(configPath).toLowerCase();

  if (ext === '.json') {
    // JSON config file  ──  e.g. { "OCI_USER_OCID": "...", ... }
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, string>;
      // Support both flat keys (OCI_USER_OCID) and camelCase aliases
      const map: Record<string, string[]> = {
        OCI_USER_OCID:      ['OCI_USER_OCID', 'user', 'userOcid'],
        OCI_TENANCY_OCID:   ['OCI_TENANCY_OCID', 'tenancy', 'tenancyOcid'],
        OCI_REGION:         ['OCI_REGION', 'region'],
        OCI_FINGERPRINT:    ['OCI_FINGERPRINT', 'fingerprint'],
        OCI_KEY_FILE:       ['OCI_KEY_FILE', 'keyFile', 'key_file'],
        OCI_COMPARTMENT_ID: ['OCI_COMPARTMENT_ID', 'compartmentId', 'compartment_id'],
        ANTHROPIC_API_KEY:  ['ANTHROPIC_API_KEY'],
      };
      for (const [envKey, aliases] of Object.entries(map)) {
        const found = aliases.find(a => data[a]);
        if (found && !process.env[envKey]) process.env[envKey] = data[found];
      }
    } catch (err) {
      console.error(`Failed to parse JSON config: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    // .env file (default)
    dotenv.config({ path: configPath });
  }
} else {
  // No config file found — fall back to process environment
  dotenv.config();
}

// ─── Validate required variables ──────────────────────────────────────────────

const REQUIRED = [
  'OCI_USER_OCID',
  'OCI_TENANCY_OCID',
  'OCI_REGION',
  'OCI_FINGERPRINT',
  'OCI_KEY_FILE',
  'OCI_COMPARTMENT_ID',
];

const missing = REQUIRED.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set them in your .env file or pass a config path as the first argument.');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('Warning: ANTHROPIC_API_KEY is not set — the /chat endpoint will not work.');
}

// ─── Start the HTTP server ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: app }    = require('./index')    as { default: import('express').Application };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { serverConfig }    = require('./config')   as { serverConfig: { port: number } };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: logger } = require('./utils/logger') as { default: import('winston').Logger };

app.listen(serverConfig.port, () => {
  logger.info(`OCI MCP Server running on port ${serverConfig.port}`);
  logger.info(`Web UI:          http://localhost:${serverConfig.port}`);
  logger.info(`MCP endpoint:    http://localhost:${serverConfig.port}/mcp`);
});
