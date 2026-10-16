import { describe, expect, it } from 'vitest'
import type { Child, MilestoneObservation, MilestoneStatus } from '@/data/types'
import {
  CDC_MILESTONES,
  CHECKPOINTS,
  checkpointDays,
  currentCheckpoint,
  milestoneConcerns,
  observationKey,
  thousandDaysDay,
  WHO_MOTOR,
  whoWindowState,
} from './milestones'

const child: Child = { id: 'c', firstName: 'Awa', birthDate: '2024-10-14', sex: 'female', gestationWeeks: 40, createdAt: '' }

const obs = (entries: Record<string, MilestoneStatus>) =>
  new Map<string, MilestoneObservation>(
    Object.entries(entries).map(([milestoneId, status]) => [
      milestoneId,
      { id: `c:${milestoneId}`, childId: 'c', milestoneId, status, updatedAt: '' },
    ]),
  )

describe('données de référence', () => {
  it('contient les 159 étapes CDC sur 12 âges repères, avec des identifiants uniques', () => {
    expect(CDC_MILESTONES).toHaveLength(159)
    expect(CHECKPOINTS).toEqual([2, 4, 6, 9, 12, 15, 18, 24, 30, 36, 48, 60])
    expect(new Set(CDC_MILESTONES.map((m) => m.id)).size).toBe(159)
    expect(CDC_MILESTONES.every((m) => m.fr && m.en)).toBe(true)
  })

  it('contient les 6 étapes motrices OMS avec des percentiles croissants', () => {
    expect(WHO_MOTOR).toHaveLength(6)
    for (const m of WHO_MOTOR) {
      const values = Object.values(m.days)
      expect([...values].sort((a, b) => a - b)).toEqual(values)
    }
  })

  it('relie les étapes CDC identiques à une étape OMS', () => {
    expect(observationKey('cdc-9m-movement-4')).toBe('who-sit')
    expect(CDC_MILESTONES.find((m) => m.id === 'cdc-9m-movement-4')!.en).toBe('Sits without support')
    expect(CDC_MILESTONES.find((m) => m.id === 'cdc-18m-movement-1')!.en).toMatch(/^Walks without holding on/)
    expect(observationKey('cdc-2m-social-1')).toBe('cdc-2m-social-1')
  })
})

describe('thousandDaysDay', () => {
  it('atteint le jour 1000 aux 2 ans d’un enfant né à terme', () => {
    expect(thousandDaysDay(child, '2026-10-14')).toBe(1000)
    expect(thousandDaysDay(child, '2024-10-14')).toBe(270)
  })
  it('compte une grossesse plus courte pour un prématuré', () => {
    expect(thousandDaysDay({ ...child, gestationWeeks: 32 }, '2024-10-14')).toBe(214)
  })
})

describe('currentCheckpoint', () => {
  it("renvoie le prochain âge repère à atteindre", () => {
    expect(currentCheckpoint(0)).toBe(2)
    expect(currentCheckpoint(checkpointDays(4) - 1)).toBe(4)
    expect(currentCheckpoint(checkpointDays(4))).toBe(6)
    expect(currentCheckpoint(3000)).toBe(60)
  })
})

describe('whoWindowState', () => {
  const walk = WHO_MOTOR.find((m) => m.id === 'who-walk-alone')!
  it('situe l’âge par rapport à la fenêtre OMS', () => {
    expect(whoWindowState(walk, 200)).toBe('early')
    expect(whoWindowState(walk, 365)).toBe('window')
    expect(whoWindowState(walk, 600)).toBe('late')
    expect(whoWindowState(walk, 600, obs({ 'who-walk-alone': 'achieved' }).get('who-walk-alone'))).toBe('achieved')
  })
})

describe('milestoneConcerns', () => {
  it('ne retient que les étapes « pas encore » dont l’âge repère est passé', () => {
    const concerns = milestoneConcerns(
      checkpointDays(6) + 10,
      obs({ 'cdc-4m-social-1': 'not_yet', 'cdc-4m-social-2': 'emerging', 'cdc-9m-social-1': 'not_yet' }),
    )
    expect(concerns.cdc.map((m) => m.id)).toEqual(['cdc-4m-social-1'])
  })

  it('lit l’observation partagée pour une étape CDC liée à l’OMS', () => {
    const concerns = milestoneConcerns(checkpointDays(9) + 1, obs({ 'who-sit': 'not_yet' }))
    expect(concerns.cdc.map((m) => m.id)).toEqual(['cdc-9m-movement-4'])
  })

  it('signale une étape motrice OMS non acquise après le 99e percentile, sauf le quatre-pattes', () => {
    const concerns = milestoneConcerns(600, obs({ 'who-walk-alone': 'not_yet', 'who-crawl': 'not_yet' }))
    expect(concerns.who.map((m) => m.id)).toEqual(['who-walk-alone'])
  })
})
