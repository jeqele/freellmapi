import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { closeDb, getDb, getDbPath, initDb } from '../../db/index.js';
import { getAppVersion } from '../../version.js';
import {
  BACKUP_EXTENSION,
  type BackupManifest,
  type BackupStats,
  decodeBackup,
  defaultBackupFilename,
  encodeBackup,
  inspectBackup,
  type BackupInfo,
} from './format.js';

const PLACEHOLDER_KEY = 'your-64-char-hex-key-here';
const KEY_HEX_LEN = 64;

function countTable(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return row.c;
}

function collectStats(db: Database.Database): BackupStats {
  return {
    users: countTable(db, 'users'),
    sessions: countTable(db, 'sessions'),
    apiKeys: countTable(db, 'api_keys'),
    settings: countTable(db, 'settings'),
    models: countTable(db, 'models'),
    requests: countTable(db, 'requests'),
    profiles: countTable(db, 'profiles'),
  };
}

function resolveActiveEncryptionKeyHex(db: Database.Database): string {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey !== PLACEHOLDER_KEY) {
    if (envKey.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(envKey)) {
      throw new Error(`Invalid ENCRYPTION_KEY env var (expected ${KEY_HEX_LEN} hex chars)`);
    }
    return envKey.toLowerCase();
  }

  const row = db.prepare("SELECT value FROM settings WHERE key = 'encryption_key'").get() as { value: string } | undefined;
  if (!row?.value) {
    throw new Error('No encryption key found — cannot create a portable backup');
  }
  if (row.value.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(row.value)) {
    throw new Error('Stored encryption_key setting is invalid');
  }
  return row.value.toLowerCase();
}

async function snapshotDatabase(sourceDb: Database.Database, destPath: string): Promise<void> {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  await sourceDb.backup(destPath);
}

function removeWalFiles(dbPath: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const file = dbPath + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function ensureEncryptionKeyPersisted(db: Database.Database, encryptionKey: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('encryption_key', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(encryptionKey);
}

export async function exportBackup(dbPath = getDbPath()): Promise<{ buffer: Buffer; filename: string; manifest: BackupManifest }> {
  const db = getDb();
  const encryptionKey = resolveActiveEncryptionKeyHex(db);
  ensureEncryptionKeyPersisted(db, encryptionKey);

  const tmpPath = path.join(os.tmpdir(), `freellmapi-export-${Date.now()}.db`);
  try {
    await snapshotDatabase(db, tmpPath);
    const database = readFileSync(tmpPath);
    const manifest: BackupManifest = {
      format: 1,
      exportedAt: new Date().toISOString(),
      appVersion: getAppVersion(),
      encryptionKey,
      stats: collectStats(db),
    };
    const buffer = encodeBackup(manifest, database);
    return {
      buffer,
      filename: defaultBackupFilename(),
      manifest,
    };
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

export function inspectBackupFile(file: Buffer): BackupInfo {
  return inspectBackup(file);
}

export function restoreBackup(file: Buffer, dbPath = getDbPath()): BackupManifest {
  const { manifest, database } = decodeBackup(file);

  if (!manifest.encryptionKey || manifest.encryptionKey.length !== KEY_HEX_LEN) {
    throw new Error('Backup manifest is missing a valid encryption key');
  }

  const dataDir = path.dirname(dbPath);
  fs.mkdirSync(dataDir, { recursive: true });

  closeDb();
  removeWalFiles(dbPath);
  fs.writeFileSync(dbPath, database);
  removeWalFiles(dbPath);

  const restored = new Database(dbPath);
  try {
    ensureEncryptionKeyPersisted(restored, manifest.encryptionKey.toLowerCase());
  } finally {
    restored.close();
  }

  initDb(dbPath);
  return manifest;
}

export { BACKUP_EXTENSION, defaultBackupFilename };
