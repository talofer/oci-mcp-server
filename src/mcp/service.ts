import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool as MCPTool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ComputeService,
  NetworkService,
  BlockStorageService,
  ObjectStorageService,
  DatabaseService,
  IdentityService,
} from '../oci/services';
import {
  IdentityExtendedService,
} from '../oci/services/identity';
import {
  NetworkExtendedService,
} from '../oci/services/network-extended';
import {
  SecurityService,
} from '../oci/services/security';
import {
  ObservabilityService,
} from '../oci/services/observability';
import logger from '../utils/logger';

// ─── Tool definitions exposed via MCP ────────────────────────────────────────

const MCP_TOOLS: MCPTool[] = [
  {
    name: 'compute__list_instances',
    description: 'List all compute instances in the OCI compartment.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'compute__get_instance',
    description: 'Get details of a specific compute instance by OCID.',
    inputSchema: {
      type: 'object',
      properties: { instance_id: { type: 'string', description: 'Instance OCID' } },
      required: ['instance_id'],
    },
  },
  {
    name: 'compute__list_availability_domains',
    description: 'List availability domains in the tenancy. Always call this before creating instances or volumes to get valid AD names.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'compute__list_images',
    description: 'List platform and custom images available in the region. Always call this before creating an instance to get a valid image_id.',
    inputSchema: {
      type: 'object',
      properties: {
        operating_system: {
          type: 'string',
          description: 'Filter by OS name, e.g. "Oracle Linux", "Windows". Optional.',
        },
        shape: {
          type: 'string',
          description: 'Filter to images compatible with a specific shape. Optional.',
        },
      },
    },
  },
  {
    name: 'compute__list_shapes',
    description: 'List compute shapes (machine types) available in the compartment.',
    inputSchema: {
      type: 'object',
      properties: {
        availability_domain: {
          type: 'string',
          description: 'Filter shapes available in a specific AD. Optional.',
        },
      },
    },
  },
  {
    name: 'compute__create_instance',
    description: 'Create a new compute instance. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        shape: { type: 'string' },
        image_id: { type: 'string' },
        subnet_id: { type: 'string' },
        availability_domain: { type: 'string' },
        metadata: { type: 'object' },
        shape_config: { type: 'object' },
      },
      required: ['display_name', 'shape', 'image_id', 'subnet_id', 'availability_domain'],
    },
  },
  {
    name: 'network__list_vcns',
    description: 'List all Virtual Cloud Networks (VCNs).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'network__create_vcn',
    description: 'Create a VCN. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        cidr_block: { type: 'string' },
        dns_label: { type: 'string' },
      },
      required: ['display_name', 'cidr_block'],
    },
  },
  {
    name: 'network__list_subnets',
    description: 'List subnets, optionally filtered by VCN.',
    inputSchema: {
      type: 'object',
      properties: { vcn_id: { type: 'string' } },
    },
  },
  {
    name: 'network__create_subnet',
    description: 'Create a subnet in a VCN. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
        cidr_block: { type: 'string' },
        availability_domain: { type: 'string' },
        dns_label: { type: 'string' },
      },
      required: ['display_name', 'vcn_id', 'cidr_block'],
    },
  },
  {
    name: 'block_storage__list_volumes',
    description: 'List all block storage volumes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'block_storage__create_volume',
    description: 'Create a block storage volume. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        availability_domain: { type: 'string' },
        size_in_gbs: { type: 'number' },
      },
      required: ['display_name', 'availability_domain'],
    },
  },
  {
    name: 'object_storage__list_buckets',
    description: 'List all object storage buckets.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'object_storage__create_bucket',
    description: 'Create an object storage bucket. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        public_access_type: {
          type: 'string',
          enum: ['NoPublicAccess', 'ObjectRead', 'ObjectReadWithoutList'],
        },
        storage_tier: { type: 'string', enum: ['Standard', 'Archive'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'database__list_autonomous_databases',
    description: 'List all Autonomous Databases.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'database__create_autonomous_database',
    description: 'Create an Autonomous Database. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        db_name: { type: 'string' },
        admin_password: { type: 'string' },
        cpu_core_count: { type: 'number' },
        data_storage_size_in_tbs: { type: 'number' },
        is_free_tier: { type: 'boolean' },
        db_workload: { type: 'string', enum: ['OLTP', 'DW', 'AJD', 'APEX'] },
      },
      required: ['display_name', 'db_name', 'admin_password', 'cpu_core_count', 'data_storage_size_in_tbs'],
    },
  },

  /* ── TERMINATION / DELETION ── */
  {
    name: 'compute__terminate_instance',
    description: 'PERMANENTLY terminate a compute instance. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance OCID to terminate' },
        preserve_boot_volume: { type: 'boolean', description: 'Keep the boot volume after termination (default: false)' },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'network__delete_vcn',
    description: 'Delete a VCN. All subnets, gateways, and route tables must be deleted first. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'VCN OCID to delete' } },
      required: ['vcn_id'],
    },
  },
  {
    name: 'network__delete_subnet',
    description: 'Delete a subnet. All instances in the subnet must be terminated first. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { subnet_id: { type: 'string', description: 'Subnet OCID to delete' } },
      required: ['subnet_id'],
    },
  },
  {
    name: 'block_storage__delete_volume',
    description: 'Delete a block volume. Volume must be detached from all instances first. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { volume_id: { type: 'string', description: 'Volume OCID to delete' } },
      required: ['volume_id'],
    },
  },
  {
    name: 'object_storage__delete_bucket',
    description: 'Delete an object storage bucket. Bucket must be empty first. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { bucket_name: { type: 'string', description: 'Bucket name to delete' } },
      required: ['bucket_name'],
    },
  },
  {
    name: 'database__delete_autonomous_database',
    description: 'PERMANENTLY delete an Autonomous Database and all its data. IRREVERSIBLE. Only call after explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { database_id: { type: 'string', description: 'Autonomous Database OCID to delete' } },
      required: ['database_id'],
    },
  },

  /* ── IDENTITY ── */
  {
    name: 'identity__list_compartments',
    description: 'List compartments.',
    inputSchema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Compartment OCID to list from. Defaults to configured compartment.' },
      },
    },
  },
  {
    name: 'identity__create_compartment',
    description: 'Create a compartment. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        parent_compartment_id: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'identity__list_groups',
    description: 'List IAM groups (tenancy-scoped).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'identity__create_group',
    description: 'Create an IAM group. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'identity__list_policies',
    description: 'List IAM policies.',
    inputSchema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string' },
      },
    },
  },
  {
    name: 'identity__create_policy',
    description: 'Create an IAM policy. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        statements: { type: 'array', items: { type: 'string' } },
        compartment_id: { type: 'string' },
      },
      required: ['name', 'description', 'statements'],
    },
  },
  {
    name: 'identity__list_dynamic_groups',
    description: 'List dynamic groups (tenancy-scoped).',
    inputSchema: { type: 'object', properties: {} },
  },

  /* ── NETWORK EXTENDED ── */
  {
    name: 'network__list_internet_gateways',
    description: 'List internet gateways.',
    inputSchema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string' },
      },
    },
  },
  {
    name: 'network__create_internet_gateway',
    description: 'Create an internet gateway. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
        is_enabled: { type: 'boolean' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_nat_gateways',
    description: 'List NAT gateways.',
    inputSchema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string' },
      },
    },
  },
  {
    name: 'network__create_nat_gateway',
    description: 'Create a NAT gateway. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_service_gateways',
    description: 'List service gateways.',
    inputSchema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string' },
      },
    },
  },
  {
    name: 'network__create_service_gateway',
    description: 'Create a service gateway. Enables all OCI services. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_route_tables',
    description: 'List route tables.',
    inputSchema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string' },
      },
    },
  },
  {
    name: 'network__create_route_table',
    description: 'Create a route table. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
        route_rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              destination: { type: 'string' },
              network_entity_id: { type: 'string' },
            },
          },
        },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_network_security_groups',
    description: 'List network security groups.',
    inputSchema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string' },
      },
    },
  },
  {
    name: 'network__create_network_security_group',
    description: 'Create a network security group. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vcn_id: { type: 'string' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_drgs',
    description: 'List Dynamic Routing Gateways.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'network__create_drg',
    description: 'Create a Dynamic Routing Gateway. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
      },
      required: ['display_name'],
    },
  },

  /* ── SECURITY ── */
  {
    name: 'security__get_cloud_guard_configuration',
    description: 'Get Cloud Guard status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'security__enable_cloud_guard',
    description: 'Enable Cloud Guard at tenancy level. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ENABLED', 'DISABLED'] },
      },
      required: ['status'],
    },
  },
  {
    name: 'security__list_cloud_guard_targets',
    description: 'List Cloud Guard targets.',
    inputSchema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string' },
      },
    },
  },
  {
    name: 'security__create_cloud_guard_target',
    description: 'Create a Cloud Guard target. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        target_resource_id: { type: 'string', description: 'OCID of compartment to target' },
      },
      required: ['display_name', 'target_resource_id'],
    },
  },
  {
    name: 'security__list_vaults',
    description: 'List vaults.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'security__create_vault',
    description: 'Create a vault. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        vault_type: { type: 'string', enum: ['DEFAULT', 'VIRTUAL_PRIVATE'] },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'security__list_bastions',
    description: 'List bastions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'security__create_bastion',
    description: 'Create a bastion. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_subnet_id: { type: 'string' },
        client_cidr_block_allow_list: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'target_subnet_id', 'client_cidr_block_allow_list'],
    },
  },

  /* ── OBSERVABILITY ── */
  {
    name: 'logging__list_log_groups',
    description: 'List log groups.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'logging__create_log_group',
    description: 'Create a log group. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'logging__list_logs',
    description: 'List logs in a log group.',
    inputSchema: {
      type: 'object',
      properties: {
        log_group_id: { type: 'string' },
      },
      required: ['log_group_id'],
    },
  },
  {
    name: 'logging__create_log',
    description: 'Create a log in a log group. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        log_group_id: { type: 'string' },
        display_name: { type: 'string' },
        log_type: { type: 'string', enum: ['CUSTOM', 'SERVICE'] },
      },
      required: ['log_group_id', 'display_name'],
    },
  },
  {
    name: 'monitoring__list_alarms',
    description: 'List monitoring alarms.',
    inputSchema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string' },
      },
    },
  },
  {
    name: 'monitoring__create_alarm',
    description: 'Create a monitoring alarm. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        namespace: { type: 'string' },
        query: { type: 'string' },
        severity: { type: 'string', enum: ['CRITICAL', 'ERROR', 'WARNING', 'INFO'] },
        destinations: { type: 'array', items: { type: 'string' }, description: 'Notification topic OCIDs' },
      },
      required: ['display_name', 'namespace', 'query', 'severity', 'destinations'],
    },
  },
  {
    name: 'notifications__list_topics',
    description: 'List notification topics.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'notifications__create_topic',
    description: 'Create a notification topic. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'notifications__create_subscription',
    description: 'Create a notification subscription. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        topic_id: { type: 'string' },
        protocol: { type: 'string', enum: ['EMAIL', 'HTTPS', 'PAGERDUTY', 'SLACK', 'SMS', 'ORACLE_FUNCTIONS'] },
        endpoint: { type: 'string' },
      },
      required: ['topic_id', 'protocol', 'endpoint'],
    },
  },
  {
    name: 'events__list_rules',
    description: 'List event rules.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'events__create_rule',
    description: 'Create an event rule. Only call after user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        description: { type: 'string' },
        condition: { type: 'string', description: 'JSON filter condition' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action_type: { type: 'string' },
              is_enabled: { type: 'boolean' },
              topic_id: { type: 'string' },
            },
          },
        },
      },
      required: ['display_name', 'description', 'condition', 'actions'],
    },
  },
  {
    name: 'sch__list_service_connectors',
    description: 'List service connectors.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── OCI Service instances (lazy-initialised) ─────────────────────────────────

let _computeService: ComputeService;
let _networkService: NetworkService;
let _blockStorageService: BlockStorageService;
let _objectStorageService: ObjectStorageService;
let _databaseService: DatabaseService;
let _identityService: IdentityService;
let _identityExtService: IdentityExtendedService;
let _networkExtService: NetworkExtendedService;
let _securityService: SecurityService;
let _observabilityService: ObservabilityService;

function getServices() {
  if (!_computeService) {
    _computeService        = new ComputeService();
    _networkService        = new NetworkService();
    _blockStorageService   = new BlockStorageService();
    _objectStorageService  = new ObjectStorageService();
    _databaseService       = new DatabaseService();
    _identityService       = new IdentityService();
    _identityExtService    = new IdentityExtendedService();
    _networkExtService     = new NetworkExtendedService();
    _securityService       = new SecurityService();
    _observabilityService  = new ObservabilityService();
  }
  return {
    cs:  _computeService,
    ns:  _networkService,
    bs:  _blockStorageService,
    os:  _objectStorageService,
    ds:  _databaseService,
    is:  _identityService,
    ixs: _identityExtService,
    nxs: _networkExtService,
    sec: _securityService,
    obs: _observabilityService,
  };
}

// ─── Tool-call router ─────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function executeOCITool(name: string, a: Args): Promise<unknown> {
  const { cs, ns, bs, os, ds, is, ixs, nxs, sec, obs } = getServices();

  switch (name) {
    /* ── COMPUTE ── */
    case 'compute__list_instances':
      return (await cs.listInstances()).map(i => ({
        id: i.id, displayName: i.displayName, shape: i.shape,
        lifecycleState: i.lifecycleState, availabilityDomain: i.availabilityDomain,
        timeCreated: i.timeCreated ? new Date(i.timeCreated).toISOString() : null,
      }));

    case 'compute__get_instance': {
      const i = await cs.getInstance(a.instance_id as string);
      return { id: i.id, displayName: i.displayName, shape: i.shape, lifecycleState: i.lifecycleState };
    }

    case 'compute__list_availability_domains':
      return (await is.listAvailabilityDomains()).map(ad => ({
        name: ad.name,
        id:   ad.id,
      }));

    case 'compute__list_images':
      return (await cs.listImages(
        a.operating_system as string | undefined,
        a.shape            as string | undefined,
      )).map(img => ({
        id:                     img.id,
        displayName:            img.displayName,
        operatingSystem:        img.operatingSystem,
        operatingSystemVersion: img.operatingSystemVersion,
        lifecycleState:         img.lifecycleState,
        timeCreated:            img.timeCreated ? new Date(img.timeCreated).toISOString() : null,
      }));

    case 'compute__list_shapes':
      return (await cs.listShapes(a.availability_domain as string | undefined)).map(s => ({
        shape:                s.shape,
        processorDescription: s.processorDescription,
        ocpus:                s.ocpus,
        memoryInGBs:          s.memoryInGBs,
        isFlexible:           s.isFlexible,
        ocpuOptions:          s.ocpuOptions,
        memoryOptions:        s.memoryOptions,
      }));

    case 'compute__create_instance': {
      const i = await cs.createInstance(
        a.display_name as string, a.shape as string, a.image_id as string,
        a.subnet_id as string, a.availability_domain as string,
        a.metadata as Record<string, string> | undefined,
        a.shape_config as { ocpus?: number; memoryInGBs?: number } | undefined,
      );
      return {
        id: i.id, displayName: i.displayName, shape: i.shape,
        lifecycleState: i.lifecycleState, availabilityDomain: i.availabilityDomain,
        timeCreated: i.timeCreated ? new Date(i.timeCreated).toISOString() : null,
      };
    }

    /* ── NETWORK ── */
    case 'network__list_vcns':
      return (await ns.listVcns()).map(v => ({
        id: v.id, displayName: v.displayName, cidrBlock: v.cidrBlock,
        lifecycleState: v.lifecycleState, dnsLabel: v.dnsLabel,
        timeCreated: v.timeCreated ? new Date(v.timeCreated).toISOString() : null,
      }));

    case 'network__create_vcn': {
      const v = await ns.createVcn(
        a.display_name as string, a.cidr_block as string, a.dns_label as string | undefined,
      );
      return { id: v.id, displayName: v.displayName, cidrBlock: v.cidrBlock, lifecycleState: v.lifecycleState };
    }

    case 'network__list_subnets':
      return (await ns.listSubnets(a.vcn_id as string | undefined)).map(s => ({
        id: s.id, displayName: s.displayName, cidrBlock: s.cidrBlock,
        vcnId: s.vcnId, availabilityDomain: s.availabilityDomain, lifecycleState: s.lifecycleState,
      }));

    case 'network__create_subnet': {
      const s = await ns.createSubnet(
        a.display_name as string, a.vcn_id as string, a.cidr_block as string,
        a.availability_domain as string | undefined, a.dns_label as string | undefined,
      );
      return { id: s.id, displayName: s.displayName, cidrBlock: s.cidrBlock, vcnId: s.vcnId, lifecycleState: s.lifecycleState };
    }

    /* ── BLOCK STORAGE ── */
    case 'block_storage__list_volumes':
      return (await bs.listVolumes()).map(v => ({
        id: v.id, displayName: v.displayName, sizeInGBs: v.sizeInGBs,
        lifecycleState: v.lifecycleState, availabilityDomain: v.availabilityDomain,
      }));

    case 'block_storage__create_volume': {
      const v = await bs.createVolume(
        a.display_name as string, a.availability_domain as string, a.size_in_gbs as number | undefined,
      );
      return { id: v.id, displayName: v.displayName, sizeInGBs: v.sizeInGBs, lifecycleState: v.lifecycleState };
    }

    /* ── OBJECT STORAGE ── */
    case 'object_storage__list_buckets':
      return (await os.listBuckets()).map(b => ({
        name: b.name, namespace: b.namespace,
        timeCreated: b.timeCreated ? new Date(b.timeCreated).toISOString() : null,
      }));

    case 'object_storage__create_bucket': {
      const b = await os.createBucket(
        a.name as string,
        (a.public_access_type as string | undefined) ?? 'NoPublicAccess',
        (a.storage_tier as string | undefined) ?? 'Standard',
      );
      return { name: b.name, namespace: b.namespace, publicAccessType: b.publicAccessType, storageTier: b.storageTier };
    }

    /* ── DATABASE ── */
    case 'database__list_autonomous_databases':
      return (await ds.listAutonomousDatabases()).map(d => ({
        id: d.id, displayName: d.displayName, dbName: d.dbName,
        lifecycleState: d.lifecycleState, dbWorkload: d.dbWorkload, isFreeTier: d.isFreeTier,
      }));

    case 'database__create_autonomous_database': {
      const d = await ds.createAutonomousDatabase(
        a.display_name as string, a.db_name as string, a.admin_password as string,
        a.cpu_core_count as number, a.data_storage_size_in_tbs as number,
        (a.is_free_tier as boolean | undefined) ?? false,
        (a.db_workload as string | undefined) ?? 'OLTP',
      );
      return { id: d.id, displayName: d.displayName, dbName: d.dbName, lifecycleState: d.lifecycleState, isFreeTier: d.isFreeTier };
    }

    /* ── TERMINATION / DELETION ── */
    case 'compute__terminate_instance':
      return await cs.terminateInstance(
        a.instance_id as string,
        (a.preserve_boot_volume as boolean | undefined) ?? false,
      );

    case 'network__delete_vcn':
      return await ns.deleteVcn(a.vcn_id as string);

    case 'network__delete_subnet':
      return await ns.deleteSubnet(a.subnet_id as string);

    case 'block_storage__delete_volume':
      return await bs.deleteVolume(a.volume_id as string);

    case 'object_storage__delete_bucket':
      return await os.deleteBucket(a.bucket_name as string);

    case 'database__delete_autonomous_database':
      return await ds.deleteAutonomousDatabase(a.database_id as string);

    /* ── IDENTITY ── */
    case 'identity__list_compartments':
      return (await ixs.listCompartments(a.compartment_id as string | undefined)).map(c => ({
        id: c.id, name: c.name, description: c.description,
        lifecycleState: c.lifecycleState, timeCreated: c.timeCreated ? new Date(c.timeCreated).toISOString() : null,
      }));

    case 'identity__create_compartment': {
      const c = await ixs.createCompartment(
        a.name as string, a.description as string, a.parent_compartment_id as string | undefined,
      );
      return { id: c.id, name: c.name, description: c.description, lifecycleState: c.lifecycleState };
    }

    case 'identity__list_groups':
      return (await ixs.listGroups()).map(g => ({
        id: g.id, name: g.name, description: g.description, lifecycleState: g.lifecycleState,
        timeCreated: g.timeCreated ? new Date(g.timeCreated).toISOString() : null,
      }));

    case 'identity__create_group': {
      const g = await ixs.createGroup(a.name as string, a.description as string);
      return { id: g.id, name: g.name, description: g.description, lifecycleState: g.lifecycleState };
    }

    case 'identity__list_policies':
      return (await ixs.listPolicies(a.compartment_id as string | undefined)).map(p => ({
        id: p.id, name: p.name, description: p.description,
        statements: p.statements, lifecycleState: p.lifecycleState,
        timeCreated: p.timeCreated ? new Date(p.timeCreated).toISOString() : null,
      }));

    case 'identity__create_policy': {
      const p = await ixs.createPolicy(
        a.name as string, a.statements as string[], a.description as string,
        a.compartment_id as string | undefined,
      );
      return { id: p.id, name: p.name, description: p.description, statements: p.statements, lifecycleState: p.lifecycleState };
    }

    case 'identity__list_dynamic_groups':
      return (await ixs.listDynamicGroups()).map(dg => ({
        id: dg.id, name: dg.name, description: dg.description,
        matchingRule: dg.matchingRule, lifecycleState: dg.lifecycleState,
        timeCreated: dg.timeCreated ? new Date(dg.timeCreated).toISOString() : null,
      }));

    /* ── NETWORK EXTENDED ── */
    case 'network__list_internet_gateways':
      return (await nxs.listInternetGateways(a.vcn_id as string | undefined)).map(ig => ({
        id: ig.id, displayName: ig.displayName, isEnabled: ig.isEnabled,
        vcnId: ig.vcnId, lifecycleState: ig.lifecycleState,
        timeCreated: ig.timeCreated ? new Date(ig.timeCreated).toISOString() : null,
      }));

    case 'network__create_internet_gateway': {
      const ig = await nxs.createInternetGateway(
        a.display_name as string, a.vcn_id as string, (a.is_enabled as boolean | undefined) ?? true,
      );
      return { id: ig.id, displayName: ig.displayName, isEnabled: ig.isEnabled, vcnId: ig.vcnId, lifecycleState: ig.lifecycleState };
    }

    case 'network__list_nat_gateways':
      return (await nxs.listNatGateways(a.vcn_id as string | undefined)).map(ng => ({
        id: ng.id, displayName: ng.displayName, blockTraffic: ng.blockTraffic,
        vcnId: ng.vcnId, lifecycleState: ng.lifecycleState,
        timeCreated: ng.timeCreated ? new Date(ng.timeCreated).toISOString() : null,
      }));

    case 'network__create_nat_gateway': {
      const ng = await nxs.createNatGateway(a.display_name as string, a.vcn_id as string);
      return { id: ng.id, displayName: ng.displayName, vcnId: ng.vcnId, lifecycleState: ng.lifecycleState };
    }

    case 'network__list_service_gateways':
      return (await nxs.listServiceGateways(a.vcn_id as string | undefined)).map(sg => ({
        id: sg.id, displayName: sg.displayName, vcnId: sg.vcnId,
        lifecycleState: sg.lifecycleState,
        timeCreated: sg.timeCreated ? new Date(sg.timeCreated).toISOString() : null,
      }));

    case 'network__create_service_gateway': {
      const sg = await nxs.createServiceGateway(a.display_name as string, a.vcn_id as string);
      return { id: sg.id, displayName: sg.displayName, vcnId: sg.vcnId, lifecycleState: sg.lifecycleState };
    }

    case 'network__list_route_tables':
      return (await nxs.listRouteTables(a.vcn_id as string | undefined)).map(rt => ({
        id: rt.id, displayName: rt.displayName, vcnId: rt.vcnId,
        lifecycleState: rt.lifecycleState,
        timeCreated: rt.timeCreated ? new Date(rt.timeCreated).toISOString() : null,
      }));

    case 'network__create_route_table': {
      const rawRules = a.route_rules as Array<{ destination: string; network_entity_id: string }> | undefined;
      const mappedRules = rawRules?.map(r => ({ destination: r.destination, networkEntityId: r.network_entity_id }));
      const rt = await nxs.createRouteTable(a.display_name as string, a.vcn_id as string, mappedRules);
      return { id: rt.id, displayName: rt.displayName, vcnId: rt.vcnId, lifecycleState: rt.lifecycleState };
    }

    case 'network__list_network_security_groups':
      return (await nxs.listNetworkSecurityGroups(a.vcn_id as string | undefined)).map(nsg => ({
        id: nsg.id, displayName: nsg.displayName, vcnId: nsg.vcnId,
        lifecycleState: nsg.lifecycleState,
        timeCreated: nsg.timeCreated ? new Date(nsg.timeCreated).toISOString() : null,
      }));

    case 'network__create_network_security_group': {
      const nsg = await nxs.createNetworkSecurityGroup(a.display_name as string, a.vcn_id as string);
      return { id: nsg.id, displayName: nsg.displayName, vcnId: nsg.vcnId, lifecycleState: nsg.lifecycleState };
    }

    case 'network__list_drgs':
      return (await nxs.listDrgs()).map(drg => ({
        id: drg.id, displayName: drg.displayName, lifecycleState: drg.lifecycleState,
        timeCreated: drg.timeCreated ? new Date(drg.timeCreated).toISOString() : null,
      }));

    case 'network__create_drg': {
      const drg = await nxs.createDrg(a.display_name as string);
      return { id: drg.id, displayName: drg.displayName, lifecycleState: drg.lifecycleState };
    }

    /* ── SECURITY ── */
    case 'security__get_cloud_guard_configuration': {
      const cfg = await sec.getCloudGuardConfiguration();
      return { status: cfg.status, selfManageResources: cfg.selfManageResources };
    }

    case 'security__enable_cloud_guard': {
      const cfg = await sec.enableCloudGuard(a.status as 'ENABLED' | 'DISABLED');
      return { status: cfg.status };
    }

    case 'security__list_cloud_guard_targets':
      return (await sec.listCloudGuardTargets(a.compartment_id as string | undefined)).map(t => ({
        id: t.id, displayName: t.displayName, lifecycleState: t.lifecycleState,
        targetResourceId: t.targetResourceId, targetResourceType: t.targetResourceType,
        timeCreated: t.timeCreated ? new Date(t.timeCreated).toISOString() : null,
      }));

    case 'security__create_cloud_guard_target': {
      const t = await sec.createCloudGuardTarget(
        a.display_name as string, a.target_resource_id as string,
      );
      return { id: t.id, displayName: t.displayName, lifecycleState: t.lifecycleState, targetResourceId: t.targetResourceId };
    }

    case 'security__list_vaults':
      return (await sec.listVaults()).map(v => ({
        id: v.id, displayName: v.displayName, vaultType: v.vaultType,
        lifecycleState: v.lifecycleState,
        timeCreated: v.timeCreated ? new Date(v.timeCreated).toISOString() : null,
      }));

    case 'security__create_vault': {
      const v = await sec.createVault(
        a.display_name as string, (a.vault_type as 'DEFAULT' | 'VIRTUAL_PRIVATE' | undefined) ?? 'DEFAULT',
      );
      return { id: v.id, displayName: v.displayName, vaultType: v.vaultType, lifecycleState: v.lifecycleState };
    }

    case 'security__list_bastions':
      return (await sec.listBastions()).map(b => ({
        id: b.id, name: b.name, lifecycleState: b.lifecycleState,
        targetSubnetId: b.targetSubnetId,
        timeCreated: b.timeCreated ? new Date(b.timeCreated).toISOString() : null,
      }));

    case 'security__create_bastion': {
      const b = await sec.createBastion(
        a.name as string, a.target_subnet_id as string, a.client_cidr_block_allow_list as string[],
      );
      return { id: b.id, name: b.name, lifecycleState: b.lifecycleState, targetSubnetId: b.targetSubnetId };
    }

    /* ── OBSERVABILITY ── */
    case 'logging__list_log_groups':
      return (await obs.listLogGroups()).map(lg => ({
        id: lg.id, displayName: lg.displayName, description: lg.description,
        lifecycleState: lg.lifecycleState,
        timeCreated: lg.timeCreated ? new Date(lg.timeCreated).toISOString() : null,
      }));

    case 'logging__create_log_group': {
      const lg = await obs.createLogGroup(a.display_name as string, a.description as string | undefined);
      return { id: lg.id, displayName: lg.displayName, lifecycleState: lg.lifecycleState };
    }

    case 'logging__list_logs':
      return (await obs.listLogs(a.log_group_id as string)).map(l => ({
        id: l.id, displayName: l.displayName, logType: l.logType,
        lifecycleState: l.lifecycleState,
        timeCreated: l.timeCreated ? new Date(l.timeCreated).toISOString() : null,
      }));

    case 'logging__create_log': {
      const l = await obs.createLog(
        a.log_group_id as string, a.display_name as string,
        (a.log_type as 'CUSTOM' | 'SERVICE' | undefined) ?? 'CUSTOM',
      );
      return { id: l.id, displayName: l.displayName, logType: l.logType, lifecycleState: l.lifecycleState };
    }

    case 'monitoring__list_alarms':
      return (await obs.listAlarms(a.compartment_id as string | undefined)).map(al => ({
        id: al.id, displayName: al.displayName, namespace: al.namespace,
        query: al.query, severity: al.severity, lifecycleState: al.lifecycleState,
      }));

    case 'monitoring__create_alarm': {
      const al = await obs.createAlarm(
        a.display_name as string, a.namespace as string, a.query as string,
        a.severity as string, a.destinations as string[],
      );
      return { id: al.id, displayName: al.displayName, namespace: al.namespace, severity: al.severity, lifecycleState: al.lifecycleState };
    }

    case 'notifications__list_topics':
      return (await obs.listTopics()).map(t => ({
        topicId: t.topicId, name: t.name, description: t.description,
        lifecycleState: t.lifecycleState,
        timeCreated: t.timeCreated ? new Date(t.timeCreated).toISOString() : null,
      }));

    case 'notifications__create_topic': {
      const t = await obs.createTopic(a.name as string, a.description as string | undefined);
      return { topicId: t.topicId, name: t.name, lifecycleState: t.lifecycleState };
    }

    case 'notifications__create_subscription': {
      const sub = await obs.createSubscription(
        a.topic_id as string, a.protocol as string, a.endpoint as string,
      );
      return { id: sub.id, topicId: sub.topicId, protocol: sub.protocol, endpoint: sub.endpoint, lifecycleState: sub.lifecycleState };
    }

    case 'events__list_rules':
      return (await obs.listRules()).map(r => ({
        id: r.id, displayName: r.displayName, description: r.description,
        condition: r.condition, lifecycleState: r.lifecycleState,
        timeCreated: r.timeCreated ? new Date(r.timeCreated).toISOString() : null,
      }));

    case 'events__create_rule': {
      const rawActions = a.actions as Array<{ action_type: string; is_enabled: boolean; topic_id?: string }>;
      const mappedActions = rawActions.map(ac => ({
        actionType: ac.action_type,
        isEnabled: ac.is_enabled,
        ...(ac.topic_id !== undefined ? { topicId: ac.topic_id } : {}),
      }));
      const r = await obs.createRule(
        a.display_name as string, a.description as string, a.condition as string, mappedActions,
      );
      return { id: r.id, displayName: r.displayName, condition: r.condition, lifecycleState: r.lifecycleState };
    }

    case 'sch__list_service_connectors':
      return (await obs.listServiceConnectors()).map(sc => ({
        id: sc.id, displayName: sc.displayName, lifecycleState: sc.lifecycleState,
        timeCreated: sc.timeCreated ? new Date(sc.timeCreated).toISOString() : null,
      }));

    default:
      throw new Error(`Unknown OCI tool: ${name}`);
  }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

export const mcpServer = new Server(
  { name: 'oci-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  logger.info(`MCP tool call: ${name}`, { args });
  try {
    const result = await executeOCITool(name, args as Args);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    logger.error(`MCP tool error: ${name}`, { error });
    return {
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
      isError: true,
    };
  }
});

// ─── In-process MCP Client ────────────────────────────────────────────────────
// Connects to the MCP server above via an InMemoryTransport pair, so the chat
// handler can call OCI tools through the full MCP protocol without HTTP overhead.

let _mcpClient: Client | null = null;

export async function getMCPClient(): Promise<Client> {
  if (_mcpClient) return _mcpClient;

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  _mcpClient = new Client({ name: 'oci-chat-client', version: '0.1.0' });

  await mcpServer.connect(serverTransport);
  await _mcpClient.connect(clientTransport);

  logger.info('In-process MCP client connected via InMemoryTransport');
  return _mcpClient;
}

// ─── Public helper ────────────────────────────────────────────────────────────

export async function callOCIToolViaMCP(toolName: string, args: Args): Promise<unknown> {
  const client = await getMCPClient();
  const result = await client.callTool({ name: toolName, arguments: args });

  // content is typed with an index signature that widens to unknown — cast explicitly
  const content = result.content as Array<{ type: string; text?: string }>;

  if (result.isError) {
    const errText = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text as string)
      .join('\n');
    throw new Error(errText || 'MCP tool call failed');
  }

  const text = content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text as string)
    .join('\n');

  try { return JSON.parse(text); } catch { return text; }
}

export { MCP_TOOLS };
