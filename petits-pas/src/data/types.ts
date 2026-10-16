export type Sex = 'female' | 'male'

export type CountryCode = 'BJ' | 'TG' | 'NE'

export interface Child {
  id: string
  firstName: string
  /** Date ISO (AAAA-MM-JJ) */
  birthDate: string
  sex: Sex
  /** Terme de naissance en semaines d'aménorrhée (40 = à terme) */
  gestationWeeks: number
  avatarMediaId?: string
  createdAt: string
}

export type ChildInput = Omit<Child, 'id' | 'createdAt'>


export type HeightMethod = 'lying' | 'standing'

export interface Measurement {
  id: string
  childId: string
  /** Date ISO (AAAA-MM-JJ) */
  date: string
  weightKg?: number
  heightCm?: number
  heightMethod?: HeightMethod
  headCm?: number
  muacCm?: number
  createdAt: string
}

export type MeasurementInput = Omit<Measurement, 'id' | 'createdAt'>

export type MilestoneStatus = 'not_yet' | 'emerging' | 'achieved'

/** Observation du parent sur une étape (CDC ou OMS). Identifiant : `${childId}:${milestoneId}`. */
export interface MilestoneObservation {
  id: string
  childId: string
  milestoneId: string
  status: MilestoneStatus
  /** Date ISO à laquelle l'étape a été franchie (si acquise). */
  achievedAt?: string
  updatedAt: string
}

/** Un souvenir : une photo (facultative) et une courte histoire, éventuellement liée à une étape franchie. */
export interface Memory {
  id: string
  childId: string
  /** Date ISO du moment vécu (peut précéder la naissance : souvenirs de grossesse). */
  date: string
  title: string
  /** Courte histoire, 200 mots au plus. */
  story: string
  mediaId?: string
  /** Étape (CDC ou OMS) à l'origine du souvenir. */
  milestoneId?: string
  createdAt: string
}

export type MemoryInput = Omit<Memory, 'id' | 'createdAt'>

/** Vaccin ou soin reçu (vitamine A, chimioprévention…). Identifiant : `${childId}:${interventionId}`. */
export interface VaccineRecord {
  id: string
  childId: string
  interventionId: string
  /** Date ISO à laquelle la dose a été reçue. */
  doneAt: string
  updatedAt: string
}

export interface Media {
  id: string
  blob: Blob
  thumb: Blob
  mime: string
  createdAt: string
}

/** Contenu complet de la base locale, pour la sauvegarde et la restauration. */
export interface DatabaseDump {
  children: Child[]
  measurements: Measurement[]
  milestones: MilestoneObservation[]
  memories: Memory[]
  vaccines: VaccineRecord[]
  media: Media[]
  settings: Settings
}

/** `replace` efface d'abord tout ; `merge` ajoute et remplace à identifiant égal. */
export type RestoreMode = 'replace' | 'merge'

export type Theme = 'light' | 'dark'

export interface Settings {
  country?: CountryCode
  locale: string
  activeChildId?: string
  onboardedAt?: string
  lastBackupAt?: string
  persisted?: boolean
  /** Thème choisi (Soleil / Lune). Absent : celui du téléphone. */
  theme?: Theme
}

export const DEFAULT_SETTINGS: Settings = { locale: 'fr' }
