#!/usr/bin/env node

import { configureOCIClient } from './oci/config';
import { startMCPServer } from './mcp/service';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const argv = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to .env or .json config file',
    default: '.env',
  })
  .option('user-ocid', { type: 'string' })
  .option('tenancy-ocid', { type: 'string' })
  .option('region', { type: 'string' })
  .option('fingerprint', { type: 'string' })
  .option('key-file', { type: 'string' })
  .option('compartment-id', { type: 'string' })
  .help()
  .parseSync();

function loadConfig() {
  const configPath = argv.config as string;

  if (fs.existsSync(configPath)) {
    const ext = path.extname(configPath);
    if (ext === '.json') {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      process.env.OCI_USER_OCID = data.userOcid || data.user || data.OCI_USER_OCID;
      process.env.OCI_TENANCY_OCID = data.tenancyOcid || data.tenancy || data.OCI_TENANCY_OCID;
      process.env.OCI_REGION = data.region || data.OCI_REGION;
      process.env.OCI_FINGERPRINT = data.fingerprint || data.OCI_FINGERPRINT;
      process.env.OCI_KEY_FILE = data.keyFile || data.OCI_KEY_FILE;
      process.env.OCI_COMPARTMENT_ID = data.compartmentId || data.OCI_COMPARTMENT_ID;
    } else {
      dotenv.config({ path: configPath });
    }
  }

  // CLI args override file config
  if (argv['user-ocid']) process.env.OCI_USER_OCID = argv['user-ocid'] as string;
  if (argv['tenancy-ocid']) process.env.OCI_TENANCY_OCID = argv['tenancy-ocid'] as string;
  if (argv.region) process.env.OCI_REGION = argv.region as string;
  if (argv.fingerprint) process.env.OCI_FINGERPRINT = argv.fingerprint as string;
  if (argv['key-file']) process.env.OCI_KEY_FILE = argv['key-file'] as string;
  if (argv['compartment-id']) process.env.OCI_COMPARTMENT_ID = argv['compartment-id'] as string;

  const missing = ['OCI_USER_OCID', 'OCI_TENANCY_OCID', 'OCI_REGION', 'OCI_FINGERPRINT', 'OCI_KEY_FILE', 'OCI_COMPARTMENT_ID']
    .filter(v => !process.env[v]);

  if (missing.length > 0) {
    process.stderr.write(`Missing OCI config: ${missing.join(', ')}\n`);
    process.exit(1);
  }
}

async function main() {
  loadConfig();
  configureOCIClient();
  await startMCPServer();
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
