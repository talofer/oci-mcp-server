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
} from '../oci/services';
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
];

// ─── OCI Service instances (lazy-initialised) ─────────────────────────────────

let _computeService: ComputeService;
let _networkService: NetworkService;
let _blockStorageService: BlockStorageService;
let _objectStorageService: ObjectStorageService;
let _databaseService: DatabaseService;

function getServices() {
  if (!_computeService) {
    _computeService = new ComputeService();
    _networkService = new NetworkService();
    _blockStorageService = new BlockStorageService();
    _objectStorageService = new ObjectStorageService();
    _databaseService = new DatabaseService();
  }
  return {
    cs: _computeService,
    ns: _networkService,
    bs: _blockStorageService,
    os: _objectStorageService,
    ds: _databaseService,
  };
}

// ─── Tool-call router ─────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function executeOCITool(name: string, a: Args): Promise<unknown> {
  const { cs, ns, bs, os, ds } = getServices();

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
