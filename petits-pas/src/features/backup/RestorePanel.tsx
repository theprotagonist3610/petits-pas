import { useId, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { repos, type RestoreMode } from '@/data'
import { BackupError, readBackupZip, summarize, type BackupSummary, type ParsedBackup } from '@/lib/backup'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'

export function summaryText(t: TFunction, s: BackupSummary): string {
  return (['children', 'memories', 'photos', 'measurements'] as const)
    .filter((key) => key === 'children' || s[key] > 0)
    .map((key) => t(`backup.summary.${key}`, { count: s[key] }))
    .join(' · ')
}

interface Props {
  /** Premier lancement sur un nouveau téléphone : pas de données à fusionner. */
  fresh?: boolean
  onRestored: () => void
}

export function RestorePanel({ fresh = false, onRestored }: Props) {
  const { t } = useTranslation()
  const inputId = useId()
  const [parsed, setParsed] = useState<ParsedBackup>()
  const [mode, setMode] = useState<RestoreMode>(fresh ? 'replace' : 'merge')
  const [status, setStatus] = useState<'idle' | 'reading' | 'restoring' | 'done'>('idle')
  const [error, setError] = useState<string>()

  async function pick(file: File | undefined) {
    if (!file) return
    setError(undefined)
    setParsed(undefined)
    setStatus('reading')
    try {
      setParsed(readBackupZip(new Uint8Array(await file.arrayBuffer())))
    } catch (e) {
      setError(t(`backup.restore.errors.${e instanceof BackupError ? e.code : 'unknown'}`))
    } finally {
      setStatus('idle')
    }
  }

  async function restore() {
    if (!parsed) return
    if (!fresh && mode === 'replace' && !window.confirm(t('backup.restore.confirmReplace'))) return
    setStatus('restoring')
    try {
      await repos.backup.restore(parsed.dump, mode)
      setStatus('done')
      setTimeout(onRestored, 1500)
    } catch {
      setError(t('backup.restore.errors.unknown'))
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return <p className="rounded-2xl bg-leaf-soft p-4 text-center font-bold text-leaf">{t('backup.restore.success')}</p>
  }

  return (
    <div className="space-y-3">
      {!parsed && (
        <>
          <label
            htmlFor={inputId}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 font-bold text-sky-brand"
          >
            <Icon name="download" size={20} className="rotate-180" />
            {status === 'reading' ? t('backup.restore.reading') : t('backup.restore.choose')}
          </label>
          <input
            id={inputId}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </>
      )}

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

      {parsed && (
        <div className="space-y-3 rounded-2xl bg-sky-soft p-4">
          <p className="font-extrabold">{t('backup.restore.found', { date: formatDate(parsed.exportedAt.slice(0, 10)) })}</p>
          <p className="text-sm">{summaryText(t, summarize(parsed.dump))}</p>

          {!fresh && (
            <div className="space-y-2" role="radiogroup">
              {(['merge', 'replace'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 bg-surface p-3 text-left ${mode === m ? 'border-sky-brand' : 'border-transparent'}`}
                >
                  <span className={`mt-1 size-4 shrink-0 rounded-full border-2 ${mode === m ? 'border-sky-brand bg-sky-brand' : 'border-line'}`} />
                  <span>
                    <span className="block font-bold">{t(`backup.restore.${m}`)}</span>
                    <span className="block text-sm text-ink-soft">{t(`backup.restore.${m}Hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <Button onClick={() => void restore()} disabled={status === 'restoring'}>
            {t('backup.restore.start')}
          </Button>
          <button type="button" onClick={() => setParsed(undefined)} className="w-full text-sm font-bold text-ink-soft">
            {t('backup.restore.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
