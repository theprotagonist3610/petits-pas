import type { CountryCode } from '@/data/types'
import type { VaccineSchedule } from './types'
import { BENIN } from './bj'
import { TOGO } from './tg'

/** Calendriers disponibles. Ajouter un pays = ajouter son fichier de données ici (Niger à venir). */
const SCHEDULES: Partial<Record<CountryCode, VaccineSchedule>> = {
  BJ: BENIN,
  TG: TOGO,
}

export function scheduleFor(country: CountryCode | undefined): VaccineSchedule | undefined {
  return country ? SCHEDULES[country] : undefined
}

export type * from './types'
