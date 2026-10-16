import { describe, expect, it } from 'vitest'
import { chronologicalAge, correctedAge } from './age'

describe('chronologicalAge', () => {
  it('compte les mois et jours calendaires', () => {
    expect(chronologicalAge('2026-01-15', '2026-04-20')).toMatchObject({ months: 3, days: 5 })
  })
  it('gère la fin de mois', () => {
    expect(chronologicalAge('2026-01-31', '2026-02-28')).toMatchObject({ months: 1, days: 0 })
    expect(chronologicalAge('2026-01-31', '2026-02-27')).toMatchObject({ months: 0, days: 27 })
  })
  it('passe les années', () => {
    expect(chronologicalAge('2023-10-12', '2026-10-12')).toMatchObject({ months: 36, days: 0 })
  })
  it('donne 0 le jour de la naissance', () => {
    expect(chronologicalAge('2026-10-12', '2026-10-12')).toEqual({ months: 0, days: 0, totalDays: 0 })
  })
})

describe('correctedAge', () => {
  it("ne s'applique pas à un enfant né à terme", () => {
    expect(correctedAge('2026-01-01', 39, '2026-06-01')).toBeNull()
  })
  it('retire les semaines manquantes avant 40 SA', () => {
    // Né à 32 SA : 8 semaines (56 jours) de correction
    const age = correctedAge('2026-01-01', 32, '2026-06-01')!
    expect(age.totalDays).toBe(chronologicalAge('2026-01-01', '2026-06-01').totalDays - 56)
  })
  it("ne s'applique plus après 2 ans", () => {
    expect(correctedAge('2024-01-01', 30, '2026-02-01')).toBeNull()
  })
})
