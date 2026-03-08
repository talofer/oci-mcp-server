import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ComputeService,
  NetworkService,
  BlockStorageService,
  ObjectStorageService,
  DatabaseService,
} from '../oci/services';
import logger from '../utils/logger';

export interface OciFunction {
  name: string;
  mcpName: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>;
}

export interface OciTool {
  name: string;
  description: string;
  getFunctions(): OciFunction[];
}

export interface MCPServiceInstance {
  getTools(): OciTool[];
  process(request: { tool: string; function: string; parameters: Record<string, unknown> }): Promise<{ status: string; content?: unknown; error?: string }>;
}

export function setupMCPTools(): MCPServiceInstance {
  // Per-service lazy initialization — only instantiate what's actually needed
  let computeService: ComputeService | null = null;
  let networkService: NetworkService | null = null;
  let blockStorageService: BlockStorageService | null = null;
  let objectStorageService: ObjectStorageService | null = null;
  let databaseService: DatabaseService | null = null;

  const compute = () => { if (!computeService) computeService = new ComputeService(); return computeService; };
  const network = () => { if (!networkService) networkService = new NetworkService(); return networkService; };
  const blockStorage = () => { if (!blockStorageService) blockStorageService = new BlockStorageService(); return blockStorageService; };
  const objectStorage = () => { if (!objectStorageService) objectStorageService = new ObjectStorageService(); return objectStorageService; };
  const database = () => { if (!databaseService) databaseService = new DatabaseService(); return databaseService; };

  const tools: OciTool[] = [
    {
      name: 'compute',
      description: 'Oracle Cloud Infrastructure Compute operations',
      getFunctions: (): OciFunction[] => [
        {
          name: 'list_instances',
          mcpName: 'list_compute_instances',
          description: 'List all compute instances in the compartment',
          parameters: {},
        },
        {
          name: 'get_instance',
          mcpName: 'get_compute_instance',
          description: 'Get details of a specific compute instance',
          parameters: {
            instance_id: { type: 'string', description: 'The OCID of the compute instance', required: true },
          },
        },
        {
          name: 'create_instance',
          mcpName: 'create_compute_instance',
          description: 'Create a new compute instance',
          parameters: {
            display_name: { type: 'string', description: 'Display name for the instance', required: true },
            shape: { type: 'string', description: 'Shape (e.g., VM.Standard.E4.Flex)', required: true },
            image_id: { type: 'string', description: 'OCID of the image to use', required: true },
            subnet_id: { type: 'string', description: 'OCID of the subnet', required: true },
            availability_domain: { type: 'string', description: 'Availability domain (e.g., AD-1)', required: true },
            ocpus: { type: 'number', description: 'Number of OCPUs (for flex shapes)' },
            memory_in_gbs: { type: 'number', description: 'Memory in GB (for flex shapes)' },
            assign_public_ip: { type: 'boolean', description: 'Assign a public IP address (default: true)' },
          },
        },
      ],
    },
    {
      name: 'network',
      description: 'Oracle Cloud Infrastructure Networking operations',
      getFunctions: (): OciFunction[] => [
        {
          name: 'list_vcns',
          mcpName: 'list_vcns',
          description: 'List all Virtual Cloud Networks (VCNs) in the compartment',
          parameters: {},
        },
        {
          name: 'get_vcn',
          mcpName: 'get_vcn',
          description: 'Get details of a specific VCN',
          parameters: {
            vcn_id: { type: 'string', description: 'The OCID of the VCN', required: true },
          },
        },
        {
          name: 'create_vcn',
          mcpName: 'create_vcn',
          description: 'Create a new Virtual Cloud Network',
          parameters: {
            display_name: { type: 'string', description: 'Display name for the VCN', required: true },
            cidr_block: { type: 'string', description: 'CIDR block (e.g., 10.0.0.0/16)', required: true },
            dns_label: { type: 'string', description: 'DNS label (optional)' },
          },
        },
        {
          name: 'list_subnets',
          mcpName: 'list_subnets',
          description: 'List all subnets in the compartment',
          parameters: {
            vcn_id: { type: 'string', description: 'Filter by VCN OCID (optional)' },
          },
        },
        {
          name: 'create_subnet',
          mcpName: 'create_subnet',
          description: 'Create a new subnet in a VCN',
          parameters: {
            display_name: { type: 'string', description: 'Display name for the subnet', required: true },
            vcn_id: { type: 'string', description: 'OCID of the parent VCN', required: true },
            cidr_block: { type: 'string', description: 'CIDR block (e.g., 10.0.1.0/24)', required: true },
            availability_domain: { type: 'string', description: 'Availability domain (optional)' },
            dns_label: { type: 'string', description: 'DNS label (optional)' },
          },
        },
      ],
    },
    {
      name: 'block_storage',
      description: 'Oracle Cloud Infrastructure Block Storage operations',
      getFunctions: (): OciFunction[] => [
        {
          name: 'list_volumes',
          mcpName: 'list_block_volumes',
          description: 'List all block storage volumes in the compartment',
          parameters: {},
        },
        {
          name: 'get_volume',
          mcpName: 'get_block_volume',
          description: 'Get details of a specific block volume',
          parameters: {
            volume_id: { type: 'string', description: 'The OCID of the block volume', required: true },
          },
        },
        {
          name: 'create_volume',
          mcpName: 'create_block_volume',
          description: 'Create a new block storage volume',
          parameters: {
            display_name: { type: 'string', description: 'Display name for the volume', required: true },
            availability_domain: { type: 'string', description: 'Availability domain', required: true },
            size_in_gbs: { type: 'number', description: 'Size in GB (optional, default 50)' },
          },
        },
      ],
    },
    {
      name: 'object_storage',
      description: 'Oracle Cloud Infrastructure Object Storage operations',
      getFunctions: (): OciFunction[] => [
        {
          name: 'list_buckets',
          mcpName: 'list_object_storage_buckets',
          description: 'List all object storage buckets in the compartment',
          parameters: {},
        },
        {
          name: 'create_bucket',
          mcpName: 'create_object_storage_bucket',
          description: 'Create a new object storage bucket',
          parameters: {
            name: { type: 'string', description: 'Name of the bucket', required: true },
            public_access_type: {
              type: 'string',
              description: 'Public access type (optional, default: NoPublicAccess)',
              enum: ['NoPublicAccess', 'ObjectRead', 'ObjectReadWithoutList'],
            },
            storage_tier: {
              type: 'string',
              description: 'Storage tier (optional, default: Standard)',
              enum: ['Standard', 'Archive'],
            },
          },
        },
      ],
    },
    {
      name: 'database',
      description: 'Oracle Cloud Infrastructure Database operations',
      getFunctions: (): OciFunction[] => [
        {
          name: 'list_autonomous_databases',
          mcpName: 'list_autonomous_databases',
          description: 'List all Autonomous Databases in the compartment',
          parameters: {},
        },
        {
          name: 'create_autonomous_database',
          mcpName: 'create_autonomous_database',
          description: 'Create a new Autonomous Database',
          parameters: {
            display_name: { type: 'string', description: 'Display name', required: true },
            db_name: { type: 'string', description: 'Database name (alphanumeric, max 14 chars)', required: true },
            admin_password: { type: 'string', description: 'Admin password', required: true },
            cpu_core_count: { type: 'number', description: 'Number of CPU cores', required: true },
            data_storage_size_in_tbs: { type: 'number', description: 'Storage size in TB', required: true },
            is_free_tier: { type: 'boolean', description: 'Use free tier (optional)' },
            db_workload: {
              type: 'string',
              description: 'Workload type (optional)',
              enum: ['OLTP', 'DW', 'AJD', 'APEX'],
            },
          },
        },
      ],
    },
  ];

  return {
    getTools: () => tools,
    async process({ tool, function: functionName, parameters }) {
      const toolDef = tools.find(t => t.name === tool);
      if (!toolDef) return { status: 'error', error: `Unknown tool: ${tool}` };

      const fnDef = toolDef.getFunctions().find(f => f.name === functionName);
      if (!fnDef) return { status: 'error', error: `Unknown function: ${tool}.${functionName}` };

      const missing = Object.entries(fnDef.parameters)
        .filter(([key, p]) => p.required && parameters[key] == null)
        .map(([key]) => key);
      if (missing.length > 0) {
        return { status: 'error', error: `Missing required parameters: ${missing.join(', ')}` };
      }

      try {
        let result: unknown;
        switch (`${tool}.${functionName}`) {
          case 'compute.list_instances':
            result = await compute().listInstances();
            break;
          case 'compute.get_instance':
            result = await compute().getInstance(parameters.instance_id as string);
            break;
          case 'compute.create_instance': {
            const shapeConfig = (parameters.ocpus || parameters.memory_in_gbs)
              ? { ocpus: parameters.ocpus as number, memoryInGBs: parameters.memory_in_gbs as number }
              : undefined;
            result = await compute().createInstance(
              parameters.display_name as string, parameters.shape as string,
              parameters.image_id as string, parameters.subnet_id as string,
              parameters.availability_domain as string, undefined, shapeConfig,
              parameters.assign_public_ip !== false
            );
            break;
          }
          case 'network.list_vcns':
            result = await network().listVcns();
            break;
          case 'network.get_vcn':
            result = await network().getVcn(parameters.vcn_id as string);
            break;
          case 'network.create_vcn':
            result = await network().createVcn(
              parameters.display_name as string, parameters.cidr_block as string,
              parameters.dns_label as string | undefined
            );
            break;
          case 'network.list_subnets':
            result = await network().listSubnets(parameters.vcn_id as string | undefined);
            break;
          case 'network.create_subnet':
            result = await network().createSubnet(
              parameters.display_name as string, parameters.vcn_id as string,
              parameters.cidr_block as string, parameters.availability_domain as string | undefined,
              parameters.dns_label as string | undefined
            );
            break;
          case 'block_storage.list_volumes':
            result = await blockStorage().listVolumes();
            break;
          case 'block_storage.get_volume':
            result = await blockStorage().getVolume(parameters.volume_id as string);
            break;
          case 'block_storage.create_volume':
            result = await blockStorage().createVolume(
              parameters.display_name as string, parameters.availability_domain as string,
              parameters.size_in_gbs as number | undefined
            );
            break;
          case 'object_storage.list_buckets':
            result = await objectStorage().listBuckets();
            break;
          case 'object_storage.create_bucket':
            result = await objectStorage().createBucket(
              parameters.name as string,
              parameters.public_access_type as string | undefined,
              parameters.storage_tier as string | undefined
            );
            break;
          case 'database.list_autonomous_databases':
            result = await database().listAutonomousDatabases();
            break;
          case 'database.create_autonomous_database':
            result = await database().createAutonomousDatabase(
              parameters.display_name as string, parameters.db_name as string,
              parameters.admin_password as string, parameters.cpu_core_count as number,
              parameters.data_storage_size_in_tbs as number,
              parameters.is_free_tier as boolean | undefined,
              parameters.db_workload as string | undefined
            );
            break;
          default:
            return { status: 'error', error: `Unhandled tool.function: ${tool}.${functionName}` };
        }
        return { status: 'success', content: result };
      } catch (error) {
        logger.error(`Error in MCP process: ${tool}.${functionName}`, { error });
        return { status: 'error', error: (error as Error).message };
      }
    },
  };
}

