import Dexie, { type EntityTable } from 'dexie'
import type { Child, Measurement, Media, Memory, MilestoneObservation, Settings, VaccineRecord } from '../types'

interface SettingsRow extends Settings {
  key: 'app'
}

export class PetitsPasDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  measurements!: EntityTable<Measurement, 'id'>
  milestones!: EntityTable<MilestoneObservation, 'id'>
  memories!: EntityTable<Memory, 'id'>
  vaccines!: EntityTable<VaccineRecord, 'id'>
  media!: EntityTable<Media, 'id'>
  settings!: EntityTable<SettingsRow, 'key'>

  constructor(name = 'petits-pas') {
    super(name)
    this.version(1).stores({
      children: 'id, birthDate, createdAt',
      media: 'id, createdAt',
      settings: 'key',
    })
    this.version(2).stores({
      measurements: 'id, [childId+date]',
    })
    this.version(3).stores({
      milestones: 'id, childId',
    })
    this.version(4).stores({
      memories: 'id, [childId+date]',
    })
    this.version(5).stores({
      vaccines: 'id, childId',
    })
    this.version(6).stores({
      parents: 'id, createdAt',
    })
    // Module « Parents » local retiré : le parent est le titulaire du compte (Supabase).
    this.version(7).stores({
      parents: null,
    })
  }
}

export const db = new PetitsPasDB()
