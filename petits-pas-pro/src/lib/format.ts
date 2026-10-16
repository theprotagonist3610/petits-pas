import type { ConsultationStatus, ConsultationType, CountryCode, Sex, Specialty, SpecialtyRow } from '@petits-pas/shared/database.types'

/** Libellés d'origine, en secours tant que la liste de la base n'est pas chargée. */
const DEFAULT_SPECIALTY_LABELS: Record<string, string> = {
  general_practitioner: 'Médecin généraliste',
  pediatrician: 'Pédiatre',
  pediatric_neurologist: 'Neuropédiatre',
  midwife: 'Sage-femme',
  nurse: 'Infirmier·ère',
  nutritionist: 'Nutritionniste',
  other: 'Autre',
}

/** Spécialités de la base (libellés choisis par les administrateurs), alimentées par PlatformProvider. */
let specialtyRegistry: SpecialtyRow[] = []

export function setSpecialties(list: SpecialtyRow[]) {
  specialtyRegistry = list
}

/** Libellé d'une spécialité. */
export function specialtyName(code: Specialty): string {
  return specialtyRegistry.find((s) => s.code === code)?.label ?? DEFAULT_SPECIALTY_LABELS[code] ?? code
}

/** Toutes les spécialités, pour les listes de choix (fiches des professionnels). */
export function specialtyOptions(): { value: Specialty; label: string }[] {
  return specialtyRegistry.length
    ? specialtyRegistry.map((s) => ({ value: s.code, label: s.label }))
    : Object.entries(DEFAULT_SPECIALTY_LABELS).map(([value, label]) => ({ value, label }))
}

export const COUNTRIES: Record<CountryCode, string> = { BJ: 'Bénin', TG: 'Togo', NE: 'Niger' }

export const TYPES: Record<ConsultationType, string> = {
  teleconsultation: 'Téléconsultation',
  appointment: 'Rendez-vous au centre',
}

export const STATUSES: Record<ConsultationStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  cancelled: 'Annulée',
  completed: 'Terminée',
}

const dateTime = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const time = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' })
const day = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long' })
const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

/** « mardi 20 octobre à 14:30 » (heure de l'ordinateur). */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatTime = (iso: string) => time.format(new Date(iso))
/** Clé AAAA-MM-JJ → « mardi 20 octobre ». */
export const formatDay = (key: string) => day.format(new Date(`${key}T12:00:00`))

/** « il y a 3 heures », « hier »… */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

/** Patient : « Fille, 7 mois », « Garçon, 2 ans et 3 mois » ou « Le parent ». */
export function formatPatient(forChild: boolean, ageMonths: number | undefined, sex: Sex | undefined): string {
  if (!forChild) return 'Le parent'
  const who = sex === 'female' ? 'Fille' : sex === 'male' ? 'Garçon' : 'Enfant'
  if (ageMonths === undefined) return who
  if (ageMonths < 24) return `${who}, ${ageMonths} mois`
  const years = Math.floor(ageMonths / 12)
  const months = ageMonths % 12
  return `${who}, ${years} an${years > 1 ? 's' : ''}${months ? ` et ${months} mois` : ''}`
}

/** Valeur d'un champ datetime-local (heure de l'ordinateur). */
export function toLocalInput(date: Date): string {
  const d = new Date(date)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
