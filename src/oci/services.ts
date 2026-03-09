import * as OCI from 'oci-sdk';
import {
  getComputeClient,
  getVirtualNetworkClient,
  getBlockStorageClient,
  getObjectStorageClient,
  getDatabaseClient,
  getIdentityClient,
  getCompartmentId,
  getTenancyId,
} from './client';
import logger from '../utils/logger';

// ─── Compute ──────────────────────────────────────────────────────────────────

export class ComputeService {
  private client: OCI.core.ComputeClient;
  private compartmentId: string;

  constructor() {
    this.client = getComputeClient();
    this.compartmentId = getCompartmentId();
  }

  async listInstances() {
    try {
      const response = await this.client.listInstances({ compartmentId: this.compartmentId });
      return response.items;
    } catch (error) {
      logger.error('Error listing compute instances', { error });
      throw error;
    }
  }

  async getInstance(instanceId: string) {
    try {
      const response = await this.client.getInstance({ instanceId });
      return response.instance;
    } catch (error) {
      logger.error(`Error getting compute instance: ${instanceId}`, { error });
      throw error;
    }
  }

  async listImages(operatingSystem?: string, shape?: string) {
    try {
      const response = await this.client.listImages({
        compartmentId: this.compartmentId,
        ...(operatingSystem && { operatingSystem }),
        ...(shape          && { shape }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing compute images', { error });
      throw error;
    }
  }

  async listShapes(availabilityDomain?: string) {
    try {
      const response = await this.client.listShapes({
        compartmentId: this.compartmentId,
        ...(availabilityDomain && { availabilityDomain }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing compute shapes', { error });
      throw error;
    }
  }

  async createInstance(
    displayName: string,
    shape: string,
    imageId: string,
    subnetId: string,
    availabilityDomain: string,
    metadata?: Record<string, string>,
    shapeConfig?: { ocpus?: number; memoryInGBs?: number },
  ) {
    try {
      const launchInstanceDetails: OCI.core.models.LaunchInstanceDetails = {
        availabilityDomain,
        compartmentId: this.compartmentId,
        displayName,
        shape,
        sourceDetails: {
          sourceType: 'image',
          imageId,
        } as OCI.core.models.InstanceSourceViaImageDetails,
        createVnicDetails: {
          subnetId,
          assignPublicIp: true,
        } as OCI.core.models.CreateVnicDetails,
        metadata,
        ...(shapeConfig && {
          shapeConfig: {
            ocpus: shapeConfig.ocpus,
            memoryInGBs: shapeConfig.memoryInGBs,
          } as OCI.core.models.LaunchInstanceShapeConfigDetails,
        }),
      };
      const response = await this.client.launchInstance({ launchInstanceDetails });
      return response.instance;
    } catch (error) {
      logger.error('Error creating compute instance', { error });
      throw error;
    }
  }

  async terminateInstance(instanceId: string, preserveBootVolume: boolean = false) {
    try {
      await this.client.terminateInstance({ instanceId, preserveBootVolume });
      logger.info(`Terminate request accepted for instance: ${instanceId}`);
      return { instanceId, status: 'TERMINATING', preserveBootVolume };
    } catch (error) {
      logger.error(`Error terminating compute instance: ${instanceId}`, { error });
      throw error;
    }
  }
}

// ─── Network ──────────────────────────────────────────────────────────────────

export class NetworkService {
  private client: OCI.core.VirtualNetworkClient;
  private compartmentId: string;

  constructor() {
    this.client = getVirtualNetworkClient();
    this.compartmentId = getCompartmentId();
  }

  async listVcns() {
    try {
      const response = await this.client.listVcns({ compartmentId: this.compartmentId });
      return response.items;
    } catch (error) {
      logger.error('Error listing VCNs', { error });
      throw error;
    }
  }

  async getVcn(vcnId: string) {
    try {
      const response = await this.client.getVcn({ vcnId });
      return response.vcn;
    } catch (error) {
      logger.error(`Error getting VCN: ${vcnId}`, { error });
      throw error;
    }
  }

  async createVcn(displayName: string, cidrBlock: string, dnsLabel?: string) {
    try {
      const createVcnDetails: OCI.core.models.CreateVcnDetails = {
        compartmentId: this.compartmentId,
        displayName,
        cidrBlock,
        dnsLabel,
      };
      const response = await this.client.createVcn({ createVcnDetails });
      return response.vcn;
    } catch (error) {
      logger.error('Error creating VCN', { error });
      throw error;
    }
  }

  async listSubnets(vcnId?: string) {
    try {
      const response = await this.client.listSubnets({
        compartmentId: this.compartmentId,
        vcnId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing subnets', { error });
      throw error;
    }
  }

  async createSubnet(
    displayName: string,
    vcnId: string,
    cidrBlock: string,
    availabilityDomain?: string,
    dnsLabel?: string,
  ) {
    try {
      const createSubnetDetails: OCI.core.models.CreateSubnetDetails = {
        compartmentId: this.compartmentId,
        displayName,
        vcnId,
        cidrBlock,
        availabilityDomain,
        dnsLabel,
      };
      const response = await this.client.createSubnet({ createSubnetDetails });
      return response.subnet;
    } catch (error) {
      logger.error('Error creating subnet', { error });
      throw error;
    }
  }

  async deleteVcn(vcnId: string) {
    try {
      await this.client.deleteVcn({ vcnId });
      logger.info(`Delete request accepted for VCN: ${vcnId}`);
      return { vcnId, status: 'DELETED' };
    } catch (error) {
      logger.error(`Error deleting VCN: ${vcnId}`, { error });
      throw error;
    }
  }

  async deleteSubnet(subnetId: string) {
    try {
      await this.client.deleteSubnet({ subnetId });
      logger.info(`Delete request accepted for subnet: ${subnetId}`);
      return { subnetId, status: 'DELETED' };
    } catch (error) {
      logger.error(`Error deleting subnet: ${subnetId}`, { error });
      throw error;
    }
  }
}

// ─── Block Storage ────────────────────────────────────────────────────────────

export class BlockStorageService {
  private client: OCI.core.BlockstorageClient;
  private compartmentId: string;

  constructor() {
    this.client = getBlockStorageClient();
    this.compartmentId = getCompartmentId();
  }

  async listVolumes() {
    try {
      const response = await this.client.listVolumes({ compartmentId: this.compartmentId });
      return response.items;
    } catch (error) {
      logger.error('Error listing volumes', { error });
      throw error;
    }
  }

  async getVolume(volumeId: string) {
    try {
      const response = await this.client.getVolume({ volumeId });
      return response.volume;
    } catch (error) {
      logger.error(`Error getting volume: ${volumeId}`, { error });
      throw error;
    }
  }

  async createVolume(displayName: string, availabilityDomain: string, sizeInGBs?: number) {
    try {
      const createVolumeDetails: OCI.core.models.CreateVolumeDetails = {
        compartmentId: this.compartmentId,
        displayName,
        availabilityDomain,
        sizeInGBs,
      };
      const response = await this.client.createVolume({ createVolumeDetails });
      return response.volume;
    } catch (error) {
      logger.error('Error creating volume', { error });
      throw error;
    }
  }

  async deleteVolume(volumeId: string) {
    try {
      await this.client.deleteVolume({ volumeId });
      logger.info(`Delete request accepted for volume: ${volumeId}`);
      return { volumeId, status: 'DELETED' };
    } catch (error) {
      logger.error(`Error deleting volume: ${volumeId}`, { error });
      throw error;
    }
  }
}

// ─── Object Storage ───────────────────────────────────────────────────────────

export class ObjectStorageService {
  private client: OCI.objectstorage.ObjectStorageClient;
  private compartmentId: string;
  private namespace: string | null = null;

  constructor() {
    this.client = getObjectStorageClient();
    this.compartmentId = getCompartmentId();
  }

  async getNamespace(): Promise<string> {
    if (this.namespace) return this.namespace;
    try {
      const response = await this.client.getNamespace({});
      this.namespace = response.value;
      return this.namespace;
    } catch (error) {
      logger.error('Error getting object storage namespace', { error });
      throw error;
    }
  }

  async listBuckets() {
    try {
      const namespaceName = await this.getNamespace();
      const response = await this.client.listBuckets({
        compartmentId: this.compartmentId,
        namespaceName,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing buckets', { error });
      throw error;
    }
  }

  async getBucket(bucketName: string) {
    try {
      const namespaceName = await this.getNamespace();
      const response = await this.client.getBucket({ namespaceName, bucketName });
      return response.bucket;
    } catch (error) {
      logger.error(`Error getting bucket: ${bucketName}`, { error });
      throw error;
    }
  }

  async createBucket(
    name: string,
    publicAccessType: string = 'NoPublicAccess',
    storageTier: string = 'Standard',
  ) {
    try {
      const namespaceName = await this.getNamespace();
      const createBucketDetails: OCI.objectstorage.models.CreateBucketDetails = {
        name,
        compartmentId: this.compartmentId,
        publicAccessType: publicAccessType as OCI.objectstorage.models.CreateBucketDetails.PublicAccessType,
        storageTier: storageTier as OCI.objectstorage.models.CreateBucketDetails.StorageTier,
      };
      const response = await this.client.createBucket({ namespaceName, createBucketDetails });
      return response.bucket;
    } catch (error) {
      logger.error(`Error creating bucket: ${name}`, { error });
      throw error;
    }
  }

  async deleteBucket(bucketName: string) {
    try {
      const namespaceName = await this.getNamespace();
      await this.client.deleteBucket({ namespaceName, bucketName });
      logger.info(`Delete request accepted for bucket: ${bucketName}`);
      return { bucketName, status: 'DELETED' };
    } catch (error) {
      logger.error(`Error deleting bucket: ${bucketName}`, { error });
      throw error;
    }
  }
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export class IdentityService {
  private client: OCI.identity.IdentityClient;
  private tenancyId: string;

  constructor() {
    this.client = getIdentityClient();
    // Availability domains are scoped to the tenancy OCID, not a compartment OCID
    this.tenancyId = getTenancyId();
  }

  async listAvailabilityDomains() {
    try {
      const response = await this.client.listAvailabilityDomains({
        compartmentId: this.tenancyId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing availability domains', { error });
      throw error;
    }
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

export class DatabaseService {
  private client: OCI.database.DatabaseClient;
  private compartmentId: string;

  constructor() {
    this.client = getDatabaseClient();
    this.compartmentId = getCompartmentId();
  }

  async listAutonomousDatabases() {
    try {
      const response = await this.client.listAutonomousDatabases({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing autonomous databases', { error });
      throw error;
    }
  }

  async getAutonomousDatabase(databaseId: string) {
    try {
      const response = await this.client.getAutonomousDatabase({
        autonomousDatabaseId: databaseId,
      });
      return response.autonomousDatabase;
    } catch (error) {
      logger.error(`Error getting autonomous database: ${databaseId}`, { error });
      throw error;
    }
  }

  async createAutonomousDatabase(
    displayName: string,
    dbName: string,
    adminPassword: string,
    cpuCoreCount: number,
    dataStorageSizeInTBs: number,
    isFreeTier: boolean = false,
    dbWorkload: string = 'OLTP',
  ) {
    try {
      // CreateAutonomousDatabaseDetails requires source discriminator = "NONE" for new DBs
      const createAutonomousDatabaseDetails: OCI.database.models.CreateAutonomousDatabaseDetails = {
        source: OCI.database.models.CreateAutonomousDatabaseDetails.source,
        compartmentId: this.compartmentId,
        displayName,
        dbName,
        adminPassword,
        cpuCoreCount,
        dataStorageSizeInTBs,
        isFreeTier,
        dbWorkload: dbWorkload as OCI.database.models.CreateAutonomousDatabaseBase.DbWorkload,
      };
      const response = await this.client.createAutonomousDatabase({
        createAutonomousDatabaseDetails,
      });
      return response.autonomousDatabase;
    } catch (error) {
      logger.error(`Error creating autonomous database: ${displayName}`, { error });
      throw error;
    }
  }

  async deleteAutonomousDatabase(databaseId: string) {
    try {
      await this.client.deleteAutonomousDatabase({ autonomousDatabaseId: databaseId });
      logger.info(`Delete request accepted for Autonomous Database: ${databaseId}`);
      return { databaseId, status: 'TERMINATING' };
    } catch (error) {
      logger.error(`Error deleting autonomous database: ${databaseId}`, { error });
      throw error;
    }
  }
}
