import { describe, it, expect } from 'vitest';
import { encodeBackup, decodeBackup, inspectBackup } from '../../services/backup/format.js';

describe('backup format', () => {
  const manifest = {
    format: 1 as const,
    exportedAt: '2026-06-25T12:00:00.000Z',
    appVersion: '0.2.1',
    encryptionKey: '0'.repeat(64),
    stats: {
      users: 1,
      sessions: 2,
      apiKeys: 3,
      settings: 4,
      models: 5,
      requests: 6,
      profiles: 0,
    },
  };

  it('round-trips manifest + database bytes', () => {
    const database = Buffer.from('sqlite-bytes');
    const file = encodeBackup(manifest, database);
    const decoded = decodeBackup(file);
    expect(decoded.manifest).toEqual(manifest);
    expect(decoded.database.equals(database)).toBe(true);
    expect(inspectBackup(file).sizeBytes).toBe(file.length);
  });

  it('rejects invalid files', () => {
    expect(() => decodeBackup(Buffer.alloc(20, 0))).toThrow(/Not a FreeLLMAPI backup/);
  });
});
