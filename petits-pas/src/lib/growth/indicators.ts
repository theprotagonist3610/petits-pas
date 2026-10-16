import type { Child, Measurement, Sex } from '@/data/types'
import { effectiveAgeDays } from '@/lib/age'
import type { LmsSeries } from './lms'

export type IndicatorId = 'weight' | 'height' | 'head' | 'muac'
export type GrowthTable = Record<Sex, LmsSeries>

export interface Indicator {
  id: IndicatorId
  field: 'weightKg' | 'heightCm' | 'headCm' | 'muacCm'
  unit: 'kg' | 'cm'
  /** Correction OMS au-delà de ±3 ET (indicateurs dérivés du poids). */
  restricted: boolean
  /** Premier jour couvert par la table OMS. */
  minDays: number
  load: () => Promise<GrowthTable>
}

const json = (m: { default: unknown }) => m.default as GrowthTable

export const INDICATORS: Indicator[] = [
  { id: 'weight', field: 'weightKg', unit: 'kg', restricted: true, minDays: 0, load: () => import('@/reference/who/weight-for-age.json').then(json) },
  { id: 'height', field: 'heightCm', unit: 'cm', restricted: false, minDays: 0, load: () => import('@/reference/who/length-height-for-age.json').then(json) },
  { id: 'head', field: 'headCm', unit: 'cm', restricted: false, minDays: 0, load: () => import('@/reference/who/head-for-age.json').then(json) },
  { id: 'muac', field: 'muacCm', unit: 'cm', restricted: true, minDays: 91, load: () => import('@/reference/who/muac-for-age.json').then(json) },
]

export const MAX_DAYS = 1826
/** Avant 2 ans (731 jours), l'OMS attend une taille couchée ; ensuite, debout. */
export const STANDING_FROM_DAYS = 731

/**
 * Âge en jours utilisé pour les courbes : âge corrigé pour un prématuré jusqu'à 2 ans,
 * âge chronologique sinon. Peut être négatif avant le terme corrigé.
 */
export function growthAgeDays(child: Child, date: string): number {
  return effectiveAgeDays(child.birthDate, child.gestationWeeks, date)
}

/** Valeur à comparer aux tables OMS, avec la correction de 0,7 cm entre taille couchée et debout. */
export function comparableValue(indicator: Indicator, m: Measurement, ageDays: number): number | undefined {
  const value = m[indicator.field]
  if (value === undefined || indicator.id !== 'height') return value
  if (ageDays < STANDING_FROM_DAYS && m.heightMethod === 'standing') return value + 0.7
  if (ageDays >= STANDING_FROM_DAYS && m.heightMethod === 'lying') return value - 0.7
  return value
}
