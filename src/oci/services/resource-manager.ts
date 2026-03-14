import * as OCI from 'oci-sdk';
import JSZip from 'jszip';
import { getResourceManagerClient, getCompartmentId } from '../client';
import logger from '../../utils/logger';

// ─── Resource Manager Service ─────────────────────────────────────────────────
// Wraps OCI Resource Manager (managed Terraform) operations.
//
// Key concepts:
//   Stack  — a Terraform configuration + variables + state stored in OCI
//   Job    — a PLAN / APPLY / DESTROY run against a stack

type RMClient = OCI.resourcemanager.ResourceManagerClient;

export class ResourceManagerService {
  private client: RMClient;
  private compartmentId: string;

  constructor() {
    this.client = getResourceManagerClient();
    this.compartmentId = getCompartmentId();
  }

  // ── Stacks ──────────────────────────────────────────────────────────────────

  async listStacks(compartmentId?: string) {
    try {
      const response = await this.client.listStacks({
        compartmentId: compartmentId ?? this.compartmentId,
      });
      return (response.items ?? []).map((s: OCI.resourcemanager.models.StackSummary) => ({
        id: s.id,
        displayName: s.displayName,
        description: s.description,
        lifecycleState: s.lifecycleState,
        terraformVersion: s.terraformVersion,
        timeCreated: s.timeCreated ? new Date(s.timeCreated).toISOString() : null,
      }));
    } catch (error) {
      logger.error('Error listing Resource Manager stacks', { error });
      throw error;
    }
  }

  async getStack(stackId: string) {
    try {
      const response = await this.client.getStack({ stackId });
      const s = response.stack;
      return {
        id: s.id,
        displayName: s.displayName,
        description: s.description,
        compartmentId: s.compartmentId,
        lifecycleState: s.lifecycleState,
        terraformVersion: s.terraformVersion,
        variables: s.variables,
        freeformTags: s.freeformTags,
        timeCreated: s.timeCreated ? new Date(s.timeCreated).toISOString() : null,
      };
    } catch (error) {
      logger.error(`Error getting stack: ${stackId}`, { error });
      throw error;
    }
  }

  async createStack(details: {
    displayName: string;
    description?: string;
    terraformVersion?: string;
    variables?: Record<string, string>;
    /** Object Storage source — provide this OR zipContentBase64 */
    objectStorageBucket?: string;
    objectStorageNamespace?: string;
    objectStorageRegion?: string;
    /** Inline zip — provide this OR Object Storage fields */
    zipContentBase64?: string;
  }) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let configSource: any;

      if (details.zipContentBase64) {
        const src: OCI.resourcemanager.models.CreateZipUploadConfigSourceDetails = {
          configSourceType: OCI.resourcemanager.models.CreateZipUploadConfigSourceDetails.configSourceType,
          zipFileBase64Encoded: details.zipContentBase64,
        };
        configSource = src;
      } else if (details.objectStorageBucket) {
        const src: OCI.resourcemanager.models.CreateObjectStorageConfigSourceDetails = {
          configSourceType: OCI.resourcemanager.models.CreateObjectStorageConfigSourceDetails.configSourceType,
          namespace: details.objectStorageNamespace ?? '',
          bucketName: details.objectStorageBucket,
          region: details.objectStorageRegion ?? '',
        };
        configSource = src;
      } else {
        throw new Error(
          'Provide either zipContentBase64 or objectStorageBucket + objectStorageNamespace + objectStorageRegion',
        );
      }

