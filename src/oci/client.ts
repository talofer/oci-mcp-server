import * as OCI from 'oci-sdk';
import { getOCIConfig, getPrivateKey } from './config';
export { getCompartmentId, getTenancyId } from './config';
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

export const getIdentityClient = (): OCI.identity.IdentityClient => {
  const provider = createOCIConfig();
  return new OCI.identity.IdentityClient({ authenticationDetailsProvider: provider });
};

export const getCloudGuardClient = (): OCI.cloudguard.CloudGuardClient => {
  const provider = createOCIConfig();
  return new OCI.cloudguard.CloudGuardClient({ authenticationDetailsProvider: provider });
};

export const getVaultClient = (): OCI.keymanagement.KmsVaultClient => {
  const provider = createOCIConfig();
  return new OCI.keymanagement.KmsVaultClient({ authenticationDetailsProvider: provider });
};

export const getBastionClient = (): OCI.bastion.BastionClient => {
  const provider = createOCIConfig();
  return new OCI.bastion.BastionClient({ authenticationDetailsProvider: provider });
};

export const getLoggingManagementClient = (): OCI.logging.LoggingManagementClient => {
  const provider = createOCIConfig();
  return new OCI.logging.LoggingManagementClient({ authenticationDetailsProvider: provider });
};

export const getMonitoringClient = (): OCI.monitoring.MonitoringClient => {
  const provider = createOCIConfig();
  return new OCI.monitoring.MonitoringClient({ authenticationDetailsProvider: provider });
};

export const getNotificationsControlPlaneClient = (): OCI.ons.NotificationControlPlaneClient => {
  const provider = createOCIConfig();
  return new OCI.ons.NotificationControlPlaneClient({ authenticationDetailsProvider: provider });
};

export const getNotificationsDataPlaneClient = (): OCI.ons.NotificationDataPlaneClient => {
  const provider = createOCIConfig();
  return new OCI.ons.NotificationDataPlaneClient({ authenticationDetailsProvider: provider });
};

export const getEventsClient = (): OCI.events.EventsClient => {
  const provider = createOCIConfig();
  return new OCI.events.EventsClient({ authenticationDetailsProvider: provider });
};

export const getServiceConnectorClient = (): OCI.sch.ServiceConnectorClient => {
  const provider = createOCIConfig();
  return new OCI.sch.ServiceConnectorClient({ authenticationDetailsProvider: provider });
};

export const getResourceManagerClient = (): OCI.resourcemanager.ResourceManagerClient => {
  const provider = createOCIConfig();
  return new OCI.resourcemanager.ResourceManagerClient({ authenticationDetailsProvider: provider });
};
