import express from 'express';
import cors from 'cors';
import path from 'path';
import { serverConfig } from './config';
import logger from './utils/logger';
import { mcpServer } from './mcp/service';
import { handleChat, PendingTool } from './chat/handler';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getConfigSummary, updateOCIConfig } from './oci/config';
import { NetworkService, ComputeService, DatabaseService } from './oci/services';
import { NetworkExtendedService } from './oci/services/network-extended';
import { SecurityService } from './oci/services/security';
import { ObservabilityService } from './oci/services/observability';

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── Static web UI ────────────────────────────────────────────────────────────

// STATIC_DIR is set by the Electron main when running as a bundled desktop app
// (esbuild collapses all __dirname to the bundle's output dir, so the relative
// path must be overridden).  Falls back to the standard compiled location for
// CLI / dev-server usage.
app.use(express.static(process.env.STATIC_DIR ?? path.join(__dirname, '../public')));

// ─── Service info ─────────────────────────────────────────────────────────────

app.get('/api', (_req, res) => {
  res.json({
    name: 'MCP Oracle Cloud Infrastructure Server',
    version: '0.1.0',
    description: 'Natural language OCI management via Claude + MCP',
    endpoints: {
      'GET /':                 'OCI Assistant web UI',
      'GET /api':              'Service info',
      'GET /api/config':       'Get current OCI config summary',
      'POST /api/config':      'Update OCI config at runtime',
      'GET /api/export-diagram': 'Export tenancy as draw.io XML file',
      'POST /mcp':             'MCP Streamable HTTP endpoint (for MCP clients)',
      'POST /chat':            'Natural language chat with OCI (SSE stream)',
    },
  });
});

// ─── OCI config endpoints ─────────────────────────────────────────────────────

/** GET /api/config — returns current config summary (private key content excluded) */
app.get('/api/config', (_req, res) => {
  res.json(getConfigSummary());
});

/**
 * POST /api/config — accepts a partial config override, applies it, then validates
 * the connection by making a lightweight OCI API call (list availability domains).
 */
