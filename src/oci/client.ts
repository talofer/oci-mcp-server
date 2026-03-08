import * as OCI from 'oci-sdk';
import { getOCIConfig, getPrivateKey } from './config';
export { getCompartmentId } from './config';
import logger from '../utils/logger';

let _provider: OCI.common.SimpleAuthenticationDetailsProvider | null = null;

function getProvider(): OCI.common.SimpleAuthenticationDetailsProvider {
  if (_provider) return _provider;
  try {
    const config = getOCIConfig();
    _provider = new OCI.common.SimpleAuthenticationDetailsProvider(
      config.tenancy,
      config.user,
      config.fingerprint,
      getPrivateKey(),
      null,
      OCI.common.Region.fromRegionId(config.region)
    );
    return _provider;
  } catch (error) {
    logger.error('Error creating OCI configuration', { error });
    throw new Error('Failed to initialize OCI configuration');
  }
}

export const getComputeClient = (): OCI.core.ComputeClient =>
  new OCI.core.ComputeClient({ authenticationDetailsProvider: getProvider() });

export const getVirtualNetworkClient = (): OCI.core.VirtualNetworkClient =>
  new OCI.core.VirtualNetworkClient({ authenticationDetailsProvider: getProvider() });

export const getBlockStorageClient = (): OCI.core.BlockstorageClient =>
  new OCI.core.BlockstorageClient({ authenticationDetailsProvider: getProvider() });

export const getObjectStorageClient = (): OCI.objectstorage.ObjectStorageClient =>
  new OCI.objectstorage.ObjectStorageClient({ authenticationDetailsProvider: getProvider() });

export const getDatabaseClient = (): OCI.database.DatabaseClient =>
  new OCI.database.DatabaseClient({ authenticationDetailsProvider: getProvider() });
