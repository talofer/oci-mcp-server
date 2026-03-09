import Anthropic from '@anthropic-ai/sdk';

// ─── OCI best-practice system prompt ─────────────────────────────────────────
// Based on Oracle's Well-Architected Framework and OCI Security Best Practices
// https://docs.oracle.com/en/solutions/oci-best-practices/index.html

export const OCI_SYSTEM_PROMPT = `You are an OCI (Oracle Cloud Infrastructure) assistant powered by Claude and connected to a live OCI tenancy via MCP (Model Context Protocol). You can list and create real cloud resources.

## Capabilities
You have 22 OCI tools covering:
- **Compute**: list/get/create/terminate instances; list availability domains, images, and shapes
- **Network**: list/create/delete VCNs and subnets
- **Block Storage**: list/create/delete volumes
- **Object Storage**: list/create/delete buckets
- **Database**: list/create/delete Autonomous Databases

## OCI Well-Architected Best Practices (ALWAYS follow these)

### Naming Convention
OCI best practice: <environment>-<resource-type>-<descriptor>
- Examples: prod-vcn-main, dev-instance-web01, test-adb-analytics01
- Environments: prod | dev | test | sandbox

### Tagging (Governance)
The OCI Well-Architected Framework requires resource tagging for cost tracking and security.
When creating any resource, remind the user to add freeform tags:
- Environment: prod | dev | test | sandbox
- Owner: <team name>
- Purpose: <brief description>
- CreatedBy: OCI-Assistant

### Security Guidelines
- **Subnets**: Recommend private subnets for backend/DB workloads; public only for load balancers and bastion hosts
- **Object Storage**: Default to NoPublicAccess — warn if public access is requested
- **Block Volumes**: Inform users that OCI encrypts all block volumes at rest by default (AES-256)
- **VCNs**: Recommend 10.x.0.0/16 CIDR; warn about overlapping ranges
- **Databases**: Strongly recommend Always Free tier (is_free_tier=true) for dev/test to avoid charges

### CIDR Planning
- VCNs: /16 blocks (e.g., 10.0.0.0/16, 10.1.0.0/16)
- Subnets: /24 blocks within the VCN (e.g., 10.0.1.0/24 public, 10.0.2.0/24 private)
- Always check existing VCNs first to avoid CIDR overlap

### Always Free Resources
Guide users to free options where appropriate:
- Compute: VM.Standard.A1.Flex (ARM) — up to 4 OCPUs + 24GB RAM total
- Database: Autonomous DB with is_free_tier=true (1 OCPU, 20GB)
- Block Storage: 200GB total per tenancy
- Object Storage: 20GB per tenancy

## MANDATORY Workflow for Resource Creation
⚠️ You MUST follow every step before calling any create_* tool:

1. **Gather info** — Ask for missing required parameters before proceeding
2. **Discover context** — ALWAYS call these discovery tools first (never guess):
   - Before any instance/volume creation: call **compute__list_availability_domains** to get valid AD names
   - Before creating an instance: call **compute__list_images** (filter by OS if known) to get a valid image_id
   - Before creating an instance: call **compute__list_shapes** to confirm the desired shape is available
   - Use list_vcns / list_subnets to find existing networking resources
3. **Present summary** — Show a clear creation plan:
   - Resource type and proposed name (following naming convention)
   - All parameters with values
   - Security/cost notes
   - Recommended tags
4. **Request confirmation** — End with: "Shall I proceed? (yes/no)"
5. **Wait** — Do NOT call any create_* or terminate_*/delete_* tool until the user types yes/confirm/proceed
6. **Create and report** — After creation, show the OCID, lifecycle state, and next steps

## MANDATORY Workflow for Resource Termination/Deletion
⚠️ Termination is PERMANENT and IRREVERSIBLE. You MUST:

1. **Identify the resource** — Use list_* tools to confirm the exact OCID/name of what the user wants to delete
2. **Check dependencies** — Warn about OCI deletion prerequisites:
   - Instances: must be RUNNING or STOPPED (not PROVISIONING)
   - Volumes: must be detached from all instances first
   - VCNs: all subnets, internet gateways, NAT gateways, service gateways, local peering gateways, dynamic routing gateways, and non-default route tables/security lists must be deleted first
   - Buckets: must be empty (all objects deleted) before deletion
3. **State clearly** — Tell the user: what will be deleted, its OCID, and that this CANNOT be undone
4. **Require explicit confirmation** — Do NOT proceed unless the user says yes/confirm/delete/proceed
5. **Report outcome** — After deletion, confirm what was removed and suggest any follow-up cleanup

## Response Style
- Format resource lists as clean tables or structured lists
- Highlight OCIDs (they start with "ocid1.") in code formatting
- Explain OCI errors in plain English with suggested fixes
- Be concise but thorough on security/cost implications`;

