/**
 * esbuild bundle script for the Electron desktop app.
 *
 * Bundles src/electron/main.ts (and all its transitive dependencies —
 * Express, OCI SDK, Anthropic SDK, Winston, dotenv, etc.) into a single
 * self-contained CommonJS file at dist/electron/main.js.
 *
 * Only 'electron' is marked external because it is provided at runtime
 * by the Electron binary itself. All Node.js built-ins (fs, path, http,
 * etc.) are automatically external when platform='node'.
 *
 * This eliminates the need to bundle node_modules into the installer,
 * reducing installer size and avoiding electron-builder's OOM on large
 * dependency trees.
 */

const esbuild = require('esbuild');
const path    = require('path');
const fs      = require('fs');

const root    = path.join(__dirname, '..');
const outfile = path.join(root, 'dist', 'electron', 'main.js');

// Ensure output directory exists
fs.mkdirSync(path.dirname(outfile), { recursive: true });

esbuild.build({
  entryPoints: [path.join(root, 'src', 'electron', 'main.ts')],
  bundle:      true,
  platform:    'node',
  target:      'node22',       // Electron 41 ships Node 22
  format:      'cjs',
  outfile,
  external:    ['electron'],   // provided by the Electron binary at runtime
  minify:      false,          // keep readable for error tracing
  sourcemap:   false,
  // Preserve __dirname / __filename semantics in the bundle
  define: {
    '__dirname': '__dirname',
  },
  // Log bundle size for visibility
  metafile: true,
}).then((result) => {
  const size = fs.statSync(outfile).size;
  const mb   = (size / 1024 / 1024).toFixed(1);
  console.log(`✓  Electron bundle → dist/electron/main.js (${mb} MB)`);

  // Log the largest bundled inputs so we can spot bloat early
  if (result.metafile) {
    const inputs = Object.entries(result.metafile.inputs)
      .map(([file, meta]) => ({ file, bytes: meta.bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 10);

    console.log('\n  Largest bundled inputs:');
    for (const { file, bytes } of inputs) {
      const kb = (bytes / 1024).toFixed(0);
      console.log(`    ${kb.padStart(6)} KB  ${file}`);
    }
  }
}).catch((err) => {
  console.error('esbuild failed:', err.message);
  process.exit(1);
});
