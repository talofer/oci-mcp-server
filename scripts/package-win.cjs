/**
 * Windows distribution packaging script.
 *
 * Build pipeline:
 *   1. Temporarily empties package.json "dependencies" so electron-builder's
 *      npm dependency scan is instant (everything is already bundled).
 *   2. Runs electron-builder with the "dir" target — creates win-unpacked/
 *      (Electron binary + our app.asar) without needing code-signing tools.
 *   3. Zips win-unpacked/ into a portable ZIP using 7za.exe (already in
 *      node_modules/7zip-bin) and copies it to installer/.
 *
 * Why not NSIS/portable?
 *   electron-builder 26.x always extracts winCodeSign (macOS code-signing
 *   tools) as part of NSIS/portable/zip creation. That extraction creates
 *   symlinks which fail on Windows without Developer Mode or admin rights.
 *   The "dir" target skips that step entirely.
 *
 * Output: installer/OCI-MCP-Server-<version>-win-x64.zip
 *   → user extracts the zip, double-clicks "OCI MCP Server.exe"
 */

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

const root        = path.join(__dirname, '..');
const pkgPath     = path.join(root, 'package.json');
const pkgOriginal = fs.readFileSync(pkgPath, 'utf8');
const pkg         = JSON.parse(pkgOriginal);

const winUnpacked = path.join(root, 'installer', 'win-unpacked');
const zipOut      = path.join(root, 'installer', `OCI-MCP-Server-${pkg.version}-win-x64.zip`);
const sevenZa     = path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

let restored = false;
function restorePkg() {
  if (!restored) {
    fs.writeFileSync(pkgPath, pkgOriginal, 'utf8');
    restored = true;
    console.log('  ✓ package.json restored');
  }
}
process.on('exit',    restorePkg);
process.on('SIGINT',  () => { restorePkg(); process.exit(130); });
process.on('SIGTERM', () => { restorePkg(); process.exit(143); });

// ── Step 1: strip deps, run electron-builder --win dir ───────────────────────
console.log('\n[1/3] Packaging app with electron-builder (dir target)…');
const stripped = { ...pkg, dependencies: {} };
fs.writeFileSync(pkgPath, JSON.stringify(stripped, null, 2), 'utf8');

try {
  execSync('npx electron-builder --win dir', {
    stdio: 'inherit',
    cwd:   root,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      WIN_CSC_LINK:                '',
      NODE_OPTIONS:                '--max-old-space-size=4096',
    },
  });
} catch {
  // electron-builder exits non-zero even on success sometimes; check output dir
  if (!fs.existsSync(path.join(winUnpacked, 'OCI MCP Server.exe'))) {
    console.error('\n✗ electron-builder failed to create win-unpacked. Aborting.');
    process.exit(1);
  }
  console.log('  (electron-builder exited with warning; continuing…)');
}

restorePkg();

// ── Step 2: verify win-unpacked ───────────────────────────────────────────────
if (!fs.existsSync(path.join(winUnpacked, 'OCI MCP Server.exe'))) {
  console.error(`\n✗ Expected ${winUnpacked}\\OCI MCP Server.exe not found.`);
  process.exit(1);
}
console.log('\n[2/3] win-unpacked is ready ✓');
console.log(`      ${winUnpacked}`);

// ── Step 3: zip win-unpacked → installer ZIP ─────────────────────────────────
console.log('\n[3/3] Creating ZIP archive…');

// Remove old zip if it exists
if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);

// 7za a <zipOut> <winUnpacked>\*  -r  -mx=5
// -mx=5  normal compression (fast); adjust to 9 for smaller file
execSync(
  `"${sevenZa}" a "${zipOut}" "${winUnpacked}${path.sep}*" -r -mx=5`,
  { stdio: 'inherit', cwd: root },
);

const zipSizeMb = (fs.statSync(zipOut).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ Done!`);
console.log(`  Installer: ${zipOut}`);
console.log(`  Size:      ${zipSizeMb} MB`);
console.log(`\n  Extract the ZIP and double-click "OCI MCP Server.exe" to launch.`);
