import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, RotateCcw } from 'lucide-react'
import { getToken } from '@/lib/api'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n'

interface BackupManifest {
  format: number
  exportedAt: string
  appVersion: string
  stats: {
    users: number
    sessions: number
    apiKeys: number
    settings: number
    models: number
    requests: number
    profiles: number
  }
}

interface BackupInfo {
  manifest: BackupManifest
  sizeBytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BackupPage() {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<BackupInfo | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const exportBackup = useMutation({
    mutationFn: async () => {
      const token = getToken()
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/api/backup/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: { message: res.statusText } }))
        throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match?.[1] ?? `freellmapi-backup-${Date.now()}.freellmapi`
      return { blob, filename }
    },
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  const inspectBackup = useMutation({
    mutationFn: async (file: File) => {
      const token = getToken()
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/api/backup/inspect`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      return body as BackupInfo
    },
    onSuccess: (info) => setPreview(info),
  })

  const restoreBackup = useMutation({
    mutationFn: async (file: File) => {
      const token = getToken()
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      const res = await fetch(`${base}/api/backup/restore`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`)
      return body
    },
    onSuccess: () => {
      setPreview(null)
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  async function onFileSelected(file: File | null) {
    setSelectedFile(file)
    setPreview(null)
    if (file) inspectBackup.mutate(file)
  }

  return (
    <div>
      <PageHeader
        title={t('backup.title')}
        description={t('backup.description')}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium">{t('backup.exportTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t('backup.exportDescription')}</p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>{t('backup.includesLogin')}</li>
            <li>{t('backup.includesKeys')}</li>
            <li>{t('backup.includesRouting')}</li>
            <li>{t('backup.includesAnalytics')}</li>
          </ul>
          <Button
            onClick={() => exportBackup.mutate()}
            disabled={exportBackup.isPending}
          >
            <Download className={exportBackup.isPending ? 'animate-pulse' : ''} />
            {exportBackup.isPending ? t('backup.exporting') : t('backup.export')}
          </Button>
          {exportBackup.isError && (
            <p className="text-xs text-destructive">{(exportBackup.error as Error).message}</p>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium">{t('backup.restoreTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t('backup.restoreDescription')}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs" htmlFor="backup-file">{t('backup.chooseFile')}</Label>
            <input
              ref={fileRef}
              id="backup-file"
              type="file"
              accept=".freellmapi,application/octet-stream"
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
          </div>

          {inspectBackup.isPending && (
            <p className="text-xs text-muted-foreground">{t('backup.inspecting')}</p>
          )}

          {preview && (
            <div className="rounded-2xl border bg-muted/30 p-3 text-xs space-y-1">
              <p><span className="text-muted-foreground">{t('backup.exportedAt')}:</span> {new Date(preview.manifest.exportedAt).toLocaleString()}</p>
              <p><span className="text-muted-foreground">{t('backup.fileSize')}:</span> {formatBytes(preview.sizeBytes)}</p>
              <p><span className="text-muted-foreground">{t('backup.appVersion')}:</span> {preview.manifest.appVersion}</p>
              <p>{preview.manifest.stats.users} {t('backup.users')} · {preview.manifest.stats.apiKeys} {t('backup.apiKeys')} · {preview.manifest.stats.requests} {t('backup.requests')}</p>
            </div>
          )}

          <Button
            variant="outline"
            disabled={!selectedFile || restoreBackup.isPending}
            onClick={() => {
              if (!selectedFile) return
              if (!window.confirm(t('backup.restoreConfirm'))) return
              restoreBackup.mutate(selectedFile)
            }}
          >
            <RotateCcw className={restoreBackup.isPending ? 'animate-spin' : ''} />
            {restoreBackup.isPending ? t('backup.restoring') : t('backup.restore')}
          </Button>

          {restoreBackup.isError && (
            <p className="text-xs text-destructive">{(restoreBackup.error as Error).message}</p>
          )}

          {restoreBackup.isSuccess && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {t('backup.restoreSuccess')}
            </div>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">{t('backup.securityNote')}</p>
    </div>
  )
}
