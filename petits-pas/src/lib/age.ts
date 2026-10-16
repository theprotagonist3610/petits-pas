export interface Age {
  months: number
  days: number
  totalDays: number
}

const DAY_MS = 86_400_000
/** En dessous de ce terme, on parle de prématurité. */
export const PRETERM_THRESHOLD_WEEKS = 37
/** L'âge corrigé est utilisé jusqu'à 2 ans d'âge chronologique. */
const CORRECTED_AGE_LIMIT_MONTHS = 24

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)))
}

function ageBetween(from: Date, to: Date): Age {
  const totalDays = Math.round((to.getTime() - from.getTime()) / DAY_MS)
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (addMonthsClamped(from, months) > to) months--
  const days = Math.round((to.getTime() - addMonthsClamped(from, months).getTime()) / DAY_MS)
  return { months, days, totalDays }
}

/** Âge chronologique à une date donnée (aujourd'hui par défaut), dates au format AAAA-MM-JJ. */
export function chronologicalAge(birthDate: string, on: string = toISODate(new Date())): Age {
  return ageBetween(parseISODate(birthDate), parseISODate(on))
}

/**
 * Âge corrigé pour un enfant né prématuré, ou `null` s'il ne s'applique pas
 * (né à terme, ou âge chronologique ≥ 24 mois).
 */
export function correctedAge(
  birthDate: string,
  gestationWeeks: number,
  on: string = toISODate(new Date()),
): Age | null {
  if (gestationWeeks >= PRETERM_THRESHOLD_WEEKS) return null
  if (chronologicalAge(birthDate, on).months >= CORRECTED_AGE_LIMIT_MONTHS) return null
  const correctedBirth = new Date(parseISODate(birthDate).getTime() + (40 - gestationWeeks) * 7 * DAY_MS)
  return ageBetween(correctedBirth, parseISODate(on))
}

/**
 * Âge en jours à utiliser pour comparer aux références (croissance, étapes) :
 * âge corrigé pour un prématuré jusqu'à 2 ans, âge chronologique sinon. Négatif avant le terme corrigé.
 */
export function effectiveAgeDays(birthDate: string, gestationWeeks: number, on: string = toISODate(new Date())): number {
  return (correctedAge(birthDate, gestationWeeks, on) ?? chronologicalAge(birthDate, on)).totalDays
}
