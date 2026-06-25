import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

function readVersionFromPkg(pkgPath: string): string | undefined {
  if (!fs.existsSync(pkgPath)) return undefined;
  const version = (JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }).version;
  return version || undefined;
}

/** App version for manifests/logs — must not read package.json at module load (breaks Electron bundle). */
export function getAppVersion(): string {
  if (process.env.FREEAPI_VERSION) return process.env.FREEAPI_VERSION;

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(here, '../package.json'),
      path.join(here, '../../package.json'),
    ];
    for (const pkgPath of candidates) {
      const version = readVersionFromPkg(pkgPath);
      if (version) return version;
    }
    const require = createRequire(import.meta.url);
    const version = (require('../package.json') as { version?: string }).version;
    if (version) return version;
  } catch {
    // Packaged desktop bundle — version should come from FREEAPI_VERSION.
  }

  return 'unknown';
}
