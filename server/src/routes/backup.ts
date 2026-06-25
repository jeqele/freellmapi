import { Router } from 'express';
import type { Request, Response } from 'express';
import express from 'express';
import { exportBackup, inspectBackupFile, restoreBackup } from '../services/backup/index.js';
import { sanitizeManifestForClient } from '../services/backup/format.js';

export const backupRouter = Router();
const upload = express.raw({
  type: ['application/octet-stream', 'application/x-freellmapi-backup', 'application/octet-stream'],
  limit: '256mb',
});

backupRouter.get('/export', async (_req: Request, res: Response) => {
  try {
    const { buffer, filename, manifest } = await exportBackup();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Exported-At', manifest.exportedAt);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
});

backupRouter.post('/inspect', upload, (req: Request, res: Response) => {
  try {
    const file = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    if (!file.length) {
      res.status(400).json({ error: { message: 'Upload a backup file in the request body' } });
      return;
    }
    const info = inspectBackupFile(file);
    res.json({
      manifest: sanitizeManifestForClient(info.manifest),
      sizeBytes: info.sizeBytes,
    });
  } catch (err) {
    res.status(400).json({ error: { message: (err as Error).message } });
  }
});

backupRouter.post('/restore', upload, (req: Request, res: Response) => {
  try {
    const file = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    if (!file.length) {
      res.status(400).json({ error: { message: 'Upload a backup file in the request body' } });
      return;
    }
    const manifest = restoreBackup(file);
    res.json({
      restoredAt: new Date().toISOString(),
      manifest: sanitizeManifestForClient(manifest),
      restartRequired: true,
    });
  } catch (err) {
    res.status(400).json({ error: { message: (err as Error).message } });
  }
});
