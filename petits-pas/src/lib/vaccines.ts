import type { Child, VaccineRecord } from '@/data/types'
import type { AgeSpec, VaccineSchedule, VaccineVisit } from '@/reference/vaccines'
import { toISODate } from './age'

/** Délai après la date prévue pendant lequel une visite est « à faire » avant d'être « à rattraper ». */
export const GRACE_DAYS = 14

export type VisitState = 'done' | 'due' | 'late' | 'upcoming'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

/** Date prévue d'une visite. Les vaccins suivent l'âge réel, même pour un enfant né prématuré. */
export function dueDate(birthDate: string, age: AgeSpec): string {
  if ('weeks' in age) return addDays(birthDate, age.weeks * 7)
  if ('months' in age) return addMonths(birthDate, age.months)
  return addMonths(birthDate, age.years * 12)
}

/** Visites qui concernent cet enfant (ex. HPV réservé aux filles). */
export function visitsFor(schedule: VaccineSchedule, child: Child): VaccineVisit[] {
  return schedule.visits.filter((v) => !v.sex || v.sex === child.sex)
}

export function visitState(
  visit: VaccineVisit,
  child: Child,
  records: Map<string, VaccineRecord>,
  today: string = toISODate(new Date()),
): VisitState {
  if (visit.interventions.every((i) => records.has(i.id))) return 'done'
  const due = dueDate(child.birthDate, visit.age)
  if (today < due) return 'upcoming'
  return today <= addDays(due, GRACE_DAYS) ? 'due' : 'late'
}

/** Prochaine visite à faire (en cours ou à venir), en ignorant celles à rattraper. */
export function nextVisit(schedule: VaccineSchedule, child: Child, records: Map<string, VaccineRecord>, today?: string) {
  return visitsFor(schedule, child).find((v) => {
    const state = visitState(v, child, records, today)
    return state === 'due' || state === 'upcoming'
  })
}

export function lateVisits(schedule: VaccineSchedule, child: Child, records: Map<string, VaccineRecord>, today?: string) {
  return visitsFor(schedule, child).filter((v) => visitState(v, child, records, today) === 'late')
}

/** Nombre de vaccins reçus / prévus (hors vitamine A, chimioprévention et déparasitage). */
export function vaccineProgress(schedule: VaccineSchedule, child: Child, records: Map<string, VaccineRecord>) {
  const vaccines = visitsFor(schedule, child).flatMap((v) => v.interventions.filter((i) => i.kind === 'vaccine'))
  return { done: vaccines.filter((i) => records.has(i.id)).length, total: vaccines.length }
}

/**
 * Date proposée quand le parent coche une visite : la date prévue s'il recopie son carnet
 * (visite passée depuis plus d'une semaine), sinon aujourd'hui.
 */
export function suggestedDoneDate(due: string, today: string = toISODate(new Date())): string {
  return addDays(due, 7) < today ? due : today
}

export function daysUntil(date: string, today: string = toISODate(new Date())): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}
