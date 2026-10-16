import type { Child, Measurement } from '@/data/types'
import { chronologicalAge } from '@/lib/age'
import { comparableValue, growthAgeDays, MAX_DAYS, type GrowthTable, type Indicator } from './indicators'
import { lmsAt, percentile, zScore } from './lms'

export interface GrowthPoint {
  measurement: Measurement
  ageDays: number
  /** Valeur saisie par le parent. */
  value: number
  z: number
  percentile: number
}

/*
 * Seuils des messages aux parents — À VALIDER PAR LE PROFESSIONNEL DE SANTÉ.
 * - Repères OMS : entre le 3e et le 97e percentile.
 * - Chute : baisse d'au moins 1,34 z entre deux mesures (≈ franchissement de deux couloirs de percentiles).
 * - Périmètre brachial (6–59 mois, seuils OMS/UNICEF de malnutrition aiguë) : < 12,5 cm modérée, < 11,5 cm sévère.
 */
export const ALERT_RULES = {
  lowZ: -1.881,
  highZ: 1.881,
  dropZ: 1.34,
  muacModerateCm: 12.5,
  muacSevereCm: 11.5,
  muacMinMonths: 6,
}

export type AssessmentKind = 'muacSevere' | 'muacModerate' | 'low' | 'high' | 'drop' | 'ok'

/** Calcule les points de l'enfant sur la courbe, triés par date. Les mesures hors plage OMS sont ignorées. */
export function growthPoints(indicator: Indicator, table: GrowthTable, child: Child, measurements: Measurement[]): GrowthPoint[] {
  const series = table[child.sex]
  const points: GrowthPoint[] = []
  for (const m of [...measurements].sort((a, b) => a.date.localeCompare(b.date))) {
    const value = m[indicator.field]
    if (value === undefined) continue
    const ageDays = growthAgeDays(child, m.date)
    if (ageDays < indicator.minDays || ageDays > MAX_DAYS) continue
    const lms = lmsAt(series, ageDays)!
    const z = zScore(lms, comparableValue(indicator, m, ageDays)!, indicator.restricted)
    points.push({ measurement: m, ageDays, value, z, percentile: percentile(z) })
  }
  return points
}

/** Message à afficher pour la dernière mesure, du plus urgent au plus rassurant. */
export function assess(indicator: Indicator, child: Child, points: GrowthPoint[]): AssessmentKind | undefined {
  const last = points.at(-1)
  if (!last) return undefined

  if (indicator.id === 'muac' && chronologicalAge(child.birthDate, last.measurement.date).months >= ALERT_RULES.muacMinMonths) {
    if (last.value < ALERT_RULES.muacSevereCm) return 'muacSevere'
    if (last.value < ALERT_RULES.muacModerateCm) return 'muacModerate'
  }
  if (last.z < ALERT_RULES.lowZ) return 'low'
  if (last.z > ALERT_RULES.highZ) return 'high'
  const previous = points.at(-2)
  if (previous && indicator.id !== 'head' && previous.z - last.z >= ALERT_RULES.dropZ) return 'drop'
  return 'ok'
}
