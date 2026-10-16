import { describe, expect, it } from 'vitest'
import type { Child, VaccineRecord } from '@/data/types'
import { scheduleFor } from '@/reference/vaccines'
import { BENIN } from '@/reference/vaccines/bj'
import { TOGO } from '@/reference/vaccines/tg'
import { dueDate, lateVisits, nextVisit, suggestedDoneDate, vaccineProgress, visitsFor, visitState } from './vaccines'

const girl: Child = { id: 'c', firstName: 'Awa', birthDate: '2026-01-31', sex: 'female', gestationWeeks: 40, createdAt: '' }
const boy: Child = { ...girl, sex: 'male' }

const records = (ids: string[]) =>
  new Map<string, VaccineRecord>(ids.map((id) => [id, { id: `c:${id}`, childId: 'c', interventionId: id, doneAt: '2026-02-01', updatedAt: '' }]))

describe('calendrier du Bénin', () => {
  it('reprend les 14 visites et des identifiants uniques', () => {
    expect(BENIN.visits).toHaveLength(14)
    const ids = BENIN.visits.flatMap((v) => v.interventions.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('compte 4 doses de vaccin antipaludique et 6 de vitamine A', () => {
    const items = BENIN.visits.flatMap((v) => v.interventions)
    expect(items.filter((i) => i.code === 'VAP').map((i) => i.dose)).toEqual([1, 2, 3, 4])
    expect(items.filter((i) => i.code === 'Vit. A')).toHaveLength(6)
  })

  it('est choisi selon le pays ; le Niger n’est pas encore disponible', () => {
    expect(scheduleFor('BJ')).toBe(BENIN)
    expect(scheduleFor('TG')).toBe(TOGO)
    expect(scheduleFor('NE')).toBeUndefined()
  })

  it('garde des identifiants stables (ils retrouvent les doses déjà notées par les parents)', () => {
    expect(BENIN.visits.map((v) => [v.id, v.interventions.map((i) => i.id)])).toEqual([
      ['bj-v1', ['bj-hepb', 'bj-bcg', 'bj-vpo-0']],
      ['bj-v2', ['bj-penta-1', 'bj-pcv-1', 'bj-vpo-1', 'bj-rota-1']],
      ['bj-v3', ['bj-penta-2', 'bj-pcv-2', 'bj-vpo-2', 'bj-rota-2', 'bj-cpp-v3']],
      ['bj-v4', ['bj-penta-3', 'bj-pcv-3', 'bj-vpo-3', 'bj-rota-3', 'bj-vpi', 'bj-cpp-v4']],
      ['bj-v5', ['bj-vap-1', 'bj-vita-v5', 'bj-cpp-v5']],
      ['bj-v6', ['bj-vap-2']],
      ['bj-v7', ['bj-rr-1', 'bj-vaa', 'bj-mena', 'bj-vap-3', 'bj-cpp-v7']],
      ['bj-v8', ['bj-vita-v8', 'bj-cpp-v8']],
      ['bj-v9', ['bj-cpp-v9']],
      ['bj-v10', ['bj-rr-2', 'bj-vap-4', 'bj-vita-v10', 'bj-cpp-v10']],
      ['bj-v11', ['bj-vita-v11', 'bj-cpp-v11']],
      ['bj-v12', ['bj-deworm-v12', 'bj-vita-v12']],
      ['bj-v13', ['bj-deworm-v13', 'bj-vita-v13']],
      ['bj-v14', ['bj-hpv']],
    ])
  })

  it('réserve le HPV aux filles', () => {
    expect(visitsFor(BENIN, girl)).toHaveLength(14)
    expect(visitsFor(BENIN, boy)).toHaveLength(13)
  })
})

describe('calendrier du Togo', () => {
  it('reprend les 6 contacts de 0 à 15 mois et le VPH des filles à 9 ans', () => {
    expect(TOGO.visits.map((v) => v.label)).toEqual(['Naissance', '6 semaines', '10 semaines', '14 semaines', '9 mois', '15 mois', '9 ans'])
    expect(visitsFor(TOGO, girl)).toHaveLength(7)
    expect(visitsFor(TOGO, boy)).toHaveLength(6)
  })

  it('utilise les abréviations du carnet togolais', () => {
    const codes = TOGO.visits.map((v) => v.interventions.map((i) => i.code + (i.dose ?? '')).join(' '))
    expect(codes).toEqual([
      'BCG VPO0',
      'DTC-HepB-Hib1 VPO1 Rota1 Pneumo1',
      'DTC-HepB-Hib2 VPO2 Rota2 Pneumo2',
      'DTC-HepB-Hib3 VPO3 Pneumo3 VPI1',
      'RR1 VAA VPI2',
      'RR2 MenA',
      'VPH',
    ])
  })

  it('a des identifiants uniques et propres au Togo', () => {
    const ids = TOGO.visits.flatMap((v) => v.interventions.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('tg-'))).toBe(true)
  })
})

describe('dueDate', () => {
  it('compte les semaines, les mois (fin de mois comprise) et les années depuis la naissance', () => {
    expect(dueDate('2026-01-31', { weeks: 6 })).toBe('2026-03-14')
    expect(dueDate('2026-01-31', { months: 1 })).toBe('2026-02-28')
    expect(dueDate('2026-01-31', { months: 9 })).toBe('2026-10-31')
    expect(dueDate('2026-01-31', { years: 9 })).toBe('2035-01-31')
  })
})

describe('visitState', () => {
  const sixWeeks = BENIN.visits[1] // prévue le 2026-03-14
  it('suit la date prévue et le délai de 14 jours', () => {
    expect(visitState(sixWeeks, girl, records([]), '2026-03-01')).toBe('upcoming')
    expect(visitState(sixWeeks, girl, records([]), '2026-03-20')).toBe('due')
    expect(visitState(sixWeeks, girl, records([]), '2026-04-01')).toBe('late')
  })
  it('est faite quand toutes les doses sont notées, et seulement alors', () => {
    const ids = sixWeeks.interventions.map((i) => i.id)
    expect(visitState(sixWeeks, girl, records(ids), '2026-04-01')).toBe('done')
    expect(visitState(sixWeeks, girl, records(ids.slice(1)), '2026-04-01')).toBe('late')
  })
})

describe('nextVisit, lateVisits, vaccineProgress', () => {
  const birthIds = BENIN.visits[0].interventions.map((i) => i.id)
  it('trouve la prochaine visite et les visites à rattraper', () => {
    const today = '2026-04-01' // 6 semaines en retard, 10 semaines prévue le 2026-04-11
    expect(nextVisit(BENIN, girl, records(birthIds), today)?.label).toBe('10 semaines')
    expect(lateVisits(BENIN, girl, records(birthIds), today).map((v) => v.label)).toEqual(['6 semaines'])
  })
  it('ne compte que les vaccins dans la progression', () => {
    const progress = vaccineProgress(BENIN, girl, records([...birthIds, 'bj-vita-v5']))
    expect(progress.done).toBe(3)
    expect(progress.total).toBe(BENIN.visits.flatMap((v) => v.interventions).filter((i) => i.kind === 'vaccine').length)
  })
})

describe('suggestedDoneDate', () => {
  it('propose la date prévue pour une visite ancienne, sinon aujourd’hui', () => {
    expect(suggestedDoneDate('2026-03-14', '2026-10-15')).toBe('2026-03-14')
    expect(suggestedDoneDate('2026-10-12', '2026-10-15')).toBe('2026-10-15')
  })
})
