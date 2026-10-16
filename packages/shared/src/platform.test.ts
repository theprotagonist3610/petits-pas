import { describe, expect, it } from 'vitest'
import type { PromotionRow, SpecialtyRow } from './database.types'
import { effectivePrice, formatPrice, priceFor, requestableSpecialties, specialtyCode, specialtyLabel, type Platform } from './platform'

const s = (code: string, requestable: boolean, forParent: boolean): SpecialtyRow => ({
  code,
  label: code.toUpperCase(),
  description: null,
  requestable,
  for_parent: forParent,
  sort_order: 0,
  created_at: '',
})

describe('paramètres de la plateforme', () => {
  it('affiche les prix en F CFA (sans décimales) ou en euros', () => {
    expect(formatPrice(15000, 'XOF').replace(/\s/g, ' ')).toBe('15 000 F CFA')
    expect(formatPrice(25, 'EUR').replace(/\s/g, ' ')).toBe('25,00 €')
  })

  it('retrouve le tarif d’une spécialité et d’un type', () => {
    const prices = [{ specialty: 'pediatrician', type: 'appointment' as const, amount: 10000, updated_at: '' }]
    expect(priceFor(prices, 'pediatrician', 'appointment')).toBe(10000)
    expect(priceFor(prices, 'pediatrician', 'teleconsultation')).toBeUndefined()
  })

  it('ne propose aux parents que les spécialités demandables, et pour eux-mêmes celles prévues pour les adultes', () => {
    const list = [s('general_practitioner', true, true), s('pediatrician', true, false), s('nurse', false, false)]
    expect(requestableSpecialties(list, true).map((x) => x.code)).toEqual(['general_practitioner', 'pediatrician'])
    expect(requestableSpecialties(list, false).map((x) => x.code)).toEqual(['general_practitioner'])
    expect(specialtyLabel(list, 'pediatrician')).toBe('PEDIATRICIAN')
    expect(specialtyLabel(list, 'inconnue')).toBe('inconnue')
  })

  it('fabrique le code d’une nouvelle spécialité', () => {
    expect(specialtyCode('Gynécologue obstétricien')).toBe('gynecologue_obstetricien')
    expect(specialtyCode('  O.R.L.  ')).toBe('o_r_l')
  })
})

describe('promotions', () => {
  const base = {
    settings: { id: true, currency: 'XOF', maintenance: false, maintenance_message: null, commission_percent: 0, updated_at: '', updated_by: null },
    specialties: [],
    prices: [
      { specialty: 'pediatrician', type: 'teleconsultation', amount: 10000, updated_at: '' },
      { specialty: 'general_practitioner', type: 'appointment', amount: 8000, updated_at: '' },
    ],
  } as unknown as Omit<Platform, 'promotions'>
  const promo = (over: Partial<PromotionRow>): PromotionRow => ({
    id: 'p',
    name: 'Rentrée',
    description: null,
    specialties: ['pediatrician'],
    types: ['teleconsultation', 'appointment'],
    discount_kind: 'percent',
    discount_value: 20,
    currency: null,
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-11-01T00:00:00Z',
    active: true,
    created_at: '',
    created_by: null,
    ...over,
  })
  const at = new Date('2026-10-15T10:00:00Z')

  it('applique une remise en pourcentage pendant sa période seulement', () => {
    const platform = { ...base, promotions: [promo({})] }
    expect(effectivePrice(platform, 'pediatrician', 'teleconsultation', at)).toMatchObject({ listPrice: 10000, price: 8000 })
    expect(effectivePrice(platform, 'pediatrician', 'teleconsultation', new Date('2026-11-01T00:00:00Z'))?.price).toBe(10000)
    expect(effectivePrice(platform, 'general_practitioner', 'appointment', at)?.promotion).toBeUndefined()
  })

  it('applique un prix fixe, jamais au-dessus du tarif, et garde la promotion la plus avantageuse', () => {
    const platform = {
      ...base,
      promotions: [promo({ id: 'a' }), promo({ id: 'b', discount_kind: 'fixed_price', discount_value: 5000, currency: 'XOF' }), promo({ id: 'c', discount_kind: 'fixed_price', discount_value: 99999, currency: 'XOF' })],
    }
    expect(effectivePrice(platform, 'pediatrician', 'teleconsultation', at)).toMatchObject({ price: 5000, promotion: { id: 'b' } })
  })

  it('ignore une promotion désactivée, d’un autre type, ou à prix fixe dans une autre devise', () => {
    const platform = {
      ...base,
      promotions: [
        promo({ id: 'off', active: false }),
        promo({ id: 'rdv', types: ['appointment'] }),
        promo({ id: 'eur', discount_kind: 'fixed_price', discount_value: 5, currency: 'EUR' }),
      ],
    }
    const result = effectivePrice(platform, 'pediatrician', 'teleconsultation', at)
    expect(result?.price).toBe(10000)
    expect(result?.promotion).toBeUndefined()
  })

  it('n’affiche pas de prix sans tarif', () => {
    expect(effectivePrice({ ...base, promotions: [] }, 'nurse', 'appointment', at)).toBeUndefined()
  })
})