      const response = await this.client.createStack({
        createStackDetails: {
          compartmentId: this.compartmentId,
          displayName: details.displayName,
          description: details.description,
          configSource,
          terraformVersion: details.terraformVersion ?? '1.2.x',
          variables: details.variables,
          freeformTags: { CreatedBy: 'OCI-Assistant' },
        },
      });
      const s = response.stack;
      return {
        id: s.id,
        displayName: s.displayName,
        lifecycleState: s.lifecycleState,
        terraformVersion: s.terraformVersion,
        timeCreated: s.timeCreated ? new Date(s.timeCreated).toISOString() : null,
      };
    } catch (error) {
      logger.error('Error creating stack', { error });
      throw error;
    }
  }

  async createStackFromHCL(details: {
    displayName: string;
    description?: string;
    terraformVersion?: string;
    variables?: Record<string, string>;
    /** Map of filename → HCL content. Must include at least one .tf file. */
    files: Record<string, string>;
  }) {
    try {
      if (!details.files || Object.keys(details.files).length === 0) {
        throw new Error('files must contain at least one .tf file');
      }
      const zip = new JSZip();
      for (const [filename, content] of Object.entries(details.files)) {
        zip.file(filename, content);
      }
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipContentBase64 = zipBuffer.toString('base64');
      return this.createStack({
        displayName:      details.displayName,
        description:      details.description,
        terraformVersion: details.terraformVersion,
        variables:        details.variables,
        zipContentBase64,
      });
    } catch (error) {
      logger.error('Error creating stack from HCL', { error });
      throw error;
    }
  }

  async updateStack(stackId: string, details: {
    displayName?: string;
    description?: string;
    variables?: Record<string, string>;
    terraformVersion?: string;
  }) {
    try {
      const response = await this.client.updateStack({
        stackId,
        updateStackDetails: {
          displayName: details.displayName,
          description: details.description,
          variables: details.variables,
          terraformVersion: details.terraformVersion,
        },
      });
      const s = response.stack;
      return { id: s.id, displayName: s.displayName, lifecycleState: s.lifecycleState };
    } catch (error) {
      logger.error(`Error updating stack: ${stackId}`, { error });
      throw error;
    }
  }

  async deleteStack(stackId: string) {
    try {
      await this.client.deleteStack({ stackId });
      return { deleted: true, stackId };
    } catch (error) {
      logger.error(`Error deleting stack: ${stackId}`, { error });
      throw error;
    }
  }

  async getStackTfState(stackId: string) {
    try {
      const response = await this.client.getStackTfState({ stackId });
      // The SDK returns a Readable stream; collect into a buffer
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = response.value as NodeJS.ReadableStream;
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end',  () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
      const text = buf.toString('utf8');
      try { return JSON.parse(text); } catch { return text; }
    } catch (error) {
      logger.error(`Error getting stack TF state: ${stackId}`, { error });
      throw error;
    }
  }

  // ── Jobs ────────────────────────────────────────────────────────────────────

  async listJobs(stackId?: string, compartmentId?: string) {
    try {
      const response = await this.client.listJobs({
        compartmentId: compartmentId ?? this.compartmentId,
        ...(stackId && { stackId }),
      });
      return (response.items ?? []).map((j: OCI.resourcemanager.models.JobSummary) => ({
        id: j.id,
        displayName: j.displayName,
        stackId: j.stackId,
        operation: j.operation,
        lifecycleState: j.lifecycleState,
        timeCreated: j.timeCreated ? new Date(j.timeCreated).toISOString() : null,
        timeFinished: j.timeFinished ? new Date(j.timeFinished).toISOString() : null,
      }));
    } catch (error) {
      logger.error('Error listing jobs', { error });
      throw error;
    }
  }

  async getJob(jobId: string) {
    try {
      const response = await this.client.getJob({ jobId });
      const j = response.job;
      return {
        id: j.id,
        displayName: j.displayName,
        stackId: j.stackId,
        compartmentId: j.compartmentId,
        operation: j.operation,
        lifecycleState: j.lifecycleState,
        timeCreated:  j.timeCreated  ? new Date(j.timeCreated).toISOString()  : null,
        timeFinished: j.timeFinished ? new Date(j.timeFinished).toISOString() : null,
      };
    } catch (error) {
      logger.error(`Error getting job: ${jobId}`, { error });
      throw error;
    }
  }

  async createJob(details: {
    stackId: string;
    /** PLAN | APPLY | DESTROY */
    operation: string;
    displayName?: string;
    /** APPLY only: auto-approve without a preceding plan */
    autoApproved?: boolean;
  }) {
    try {
      const op = details.operation.toUpperCase();

      let jobOperationDetails: OCI.resourcemanager.models.CreateJobOperationDetails;

      if (op === 'PLAN') {
        const d: OCI.resourcemanager.models.CreatePlanJobOperationDetails = {
          operation: OCI.resourcemanager.models.CreatePlanJobOperationDetails.operation,
        };
        jobOperationDetails = d;
      } else if (op === 'APPLY') {
        const strategy = details.autoApproved
          ? OCI.resourcemanager.models.ApplyJobOperationDetails.ExecutionPlanStrategy.AutoApproved
          : OCI.resourcemanager.models.ApplyJobOperationDetails.ExecutionPlanStrategy.FromLatestPlanJob;
        const d: OCI.resourcemanager.models.CreateApplyJobOperationDetails = {
          operation: OCI.resourcemanager.models.CreateApplyJobOperationDetails.operation,
          executionPlanStrategy: strategy,
        };
        jobOperationDetails = d;
      } else if (op === 'DESTROY') {
        const d: OCI.resourcemanager.models.CreateDestroyJobOperationDetails = {
          operation: OCI.resourcemanager.models.CreateDestroyJobOperationDetails.operation,
          executionPlanStrategy:
            OCI.resourcemanager.models.DestroyJobOperationDetails.ExecutionPlanStrategy.AutoApproved,
        };
        jobOperationDetails = d;
      } else {
        throw new Error(`Unknown operation: ${details.operation}. Use PLAN, APPLY, or DESTROY.`);
      }

      const response = await this.client.createJob({
        createJobDetails: {
          stackId: details.stackId,
          displayName: details.displayName,
          jobOperationDetails,
          freeformTags: { CreatedBy: 'OCI-Assistant' },
        },
      });
      const j = response.job;
      return {
        id: j.id,
        displayName: j.displayName,
        stackId: j.stackId,
        operation: j.operation,
        lifecycleState: j.lifecycleState,
        timeCreated: j.timeCreated ? new Date(j.timeCreated).toISOString() : null,
      };
    } catch (error) {
      logger.error('Error creating job', { error });
      throw error;
    }
  }

  async cancelJob(jobId: string) {
    try {
      await this.client.cancelJob({ jobId });
      return { cancelled: true, jobId };
    } catch (error) {
      logger.error(`Error cancelling job: ${jobId}`, { error });
      throw error;
    }
  }

  async getJobLogs(jobId: string, maxLines = 200) {
    try {
      const entries: string[] = [];
      for await (const item of this.client.getAllJobLogs({ jobId })) {
        const level = (item as OCI.resourcemanager.models.LogEntry).level ?? 'INFO';
        const msg   = (item as OCI.resourcemanager.models.LogEntry).message ?? '';
        entries.push(`[${level}] ${msg}`);
        if (entries.length >= maxLines) break;
      }
      return entries;
    } catch (error) {
      logger.error(`Error getting job logs: ${jobId}`, { error });
      throw error;
    }
  }

  async listTerraformVersions() {
    try {
      const response = await this.client.listTerraformVersions({
        compartmentId: this.compartmentId,
      });
      return (response.terraformVersionCollection?.items ?? []).map(
        (v: OCI.resourcemanager.models.TerraformVersionSummary) => ({
          name: v.name,
          isDefault: v.isDefault,
        }),
      );
    } catch (error) {
      logger.error('Error listing Terraform versions', { error });
      throw error;
    }
  }
}
