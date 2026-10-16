import type {
  Child,
  ChildInput,
  DatabaseDump,
  Measurement,
  MeasurementInput,
  Media,
  Memory,
  MemoryInput,
  MilestoneObservation,
  MilestoneStatus,
  RestoreMode,
  Settings,
  VaccineRecord,
} from './types'

/**
 * Contrats de stockage. L'application ne dépend que de ces interfaces :
 * l'implémentation IndexedDB (Dexie) pourra être remplacée par SQLite sous Capacitor.
 */
export interface ChildRepository {
  list(): Promise<Child[]>
  get(id: string): Promise<Child | undefined>
  create(input: ChildInput): Promise<Child>
  update(id: string, patch: Partial<ChildInput>): Promise<void>
  remove(id: string): Promise<void>
}

export interface MeasurementRepository {
  listByChild(childId: string): Promise<Measurement[]>
  get(id: string): Promise<Measurement | undefined>
  create(input: MeasurementInput): Promise<Measurement>
  update(id: string, patch: Partial<MeasurementInput>): Promise<void>
  remove(id: string): Promise<void>
}

export interface MilestoneRepository {
  listByChild(childId: string): Promise<MilestoneObservation[]>
  /** Enregistre le statut d'une étape ;  efface l'observation. */
  set(childId: string, milestoneId: string, status: MilestoneStatus | null, achievedAt?: string): Promise<void>
}

export interface MemoryRepository {
  /** Souvenirs d'un enfant, du plus récent au plus ancien. */
  listByChild(childId: string): Promise<Memory[]>
  /** Nombre total de souvenirs, tous enfants confondus. */
  count(): Promise<number>
  get(id: string): Promise<Memory | undefined>
  create(input: MemoryInput): Promise<Memory>
  update(id: string, patch: Partial<MemoryInput>): Promise<void>
  /** Supprime le souvenir et sa photo. */
  remove(id: string): Promise<void>
}

export interface VaccineRepository {
  listByChild(childId: string): Promise<VaccineRecord[]>
  /** Marque des doses comme reçues à `doneAt`, ou les efface avec `null`. */
  set(childId: string, interventionIds: string[], doneAt: string | null): Promise<void>
}

export interface BackupRepository {
  dump(): Promise<DatabaseDump>
  /** Nombre d'éléments sauvegardés, sans charger les photos. */
  counts(): Promise<{ children: number; memories: number; photos: number; measurements: number }>
  /** Restaure en une seule transaction : en cas d'erreur, rien n'est modifié. */
  restore(dump: DatabaseDump, mode: RestoreMode): Promise<void>
}

export interface MediaRepository {
  get(id: string): Promise<Media | undefined>
  save(blob: Blob, thumb: Blob): Promise<Media>
  remove(id: string): Promise<void>
}

export interface SettingsRepository {
  get(): Promise<Settings>
  update(patch: Partial<Settings>): Promise<void>
}
