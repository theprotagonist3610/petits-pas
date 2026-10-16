import { describe, expect, it, vi } from 'vitest'
import type { PayoutRequestRow, ProfessionalEarningRow } from '@petits-pas/shared/database.types'

vi.mock('./supabase', () => ({ supabase: {} }))
const { summarize } = await import('./accounting')

const earning = (id: string, net: number, payoutId: string | null = null, currency: 'XOF' | 'EUR' = 'XOF'): ProfessionalEarningRow => ({
  id,
  professional_id: 'p1',
  consultation_id: `c-${id}`,
  gross_amount: net,
  commission_percent: 0,
  net_amount: net,
  currency,
  earned_at: '2026-10-01T00:00:00Z',
  payout_id: payoutId,
})

const payout = (id: string, status: PayoutRequestRow['status']) => ({ id, status }) as PayoutRequestRow

describe('comptabilité du professionnel', () => {
  it('sépare disponible, en cours de paiement et déjà versé', () => {
    const earnings = [earning('a', 10000), earning('b', 15000, 'r1'), earning('c', 5000, 'r2'), earning('d', 7000, 'r3')]
    const payouts = [payout('r1', 'requested'), payout('r2', 'paid'), payout('r3', 'rejected')]
    expect(summarize(earnings, payouts).get('XOF')).toEqual({ available: 17000, pending: 15000, paid: 5000 })
  })

  it('totalise chaque devise à part', () => {
    const totals = summarize([earning('a', 10000), earning('b', 20, null, 'EUR')], [])
    expect(totals.get('XOF')?.available).toBe(10000)
    expect(totals.get('EUR')?.available).toBe(20)
  })
})
