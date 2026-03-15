import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// Stores the active OCI configuration after configureOCIClient() is called
let ociConfig = {
  user: '',
  tenancy: '',
  region: '',
  fingerprint: '',
  keyFile: '',
  compartmentId: '',
  privateKey: '',
};

/**
 * Loads OCI configuration from environment variables and reads the private key from disk.
 */
export function configureOCIClient() {
  try {
    // Read configuration from environment variables
    ociConfig.user = process.env.OCI_USER_OCID || '';
    ociConfig.tenancy = process.env.OCI_TENANCY_OCID || '';
    ociConfig.region = process.env.OCI_REGION || '';
    ociConfig.fingerprint = process.env.OCI_FINGERPRINT || '';
    ociConfig.keyFile = process.env.OCI_KEY_FILE || '';
    ociConfig.compartmentId = process.env.OCI_COMPARTMENT_ID || '';

    if (!ociConfig.user || !ociConfig.tenancy || !ociConfig.region ||
        !ociConfig.fingerprint || !ociConfig.keyFile || !ociConfig.compartmentId) {
      throw new Error('Missing required OCI configuration variables');
    }

    // Read the private key from disk
    try {
      const keyFilePath = path.resolve(ociConfig.keyFile);
      ociConfig.privateKey = fs.readFileSync(keyFilePath, 'utf8');
      logger.info('OCI configuration loaded successfully');
    } catch (error) {
      throw new Error(`Failed to read private key file: ${(error as Error).message}`);
    }

    return ociConfig;
  } catch (error) {
    logger.error('Error configuring OCI client', { error });
    throw error;
  }
}

/** Returns a copy of the current OCI configuration. */
export function getOCIConfig() {
  return { ...ociConfig };
}

/** Returns the configured compartment ID. */
export function getCompartmentId() {
  return ociConfig.compartmentId;
}

/** Returns the configured tenancy OCID. */
export function getTenancyId() {
  return ociConfig.tenancy;
}

/** Returns the configured private key. */
export function getPrivateKey() {
  return ociConfig.privateKey;
}

/**
 * Returns a summary of the current OCI configuration safe for the browser —
 * the private key content is excluded; only the file path is returned.
 */
export function getConfigSummary() {
  return {
    user:          ociConfig.user,
    tenancy:       ociConfig.tenancy,
    region:        ociConfig.region,
    fingerprint:   ociConfig.fingerprint,
    keyFile:       ociConfig.keyFile,
    compartmentId: ociConfig.compartmentId,
    configured:    !!(ociConfig.user && ociConfig.tenancy && ociConfig.region),
  };
}

/**
 * Updates the in-memory OCI configuration at runtime (no server restart needed).
 * Only fields that are present in `overrides` are changed.
 * Because OCI clients are not cached (created fresh per request), the new values
 * take effect on the very next OCI API call.
 */
export async function updateOCIConfig(overrides: {
  user?: string;
  tenancy?: string;
  region?: string;
  fingerprint?: string;
  keyFile?: string;
  compartmentId?: string;
}): Promise<void> {
  if (overrides.user)          { ociConfig.user          = overrides.user;          process.env.OCI_USER_OCID      = overrides.user; }
  if (overrides.tenancy)       { ociConfig.tenancy       = overrides.tenancy;       process.env.OCI_TENANCY_OCID   = overrides.tenancy; }
  if (overrides.region)        { ociConfig.region        = overrides.region;        process.env.OCI_REGION         = overrides.region; }
  if (overrides.fingerprint)   { ociConfig.fingerprint   = overrides.fingerprint;   process.env.OCI_FINGERPRINT    = overrides.fingerprint; }
  if (overrides.compartmentId) { ociConfig.compartmentId = overrides.compartmentId; process.env.OCI_COMPARTMENT_ID = overrides.compartmentId; }
  if (overrides.keyFile) {
    ociConfig.keyFile = overrides.keyFile;
    process.env.OCI_KEY_FILE = overrides.keyFile;
    try {
      ociConfig.privateKey = fs.readFileSync(path.resolve(overrides.keyFile), 'utf8');
    } catch (err) {
      throw new Error(`Failed to read private key file at "${overrides.keyFile}": ${(err as Error).message}`);
    }
  }
  logger.info('OCI configuration updated at runtime', { region: ociConfig.region, user: ociConfig.user });
}
