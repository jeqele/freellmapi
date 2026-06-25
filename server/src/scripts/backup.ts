/**
 * backup — export or restore a complete FreeLLMAPI snapshot as a single file.
 *
 * The .freellmapi file contains the full SQLite database plus metadata
 * (login accounts, API keys, routing, settings, analytics history).
 *
 * Usage:
 *   tsx src/scripts/backup.ts export [--out <path.freellmapi>] [--db <path>]
 *   tsx src/scripts/backup.ts restore --from <path.freellmapi> [--db <path>]
 *   tsx src/scripts/backup.ts inspect --from <path.freellmapi>
 */
import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getDbPath } from '../db/index.js';
import {
  exportBackup,
  inspectBackupFile,
  restoreBackup,
  defaultBackupFilename,
} from '../services/backup/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = path.resolve(__dirname, '../../data/freeapi.db');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd) {
    throw new Error('Usage: backup.ts <export|restore|inspect> [options]');
  }

  const dbPath = path.resolve(arg('db') ?? DEFAULT_DB);

  if (cmd !== 'inspect') {
    initDb(dbPath);
  }

  switch (cmd) {
    case 'export': {
      const outPath = path.resolve(arg('out') ?? defaultBackupFilename());
      const { buffer, manifest } = await exportBackup(dbPath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buffer);
      console.log(`Exported backup: ${outPath}`);
      console.log(`  users: ${manifest.stats.users}`);
      console.log(`  api keys: ${manifest.stats.apiKeys}`);
      console.log(`  settings: ${manifest.stats.settings}`);
      console.log(`  requests: ${manifest.stats.requests}`);
      break;
    }
    case 'restore': {
      const from = arg('from');
      if (!from) throw new Error('Specify --from <path.freellmapi>');
      const file = fs.readFileSync(path.resolve(from));
      const manifest = restoreBackup(file, dbPath);
      console.log(`Restored backup from ${from} -> ${getDbPath()}`);
      console.log(`  exported: ${manifest.exportedAt}`);
      console.log(`  users: ${manifest.stats.users}`);
      console.log(`  api keys: ${manifest.stats.apiKeys}`);
      console.log('Restart the server for the restored state to load.');
      break;
    }
    case 'inspect': {
      const from = arg('from');
      if (!from) throw new Error('Specify --from <path.freellmapi>');
      const file = fs.readFileSync(path.resolve(from));
      const info = inspectBackupFile(file);
      console.log(JSON.stringify(info, null, 2));
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
