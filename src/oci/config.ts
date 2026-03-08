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

/** Returns the configured private key. */
export function getPrivateKey() {
  return ociConfig.privateKey;
}
