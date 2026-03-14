/**
 * Electron main process for OCI MCP Server desktop app.
 *
 * Startup sequence:
 *   1. Load (or pick) a config file (.env or .json)
 *   2. Populate process.env from the config
 *   3. Show splash window
 *   4. Start the Express server in-process
 *   5. Open the main BrowserWindow once the server is ready
 *   6. On window close → shut down HTTP server → quit
 *
 * Supported config formats:
 *   .env  — standard KEY=VALUE dotenv file (e.g. the project's .env)
 *   .json — JSON object with env-var keys or camelCase aliases
 */

import { app, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ─── Config persistence ────────────────────────────────────────────────────────
// Stores { configFilePath: string } in the user's app data directory.

interface ElectronConfig {
  configFilePath: string;
}

function electronConfigPath(): string {
  return path.join(app.getPath('userData'), 'electron-config.json');
}

function loadSavedConfigPath(): string | null {
  const p = electronConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8')) as ElectronConfig;
    return cfg.configFilePath && fs.existsSync(cfg.configFilePath)
      ? cfg.configFilePath
      : null;
  } catch {
    return null;
  }
}

function saveConfigPath(configFilePath: string): void {
  fs.writeFileSync(electronConfigPath(), JSON.stringify({ configFilePath }, null, 2), 'utf8');
}

// ─── OCI config loading ────────────────────────────────────────────────────────
// Mirrors the JSON-parsing block from cli.ts, but throws instead of process.exit().

const CONFIG_ALIAS_MAP: Record<string, string[]> = {
  OCI_USER_OCID:      ['OCI_USER_OCID', 'user', 'userOcid'],
  OCI_TENANCY_OCID:   ['OCI_TENANCY_OCID', 'tenancy', 'tenancyOcid'],
  OCI_REGION:         ['OCI_REGION', 'region'],
  OCI_FINGERPRINT:    ['OCI_FINGERPRINT', 'fingerprint'],
  OCI_KEY_FILE:       ['OCI_KEY_FILE', 'keyFile', 'key_file'],
  OCI_COMPARTMENT_ID: ['OCI_COMPARTMENT_ID', 'compartmentId', 'compartment_id'],
  ANTHROPIC_API_KEY:  ['ANTHROPIC_API_KEY'],
};

const REQUIRED_OCI_KEYS = [
  'OCI_USER_OCID',
  'OCI_TENANCY_OCID',
  'OCI_REGION',
  'OCI_FINGERPRINT',
  'OCI_KEY_FILE',
  'OCI_COMPARTMENT_ID',
];

