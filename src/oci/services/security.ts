import * as OCI from 'oci-sdk';
import { getCompartmentId, getTenancyId, getOCIConfig } from '../config';
import { getCloudGuardClient, getVaultClient, getBastionClient } from '../client';
import logger from '../../utils/logger';

// ─── Security ─────────────────────────────────────────────────────────────────

export class SecurityService {
  private cloudGuardClient: OCI.cloudguard.CloudGuardClient;
  private vaultClient: OCI.keymanagement.KmsVaultClient;
  private bastionClient: OCI.bastion.BastionClient;
  private compartmentId: string;
  private tenancyId: string;

  constructor() {
    this.cloudGuardClient = getCloudGuardClient();
    this.vaultClient = getVaultClient();
    this.bastionClient = getBastionClient();
    this.compartmentId = getCompartmentId();
    this.tenancyId = getTenancyId();
  }

  // ─── Cloud Guard ────────────────────────────────────────────────────────────

  async getCloudGuardConfiguration() {
    try {
      const response = await this.cloudGuardClient.getConfiguration({
        compartmentId: this.tenancyId,
      });
      return response.configuration;
    } catch (error) {
      logger.error('Error getting Cloud Guard configuration', { error });
      throw error;
    }
  }

  async enableCloudGuard(status: 'ENABLED' | 'DISABLED') {
    try {
      const updateConfigurationDetails: OCI.cloudguard.models.UpdateConfigurationDetails = {
        reportingRegion: getOCIConfig().region,
        status: status as OCI.cloudguard.models.CloudGuardStatus,
        selfManageResources: false,
      };
      const response = await this.cloudGuardClient.updateConfiguration({
        compartmentId: this.tenancyId,
        updateConfigurationDetails,
      });
      return response.configuration;
    } catch (error) {
      logger.error(`Error updating Cloud Guard configuration to status: ${status}`, { error });
      throw error;
    }
  }

  async listCloudGuardTargets(compartmentId?: string) {
    try {
      const response = await this.cloudGuardClient.listTargets({
        compartmentId: compartmentId ?? this.compartmentId,
      });
      return response.targetCollection.items;
    } catch (error) {
      logger.error('Error listing Cloud Guard targets', { error });
      throw error;
    }
  }

  async createCloudGuardTarget(displayName: string, targetResourceId: string) {
    try {
      const createTargetDetails: OCI.cloudguard.models.CreateTargetDetails = {
        compartmentId: this.compartmentId,
        displayName,
        targetResourceType: OCI.cloudguard.models.TargetResourceType.Compartment,
        targetResourceId,
      };
      const response = await this.cloudGuardClient.createTarget({ createTargetDetails });
      return response.target;
    } catch (error) {
      logger.error(`Error creating Cloud Guard target: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Vault ──────────────────────────────────────────────────────────────────

  async listVaults() {
    try {
      const response = await this.vaultClient.listVaults({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing vaults', { error });
      throw error;
    }
  }

  async createVault(displayName: string, vaultType: string = 'DEFAULT') {
    try {
      const createVaultDetails: OCI.keymanagement.models.CreateVaultDetails = {
        compartmentId: this.compartmentId,
        displayName,
        vaultType: vaultType as OCI.keymanagement.models.CreateVaultDetails.VaultType,
      };
      const response = await this.vaultClient.createVault({ createVaultDetails });
      return response.vault;
    } catch (error) {
      logger.error(`Error creating vault: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Bastion ────────────────────────────────────────────────────────────────

  async listBastions() {
    try {
      const response = await this.bastionClient.listBastions({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing bastions', { error });
      throw error;
    }
  }

  async createBastion(
    name: string,
    targetSubnetId: string,
    clientCidrBlockAllowList: string[],
  ) {
    try {
      const createBastionDetails: OCI.bastion.models.CreateBastionDetails = {
        bastionType: 'STANDARD',
        compartmentId: this.compartmentId,
        targetSubnetId,
        name,
        clientCidrBlockAllowList,
      };
      const response = await this.bastionClient.createBastion({ createBastionDetails });
      return response.bastion;
    } catch (error) {
      logger.error(`Error creating bastion: ${name}`, { error });
      throw error;
    }
  }
}
