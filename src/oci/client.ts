import * as OCI from 'oci-sdk';
import { getOCIConfig, getPrivateKey } from './config';
export { getCompartmentId } from './config';
import logger from '../utils/logger';

// ─── OCI auth provider ────────────────────────────────────────────────────────

const createOCIConfig = (): OCI.common.AuthenticationDetailsProvider => {
  try {
    const config = getOCIConfig();
    return new OCI.common.SimpleAuthenticationDetailsProvider(
      config.tenancy,
      config.user,
      config.fingerprint,
      getPrivateKey(),
      null,
      OCI.common.Region.fromRegionId(config.region),
    );
  } catch (error) {
    logger.error('Error creating OCI configuration', { error });
    throw new Error('Failed to initialize OCI configuration');
  }
};

// ─── Client factories ─────────────────────────────────────────────────────────

export const getComputeClient = (): OCI.core.ComputeClient => {
  const provider = createOCIConfig();
  return new OCI.core.ComputeClient({ authenticationDetailsProvider: provider });
};

export const getVirtualNetworkClient = (): OCI.core.VirtualNetworkClient => {
  const provider = createOCIConfig();
  return new OCI.core.VirtualNetworkClient({ authenticationDetailsProvider: provider });
};

export const getBlockStorageClient = (): OCI.core.BlockstorageClient => {
  const provider = createOCIConfig();
  return new OCI.core.BlockstorageClient({ authenticationDetailsProvider: provider });
};

export const getObjectStorageClient = (): OCI.objectstorage.ObjectStorageClient => {
  const provider = createOCIConfig();
  return new OCI.objectstorage.ObjectStorageClient({ authenticationDetailsProvider: provider });
};

export const getDatabaseClient = (): OCI.database.DatabaseClient => {
  const provider = createOCIConfig();
  return new OCI.database.DatabaseClient({ authenticationDetailsProvider: provider });
};
