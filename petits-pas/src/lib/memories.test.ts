import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import type { Child } from '@/data/types'
import { countWords, earliestMemoryDate, memoryAgeLabel } from './memories'

const child: Child = { id: 'c', firstName: 'Awa', birthDate: '2026-01-15', sex: 'female', gestationWeeks: 40, createdAt: '' }
const t = ((key: string, opts?: { count?: number }) => (opts?.count !== undefined ? `${key}:${opts.count}` : key)) as unknown as TFunction

describe('countWords', () => {
  it('compte les mots séparés par des espaces ou des retours à la ligne', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords("Aujourd'hui, Awa a ri\n aux éclats !")).toBe(6)
  })
})

describe('memoryAgeLabel', () => {
  it('distingue grossesse, naissance, jours, mois et années', () => {
    expect(memoryAgeLabel(t, child, '2025-11-01')).toBe('memories.age.pregnancy')
    expect(memoryAgeLabel(t, child, '2026-01-15')).toBe('memories.age.birth')
    expect(memoryAgeLabel(t, child, '2026-01-25')).toBe('age.days:10')
    expect(memoryAgeLabel(t, child, '2026-07-20')).toBe('age.months:6')
    expect(memoryAgeLabel(t, child, '2029-02-01')).toBe('age.years:3')
  })
})

describe('earliestMemoryDate', () => {
  it('remonte de 300 jours avant la naissance', () => {
    expect(earliestMemoryDate(child)).toBe('2025-03-21')
  })
})
