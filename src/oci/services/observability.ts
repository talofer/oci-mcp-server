import * as OCI from 'oci-sdk';
import { getCompartmentId } from '../client';
import {
  getLoggingManagementClient,
  getMonitoringClient,
  getNotificationsControlPlaneClient,
  getNotificationsDataPlaneClient,
  getEventsClient,
  getServiceConnectorClient,
} from '../client';
import logger from '../../utils/logger';

// ─── Observability ────────────────────────────────────────────────────────────

export class ObservabilityService {
  private loggingClient: OCI.logging.LoggingManagementClient;
  private monitoringClient: OCI.monitoring.MonitoringClient;
  private notificationsClient: OCI.ons.NotificationControlPlaneClient;
  private notificationsDataClient: OCI.ons.NotificationDataPlaneClient;
  private eventsClient: OCI.events.EventsClient;
  private schClient: OCI.sch.ServiceConnectorClient;
  private compartmentId: string;

  constructor() {
    this.loggingClient = getLoggingManagementClient();
    this.monitoringClient = getMonitoringClient();
    this.notificationsClient = getNotificationsControlPlaneClient();
    this.notificationsDataClient = getNotificationsDataPlaneClient();
    this.eventsClient = getEventsClient();
    this.schClient = getServiceConnectorClient();
    this.compartmentId = getCompartmentId();
  }

  // ─── Logging Management ─────────────────────────────────────────────────────

  async listLogGroups() {
    try {
      const response = await this.loggingClient.listLogGroups({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing log groups', { error });
      throw error;
    }
  }

  async createLogGroup(displayName: string, description?: string) {
    try {
      const createLogGroupDetails: OCI.logging.models.CreateLogGroupDetails = {
        compartmentId: this.compartmentId,
        displayName,
        ...(description !== undefined && { description }),
      };
      const response = await this.loggingClient.createLogGroup({ createLogGroupDetails });
      // createLogGroup is async — returns a work request, not the resource directly
      return { id: response.opcWorkRequestId, displayName, lifecycleState: 'CREATING' };
    } catch (error) {
      logger.error(`Error creating log group: ${displayName}`, { error });
      throw error;
    }
  }

  async listLogs(logGroupId: string) {
    try {
      const response = await this.loggingClient.listLogs({ logGroupId });
      return response.items;
    } catch (error) {
      logger.error(`Error listing logs for log group: ${logGroupId}`, { error });
      throw error;
    }
  }

  async createLog(
    logGroupId: string,
    displayName: string,
    logType: 'CUSTOM' | 'SERVICE' = 'CUSTOM',
  ) {
    try {
      const createLogDetails: OCI.logging.models.CreateLogDetails = {
        displayName,
        logType: logType as OCI.logging.models.CreateLogDetails.LogType,
        isEnabled: true,
      };
      const response = await this.loggingClient.createLog({ logGroupId, createLogDetails });
      // createLog is async — returns a work request, not the resource directly
      return { id: response.opcWorkRequestId, displayName, logType, lifecycleState: 'CREATING' };
    } catch (error) {
      logger.error(`Error creating log: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Monitoring ─────────────────────────────────────────────────────────────

  async listAlarms(compartmentId?: string) {
    try {
      const response = await this.monitoringClient.listAlarms({
        compartmentId: compartmentId ?? this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing alarms', { error });
      throw error;
    }
  }

  async createAlarm(
    displayName: string,
    namespace: string,
    query: string,
    severity: string,
    destinations: string[],
  ) {
    try {
      const effectiveCompartmentId = this.compartmentId;
      const createAlarmDetails: OCI.monitoring.models.CreateAlarmDetails = {
        compartmentId: effectiveCompartmentId,
        displayName,
        metricCompartmentId: effectiveCompartmentId,
        namespace,
        query,
        severity,
        destinations,
        isEnabled: true,
      };
      const response = await this.monitoringClient.createAlarm({ createAlarmDetails });
      return response.alarm;
    } catch (error) {
      logger.error(`Error creating alarm: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── ONS Notifications ──────────────────────────────────────────────────────

  async listTopics() {
    try {
      const response = await this.notificationsClient.listTopics({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing notification topics', { error });
      throw error;
    }
  }

  async createTopic(name: string, description?: string) {
    try {
      const createTopicDetails: OCI.ons.models.CreateTopicDetails = {
        compartmentId: this.compartmentId,
        name,
        ...(description !== undefined && { description }),
      };
      const response = await this.notificationsClient.createTopic({ createTopicDetails });
      return response.notificationTopic;
    } catch (error) {
      logger.error(`Error creating notification topic: ${name}`, { error });
      throw error;
    }
  }

  async createSubscription(topicId: string, protocol: string, endpoint: string) {
    try {
      const createSubscriptionDetails: OCI.ons.models.CreateSubscriptionDetails = {
        compartmentId: this.compartmentId,
        topicId,
        protocol,
        endpoint,
      };
      const response = await this.notificationsDataClient.createSubscription({
        createSubscriptionDetails,
      });
      return response.subscription;
    } catch (error) {
      logger.error(`Error creating subscription to topic: ${topicId}`, { error });
      throw error;
    }
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  async listRules() {
    try {
      const response = await this.eventsClient.listRules({
        compartmentId: this.compartmentId,
      });
      return response.items;
    } catch (error) {
      logger.error('Error listing event rules', { error });
      throw error;
    }
  }

  async createRule(
    displayName: string,
    description: string,
    condition: string,
    actions: Array<{
      actionType: string;
      topicId?: string;
      streamId?: string;
      isEnabled: boolean;
    }>,
  ) {
    try {
      const actionDetailsList: OCI.events.models.ActionDetails[] = actions.map((action) => ({
        actionType: action.actionType,
        isEnabled: action.isEnabled,
        ...(action.topicId !== undefined && { topicId: action.topicId }),
        ...(action.streamId !== undefined && { streamId: action.streamId }),
      }));

      const createRuleDetails: OCI.events.models.CreateRuleDetails = {
        compartmentId: this.compartmentId,
        displayName,
        description,
        isEnabled: true,
        condition,
        actions: {
          actions: actionDetailsList,
        },
      };
      const response = await this.eventsClient.createRule({ createRuleDetails });
      return response.rule;
    } catch (error) {
      logger.error(`Error creating event rule: ${displayName}`, { error });
      throw error;
    }
  }

  // ─── Service Connector Hub ──────────────────────────────────────────────────

  async listServiceConnectors() {
    try {
      const response = await this.schClient.listServiceConnectors({
        compartmentId: this.compartmentId,
      });
      return response.serviceConnectorCollection.items;
    } catch (error) {
      logger.error('Error listing service connectors', { error });
      throw error;
    }
  }
}
