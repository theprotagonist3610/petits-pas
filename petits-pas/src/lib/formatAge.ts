import type { TFunction } from 'i18next'
import type { Age } from './age'

/** Âge en mois → « 7 mois », « 2 ans et 3 mois ». */
export function formatAgeMonths(t: TFunction, months: number): string {
  if (months < 24) return t('age.months', { count: months })
  const y = t('age.years', { count: Math.floor(months / 12) })
  return months % 12 ? t('age.and', { a: y, b: t('age.months', { count: months % 12 }) }) : y
}

export function formatAge(t: TFunction, age: Age): string {
  if (age.totalDays < 0) return t('age.beforeTerm')
  if (age.totalDays === 0) return t('age.newborn')
  if (age.months === 0) return t('age.days', { count: age.days })
  if (age.months < 24) {
    const m = t('age.months', { count: age.months })
    return age.days ? t('age.and', { a: m, b: t('age.days', { count: age.days }) }) : m
  }
  const years = Math.floor(age.months / 12)
  const months = age.months % 12
  const y = t('age.years', { count: years })
  return months ? t('age.and', { a: y, b: t('age.months', { count: months }) }) : y
}
