import { describe, expect, it } from 'vitest'
import type { Child, Measurement } from '@/data/types'
import { INDICATORS, type IndicatorId } from './indicators'
import { assess, growthPoints } from './assess'
import { lmsAt, valueAtZ } from './lms'

const child: Child = { id: 'c', firstName: 'Awa', birthDate: '2025-01-01', sex: 'female', gestationWeeks: 40, createdAt: '' }
const indicator = (id: IndicatorId) => INDICATORS.find((i) => i.id === id)!

let n = 0
const m = (date: string, values: Partial<Measurement>): Measurement => ({ id: String(n++), childId: 'c', date, createdAt: '', ...values })

async function run(id: IndicatorId, measurements: Measurement[], who = child) {
  const ind = indicator(id)
  const points = growthPoints(ind, await ind.load(), who, measurements)
  return { points, kind: assess(ind, who, points) }
}

/** Valeur OMS pour un âge (en jours) et un z-score donnés. */
async function valueFor(id: IndicatorId, days: number, z: number, sex: Child['sex'] = 'female') {
  return valueAtZ(lmsAt((await indicator(id).load())[sex], days)!, z)
}

describe('growthPoints', () => {
  it('trie les mesures et ignore celles sans valeur', async () => {
    const { points } = await run('weight', [m('2025-03-01', { weightKg: 5 }), m('2025-02-01', { heightCm: 55 }), m('2025-01-15', { weightKg: 4 })])
    expect(points.map((p) => p.value)).toEqual([4, 5])
  })

  it("utilise l'âge corrigé pour un prématuré", async () => {
    const preterm = { ...child, gestationWeeks: 32 }
    const { points } = await run('weight', [m('2025-04-01', { weightKg: 5 })], preterm)
    expect(points[0].ageDays).toBe(90 - 56)
  })

  it('ignore les mesures de PB avant 3 mois', async () => {
    const { points } = await run('muac', [m('2025-02-01', { muacCm: 11 })])
    expect(points).toHaveLength(0)
  })

  it('corrige de 0,7 cm une taille mesurée debout avant 2 ans', async () => {
    const median = await valueFor('height', 365, 0)
    const { points } = await run('height', [m('2026-01-01', { heightCm: median - 0.7, heightMethod: 'standing' })])
    expect(points[0].z).toBeCloseTo(0, 6)
  })
})

describe('assess', () => {
  it('rassure entre le 3e et le 97e percentile', async () => {
    expect((await run('weight', [m('2026-01-01', { weightKg: await valueFor('weight', 365, 0.5) })])).kind).toBe('ok')
  })

  it('signale une valeur sous le 3e percentile', async () => {
    expect((await run('weight', [m('2026-01-01', { weightKg: await valueFor('weight', 365, -2.2) })])).kind).toBe('low')
  })

  it('signale une chute de deux couloirs entre deux mesures', async () => {
    const kind = (
      await run('weight', [
        m('2025-07-02', { weightKg: await valueFor('weight', 182, 1) }),
        m('2026-01-01', { weightKg: await valueFor('weight', 365, -0.5) }),
      ])
    ).kind
    expect(kind).toBe('drop')
  })

  it('applique les seuils absolus du PB à partir de 6 mois', async () => {
    expect((await run('muac', [m('2025-08-01', { muacCm: 11.2 })])).kind).toBe('muacSevere')
    expect((await run('muac', [m('2025-08-01', { muacCm: 12.2 })])).kind).toBe('muacModerate')
  })
})
