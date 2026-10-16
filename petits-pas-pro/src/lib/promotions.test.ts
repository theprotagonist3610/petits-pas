import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { promotionPhase, validatePromotion } = await import('./promotions')

const valid = {
  name: 'Rentrée',
  description: '',
  specialties: ['pediatrician'],
  types: ['teleconsultation' as const],
  discountKind: 'percent' as const,
  discountValue: 20,
  startsAt: '2026-10-01T08:00',
  endsAt: '2026-10-31T23:59',
}

describe('promotions', () => {
  it('valide une promotion complète, à durée limitée', () => {
    expect(validatePromotion(valid)).toBeUndefined()
    expect(validatePromotion({ ...valid, name: ' ' })).toBe('name')
    expect(validatePromotion({ ...valid, specialties: [] })).toBe('specialties')
    expect(validatePromotion({ ...valid, types: [] })).toBe('types')
    expect(validatePromotion({ ...valid, discountValue: null })).toBe('value')
    expect(validatePromotion({ ...valid, discountValue: 120 })).toBe('percent')
    expect(validatePromotion({ ...valid, endsAt: '2026-09-30T00:00' })).toBe('period')
    expect(validatePromotion({ ...valid, discountKind: 'fixed_price', discountValue: 5000 })).toBeUndefined()
  })

  it('classe les promotions : en cours, à venir, terminées', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const p = (starts: string, ends: string, active = true) => ({ active, starts_at: starts, ends_at: ends })
    expect(promotionPhase(p('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), now)).toBe('running')
    expect(promotionPhase(p('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), now)).toBe('upcoming')
    expect(promotionPhase(p('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'), now)).toBe('ended')
    expect(promotionPhase(p('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', false), now)).toBe('ended')
  })
})
