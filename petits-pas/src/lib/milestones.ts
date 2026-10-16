import type { Child, MilestoneObservation } from '@/data/types'
import cdc from '@/reference/milestones/cdc.json'
import { WHO_MOTOR, type WhoMotorMilestone } from '@/reference/milestones/who-motor'
import { effectiveAgeDays } from './age'
export { THOUSAND_DAYS_MONTHS, thousandDaysDay } from './thousandDays'

export type Domain = 'social' | 'language' | 'cognitive' | 'movement'

export interface CdcMilestone {
  id: string
  months: number
  domain: Domain
  fr: string
  en: string
  adapted?: boolean
}

export const CDC_MILESTONES = cdc as CdcMilestone[]
export const DOMAINS: Domain[] = ['social', 'language', 'cognitive', 'movement']
export const CHECKPOINTS = [...new Set(CDC_MILESTONES.map((m) => m.months))]

export const DAYS_PER_MONTH = 30.4375

/**
 * Étapes CDC identiques à une étape motrice OMS : elles partagent la même observation,
 * pour que le parent ne coche pas deux fois la même chose.
 */
const SAME_AS_WHO: Record<string, string> = {
  'cdc-9m-movement-4': 'who-sit',
  'cdc-12m-movement-2': 'who-walk-assisted',
  'cdc-18m-movement-1': 'who-walk-alone',
}

export function observationKey(milestoneId: string): string {
  return SAME_AS_WHO[milestoneId] ?? milestoneId
}

export function checkpointDays(months: number): number {
  return Math.round(months * DAYS_PER_MONTH)
}

/** Étape CDC « en ce moment » : le premier âge repère pas encore atteint (ou le dernier, après 5 ans). */
export function currentCheckpoint(ageDays: number): number {
  return CHECKPOINTS.find((m) => checkpointDays(m) > ageDays) ?? CHECKPOINTS[CHECKPOINTS.length - 1]
}

export function milestoneAgeDays(child: Child, on?: string): number {
  return effectiveAgeDays(child.birthDate, child.gestationWeeks, on)
}

/*
 * Règles des messages aux parents — À VALIDER PAR LE PROFESSIONNEL DE SANTÉ.
 * - CDC : chaque étape est atteinte par au moins 75 % des enfants à l'âge repère. Une étape « pas encore »
 *   après cet âge invite à en parler (consigne « Act Early » du CDC).
 * - OMS : une étape motrice « pas encore » après le 99e percentile invite à en parler
 *   (sauf le quatre-pattes, que certains enfants ne font jamais).
 */
export type WhoWindowState = 'early' | 'window' | 'late' | 'achieved'

export function whoWindowState(m: WhoMotorMilestone, ageDays: number, obs?: MilestoneObservation): WhoWindowState {
  if (obs?.status === 'achieved') return 'achieved'
  if (ageDays < m.days.p1) return 'early'
  if (ageDays <= m.days.p99) return 'window'
  return 'late'
}

export interface MilestoneConcerns {
  cdc: CdcMilestone[]
  who: WhoMotorMilestone[]
}

export function milestoneConcerns(ageDays: number, observations: Map<string, MilestoneObservation>): MilestoneConcerns {
  return {
    cdc: CDC_MILESTONES.filter(
      (m) => checkpointDays(m.months) <= ageDays && observations.get(observationKey(m.id))?.status === 'not_yet',
    ),
    who: WHO_MOTOR.filter(
      (m) => !m.optional && ageDays > m.days.p99 && observations.get(m.id)?.status === 'not_yet',
    ),
  }
}

/** Intitulé français d'une étape CDC ou OMS (pour titrer un souvenir). */
export function milestoneTitle(id: string): string | undefined {
  return WHO_MOTOR.find((m) => m.id === id)?.title ?? CDC_MILESTONES.find((m) => m.id === id)?.fr
}

export { WHO_MOTOR }