export async function startMCPServer() {
  const server = new Server(
    { name: 'oci-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  const mcpService = setupMCPTools();

  // Build MCP name → { tool, fn } map from the single source of truth
  const nameMap = new Map<string, { tool: string; fn: string }>();
  for (const tool of mcpService.getTools()) {
    for (const fn of tool.getFunctions()) {
      nameMap.set(fn.mcpName, { tool: tool.name, fn: fn.name });
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpService.getTools().flatMap(tool =>
      tool.getFunctions().map(fn => {
        const properties: Record<string, object> = {};
        const required: string[] = [];
        for (const [key, param] of Object.entries(fn.parameters)) {
          const schema: Record<string, unknown> = { type: param.type, description: param.description };
          if (param.enum) schema['enum'] = param.enum;
          properties[key] = schema;
          if (param.required) required.push(key);
        }
        return {
          name: fn.mcpName,
          description: fn.description,
          inputSchema: { type: 'object' as const, properties, required },
        };
      })
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    logger.info(`Calling tool: ${name}`, { args });

    const mapping = nameMap.get(name);
    if (!mapping) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    try {
      const result = await mcpService.process({ tool: mapping.tool, function: mapping.fn, parameters: args });
      if (result.status === 'error') {
        return { content: [{ type: 'text', text: result.error ?? 'Unknown error' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result.content, null, 2) }] };
    } catch (error) {
      logger.error(`Tool execution error: ${name}`, { error });
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('OCI MCP Server started');
}
