/** Paramètres LMS d'une table OMS pour un sexe, indexés par jour à partir de `start`. */
export interface LmsSeries {
  start: number
  l: number[]
  m: number[]
  s: number[]
}

export interface Lms {
  l: number
  m: number
  s: number
}

/** Courbes de référence affichées (percentiles OMS) et leur z-score. */
export const PERCENTILE_LINES = [
  { p: 3, z: -1.881 },
  { p: 15, z: -1.036 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036 },
  { p: 97, z: 1.881 },
] as const

export function lmsAt(series: LmsSeries, ageDays: number): Lms | undefined {
  const i = Math.round(ageDays) - series.start
  if (i < 0 || i >= series.m.length) return undefined
  return { l: series.l[i], m: series.m[i], s: series.s[i] }
}

/** Valeur de la mesure correspondant à un z-score donné. */
export function valueAtZ({ l, m, s }: Lms, z: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l)
}

/**
 * z-score d'une mesure (méthode LMS de l'OMS).
 * `restricted` applique la correction OMS au-delà de ±3 ET, utilisée pour les indicateurs
 * dérivés du poids (poids, IMC, périmètre brachial) mais pas pour la taille ni le périmètre crânien.
 */
export function zScore(lms: Lms, x: number, restricted: boolean): number {
  const { l, m, s } = lms
  const z = l === 0 ? Math.log(x / m) / s : (Math.pow(x / m, l) - 1) / (l * s)
  if (!restricted || Math.abs(z) <= 3) return z
  if (z > 3) {
    const sd3 = valueAtZ(lms, 3)
    return 3 + (x - sd3) / (sd3 - valueAtZ(lms, 2))
  }
  const sd3 = valueAtZ(lms, -3)
  return -3 + (x - sd3) / (valueAtZ(lms, -2) - sd3)
}

/** Fonction de répartition de la loi normale (approximation d'Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const erf =
    1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/**
 * Percentile arrondi, borné à 0,1–99,9 pour éviter d'afficher « 0e » ou « 100e ».
 * Une décimale près des repères (< 3e, > 97e) pour ne pas afficher « 3e » sous la courbe du 3e percentile.
 */
export function percentile(z: number): number {
  const p = normalCdf(z) * 100
  if (p < 0.1) return 0.1
  if (p > 99.9) return 99.9
  if (p < 3) return Math.floor(p * 10) / 10
  if (p > 97) return Math.ceil(p * 10) / 10
  return Math.round(p)
}