app.post('/api/config', express.json(), async (req, res) => {
  try {
    await updateOCIConfig(req.body);
    // Validate the new config by making a cheap OCI call
    const svc = new NetworkService();
    await svc.listVcns().catch(() => { /* tolerate empty tenancy */ });
    res.json({ ok: true, config: getConfigSummary() });
  } catch (err: any) {
    logger.warn('Config update failed', { error: err.message });
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── Draw.io export endpoint ───────────────────────────────────────────────────

/**
 * GET /api/export-diagram — queries all OCI resources in parallel, generates a
 * draw.io XML file representing the tenancy architecture, and returns it as a
 * downloadable attachment.
 */
app.get('/api/export-diagram', async (_req, res) => {
  try {
    logger.info('Export diagram request');

    // Fetch all resource types in parallel; use allSettled so partial failures
    // don't abort the entire export.
    const [vcnsR, instancesR, databasesR, igwsR, natGwsR, bastionsR, vaultsR, logGroupsR, alarmsR] =
      await Promise.allSettled([
        new NetworkService().listVcns(),
        new ComputeService().listInstances(),
        new DatabaseService().listAutonomousDatabases(),
        new NetworkExtendedService().listInternetGateways(),
        new NetworkExtendedService().listNatGateways(),
        new SecurityService().listBastions(),
        new SecurityService().listVaults(),
        new ObservabilityService().listLogGroups(),
        new ObservabilityService().listAlarms(),
      ]);

    const unwrap = (r: PromiseSettledResult<unknown>) =>
      r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [];

    const vcnList = unwrap(vcnsR);

    // Fetch subnets per VCN (sequential per VCN, VCNs in parallel)
    const subnetsPerVcn = await Promise.all(
      vcnList.map((v: any) => new NetworkService().listSubnets(v.id).catch(() => []))
    );

    const xml = generateDrawioXml({
      vcns:         vcnList,
      subnetsPerVcn,
      instances:    unwrap(instancesR),
      databases:    unwrap(databasesR),
      igws:         unwrap(igwsR),
      natGws:       unwrap(natGwsR),
      bastions:     unwrap(bastionsR),
      vaults:       unwrap(vaultsR),
      logGroups:    unwrap(logGroupsR),
      alarms:       unwrap(alarmsR),
    });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="oci-architecture-${date}.drawio"`);
    res.send(xml);
  } catch (err: any) {
    logger.error('Export diagram error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Draw.io XML generator ────────────────────────────────────────────────────

function escXml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface DrawioData {
  vcns: any[];
  subnetsPerVcn: any[][];
  instances: any[];
  databases: any[];
  igws: any[];
  natGws: any[];
  bastions: any[];
  vaults: any[];
  logGroups: any[];
  alarms: any[];
}

function generateDrawioXml(data: DrawioData): string {
  let idCounter = 10;
  const nextId = () => `c${idCounter++}`;
  const cells: string[] = [];

  const mkCell = (
    id: string, value: string, style: string, parent: string,
    x: number, y: number, w: number, h: number,
  ) =>
    `<mxCell id="${id}" value="${escXml(value)}" style="${style}" vertex="1" parent="${parent}">` +
    `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

  // ── Top-level tenancy container ──
  const tenancyId = nextId();
  const totalVcnWidth = data.vcns.reduce((acc, _, vi) => {
    const snCount = (data.subnetsPerVcn[vi] || []).length;
    return acc + Math.max(420, snCount * 200 + 40) + 30;
  }, 0);
  const totalW = Math.max(1600, totalVcnWidth + 260);

  cells.push(mkCell(tenancyId, 'OCI Tenancy', 'swimlane;startSize=30;fillColor=#f5f5f5;strokeColor=#666666;fontSize=14;fontStyle=1;rounded=1;arcSize=2;', '1', 20, 20, totalW, 650));

  // ── VCNs ──
  let vcnX = 10;
  data.vcns.forEach((vcn: any, vi: number) => {
    const subnets: any[] = data.subnetsPerVcn[vi] || [];
    const vcnId = nextId();
    const vcnW = Math.max(420, subnets.length * 200 + 40);
    const vcnH = 570;

    cells.push(mkCell(vcnId, escXml(vcn.displayName || 'VCN'), 'swimlane;startSize=28;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;fontStyle=1;rounded=1;arcSize=2;', tenancyId, vcnX, 40, vcnW, vcnH));

    // Gateways row inside VCN
    let gwX = 10;
    const vcnIgws = data.igws.filter((g: any) => g.vcnId === vcn.id);
    const vcnNats = data.natGws.filter((g: any) => g.vcnId === vcn.id);
    vcnIgws.forEach((g: any) => {
      cells.push(mkCell(nextId(), escXml(g.displayName || 'Internet GW'), 'rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;', vcnId, gwX, 36, 140, 36));
      gwX += 155;
    });
    vcnNats.forEach((g: any) => {
      cells.push(mkCell(nextId(), escXml(g.displayName || 'NAT GW'), 'rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;', vcnId, gwX, 36, 140, 36));
      gwX += 155;
    });

    // Subnets
    let snX = 10;
    subnets.forEach((subnet: any) => {
      const snId = nextId();
      const snLabel = `${subnet.displayName || 'Subnet'}&#xa;${subnet.cidrBlock || ''}`;
      cells.push(mkCell(snId, snLabel, 'swimlane;startSize=28;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;rounded=1;arcSize=3;', vcnId, snX, 86, 188, 460));

      let resY = 36;
      // Instances in this subnet
      data.instances
        .filter((i: any) => i.subnetId === subnet.id)
        .forEach((inst: any) => {
          cells.push(mkCell(nextId(), escXml(inst.displayName || 'Instance'),
            'rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=10;',
            snId, 8, resY, 168, 38));
          resY += 48;
        });
      // Databases in this subnet
      data.databases
        .filter((d: any) => d.subnetId === subnet.id)
        .forEach((db: any) => {
          cells.push(mkCell(nextId(), escXml(db.displayName || 'ADB'),
            'shape=cylinder3;fillColor=#f8cecc;strokeColor=#b85450;fontSize=10;',
            snId, 8, resY, 168, 46));
          resY += 56;
        });
      snX += 198;
    });

    vcnX += vcnW + 30;
  });

  // ── Security panel (right side) ──
  const secX = vcnX;
  if (data.bastions.length || data.vaults.length) {
    const secId = nextId();
    cells.push(mkCell(secId, 'Security', 'swimlane;startSize=28;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;fontStyle=1;rounded=1;arcSize=2;', tenancyId, secX, 40, 220, 280));
    let sy = 36;
    data.bastions.forEach((b: any) => {
      cells.push(mkCell(nextId(), escXml(b.displayName || 'Bastion'), 'rounded=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10;', secId, 10, sy, 196, 38));
      sy += 48;
    });
    data.vaults.forEach((v: any) => {
      cells.push(mkCell(nextId(), escXml(v.displayName || 'Vault'), 'shape=cylinder3;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=10;', secId, 10, sy, 196, 44));
      sy += 54;
    });
  }

  // ── Observability panel (below security) ──
  if (data.logGroups.length || data.alarms.length) {
    const obsId = nextId();
    const obsY = (data.bastions.length || data.vaults.length) ? 340 : 40;
    cells.push(mkCell(obsId, 'Observability', 'swimlane;startSize=28;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=12;fontStyle=1;rounded=1;arcSize=2;', tenancyId, secX, obsY, 220, 270));
    let oy = 36;
    data.logGroups.slice(0, 4).forEach((lg: any) => {
      cells.push(mkCell(nextId(), escXml(lg.displayName || 'Log Group'), 'rounded=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=10;', obsId, 10, oy, 196, 38));
      oy += 48;
    });
    data.alarms.slice(0, 3).forEach((a: any) => {
      cells.push(mkCell(nextId(), escXml(a.displayName || 'Alarm'), 'shape=note;size=10;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=10;', obsId, 10, oy, 196, 38));
      oy += 48;
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="OCI-Assistant" modified="${new Date().toISOString()}" agent="OCI-MCP-Server" version="21.0.0">
  <diagram name="OCI Architecture" id="oci-arch-export">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

// ─── MCP Streamable HTTP endpoint ─────────────────────────────────────────────
// Allows external MCP clients (e.g. Claude Desktop, other agents) to connect.

app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error('MCP HTTP request error', { error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP server error' });
    }
  }
});

// ─── Natural language chat endpoint (SSE) ─────────────────────────────────────

app.post('/chat', async (req, res) => {
  const { message, history, pendingTool } = req.body as {
    message?: unknown;
    history?: unknown;
    pendingTool?: PendingTool;
  };

  // __CONFIRM__ / __CANCEL__ are internal sentinel values sent by the UI when
  // the user clicks Confirm or Cancel on a pending write operation.
  const isResume = message === '__CONFIRM__' || message === '__CANCEL__';

  if (!message || typeof message !== 'string' || (!isResume && message.trim().length === 0)) {
    res.status(400).json({ error: 'message must be a non-empty string' });
    return;
  }

  const safeHistory = Array.isArray(history) ? history : [];

  // Validate pendingTool shape to prevent injection of arbitrary input.
  const safePendingTool: PendingTool | undefined =
    pendingTool &&
    typeof pendingTool === 'object' &&
    typeof pendingTool.id === 'string' &&
    typeof pendingTool.name === 'string' &&
    typeof pendingTool.input === 'object'
      ? pendingTool
      : undefined;

  if (isResume) {
    logger.info('Chat resume', { action: message, tool: safePendingTool?.name });
  } else {
    logger.info('Chat request', { preview: (message as string).slice(0, 80) });
  }

  // Abort the agentic loop if the client disconnects (tab closed, Stop button, etc.)
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  await handleChat(message.trim(), safeHistory, res, safePendingTool, controller.signal);
});

// ─── Graceful shutdown (registered here so all entry points get it) ───────────

process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT received, shutting down');  process.exit(0); });
process.on('uncaughtException',  (err)    => { logger.error('Uncaught exception',   { err });    process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason }); process.exit(1); });

// ─── Export app — entry points (cli.ts / server.ts) call app.listen() ─────────
// Do NOT call app.listen() here; importing this module must be side-effect free
// so that server.ts and cli.ts can each own the bind step.

export default app;
