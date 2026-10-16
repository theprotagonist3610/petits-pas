import type { Settings } from '@/data/types'

/** Une sauvegarde de plus de 30 jours est considérée comme ancienne. */
export const BACKUP_STALE_DAYS = 30
/** Sans souvenir, on laisse au parent une semaine de découverte avant de proposer la première sauvegarde. */
const FIRST_BACKUP_AFTER_DAYS = 7

export type BackupReminder = 'never' | 'stale'

const daysSince = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / 86_400_000

export function backupReminder(settings: Settings, memoryCount: number, now: Date = new Date()): BackupReminder | undefined {
  if (settings.lastBackupAt) return daysSince(settings.lastBackupAt, now) > BACKUP_STALE_DAYS ? 'stale' : undefined
  const settled = settings.onboardedAt !== undefined && daysSince(settings.onboardedAt, now) > FIRST_BACKUP_AFTER_DAYS
  return memoryCount > 0 || settled ? 'never' : undefined
}
