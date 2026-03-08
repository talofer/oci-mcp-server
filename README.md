# MCP Server for Oracle Cloud Infrastructure

This package implements a Model Context Protocol (MCP) server for Oracle Cloud Infrastructure. It allows language models like Claude to interact with OCI resources through structured tools.

## Features

- Model Context Protocol implementation for OCI
- Direct integration with Claude Desktop
- Tools for managing:
  - Compute instances
  - Virtual networks (VCNs) and subnets
  - Block storage volumes
  - Object storage buckets
  - Autonomous databases

## Quick install

For a quick install with interactive setup:

```bash
git clone https://github.com/jopsis/mcp-oci-ts.git
cd mcp-oci-ts
chmod +x setup.sh
./setup.sh
```

## Manual install

### 1. Clone and install

```bash
git clone https://github.com/jopsis/mcp-oci-ts.git
cd mcp-oci-ts
npm install
npm run build
npm install -g .
```

### 2. Configure

Create a JSON config file (e.g. `~/.mcp-server-oci/config.json`):

```json
{
  "userOcid": "ocid1.user.oc1..example",
  "tenancyOcid": "ocid1.tenancy.oc1..example",
  "region": "us-ashburn-1",
  "fingerprint": "12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd:ef",
  "keyFile": "/path/to/your/oci_api_key.pem",
  "compartmentId": "ocid1.compartment.oc1..example"
}
```

Or use a `.env` file:

```
OCI_USER_OCID=ocid1.user.oc1..example
OCI_TENANCY_OCID=ocid1.tenancy.oc1..example
OCI_REGION=us-ashburn-1
OCI_FINGERPRINT=12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd:ef
OCI_KEY_FILE=/path/to/your/oci_api_key.pem
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..example
```

## Claude Desktop integration

To integrate this MCP server with Claude Desktop, add the following to your Claude Desktop settings file (typically `~/.config/claude-desktop/settings.json`):

```json
{
  "mcpServers": {
    "oracle-cloud": {
      "command": "/path/to/mcp-server-oci",
      "args": [
        "--config",
        "/path/to/your/config.json"
      ],
      "env": {}
    }
  }
}
```

If you installed globally with npm, run `which mcp-server-oci` to find the correct path.

## Usage

Once configured, restart Claude Desktop. You can then manage Oracle Cloud Infrastructure through natural conversation with Claude.

### Example prompts

- "List all my compute instances in Oracle Cloud"
- "Create a new VCN named 'dev-network' with CIDR 10.0.0.0/16"
- "Show all my object storage buckets"
- "Create a subnet in the main VCN with CIDR 10.0.1.0/24"

## CLI options

```
Options:
  --config, -c         Path to config file (.env or .json)   [string] [default: ".env"]
  --user-ocid          OCI user OCID                         [string]
  --tenancy-ocid       OCI tenancy OCID                      [string]
  --region             OCI region                            [string]
  --fingerprint        API key fingerprint                   [string]
  --key-file           Path to private key file              [string]
  --compartment-id     OCID of the compartment to use        [string]
  --help               Show help                             [boolean]
```

## Development

### Project structure

```
mcp-server-oci/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── index.ts               # Express app (REST + /chat endpoint)
│   ├── server.ts              # Express server startup
│   ├── claude/
│   │   └── bridge.ts          # Claude Desktop bridge (port 3001)
│   ├── mcp/
│   │   └── service.ts         # MCP tool definitions and dispatch
│   ├── oci/
│   │   ├── client.ts          # OCI SDK client factories
│   │   ├── config.ts          # OCI configuration loader
│   │   └── services.ts        # OCI service classes
│   ├── config/
│   │   └── index.ts           # Server configuration
│   └── utils/
│       └── logger.ts          # Winston logger
├── package.json
└── tsconfig.json
```

### Build from source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run locally
node dist/cli.js --config=./config.json
```

## Security considerations

- The config file contains sensitive credentials — restrict its file permissions (e.g. `chmod 600`).
- The OCI API private key should be granted only the permissions required for the operations this server performs.
- Consider using a dedicated OCI compartment scoped to this server's operations.

## License

MIT. See the LICENSE file for details.
