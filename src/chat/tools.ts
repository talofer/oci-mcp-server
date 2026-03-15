import Anthropic from '@anthropic-ai/sdk';
import { loadArchitectureGuidelines } from '../utils/architecture-guidelines';

// ─── OCI best-practice system prompt ─────────────────────────────────────────
// Based on Oracle's Well-Architected Framework and OCI Security Best Practices
// https://docs.oracle.com/en/solutions/oci-best-practices/index.html

// Load Oracle best practices reference once at module init (no per-request API calls)
const _guidelines = loadArchitectureGuidelines();

export const OCI_SYSTEM_PROMPT = `You are an OCI (Oracle Cloud Infrastructure) architect assistant, connected to a live OCI tenancy via MCP (Model Context Protocol). You can list, design, and create real cloud resources following Oracle's official Well-Architected Framework and CIS Landing Zone best practices.

## Question vs Command — Critical Distinction

⛔ **When the user is ASKING a question** (what, how, show, list, explain, tell me, can I, what would it cost, is it possible, describe, compare, help me understand…):
- Answer using your knowledge and read-only list_* / get_* tools ONLY.
- NEVER call any create_*, delete_*, terminate_*, enable_*, disable_*, update_*, modify_*, attach_*, or detach_* tool.
- Even if a creation workflow *could* answer the question, do NOT start it. Just provide the information.

✅ **When the user is issuing a COMMAND** (create, make, set up, deploy, build, configure, delete, remove, enable, disable…):
- First present a complete plan with all resource names, parameters, and cost implications.
- Ask clarifying questions to optimise the solution before proposing it.
- End with "Shall I proceed? (yes/no)" and wait for explicit confirmation.
- A technical confirmation dialog will also appear in the UI before any write operation executes — treat this as an additional safety layer, not a substitute for your verbal confirmation step.

When in doubt about whether a request is a question or a command — **ask for clarification** rather than taking action.

## Capabilities
You have 75 OCI tools covering:
- **Identity & Compartments**: list/create compartments, groups, policies, dynamic groups
- **Networking**: list/create VCNs, subnets, internet/NAT/service gateways, route tables, NSGs, DRGs
- **Security**: Cloud Guard, Vault (key management), Bastion Service
- **Observability**: Log groups, logs, monitoring alarms, notification topics, event rules, Service Connector Hub
- **Compute**: list/get/create/terminate instances; list availability domains, images, shapes
- **Block Storage**: list/create/delete volumes
- **Object Storage**: list/create/delete buckets
- **Database**: list/create/delete Autonomous Databases
- **Resource Manager**: list/create/update/delete stacks; run PLAN/APPLY/DESTROY jobs; get job logs and Terraform state (managed Terraform-as-a-Service)

## Architecture Approach (ALWAYS follow for any architecture request)

When a user asks to "set up", "create", "deploy", or "architect" anything on OCI:

1. **Consult Oracle best practices** — follow the guidelines below (derived from OCI Well-Architected Framework, OCI Architecture Center, and Oracle CIS Landing Zone)
2. **Propose a complete architecture** — don't just create isolated resources; propose the full set: compartments → networking → security → observability → compute/DB
3. **Present a structured plan** with:
   - Architecture diagram in text/ASCII
   - Complete resource list with proposed names, CIDRs, and configurations
   - Security notes (Cloud Guard, Vault, Bastion recommendations)
   - Observability stack (log groups, alarms, notifications)
   - Cost estimate (highlight Always Free options)
4. **Request confirmation** — "Shall I proceed to create these N resources? (yes/no)"
5. **Create in order**: Compartments → VCN+Gateways → Subnets → Security resources → Observability → Compute/DB
6. **Report** each resource created with its OCID and state

## Naming Convention
Format: \`<env>-<resource-type>-<descriptor>\`
- Environments: prod | dev | test | sandbox
- Examples: prod-vcn-hub, dev-subnet-app, prod-loggroup-security, prod-bastion-main

## Mandatory Tagging
Always include in every resource:
- Environment: prod | dev | test | sandbox
- Owner: \`<team>\`
- Purpose: \`<description>\`
- CreatedBy: OCI-Assistant

## MANDATORY Creation Workflow
⚠️ Before calling any create_* tool:
1. Discover context — call list_* tools to find existing resources and avoid conflicts
2. Present full plan with all parameters
3. End with: "Shall I proceed? (yes/no)"
4. Wait for explicit confirmation
5. Create and report OCID + lifecycle state

## Resource Creation — Prefer Resource Manager

**For any infrastructure creation request, use OCI Resource Manager (managed Terraform) as the preferred path.**
Direct API tools (compute__create_instance, network__create_vcn, etc.) remain available but should only be
used as a fallback when RM is not appropriate (read-only queries, or user explicitly prefers direct API).

### Why Resource Manager?
- Terraform state tracks every resource — reverting is a single DESTROY job on the stack.
- PLAN shows an exact diff before any resource is touched.
- The stack OCID is the single handle to undo everything.

### Preferred Workflow for New Infrastructure
1. Draft the Terraform HCL for the requested resources.
2. Call resource_manager__list_terraform_versions to pick a supported version.
3. Call resource_manager__list_stacks to check for naming conflicts.
4. Present the full HCL and a cost estimate. End with "Shall I proceed? (yes/no)".
5. On confirmation, call resource_manager__create_stack_from_hcl with the files map.
6. State the returned stack ID prominently: "Stack created: \`<id>\`".
7. Follow the MANDATORY RM Workflow below (PLAN → show logs → confirm → APPLY).

### Revert Workflow
To undo all resources in a stack:
1. resource_manager__create_job with operation="DESTROY".
2. Poll resource_manager__get_job until SUCCEEDED; show logs.
3. resource_manager__delete_stack to remove the stack record.

### OCI Provider Block (no credentials needed inside Resource Manager)
When writing HCL for Resource Manager, always start main.tf with — the provider is auto-configured:

terraform {
  required_providers {
    oci = { source = "oracle/oci" }
  }
}
variable "compartment_id" {}

Never add credentials blocks (tenancy_ocid, user_ocid, etc.) — RM supplies them automatically.

### Common OCI Terraform Patterns

VCN:
  resource "oci_core_vcn" "vcn" {
    compartment_id = var.compartment_id
    display_name   = "dev-vcn-main"
    cidr_blocks    = ["10.0.0.0/16"]
    dns_label      = "devmain"
    freeform_tags  = { "CreatedBy" = "OCI-Assistant" }
  }

Internet Gateway + Route Table + Subnet:
  resource "oci_core_internet_gateway" "igw" {
    compartment_id = var.compartment_id
    vcn_id         = oci_core_vcn.vcn.id
    display_name   = "dev-igw-main"
    enabled        = true
  }
  resource "oci_core_route_table" "rt_public" {
    compartment_id = var.compartment_id
    vcn_id         = oci_core_vcn.vcn.id
    route_rules {
      network_entity_id = oci_core_internet_gateway.igw.id
      destination       = "0.0.0.0/0"
      destination_type  = "CIDR_BLOCK"
    }
  }
  resource "oci_core_subnet" "subnet_public" {
    compartment_id = var.compartment_id
    vcn_id         = oci_core_vcn.vcn.id
    display_name   = "dev-subnet-public"
    cidr_block     = "10.0.1.0/24"
    dns_label      = "public"
    route_table_id = oci_core_route_table.rt_public.id
    freeform_tags  = { "CreatedBy" = "OCI-Assistant" }
  }

Compute (flex shape):
  variable "instance_image_id"   {}
  variable "availability_domain" {}
  resource "oci_core_instance" "app" {
    compartment_id      = var.compartment_id
    availability_domain = var.availability_domain
    display_name        = "dev-instance-app"
    shape               = "VM.Standard.A1.Flex"
    shape_config { ocpus = 1; memory_in_gbs = 6 }
    source_details { source_type = "image"; source_id = var.instance_image_id }
    create_vnic_details { subnet_id = oci_core_subnet.subnet_public.id; assign_public_ip = true }
    freeform_tags = { "CreatedBy" = "OCI-Assistant" }
  }
  output "instance_public_ip" { value = oci_core_instance.app.public_ip }

variables.tf pattern (always include when using variables):
  variable "compartment_id"     { description = "Compartment OCID" }
  variable "availability_domain"{ description = "AD name, e.g. AD-1" }
  variable "instance_image_id"  { description = "Platform image OCID" }

Pass variable values via the variables parameter of create_stack_from_hcl.

### When NOT to use Resource Manager
- Read-only operations (list_*, get_*)
- User explicitly prefers direct API and accepts the harder revert trade-off (e.g. creating a single bucket)

### Draw.io Diagram Uploads
When a user uploads a Draw.io diagram (message begins with "[DRAW.IO DIAGRAM ATTACHED]"):
1. Analyze the nested shape structure to identify OCI resources:
   - Container/swimlane shapes marked [container] are typically VCNs or compartments
   - Rectangles nested inside containers are subnets
   - Leaf shapes inside subnets are compute instances, databases, or services
   - Shape labels ARE the intended resource names — keep them; follow the Naming Convention
2. Connections (→) reveal routing: subnet → internet gateway = public subnet; subnet → nat gateway = private subnet
3. Generate complete Terraform HCL using the Common OCI Terraform Patterns above
4. Present the full HCL with a cost estimate; end with "Shall I proceed? (yes/no)"
5. On confirmation, deploy with resource_manager__create_stack_from_hcl

## MANDATORY Resource Manager Workflow
⚠️ For any stack change (APPLY or DESTROY):
1. Run a **PLAN** job first (resource_manager__create_job with operation=PLAN)
2. Poll the job until it reaches SUCCEEDED (use resource_manager__get_job)
3. Fetch and **show the user the plan output** (resource_manager__get_job_logs)
4. Ask "The plan shows X changes. Shall I proceed with APPLY? (yes/no)"
5. Wait for confirmation, then run APPLY — the UI confirmation dialog will also appear
6. Poll until SUCCEEDED, then fetch and show apply logs
⚠️ NEVER run APPLY or DESTROY without first showing the user the PLAN output.

## MANDATORY Deletion Workflow
⚠️ Before calling any delete_*/terminate_* tool:
1. Identify the exact resource (list it, show OCID)
2. Warn about dependencies and prerequisites
3. State clearly: "This CANNOT be undone"
4. Wait for explicit yes/confirm
5. Report outcome

## Response Style
- Format resource lists as tables
- Show OCIDs in \`code\` formatting
- Explain OCI errors in plain English
- Always mention cost implications

---

## Oracle OCI Best Practices Reference
(From OCI Well-Architected Framework, Oracle Architecture Center, Oracle CIS Landing Zone)

${_guidelines}
`;

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

  /* ── IDENTITY ── */
  {
    name: 'identity__list_compartments',
    description: 'List compartments. Call before creating resources to confirm correct compartment context. Best practice: use separate compartments for Network, Security, AppDev, Database.',
    input_schema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Optional: OCID of parent compartment. Defaults to configured root compartment.' },
      },
    },
  },
  {
    name: 'identity__create_compartment',
    description: 'Create a compartment. ONLY call after user confirmation. OCI best practice: create compartments for Network, Security, AppDev, Database to isolate resources and apply least-privilege policies.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Compartment name. Convention: <env>-<purpose> e.g. prod-network, prod-security' },
        description: { type: 'string', description: 'Clear description of compartment purpose' },
        parent_compartment_id: { type: 'string', description: 'Parent compartment OCID. Omit to create under configured root compartment.' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'identity__list_groups',
    description: 'List IAM groups in the tenancy. Groups are tenancy-scoped. Use before creating policies to get existing group names.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'identity__create_group',
    description: 'Create an IAM group. ONLY call after user confirmation. OCI best practice: one group per role per compartment (e.g. NetworkAdmins, SecurityAdmins, DBAdmins).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name. Convention: <Resource>Admins or <Resource>Readers e.g. NetworkAdmins, DBReaders' },
        description: { type: 'string', description: 'Clear description of group purpose and access level' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'identity__list_policies',
    description: 'List IAM policies in a compartment.',
    input_schema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Optional compartment OCID. Defaults to configured compartment.' },
      },
    },
  },
  {
    name: 'identity__create_policy',
    description: 'Create an IAM policy. ONLY call after user confirmation. Statements use Oracle policy syntax: "allow group <name> to <verb> <resource-type> in compartment <name>".',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Policy name. Convention: <group>-<compartment>-policy' },
        description: { type: 'string', description: 'What this policy grants' },
        statements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of policy statements. Example: ["allow group NetworkAdmins to manage virtual-network-family in compartment Network"]',
        },
        compartment_id: { type: 'string', description: 'Optional: compartment OCID where policy is created. Defaults to configured compartment.' },
      },
      required: ['name', 'description', 'statements'],
    },
  },
  {
    name: 'identity__list_dynamic_groups',
    description: 'List dynamic groups (used for Instance Principals). Best practice: use dynamic groups instead of storing API keys on instances.',
    input_schema: { type: 'object', properties: {} },
  },

  /* ── NETWORK EXTENDED ── */
  {
    name: 'network__list_internet_gateways',
    description: 'List internet gateways. Each VCN should have at most one IGW, attached only to public subnets via route tables.',
    input_schema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'Optional VCN OCID to filter' } },
    },
  },
  {
    name: 'network__create_internet_gateway',
    description: 'Create an Internet Gateway for a VCN. ONLY call after user confirmation. Needed for public subnets (load balancers, bastion). Route 0.0.0.0/0 to this IGW in the public subnet route table.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-igw-<vcn-name>' },
        vcn_id: { type: 'string', description: 'VCN OCID' },
        is_enabled: { type: 'boolean', description: 'Enable the gateway (default: true)' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_nat_gateways',
    description: 'List NAT gateways. Private subnets use NAT GW for outbound internet access.',
    input_schema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'Optional VCN OCID to filter' } },
    },
  },
  {
    name: 'network__create_nat_gateway',
    description: 'Create a NAT Gateway. ONLY call after user confirmation. Required for private subnets that need outbound internet (patches, APIs). Route 0.0.0.0/0 to this NAT GW in private subnet route tables.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-natgw-<vcn-name>' },
        vcn_id: { type: 'string', description: 'VCN OCID' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_service_gateways',
    description: 'List service gateways. Service GW provides private access to OCI services (Object Storage, ADB) without internet traversal.',
    input_schema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'Optional VCN OCID to filter' } },
    },
  },
  {
    name: 'network__create_service_gateway',
    description: 'Create a Service Gateway. ONLY call after user confirmation. Enables private access to OCI services (Object Storage, ADB). Best practice: always create alongside NAT GW for private subnets.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-sgw-<vcn-name>' },
        vcn_id: { type: 'string', description: 'VCN OCID' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_route_tables',
    description: 'List route tables in a VCN. Each subnet needs a route table directing traffic to the appropriate gateway.',
    input_schema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'Optional VCN OCID to filter' } },
    },
  },
  {
    name: 'network__create_route_table',
    description: 'Create a route table. ONLY call after user confirmation. Public subnet: route 0.0.0.0/0 → IGW. Private subnet: route 0.0.0.0/0 → NAT GW and OCI services CIDR → Service GW.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-rt-<subnet-name> e.g. prod-rt-public' },
        vcn_id: { type: 'string', description: 'VCN OCID' },
        route_rules: {
          type: 'array',
          description: 'Array of route rules. Each rule: { destination: "0.0.0.0/0", network_entity_id: "<gateway-ocid>" }',
          items: {
            type: 'object',
            properties: {
              destination: { type: 'string', description: 'CIDR block e.g. 0.0.0.0/0' },
              network_entity_id: { type: 'string', description: 'Gateway OCID (IGW, NAT GW, or Service GW)' },
            },
            required: ['destination', 'network_entity_id'],
          },
        },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_network_security_groups',
    description: 'List Network Security Groups (NSGs). NSGs are preferred over Security Lists — they attach to individual VNICs and support more granular rules.',
    input_schema: {
      type: 'object',
      properties: { vcn_id: { type: 'string', description: 'Optional VCN OCID to filter' } },
    },
  },
  {
    name: 'network__create_network_security_group',
    description: 'Create a Network Security Group (NSG). ONLY call after user confirmation. Create one NSG per tier: LB-NSG, App-NSG, DB-NSG. Apply least-privilege ingress/egress rules.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-nsg-<tier> e.g. prod-nsg-app, prod-nsg-db' },
        vcn_id: { type: 'string', description: 'VCN OCID' },
      },
      required: ['display_name', 'vcn_id'],
    },
  },
  {
    name: 'network__list_drgs',
    description: 'List Dynamic Routing Gateways (DRGs). DRGs enable VCN-to-VCN peering and on-premises connectivity (FastConnect/VPN).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'network__create_drg',
    description: 'Create a Dynamic Routing Gateway. ONLY call after user confirmation. One DRG per region is typical — attach multiple VCNs to it for hub-and-spoke topology.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-drg-<region>' },
      },
      required: ['display_name'],
    },
  },

  /* ── SECURITY ── */
  {
    name: 'security__get_cloud_guard_configuration',
    description: 'Get Cloud Guard status for the tenancy. Cloud Guard detects misconfigurations and threats. Should be ENABLED at root compartment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'security__enable_cloud_guard',
    description: 'Enable or disable Cloud Guard. ONLY call after user confirmation. Best practice: ALWAYS enable Cloud Guard at tenancy root. It is free and detects public buckets, open security lists, weak passwords.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ENABLED', 'DISABLED'], description: 'ENABLED to activate Cloud Guard (strongly recommended)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'security__list_cloud_guard_targets',
    description: 'List Cloud Guard monitoring targets. Each target scopes Cloud Guard to a compartment.',
    input_schema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Optional compartment OCID. Defaults to configured compartment.' },
      },
    },
  },
  {
    name: 'security__create_cloud_guard_target',
    description: 'Create a Cloud Guard target for a compartment. ONLY call after user confirmation. Point to the root compartment OCID to monitor everything.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-cloudguard-target' },
        target_resource_id: { type: 'string', description: 'OCID of the compartment to monitor (use tenancy OCID for root-level coverage)' },
      },
      required: ['display_name', 'target_resource_id'],
    },
  },
  {
    name: 'security__list_vaults',
    description: 'List Vaults (OCI Key Management). Vaults store encryption keys (CMK) and secrets. Best practice: one vault per region per environment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'security__create_vault',
    description: 'Create a Vault for key management. ONLY call after user confirmation. Use DEFAULT type for most workloads. VIRTUAL_PRIVATE gives dedicated HSM partition (higher cost).',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-vault-<region> e.g. prod-vault-fra' },
        vault_type: {
          type: 'string',
          enum: ['DEFAULT', 'VIRTUAL_PRIVATE'],
          description: 'DEFAULT: shared HSM (recommended, ~$0/month for keys). VIRTUAL_PRIVATE: dedicated partition (expensive).',
        },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'security__list_bastions',
    description: 'List Bastion resources. Bastions provide secure SSH/RDP access to private instances without public IPs.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'security__create_bastion',
    description: 'Create a Bastion for secure SSH access. ONLY call after user confirmation. Deploy in a public subnet. Never expose application instances with public IPs — always use Bastion.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name: <env>-bastion-<purpose> e.g. prod-bastion-main' },
        target_subnet_id: { type: 'string', description: 'OCID of the public subnet where the Bastion is deployed' },
        client_cidr_block_allow_list: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of CIDRs allowed to connect to the Bastion. Restrict to corporate IP ranges. e.g. ["203.0.113.0/24"]',
        },
      },
      required: ['name', 'target_subnet_id', 'client_cidr_block_allow_list'],
    },
  },

  /* ── OBSERVABILITY: LOGGING ── */
  {
    name: 'logging__list_log_groups',
    description: 'List logging log groups. Log groups organise logs per compartment/application. Best practice: one log group per compartment.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'logging__create_log_group',
    description: 'Create a log group. ONLY call after user confirmation. Create one per compartment: <env>-<compartment>-log-group.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-<compartment>-log-group e.g. prod-network-log-group' },
        description: { type: 'string', description: 'Optional description of what this log group collects' },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'logging__list_logs',
    description: 'List logs within a log group.',
    input_schema: {
      type: 'object',
      properties: {
        log_group_id: { type: 'string', description: 'Log group OCID' },
      },
      required: ['log_group_id'],
    },
  },
  {
    name: 'logging__create_log',
    description: 'Create a log within a log group. ONLY call after user confirmation. Enable VCN Flow Logs, Audit logs, and Service logs for full observability.',
    input_schema: {
      type: 'object',
      properties: {
        log_group_id: { type: 'string', description: 'Log group OCID where this log will be stored' },
        display_name: { type: 'string', description: 'Name: <resource-type>-<resource-name>-log e.g. vcn-flow-prod-vcn-main-log' },
        log_type: {
          type: 'string',
          enum: ['CUSTOM', 'SERVICE'],
          description: 'CUSTOM: for application logs. SERVICE: for OCI service logs (VCN flow, LB access, Object Storage).',
        },
      },
      required: ['log_group_id', 'display_name'],
    },
  },

  /* ── OBSERVABILITY: MONITORING ── */
  {
    name: 'monitoring__list_alarms',
    description: 'List monitoring alarms. Best practice: create alarms for CPU, memory, instance health, budget, and security events.',
    input_schema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Optional compartment OCID. Defaults to configured compartment.' },
      },
    },
  },
  {
    name: 'monitoring__create_alarm',
    description: 'Create a monitoring alarm. ONLY call after user confirmation. Requires a notification topic OCID as destination. Common namespaces: oci_computeagent, oci_autonomous_database, oci_lbaas.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-alarm-<metric>-<threshold> e.g. prod-alarm-cpu-high' },
        namespace: { type: 'string', description: 'Metric namespace e.g. oci_computeagent, oci_autonomous_database, oci_lbaas, oci_objectstorage' },
        query: { type: 'string', description: 'MQL query e.g. "CpuUtilization[1m].mean() > 80" or "HealthyBackendCount[1m].min() < 1"' },
        severity: {
          type: 'string',
          enum: ['CRITICAL', 'ERROR', 'WARNING', 'INFO'],
          description: 'CRITICAL: page immediately. WARNING: alert. INFO: informational.',
        },
        destinations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of notification topic OCIDs. Create topics with notifications__create_topic first.',
        },
      },
      required: ['display_name', 'namespace', 'query', 'severity', 'destinations'],
    },
  },

  /* ── OBSERVABILITY: NOTIFICATIONS ── */
  {
    name: 'notifications__list_topics',
    description: 'List ONS notification topics. Topics receive alarm and event notifications, then fan out to email/PagerDuty/Slack subscribers.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'notifications__create_topic',
    description: 'Create a notification topic. ONLY call after user confirmation. Best practice: create separate topics per severity: <env>-topic-critical, <env>-topic-warning, <env>-topic-security.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Topic name: <env>-topic-<severity> e.g. prod-topic-critical' },
        description: { type: 'string', description: 'Optional description of what notifications this topic receives' },
      },
      required: ['name'],
    },
  },
  {
    name: 'notifications__create_subscription',
    description: 'Subscribe to a notification topic. ONLY call after user confirmation. Add email, PagerDuty, or Slack subscribers to receive alerts.',
    input_schema: {
      type: 'object',
      properties: {
        topic_id: { type: 'string', description: 'Topic OCID to subscribe to' },
        protocol: {
          type: 'string',
          enum: ['EMAIL', 'HTTPS', 'PAGERDUTY', 'SLACK', 'SMS', 'ORACLE_FUNCTIONS'],
          description: 'Delivery protocol. EMAIL requires email address. HTTPS/PAGERDUTY/SLACK require webhook URL.',
        },
        endpoint: { type: 'string', description: 'Delivery endpoint: email address, webhook URL, or phone number depending on protocol' },
      },
      required: ['topic_id', 'protocol', 'endpoint'],
    },
  },

  /* ── OBSERVABILITY: EVENTS ── */
  {
    name: 'events__list_rules',
    description: 'List event rules. Event rules trigger notifications when OCI resources change (creates, deletes, state changes).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'events__create_rule',
    description: 'Create an event rule. ONLY call after user confirmation. Use to alert on security-sensitive events: public bucket creation, IAM policy changes, Cloud Guard findings.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: 'Name: <env>-event-<trigger> e.g. prod-event-public-bucket' },
        description: { type: 'string', description: 'What event this rule monitors' },
        condition: {
          type: 'string',
          description: 'JSON filter string. Example: \'{"eventType":["com.oraclecloud.objectstorage.createbucket"],"data":{"additionalDetails":{"publicAccessType":["ObjectRead","ObjectReadWithoutList"]}}}\' or \'{"eventType":["com.oraclecloud.identitycontrolplane.updatepolicy"]}\'',
        },
        actions: {
          type: 'array',
          description: 'Array of actions to trigger',
          items: {
            type: 'object',
            properties: {
              action_type: { type: 'string', description: 'Action type: ONS (notification topic), OSS (streaming), FAAS (functions)' },
              is_enabled: { type: 'boolean', description: 'Enable this action' },
              topic_id: { type: 'string', description: 'Topic OCID (required when action_type=ONS)' },
            },
            required: ['action_type', 'is_enabled'],
          },
        },
      },
      required: ['display_name', 'description', 'condition', 'actions'],
    },
  },

  /* ── OBSERVABILITY: SERVICE CONNECTOR HUB ── */
  {
    name: 'sch__list_service_connectors',
    description: 'List Service Connector Hub connectors. SCH routes logs/metrics to destinations like Object Storage, Streaming, or Functions for SIEM integration.',
    input_schema: { type: 'object', properties: {} },
  },

  /* ── RESOURCE MANAGER (managed Terraform) ── */
  {
    name: 'resource_manager__list_terraform_versions',
    description: 'List Terraform versions supported by OCI Resource Manager. Call this before creating a stack to pick a supported version.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'resource_manager__list_stacks',
    description: 'List all Resource Manager stacks (managed Terraform configs) in the compartment. Always call before creating a stack to check for naming conflicts.',
    input_schema: {
      type: 'object',
      properties: {
        compartment_id: { type: 'string', description: 'Optional compartment OCID. Defaults to configured compartment.' },
      },
    },
  },
  {
    name: 'resource_manager__get_stack',
    description: 'Get details of a Resource Manager stack including variables, Terraform version, and lifecycle state.',
    input_schema: {
      type: 'object',
      properties: { stack_id: { type: 'string', description: 'Stack OCID (starts with ocid1.ormstack...)' } },
      required: ['stack_id'],
    },
  },
  {
    name: 'resource_manager__get_stack_tf_state',
    description: 'Retrieve the current Terraform state file for a stack. Use to inspect what resources are currently managed.',
    input_schema: {
      type: 'object',
      properties: { stack_id: { type: 'string', description: 'Stack OCID.' } },
      required: ['stack_id'],
    },
  },
  {
    name: 'resource_manager__list_jobs',
    description: 'List jobs for a stack or compartment. Use to check the status of recent plan/apply/destroy runs.',
    input_schema: {
      type: 'object',
      properties: {
        stack_id:       { type: 'string', description: 'Optional: filter by stack OCID.' },
        compartment_id: { type: 'string', description: 'Optional compartment OCID override.' },
      },
    },
  },
  {
    name: 'resource_manager__get_job',
    description: 'Get status and details of a specific Resource Manager job (PLAN, APPLY, DESTROY).',
    input_schema: {
      type: 'object',
      properties: { job_id: { type: 'string', description: 'Job OCID (starts with ocid1.ormjob...)' } },
      required: ['job_id'],
    },
  },
  {
    name: 'resource_manager__get_job_logs',
    description: 'Retrieve Terraform execution logs for a job — the actual plan diff, apply output, or error messages. Call this after a job finishes to show the user what happened.',
    input_schema: {
      type: 'object',
      properties: {
        job_id:    { type: 'string', description: 'Job OCID.' },
        max_lines: { type: 'number', description: 'Maximum log lines to return. Default 200.' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'resource_manager__create_stack',
    description: 'Create a Resource Manager stack from a Terraform config. ONLY call after user confirmation. Source options: (a) base64-encoded zip via zip_content_base64, or (b) zip stored in OCI Object Storage via object_storage_bucket + object_storage_object.',
    input_schema: {
      type: 'object',
      properties: {
        display_name:             { type: 'string', description: 'Stack name. Convention: <env>-stack-<purpose>' },
        description:              { type: 'string', description: 'What this stack provisions.' },
        terraform_version:        { type: 'string', description: 'Terraform version e.g. "1.2.x". Use resource_manager__list_terraform_versions first.' },
        variables:                { type: 'object', description: 'Terraform input variables as key-value pairs.', additionalProperties: { type: 'string' } },
        zip_content_base64:       { type: 'string', description: 'Base64-encoded .zip of the Terraform config files. Use this OR the Object Storage fields.' },
        object_storage_bucket:    { type: 'string', description: 'OCI Object Storage bucket containing the config zip.' },
        object_storage_namespace: { type: 'string', description: 'Object Storage namespace (your tenancy name).' },
        object_storage_object:    { type: 'string', description: 'Object key (path) of the .zip inside the bucket.' },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'resource_manager__create_stack_from_hcl',
    description: 'Create a Resource Manager stack from raw HCL text files. Pass a files map of filename → HCL content; the server zips and uploads them. Returns the stack OCID. ONLY call after user confirmation. ALWAYS prefer this over resource_manager__create_stack when you have HCL content — you cannot base64-encode zips yourself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        display_name:      { type: 'string', description: 'Stack name. Convention: <env>-stack-<purpose>.' },
        description:       { type: 'string', description: 'What this stack provisions.' },
        terraform_version: { type: 'string', description: 'Terraform version e.g. "1.2.x". Use resource_manager__list_terraform_versions first.' },
        variables:         { type: 'object', additionalProperties: { type: 'string' }, description: 'Terraform input variables as key-value string pairs.' },
        files:             { type: 'object', additionalProperties: { type: 'string' }, description: 'Map of filename → HCL content. Must include at least one .tf file. E.g. {"main.tf":"...","variables.tf":"..."}.' },
      },
      required: ['display_name', 'files'],
    },
  },
  {
    name: 'resource_manager__update_stack',
    description: 'Update stack metadata or variables. ONLY call after user confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        stack_id:          { type: 'string', description: 'Stack OCID.' },
        display_name:      { type: 'string', description: 'New name.' },
        description:       { type: 'string', description: 'New description.' },
        terraform_version: { type: 'string', description: 'New Terraform version.' },
        variables:         { type: 'object', description: 'Updated input variables.', additionalProperties: { type: 'string' } },
      },
      required: ['stack_id'],
    },
  },
  {
    name: 'resource_manager__create_job',
    description: 'Run a PLAN, APPLY, or DESTROY job against a stack. ONLY call after user confirmation. Best practice: always run PLAN first, show the user the diff from get_job_logs, then run APPLY only if they approve.',
    input_schema: {
      type: 'object',
      properties: {
        stack_id:      { type: 'string', description: 'Stack OCID to execute against.' },
        operation:     { type: 'string', enum: ['PLAN', 'APPLY', 'DESTROY'], description: 'PLAN: preview changes (safe, no resources touched). APPLY: create/update resources. DESTROY: permanently remove ALL managed resources.' },
        display_name:  { type: 'string', description: 'Optional job name for easy identification.' },
        auto_approved: { type: 'boolean', description: 'APPLY only: skip plan and auto-approve. Default false (recommended: always plan first).' },
      },
      required: ['stack_id', 'operation'],
    },
  },
  {
    name: 'resource_manager__cancel_job',
    description: 'Cancel a running Resource Manager job. ONLY call after user confirmation.',
    input_schema: {
      type: 'object',
      properties: { job_id: { type: 'string', description: 'Job OCID to cancel.' } },
      required: ['job_id'],
    },
  },
  {
    name: 'resource_manager__delete_stack',
    description: 'Delete a Resource Manager stack. IRREVERSIBLE. Run a DESTROY job first to remove all managed OCI resources, then delete the stack. ONLY call after explicit user confirmation.',
    input_schema: {
      type: 'object',
      properties: { stack_id: { type: 'string', description: 'Stack OCID to delete.' } },
      required: ['stack_id'],
    },
  },
];
