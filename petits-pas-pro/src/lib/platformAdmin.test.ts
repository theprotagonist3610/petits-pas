import { describe, expect, it, vi } from 'vitest'

// Le client Supabase n'est pas utile pour lire un montant : on évite d'exiger la configuration.
vi.mock('./supabase', () => ({ supabase: {} }))
const { parseAmount } = await import('./platformAdmin')

describe('saisie des tarifs', () => {
  it('lit les montants en F CFA ou en euros', () => {
    expect(parseAmount('15000')).toBe(15000)
    expect(parseAmount('15 000')).toBe(15000)
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount('12.555')).toBe(12.56)
  })

  it('distingue un champ vide (pas de tarif) d’une saisie invalide', () => {
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount('douze')).toBeNaN()
    expect(parseAmount('-5')).toBeNaN()
  })
})
