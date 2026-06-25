export const BACKUP_MAGIC = Buffer.from('FREELLMAPI\0', 'ascii');
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = '.freellmapi';

export interface BackupManifest {
  format: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  appVersion: string;
  encryptionKey: string;
  stats: BackupStats;
}

export interface BackupStats {
  users: number;
  sessions: number;
  apiKeys: number;
  settings: number;
  models: number;
  requests: number;
  profiles: number;
}

export interface BackupInfo {
  manifest: BackupManifest;
  sizeBytes: number;
}

export function defaultBackupFilename(date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `freellmapi-backup-${stamp}${BACKUP_EXTENSION}`;
}

export function encodeBackup(manifest: BackupManifest, database: Buffer): Buffer {
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBytes.length > 0xffff_ffff) {
    throw new Error('Backup manifest is too large');
  }

  const header = Buffer.alloc(4);
  header.writeUInt32BE(manifestBytes.length, 0);

  return Buffer.concat([
    BACKUP_MAGIC,
    Buffer.from([BACKUP_FORMAT_VERSION]),
    header,
    manifestBytes,
    database,
  ]);
}

export function decodeBackup(file: Buffer): { manifest: BackupManifest; database: Buffer } {
  if (file.length < BACKUP_MAGIC.length + 1 + 4) {
    throw new Error('File is too small to be a FreeLLMAPI backup');
  }

  const magic = file.subarray(0, BACKUP_MAGIC.length);
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new Error('Not a FreeLLMAPI backup file (invalid header)');
  }

  const version = file[BACKUP_MAGIC.length];
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${version}`);
  }

  const manifestLen = file.readUInt32BE(BACKUP_MAGIC.length + 1);
  const manifestStart = BACKUP_MAGIC.length + 1 + 4;
  const manifestEnd = manifestStart + manifestLen;
  if (manifestEnd > file.length) {
    throw new Error('Backup file is truncated or corrupt');
  }

  const manifest = JSON.parse(file.subarray(manifestStart, manifestEnd).toString('utf8')) as BackupManifest;
  const database = file.subarray(manifestEnd);
  if (!database.length) {
    throw new Error('Backup file is missing database contents');
  }

  return { manifest, database };
}

export function sanitizeManifestForClient(manifest: BackupManifest): Omit<BackupManifest, 'encryptionKey'> {
  const { encryptionKey: _removed, ...safe } = manifest;
  return safe;
}

export function inspectBackup(file: Buffer): BackupInfo {
  const { manifest, database } = decodeBackup(file);
  return {
    manifest,
    sizeBytes: file.length,
  };
}