// ─── Anthropic tool schemas (Claude API format) ───────────────────────────────
// Each Anthropic tool maps to one OCI MCP tool via callMCPTool() below.
// Rich descriptions guide Claude to use them correctly per OCI best practices.

export const OCI_TOOLS: Anthropic.Tool[] = [
  /* ── COMPUTE ── */
  {
    name: 'compute__list_instances',
    description: 'List all compute instances in the OCI compartment. Use before creating instances to check for naming conflicts.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compute__list_availability_domains',
    description: 'List availability domains in the tenancy. ALWAYS call this before creating instances or volumes — never guess the AD name.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compute__list_images',
    description: 'List platform and custom images available in the region. ALWAYS call this before creating an instance to get a valid image_id. Never guess an image OCID.',
    input_schema: {
      type: 'object',
      properties: {
        operating_system: {
          type: 'string',
          description: 'Filter by OS name, e.g. "Oracle Linux", "Windows", "Canonical Ubuntu". Optional.',
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
    description: 'List compute shapes (machine types) available in the compartment. Free tier shape: VM.Standard.A1.Flex.',
    input_schema: {
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
    name: 'compute__get_instance',
    description: 'Get detailed info about a compute instance by OCID.',
    input_schema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance OCID (starts with ocid1.instance...)' },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'compute__create_instance',
    description: 'Create a compute instance. ONLY call after the user has explicitly confirmed. Common free shape: VM.Standard.A1.Flex.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name following: <env>-instance-<name>' },
        shape: { type: 'string', description: 'VM shape (e.g. VM.Standard.A1.Flex, VM.Standard.E4.Flex, VM.Standard3.Flex)' },
        image_id: { type: 'string', description: 'Platform or custom image OCID' },
        subnet_id: { type: 'string', description: 'Subnet OCID' },
        availability_domain: { type: 'string', description: 'Full AD name (e.g. pMEr:EU-FRANKFURT-1-AD-1)' },
        metadata: {
          type: 'object',
          description: 'Optional: ssh_authorized_keys for SSH access, user_data for cloud-init',
          additionalProperties: { type: 'string' },
        },
        shape_config: {
          type: 'object',
          description: 'Required for flex shapes. A1.Flex: min 1 OCPU/6GB; E4.Flex: 1 OCPU/6-64GB',
          properties: {
            ocpus: { type: 'number' },
            memoryInGBs: { type: 'number' },
          },
        },
      },
      required: ['display_name', 'shape', 'image_id', 'subnet_id', 'availability_domain'],
    },
  },

  /* ── NETWORK ── */
  {
    name: 'network__list_vcns',
    description: 'List all VCNs in the compartment. Always call before creating a VCN to check CIDR conflicts.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'network__create_vcn',
    description: 'Create a VCN. ONLY call after user confirmation. Recommend /16 CIDR (e.g. 10.0.0.0/16).',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-vcn-<name>' },
        cidr_block: { type: 'string', description: 'CIDR /16 (e.g. 10.0.0.0/16). Must not overlap existing VCNs.' },
        dns_label: { type: 'string', description: 'Optional DNS label (alphanumeric, max 15 chars, no hyphens)' },
      },
      required: ['display_name', 'cidr_block'],
    },
  },
  {
    name: 'network__list_subnets',
    description: 'List subnets. Call before creating a subnet to verify CIDR availability.',
    input_schema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string', description: 'Optional VCN OCID to filter results' },
      },
    },
  },
  {
    name: 'network__create_subnet',
    description: 'Create a subnet. ONLY call after user confirmation. Use /24 within the VCN range.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-subnet-<name>' },
        vcn_id: { type: 'string', description: 'Parent VCN OCID' },
        cidr_block: { type: 'string', description: 'CIDR /24 within the VCN (e.g. 10.0.1.0/24)' },
        availability_domain: { type: 'string', description: 'Optional: pin to AD. Omit for regional subnet (recommended).' },
        dns_label: { type: 'string', description: 'Optional DNS label' },
      },
      required: ['display_name', 'vcn_id', 'cidr_block'],
    },
  },

  /* ── BLOCK STORAGE ── */
  {
    name: 'block_storage__list_volumes',
    description: 'List all block storage volumes in the compartment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'block_storage__create_volume',
    description: 'Create a block volume. ONLY call after user confirmation. OCI encrypts all volumes at rest (AES-256) by default.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-volume-<name>' },
        availability_domain: { type: 'string', description: 'Must match the AD of the instance that will attach it' },
        size_in_gbs: { type: 'number', description: 'Size in GB. Min 50, Max 32768. Always Free includes 200GB total.' },
      },
      required: ['display_name', 'availability_domain'],
    },
  },

  /* ── OBJECT STORAGE ── */
  {
    name: 'object_storage__list_buckets',
    description: 'List all object storage buckets.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'object_storage__create_bucket',
    description: 'Create an object storage bucket. ONLY call after user confirmation. Default to NoPublicAccess for security.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique name within the namespace. Convention: <env>-<purpose>-bucket' },
        public_access_type: {
          type: 'string',
          enum: ['NoPublicAccess', 'ObjectRead', 'ObjectReadWithoutList'],
          description: 'SECURITY: Use NoPublicAccess unless explicitly needed (e.g. static website hosting)',
        },
        storage_tier: {
          type: 'string',
          enum: ['Standard', 'Archive'],
          description: 'Standard: frequent access. Archive: low cost, 90-day minimum, for backups.',
        },
      },
      required: ['name'],
    },
  },

  /* ── DATABASE ── */
  {
    name: 'database__list_autonomous_databases',
    description: 'List all Autonomous Databases in the compartment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'database__create_autonomous_database',
    description: 'Create an Autonomous Database. ONLY call after user confirmation. Recommend is_free_tier=true for dev/test.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-adb-<name>' },
        db_name: { type: 'string', description: '1-14 alphanumeric chars, starts with letter (e.g. MYDB01)' },
        admin_password: { type: 'string', description: 'Min 12 chars, must include uppercase, lowercase, number and special char' },
        cpu_core_count: { type: 'number', description: 'OCPUs. Always Free = 1. Paid = 1-128.' },
        data_storage_size_in_tbs: { type: 'number', description: 'Storage in TB. Always Free = 1 (20GB effective). Paid = 1-384.' },
        is_free_tier: { type: 'boolean', description: 'true = Always Free (1 OCPU, 20GB). Recommended for dev/test.' },
        db_workload: {
          type: 'string',
          enum: ['OLTP', 'DW', 'AJD', 'APEX'],
          description: 'OLTP=Transaction Processing, DW=Data Warehouse, AJD=JSON DB, APEX=App Express',
        },
      },
      required: ['display_name', 'db_name', 'admin_password', 'cpu_core_count', 'data_storage_size_in_tbs'],
    },
  },

  /* ── TERMINATION / DELETION ── */
  {
    name: 'compute__terminate_instance',
    description: 'PERMANENTLY terminate a compute instance. IRREVERSIBLE — all data on the boot volume is lost unless preserve_boot_volume=true. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        instance_id: { type: 'string', description: 'Instance OCID to terminate (starts with ocid1.instance...)' },
        preserve_boot_volume: {
          type: 'boolean',
          description: 'true = keep the boot volume after termination (useful for reattaching later). Default: false (boot volume is deleted too).',
        },
      },
      required: ['instance_id'],
    },
  },
  {
    name: 'network__delete_vcn',
    description: 'Delete a VCN. IRREVERSIBLE. Prerequisites: all subnets, internet/NAT/service gateways, non-default route tables and security lists must be removed first. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        vcn_id: { type: 'string', description: 'VCN OCID to delete (starts with ocid1.vcn...)' },
      },
      required: ['vcn_id'],
    },
  },
  {
    name: 'network__delete_subnet',
    description: 'Delete a subnet. IRREVERSIBLE. All instances in the subnet must be terminated first. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        subnet_id: { type: 'string', description: 'Subnet OCID to delete (starts with ocid1.subnet...)' },
      },
      required: ['subnet_id'],
    },
  },
  {
    name: 'block_storage__delete_volume',
    description: 'Delete a block storage volume. IRREVERSIBLE. The volume must be detached from all instances first. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        volume_id: { type: 'string', description: 'Volume OCID to delete (starts with ocid1.volume...)' },
      },
      required: ['volume_id'],
    },
  },
  {
    name: 'object_storage__delete_bucket',
    description: 'Delete an object storage bucket. IRREVERSIBLE. The bucket must be completely empty first (all objects and multipart uploads deleted). ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        bucket_name: { type: 'string', description: 'Bucket name to delete' },
      },
      required: ['bucket_name'],
    },
  },
  {
    name: 'database__delete_autonomous_database',
    description: 'PERMANENTLY delete an Autonomous Database and ALL its data. IRREVERSIBLE. Free tier DBs can be recreated, but all data is gone. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'Autonomous Database OCID to delete (starts with ocid1.autonomousdatabase...)' },
      },
      required: ['database_id'],
    },
  },
];
