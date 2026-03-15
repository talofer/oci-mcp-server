import * as OCI from 'oci-sdk';
import { getCompartmentId } from '../client';
import { getVirtualNetworkClient } from '../client';
import logger from '../../utils/logger';

// ─── Network Extended ─────────────────────────────────────────────────────────

export class NetworkExtendedService {
  private client: OCI.core.VirtualNetworkClient;
  private compartmentId: string;

  constructor() {
    this.client = getVirtualNetworkClient();
    this.compartmentId = getCompartmentId();
  }

  // ─── Internet Gateways ──────────────────────────────────────────────────────

  async listInternetGateways(vcnId?: string) {
    try {
      const response = await this.client.listInternetGateways({
        compartmentId: this.compartmentId,
        ...(vcnId && { vcnId }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing internet gateways', { error });
      throw error;
    }
  }

  async createInternetGateway(displayName: string, vcnId: string, isEnabled: boolean = true) {
    try {
      const createInternetGatewayDetails: OCI.core.models.CreateInternetGatewayDetails = {
        compartmentId: this.compartmentId,
        vcnId,
        displayName,
        isEnabled,
      };
      const response = await this.client.createInternetGateway({ createInternetGatewayDetails });
      return response.internetGateway;
    } catch (error) {
      logger.error(`Error creating internet gateway: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── NAT Gateways ───────────────────────────────────────────────────────────

  async listNatGateways(vcnId?: string) {
    try {
      const response = await this.client.listNatGateways({
        compartmentId: this.compartmentId,
        ...(vcnId && { vcnId }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing NAT gateways', { error });
      throw error;
    }
  }

  async createNatGateway(displayName: string, vcnId: string) {
    try {
      const createNatGatewayDetails: OCI.core.models.CreateNatGatewayDetails = {
        compartmentId: this.compartmentId,
        vcnId,
        displayName,
      };
      const response = await this.client.createNatGateway({ createNatGatewayDetails });
      return response.natGateway;
    } catch (error) {
      logger.error(`Error creating NAT gateway: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Service Gateways ───────────────────────────────────────────────────────

  async listServiceGateways(vcnId?: string) {
    try {
      const response = await this.client.listServiceGateways({
        compartmentId: this.compartmentId,
        ...(vcnId && { vcnId }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing service gateways', { error });
      throw error;
    }
  }

  async createServiceGateway(displayName: string, vcnId: string) {
    try {
      const servicesResponse = await this.client.listServices({ limit: 100 });
      const services = servicesResponse.items.map(s => ({ serviceId: s.id }));

      const createServiceGatewayDetails: OCI.core.models.CreateServiceGatewayDetails = {
        compartmentId: this.compartmentId,
        vcnId,
        displayName,
        services,
      };
      const response = await this.client.createServiceGateway({ createServiceGatewayDetails });
      return response.serviceGateway;
    } catch (error) {
      logger.error(`Error creating service gateway: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Route Tables ───────────────────────────────────────────────────────────

  async listRouteTables(vcnId?: string) {
    try {
      const response = await this.client.listRouteTables({
        compartmentId: this.compartmentId,
        ...(vcnId && { vcnId }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing route tables', { error });
      throw error;
    }
  }

  async createRouteTable(
    displayName: string,
    vcnId: string,
    routeRules?: Array<{ destination: string; networkEntityId: string }>,
  ) {
    try {
      const mappedRouteRules: OCI.core.models.RouteRule[] = (routeRules ?? []).map(r => ({
        destination: r.destination,
        destinationType: OCI.core.models.RouteRule.DestinationType.CidrBlock,
        networkEntityId: r.networkEntityId,
      }));

      const createRouteTableDetails: OCI.core.models.CreateRouteTableDetails = {
        compartmentId: this.compartmentId,
        vcnId,
        displayName,
        routeRules: mappedRouteRules,
      };
      const response = await this.client.createRouteTable({ createRouteTableDetails });
      return response.routeTable;
    } catch (error) {
      logger.error(`Error creating route table: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Network Security Groups ────────────────────────────────────────────────

  async listNetworkSecurityGroups(vcnId?: string) {
    try {
      const response = await this.client.listNetworkSecurityGroups({
        compartmentId: this.compartmentId,
        ...(vcnId && { vcnId }),
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing network security groups', { error });
      throw error;
    }
  }

  async createNetworkSecurityGroup(displayName: string, vcnId: string) {
    try {
      const createNetworkSecurityGroupDetails: OCI.core.models.CreateNetworkSecurityGroupDetails = {
        compartmentId: this.compartmentId,
        vcnId,
        displayName,
      };
      const response = await this.client.createNetworkSecurityGroup({
        createNetworkSecurityGroupDetails,
      });
      return response.networkSecurityGroup;
    } catch (error) {
      logger.error(`Error creating network security group: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Dynamic Routing Gateways ───────────────────────────────────────────────

  async listDrgs() {
    try {
      const response = await this.client.listDrgs({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing DRGs', { error });
      throw error;
    }
  }

  async createDrg(displayName: string) {
    try {
      const createDrgDetails: OCI.core.models.CreateDrgDetails = {
        compartmentId: this.compartmentId,
        displayName,
      };
      const response = await this.client.createDrg({ createDrgDetails });
      return response.drg;
    } catch (error) {
      logger.error(`Error creating DRG: ${displayName}`, { error });
      throw error;
    }
  }
}
