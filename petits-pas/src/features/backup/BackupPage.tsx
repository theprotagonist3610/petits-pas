import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos } from '@/data'
import { useMemoryCount, useSettings } from '@/data/hooks'
import { backupFileName, createBackupZip } from '@/lib/backup'
import { backupReminder } from '@/lib/backupReminder'
import { formatDate } from '@/lib/format'
import { requestPersistentStorage } from '@/lib/storage'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { RestorePanel, summaryText } from './RestorePanel'

const ZIP = 'application/zip'

function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([], 'test.zip', { type: ZIP })] })
  } catch {
    return false
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function BackupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useSettings()
  const memoryCount = useMemoryCount()
  const summary = useLiveQuery(() => repos.backup.counts(), [])
  const [status, setStatus] = useState<'idle' | 'preparing' | 'done'>('idle')
  const shareable = canShareFiles()

  if (!settings || memoryCount === undefined) return null
  const reminder = backupReminder(settings, memoryCount)

  async function save(how: 'share' | 'download') {
    setStatus('preparing')
    try {
      const zip = await createBackupZip(await repos.backup.dump())
      const file = new File([zip as Uint8Array<ArrayBuffer>], backupFileName(), { type: ZIP })
      if (how === 'share') await navigator.share({ files: [file], title: t('backup.title') })
      else download(file)
      await repos.settings.update({ lastBackupAt: new Date().toISOString() })
      setStatus('done')
    } catch {
      // Partage annulé : la sauvegarde n'est pas comptée comme faite.
      setStatus('idle')
    }
  }

  async function protect() {
    await repos.settings.update({ persisted: await requestPersistentStorage() })
  }

  return (
    <>
      <PageHeader title={t('backup.title')} />
      <div className="space-y-5">
        <section className={`rounded-3xl p-4 ${reminder ? 'bg-honey-soft' : 'bg-leaf-soft'}`}>
          <p className="flex items-center gap-2 font-extrabold">
            <Icon name="shield" size={20} className={reminder ? 'text-sun' : 'text-leaf'} />
            {settings.lastBackupAt ? t('backup.last', { date: formatDate(settings.lastBackupAt.slice(0, 10)) }) : t('backup.never')}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {reminder === 'never' || !settings.lastBackupAt ? t('backup.neverText') : reminder === 'stale' ? t('backup.staleText') : t('backup.okText')}
          </p>
          {summary && <p className="mt-2 text-sm font-semibold text-ink-soft">{t('backup.contents', { summary: summaryText(t, summary) })}</p>}
        </section>

        <section className="space-y-3 rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="text-lg font-extrabold">{t('backup.save.title')}</h2>
          <p className="text-sm leading-relaxed text-ink-soft">{t('backup.save.text')}</p>
          {status === 'preparing' ? (
            <p className="rounded-2xl bg-cream p-3 text-center font-bold text-ink-soft">{t('backup.save.preparing')}</p>
          ) : (
            <>
              {shareable && (
                <Button onClick={() => void save('share')}>
                  <Icon name="share" size={20} /> {t('backup.save.share')}
                </Button>
              )}
              <Button variant={shareable ? 'secondary' : 'primary'} onClick={() => void save('download')}>
                <Icon name="download" size={20} /> {t('backup.save.download')}
              </Button>
            </>
          )}
          {status === 'done' && <p className="rounded-2xl bg-leaf-soft p-3 text-sm font-bold text-leaf">{t('backup.save.done')}</p>}
          <p className="text-xs text-ink-soft">{t('backup.save.privacy')}</p>
        </section>

        <section className="space-y-3 rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="text-lg font-extrabold">{t('backup.restore.title')}</h2>
          <p className="text-sm leading-relaxed text-ink-soft">{t('backup.restore.text')}</p>
          <RestorePanel onRestored={() => navigate('/', { replace: true })} />
        </section>

        <section className="rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="mb-2 font-extrabold">{t('settings.storage')}</h2>
          <p className={`flex gap-2 text-sm font-semibold ${settings.persisted ? 'text-leaf' : 'text-sun'}`}>
            <Icon name="shield" size={18} className="shrink-0" />
            {settings.persisted ? t('settings.persisted') : t('settings.notPersisted')}
          </p>
          {!settings.persisted && (
            <Button variant="secondary" className="mt-3" onClick={() => void protect()}>
              {t('settings.protect')}
            </Button>
          )}
        </section>
      </div>
    </>
  )
}
