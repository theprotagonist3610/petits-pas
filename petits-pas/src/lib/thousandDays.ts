import type { Child } from '@/data/types'
import { chronologicalAge } from './age'

/** Les 1000 premiers jours se terminent aux 2 ans : la période charnière du suivi. */
export const THOUSAND_DAYS_MONTHS = 24

/**
 * Jour des 1000 premiers jours (grossesse comprise) : environ 270 jours de grossesse pour un terme
 * à 40 semaines, moins pour un prématuré, puis l'âge en jours. Les 2 ans d'un enfant né à terme = jour 1000.
 */
export function thousandDaysDay(child: Child, on?: string): number {
  const pregnancyDays = child.gestationWeeks * 7 - 10
  return pregnancyDays + chronologicalAge(child.birthDate, on).totalDays
}
