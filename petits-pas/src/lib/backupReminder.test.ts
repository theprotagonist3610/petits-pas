import { describe, expect, it } from 'vitest'
import { backupReminder } from './backupReminder'

const now = new Date('2026-10-15T12:00:00Z')

describe('backupReminder', () => {
  it('ne dérange pas un parent qui vient d’installer l’application', () => {
    expect(backupReminder({ locale: 'fr', onboardedAt: '2026-10-12T00:00:00Z' }, 0, now)).toBeUndefined()
  })
  it('propose une première sauvegarde dès le premier souvenir, ou après une semaine', () => {
    expect(backupReminder({ locale: 'fr', onboardedAt: '2026-10-12T00:00:00Z' }, 1, now)).toBe('never')
    expect(backupReminder({ locale: 'fr', onboardedAt: '2026-10-01T00:00:00Z' }, 0, now)).toBe('never')
  })
  it('rappelle une sauvegarde de plus de 30 jours', () => {
    expect(backupReminder({ locale: 'fr', lastBackupAt: '2026-10-01T00:00:00Z' }, 5, now)).toBeUndefined()
    expect(backupReminder({ locale: 'fr', lastBackupAt: '2026-09-01T00:00:00Z' }, 5, now)).toBe('stale')
  })
})
