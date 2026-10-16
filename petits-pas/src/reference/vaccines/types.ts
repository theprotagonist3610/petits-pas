import type { CountryCode, Sex } from '@/data/types'

export type InterventionKind = 'vaccine' | 'supplement' | 'prevention'

/** Âge prévu d'une visite, compté depuis la date de naissance (âge réel, jamais l'âge corrigé). */
export type AgeSpec = { weeks: number } | { months: number } | { years: number }

export interface Intervention {
  /** Identifiant stable, préfixé par le pays (ex. `bj-penta-1`). */
  id: string
  code: string
  name: string
  kind: InterventionKind
  dose?: number
  protects: string[]
}

export interface VaccineVisit {
  id: string
  age: AgeSpec
  label: string
  interventions: Intervention[]
  /** Visite réservée à un sexe (ex. HPV pour les filles). */
  sex?: Sex
}

export interface VaccineSchedule {
  country: CountryCode
  title: string
  source: string
  helpline?: string
  visits: VaccineVisit[]
}
