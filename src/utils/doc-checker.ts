/**
 * OCI Documentation Version Checker
 *
 * On every server startup this module makes lightweight HEAD requests to key
 * OCI best-practice documentation pages and compares the `Last-Modified`
 * response header against the values stored in `data/oci-docs-versions.json`.
 *
 * If any page has been updated since the last check a WARNING is logged so
 * the operator knows to review `src/chat/tools.ts` and keep the system
 * prompt in sync with Oracle's latest guidance.
 *
 * The check is fully non-blocking — startup proceeds even if the network
 * is unavailable or a request times out.
 */

import https from 'https';
import fs   from 'fs';
import path from 'path';
import logger from './logger';

// ─── Tracked documentation pages ─────────────────────────────────────────────

const TRACKED_DOCS = [
  {
    key:  'well-architected-framework',
    name: 'OCI Well-Architected Framework',
    url:  'https://docs.oracle.com/en/solutions/oci-best-practices/index.html',
  },
  {
    key:  'compute-best-practices',
    name: 'OCI Compute Best Practices',
    url:  'https://docs.oracle.com/en-us/iaas/Content/Compute/References/bestpracticescompute.htm',
  },
  {
    key:  'security-guide',
    name: 'OCI Security Guide',
    url:  'https://docs.oracle.com/en-us/iaas/Content/Security/Concepts/security_guide.htm',
  },
  {
    key:  'network-best-practices',
    name: 'OCI Networking Best Practices',
    url:  'https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/bestpracticesoverview.htm',
  },
  {
    key:  'cost-management',
    name: 'OCI Cost Management Best Practices',
    url:  'https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/costmanagementoverview.htm',
  },
] as const;

// ─── Persistence ──────────────────────────────────────────────────────────────

const VERSIONS_FILE = path.join(process.cwd(), 'data', 'oci-docs-versions.json');

interface StoredDoc {
  url:          string;
  name:         string;
  lastModified: string | null;
  lastChecked:  string;
}

type StoredVersions = Record<string, StoredDoc>;

function load(): StoredVersions {
  try {
    if (fs.existsSync(VERSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8')) as StoredVersions;
    }
  } catch { /* corrupt file — start fresh */ }
  return {};
}

function save(versions: StoredVersions): void {
  try {
    const dir = path.dirname(VERSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2), 'utf8');
  } catch (err) {
    logger.warn('Could not persist OCI docs version cache', { err });
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function headLastModified(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        resolve(res.headers['last-modified'] ?? null);
        res.resume(); // consume and discard response body
      });
      req.on('error',   () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function checkOCIDocsForUpdates(): Promise<void> {
  logger.info('Checking OCI documentation for updates…');

  const stored  = load();
  const now     = new Date().toISOString();
  const updated: string[] = [];

  await Promise.all(
    TRACKED_DOCS.map(async (doc) => {
      const lastModified = await headLastModified(doc.url);
      const prev = stored[doc.key];

      if (!prev) {
        // First run — just record the baseline
        stored[doc.key] = { url: doc.url, name: doc.name, lastModified, lastChecked: now };
        logger.info(`OCI docs baseline recorded: "${doc.name}" — ${lastModified ?? 'no Last-Modified header'}`);
      } else if (lastModified && prev.lastModified && lastModified !== prev.lastModified) {
        // Page has been updated since last check
        updated.push(doc.name);
        logger.warn(`OCI documentation UPDATED: "${doc.name}"`, {
          previous:  prev.lastModified,
          current:   lastModified,
          url:       doc.url,
          action:    'Review src/chat/tools.ts OCI_SYSTEM_PROMPT and update best-practice guidance if needed',
        });
        stored[doc.key] = { ...prev, lastModified, lastChecked: now };
      } else {
        // No change (or couldn't determine — treat as unchanged)
        stored[doc.key] = { ...prev, lastChecked: now };
        logger.debug(`OCI docs unchanged: "${doc.name}"`);
      }
    }),
  );

  save(stored);

  if (updated.length > 0) {
    logger.warn(
      `⚠️  ${updated.length} OCI documentation page(s) have changed since last startup:\n` +
      updated.map(n => `   • ${n}`).join('\n') +
      '\n   Review src/chat/tools.ts → OCI_SYSTEM_PROMPT to keep best practices up to date.',
    );
  } else {
    logger.info('OCI documentation check complete — all pages are up to date ✓');
  }
}
