import * as OCI from 'oci-sdk';
import {
  getComputeClient,
  getVirtualNetworkClient,
  getBlockStorageClient,
  getObjectStorageClient,
  getDatabaseClient,
  getCompartmentId,
} from './client';
import logger from '../utils/logger';

export class ComputeService {
  private client: OCI.core.ComputeClient;
  private compartmentId: string;

  constructor() {
    this.client = getComputeClient();
    this.compartmentId = getCompartmentId();
  }

  async listInstances() {
    try {
      const items: OCI.core.models.Instance[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listInstances({ compartmentId: this.compartmentId, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
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

  async createInstance(
    displayName: string,
    shape: string,
    imageId: string,
    subnetId: string,
    availabilityDomain: string,
    metadata?: Record<string, string>,
    shapeConfig?: { ocpus?: number; memoryInGBs?: number },
    assignPublicIp = true
  ) {
    try {
      const launchDetails: OCI.core.models.LaunchInstanceDetails = {
        availabilityDomain,
        compartmentId: this.compartmentId,
        displayName,
        shape,
        sourceDetails: {
          sourceType: 'image',
          imageId,
        } as OCI.core.models.InstanceSourceViaImageDetails,
        createVnicDetails: { subnetId, assignPublicIp } as OCI.core.models.CreateVnicDetails,
        metadata,
      };
      if (shapeConfig) {
        launchDetails.shapeConfig = shapeConfig as OCI.core.models.LaunchInstanceShapeConfigDetails;
      }
      const response = await this.client.launchInstance({ launchInstanceDetails: launchDetails });
      return response.instance;
    } catch (error) {
      logger.error('Error creating compute instance', { error });
      throw error;
    }
  }
}

export class NetworkService {
  private client: OCI.core.VirtualNetworkClient;
  private compartmentId: string;

  constructor() {
    this.client = getVirtualNetworkClient();
    this.compartmentId = getCompartmentId();
  }

  async listVcns() {
    try {
      const items: OCI.core.models.Vcn[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listVcns({ compartmentId: this.compartmentId, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
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
      const items: OCI.core.models.Subnet[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listSubnets({ compartmentId: this.compartmentId, vcnId, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
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
    dnsLabel?: string
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
}

export class BlockStorageService {
  private client: OCI.core.BlockstorageClient;
  private compartmentId: string;

  constructor() {
    this.client = getBlockStorageClient();
    this.compartmentId = getCompartmentId();
  }

  async listVolumes() {
    try {
      const items: OCI.core.models.Volume[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listVolumes({ compartmentId: this.compartmentId, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
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
}

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
      return this.namespace as string;
    } catch (error) {
      logger.error('Error getting object storage namespace', { error });
      throw error;
    }
  }

  async listBuckets() {
    try {
      const namespaceName = await this.getNamespace();
      const items: OCI.objectstorage.models.BucketSummary[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listBuckets({ compartmentId: this.compartmentId, namespaceName, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
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
    publicAccessType = 'NoPublicAccess',
    storageTier = 'Standard'
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
}

export class DatabaseService {
  private client: OCI.database.DatabaseClient;
  private compartmentId: string;

  constructor() {
    this.client = getDatabaseClient();
    this.compartmentId = getCompartmentId();
  }

  async listAutonomousDatabases() {
    try {
      const items: OCI.database.models.AutonomousDatabaseSummary[] = [];
      let page: string | undefined;
      do {
        const response = await this.client.listAutonomousDatabases({ compartmentId: this.compartmentId, page });
        items.push(...response.items);
        page = response.opcNextPage;
      } while (page);
      return items;
    } catch (error) {
      logger.error('Error listing autonomous databases', { error });
      throw error;
    }
  }

  async getAutonomousDatabase(autonomousDatabaseId: string) {
    try {
      const response = await this.client.getAutonomousDatabase({ autonomousDatabaseId });
      return response.autonomousDatabase;
    } catch (error) {
      logger.error(`Error getting autonomous database: ${autonomousDatabaseId}`, { error });
      throw error;
    }
  }

  async createAutonomousDatabase(
    displayName: string,
    dbName: string,
    adminPassword: string,
    cpuCoreCount: number,
    dataStorageSizeInTBs: number,
    isFreeTier = false,
    dbWorkload = 'OLTP'
  ) {
    try {
      const details = {
        compartmentId: this.compartmentId,
        displayName,
        dbName,
        adminPassword,
        cpuCoreCount,
        dataStorageSizeInTBs,
        isFreeTier,
        dbWorkload: dbWorkload as OCI.database.models.CreateAutonomousDatabaseBase.DbWorkload,
        source: 'NONE' as const,
      };
      const response = await this.client.createAutonomousDatabase({
        createAutonomousDatabaseDetails: details,
      });
      return response.autonomousDatabase;
    } catch (error) {
      logger.error(`Error creating autonomous database: ${displayName}`, { error });
      throw error;
    }
  }
}
