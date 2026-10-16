import type { TFunction } from 'i18next'
import type { Child } from '@/data/types'
import { chronologicalAge } from './age'

/** Une histoire de souvenir tient en 200 mots au plus. */
export const MAX_STORY_WORDS = 200
/** On peut garder des souvenirs de grossesse : jusqu'à 10 mois avant la naissance. */
export const PREGNANCY_DAYS = 300

/** Compte les mots ; la ponctuation isolée (« ! », « ? », « : » précédés d'une espace en français) n'en est pas un. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

/** Date la plus ancienne acceptée pour un souvenir (début de grossesse). */
export function earliestMemoryDate(child: Child): string {
  const d = new Date(`${child.birthDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - PREGNANCY_DAYS)
  return d.toISOString().slice(0, 10)
}

/** Légende courte : « Pendant la grossesse », « Naissance », « 3 mois », « 2 ans »… */
export function memoryAgeLabel(t: TFunction, child: Child, date: string): string {
  if (date < child.birthDate) return t('memories.age.pregnancy')
  const age = chronologicalAge(child.birthDate, date)
  if (age.totalDays === 0) return t('memories.age.birth')
  if (age.months === 0) return t('age.days', { count: age.days })
  if (age.months < 24) return t('age.months', { count: age.months })
  return t('age.years', { count: Math.floor(age.months / 12) })
}
