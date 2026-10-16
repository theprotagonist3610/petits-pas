import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMemoryCount, useSettings } from '@/data/hooks'
import { backupReminder } from '@/lib/backupReminder'
import { Icon } from '@/components/Icon'

/** Rappel de sauvegarde sur l'accueil (léger : n'embarque pas le code du .zip). */
export function BackupReminderBanner() {
  const { t } = useTranslation()
  const settings = useSettings()
  const memoryCount = useMemoryCount()
  if (!settings || memoryCount === undefined) return null
  const reminder = backupReminder(settings, memoryCount)
  if (!reminder) return null

  return (
    <Link to="/sauvegarde" className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface p-3 font-bold shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sun-soft text-sun">
        <Icon name="shield" size={20} />
      </span>
      <span className="flex-1">{t(`backup.reminder.${reminder}`)}</span>
      <Icon name="chevronRight" size={20} className="text-ink-soft" />
    </Link>
  )
}
