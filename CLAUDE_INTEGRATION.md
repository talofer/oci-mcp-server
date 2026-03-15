# Claude Desktop Integration

This guide explains how to integrate the OCI MCP Server with Claude Desktop.

## Architecture

```
+----------------+      +------------------+      +------------------+
|                |      |                  |      |                  |
| Claude Desktop | <--> | Claude-MCP Bridge| <--> | MCP OCI Server  |
|                |      |                  |      |                  |
+----------------+      +------------------+      +------------------+
        |                       |                         |
        v                       v                         v
  User Interface           Port 3001                 Port 3000
```

The system has three main components:

1. **Claude Desktop**: The Anthropic desktop app for conversing with Claude
2. **Claude-MCP Bridge**: Translates requests between Claude Desktop and the MCP protocol
3. **MCP-OCI Server**: Implements the MCP protocol and communicates with Oracle Cloud Infrastructure

## Prerequisites

- Claude Desktop installed
- MCP-OCI server and Claude bridge configured and running
- Oracle Cloud Infrastructure credentials configured

## Server setup

### Option 1: Docker

The easiest way to run the full system is with Docker Compose:

1. Make sure your `.env` file is correctly configured
2. Run Docker Compose:

```bash
docker-compose up -d
```

This starts both the MCP-OCI server (port 3000) and the Claude bridge (port 3001).

### Option 2: Local

To run the servers locally:

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Start the servers:

```bash
npm start
```

## Verifying the setup

Check that both servers are running correctly:

```bash
npm run test:claude
```

This performs the following checks:
- Basic connectivity with the Claude bridge
- Fetching available tools
- Executing a test function (list VCNs)

## Configuring Claude Desktop

Once the servers are running, configure Claude Desktop to use the OCI tools:

1. **Open Claude Desktop**

2. **Open tool settings**
   - Click the gear icon (⚙️) in the top right
   - Select "Custom Tools"

3. **Add a new tool server**
   - Click "Add server"
   - Fill in the details:
     - **Name**: Oracle Cloud Infrastructure
     - **Description**: Tools for managing Oracle Cloud Infrastructure resources
     - **Server URL**: http://localhost:3001
     - **Tools endpoint**: /tools
     - **Function endpoint**: /function

4. **Save the configuration**
   - Click "Save"
   - Make sure the toggle is set to enabled

## Usage

Once configured, you can ask Claude to manage your Oracle Cloud infrastructure. Some examples:

### Query existing resources

- **Compute instances**: "Can you list all my compute instances in Oracle Cloud?"
- **Virtual networks**: "Show me all my VCNs"
- **Storage**: "How many object storage buckets do I have?"

### Create new resources

- **Virtual network**: "Create a new VCN called 'production-net' with CIDR 10.0.0.0/16"
- **Instance**: "I need to create a compute instance with shape VM.Standard.E4.Flex"
- **Storage**: "Create a new bucket called 'app-data'"

### Analysis and recommendations

- **Architecture**: "How should I structure my VCNs and subnets for a three-tier application?"
- **Optimization**: "Can you review my current instances and suggest improvements?"
- **Security**: "How can I configure my subnets for better security?"

## Example interaction

**User**:
```
I need to set up a new VCN for my dev environment. It should have CIDR 172.16.0.0/16 and be named "dev-network".
```

**Claude**:
```
I'll create that VCN for you now.

[Claude uses the "network" tool with function "create_vcn"]

Done! The new VCN has been created:

- ID: ocid1.vcn.oc1.iad.amaaaaaauhde7kyaqocm4taljrxjsxjmk5vcznevf7uqye4z3cyddcmsp5qq
- Name: dev-network
- CIDR: 172.16.0.0/16
- State: PROVISIONING (will become AVAILABLE in a few minutes)
- DNS label: (none configured)

The VCN will finish provisioning shortly. Would you like me to create subnets inside it?
```

## Troubleshooting

### 1. Check that the servers are running

```bash
# Docker
docker ps

# Local
ps aux | grep node
```

### 2. Check server logs

```bash
# Docker
docker-compose logs -f

# Local
tail -f logs/combined.log
```

### 3. Test connectivity

```bash
# Test the MCP-OCI server
curl http://localhost:3000

# Test the Claude bridge
curl http://localhost:3001
```

### 4. Verify Claude Desktop configuration

- Make sure the server URL is correct
- Check that the tools and function endpoints are correctly set
- Confirm that the tools toggle is enabled

### 5. Common errors

- **"Cannot connect to server"**: Ensure both servers are running and reachable.
- **"No tools found"**: The `/tools` endpoint is not returning the expected format.
- **"Error executing function"**: Check the server logs for details.
- **"OCI access denied"**: OCI credentials may be invalid or missing required permissions.

## Production considerations

For production deployments:

1. **HTTPS**: Configure SSL/TLS certificates for both servers
2. **Authentication**: Add an authentication mechanism to the Claude bridge
3. **Least privilege**: Scope OCI credentials to only the permissions this server needs
4. **Private networking**: Run the servers in a private network behind a reverse proxy
5. **Audit logging**: Enable full logging of all actions performed

## Next steps

- **Custom tools**: Add new tools or functions for your specific use case
- **More OCI services**: Extend coverage to additional OCI services
- **Automated workflows**: Build predefined sequences for common tasks
- **Admin interface**: Develop a web UI for managing the configuration
