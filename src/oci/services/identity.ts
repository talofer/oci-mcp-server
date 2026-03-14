import * as OCI from 'oci-sdk';
import { getCompartmentId, getTenancyId } from '../client';
import { getIdentityClient } from '../client';
import logger from '../../utils/logger';

// ─── Identity Extended ────────────────────────────────────────────────────────

export class IdentityExtendedService {
  private client: OCI.identity.IdentityClient;
  private compartmentId: string;
  private tenancyId: string;

  constructor() {
    this.client = getIdentityClient();
    this.compartmentId = getCompartmentId();
    this.tenancyId = getTenancyId();
  }

  async listCompartments(compartmentId?: string) {
    try {
      const response = await this.client.listCompartments({
        compartmentId: compartmentId ?? this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing compartments', { error });
      throw error;
    }
  }

  async createCompartment(name: string, description: string, parentCompartmentId?: string) {
    try {
      const createCompartmentDetails: OCI.identity.models.CreateCompartmentDetails = {
        compartmentId: parentCompartmentId ?? this.compartmentId,
        name,
        description,
      };
      const response = await this.client.createCompartment({ createCompartmentDetails });
      return response.compartment;
    } catch (error) {
      logger.error(`Error creating compartment: ${name}`, { error });
      throw error;
    }
  }

  async listGroups() {
    try {
      const response = await this.client.listGroups({
        compartmentId: this.tenancyId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing groups', { error });
      throw error;
    }
  }

  async createGroup(name: string, description: string) {
    try {
      const createGroupDetails: OCI.identity.models.CreateGroupDetails = {
        compartmentId: this.tenancyId,
        name,
        description,
      };
      const response = await this.client.createGroup({ createGroupDetails });
      return response.group;
    } catch (error) {
      logger.error(`Error creating group: ${name}`, { error });
      throw error;
    }
  }

  async listPolicies(compartmentId?: string) {
    try {
      const response = await this.client.listPolicies({
        compartmentId: compartmentId ?? this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing policies', { error });
      throw error;
    }
  }

  async createPolicy(
    name: string,
    statements: string[],
    description: string,
    compartmentId?: string,
  ) {
    try {
      const createPolicyDetails: OCI.identity.models.CreatePolicyDetails = {
        compartmentId: compartmentId ?? this.compartmentId,
        name,
        statements,
        description,
      };
      const response = await this.client.createPolicy({ createPolicyDetails });
      return response.policy;
    } catch (error) {
      logger.error(`Error creating policy: ${name}`, { error });
      throw error;
    }
  }

  async listDynamicGroups() {
    try {
      const response = await this.client.listDynamicGroups({
        compartmentId: this.tenancyId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing dynamic groups', { error });
      throw error;
    }
  }
}