function loadOciConfig(configFilePath: string): void {
  const ext = path.extname(configFilePath).toLowerCase();

  if (ext === '.json') {
    // ── JSON format ──────────────────────────────────────────────────────────
    let data: Record<string, string>;
    try {
      data = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Record<string, string>;
    } catch (err) {
      throw new Error(`Failed to parse JSON config: ${(err as Error).message}`);
    }
    for (const [envKey, aliases] of Object.entries(CONFIG_ALIAS_MAP)) {
      const found = aliases.find(a => data[a]);
      if (found && !process.env[envKey]) process.env[envKey] = data[found];
    }
  } else {
    // ── .env format (KEY=VALUE lines) ───────────────────────────────────────
    // Use dotenv's parse so we handle quoted values, comments, etc.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const dotenv = require('dotenv') as typeof import('dotenv');
    let raw: string;
    try {
      raw = fs.readFileSync(configFilePath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read .env file: ${(err as Error).message}`);
    }
    const parsed = dotenv.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const missing = REQUIRED_OCI_KEYS.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required config fields: ${missing.join(', ')}`);
  }
}

// ─── HTTP server lifecycle ─────────────────────────────────────────────────────

let httpServer: http.Server | null = null;

async function startServer(): Promise<number> {
  // All require() calls are dynamic so they happen AFTER process.env is populated.
  // Paths are relative to dist/electron/main.js → dist/ is one level up.
  /* eslint-disable @typescript-eslint/no-require-imports */

  // When bundled by esbuild, every module shares the same __dirname (the bundle's
  // output directory: dist/electron/).  Express's static middleware in index.ts uses
  // path.join(__dirname, '../public') which would resolve to dist/public/ — wrong.
  // Setting STATIC_DIR here (before index.ts is loaded) gives it the correct path.
  if (!process.env.STATIC_DIR) {
    process.env.STATIC_DIR = path.join(__dirname, '../../public');
  }

  const { configureOCIClient } = require('../oci/config') as typeof import('../oci/config');
  configureOCIClient();

  // Override the uncaughtException handler that index.ts registers (it calls process.exit(1),
  // which would kill Electron silently). Replace with a dialog-based handler.
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (err: Error) => {
    dialog.showErrorBox('Unexpected Error', err.message);
  });

  const { default: expressApp } = require('../index') as { default: import('express').Application };
  const { serverConfig } = require('../config') as { serverConfig: { port: number } };
  const { checkOCIDocsForUpdates } = require('../utils/doc-checker') as typeof import('../utils/doc-checker');

  const port = serverConfig.port;

  return new Promise((resolve, reject) => {
    httpServer = (expressApp as import('express').Application & { listen: Function }).listen(port, () => {
      // Non-blocking background doc freshness check
      checkOCIDocsForUpdates().catch(() => { /* swallow — non-fatal */ });
      resolve(port);
    });
    httpServer!.on('error', reject);
  });
}

// ─── BrowserWindows ────────────────────────────────────────────────────────────

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(
    'data:text/html,' +
    encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1a2e; color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100vh; text-align: center;
  }
  h2 { font-size: 22px; margin-bottom: 10px; color: #f05a28; }
  p  { font-size: 14px; color: #aaa; }
  .dot { animation: blink 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
</style></head>
<body>
  <div>
    <h2>OCI MCP Server</h2>
    <p>Starting server<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p>
  </div>
</body>
</html>`),
  );

  return splash;
}

function createMainWindow(port: number): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'OCI MCP Server',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  win.loadURL(`http://localhost:${port}`);

  // Remove default menu bar (keeps it clean for a developer tool)
  win.setMenuBarVisibility(false);

  return win;
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // ── 1. Load or pick config file ──
  let configFilePath = loadSavedConfigPath();

  if (!configFilePath) {
    const result = await dialog.showOpenDialog({
      title: 'Select OCI Config File',
      buttonLabel: 'Open',
      filters: [
        { name: 'Config Files', extensions: ['env', 'json'] },
        { name: 'dotenv (.env)', extensions: ['env'] },
        { name: 'JSON Config', extensions: ['json'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      app.quit();
      return;
    }

    configFilePath = result.filePaths[0];
    saveConfigPath(configFilePath);
  }

  // ── 2. Load config into process.env ──
  try {
    loadOciConfig(configFilePath);
  } catch (err) {
    dialog.showErrorBox('Configuration Error', (err as Error).message);
    app.quit();
    return;
  }

  // ── 3. Show splash ──
  const splash = createSplashWindow();

  // ── 4. Start Express server ──
  let port: number;
  try {
    port = await startServer();
  } catch (err) {
    splash.close();
    dialog.showErrorBox('Server Failed to Start', (err as Error).message);
    app.quit();
    return;
  }

  // ── 5. Open main window; close splash once the page loads ──
  const win = createMainWindow(port);

  win.webContents.on('did-finish-load', () => {
    splash.close();
    win.show();
    win.focus();
  });

  // Retry once if the first load fails (e.g. server not fully ready)
  win.webContents.on('did-fail-load', () => {
    setTimeout(() => win.loadURL(`http://localhost:${port}`), 500);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (httpServer?.listening) {
    event.preventDefault();
    httpServer.close(() => {
      httpServer = null;
      app.quit();
    });
  }
});
