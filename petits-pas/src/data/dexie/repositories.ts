import Dexie from 'dexie'
import type {
  BackupRepository,
  ChildRepository,
  MeasurementRepository,
  MemoryRepository,
  MediaRepository,
  MilestoneRepository,
  SettingsRepository,
  VaccineRepository,
} from '../repositories'
import { DEFAULT_SETTINGS, type Child, type Measurement, type Memory, type Settings } from '../types'
import { newId } from '@/lib/id'
import type { PetitsPasDB } from './db'

export function createDexieRepositories(db: PetitsPasDB) {
  const children: ChildRepository = {
    list: () => db.children.orderBy('createdAt').toArray(),
    get: (id) => db.children.get(id),
    async create(input) {
      const child: Child = { ...input, id: newId(), createdAt: new Date().toISOString() }
      await db.children.add(child)
      return child
    },
    async update(id, patch) {
      await db.children.update(id, patch)
    },
    async remove(id) {
      const tables = [db.children, db.measurements, db.milestones, db.memories, db.vaccines, db.media, db.settings]
      await db.transaction('rw', tables, async () => {
        const child = await db.children.get(id)
        if (child?.avatarMediaId) await db.media.delete(child.avatarMediaId)
        await db.measurements.where('[childId+date]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete()
        await db.milestones.where('childId').equals(id).delete()
        await db.vaccines.where('childId').equals(id).delete()
        const childMemories = db.memories.where('[childId+date]').between([id, Dexie.minKey], [id, Dexie.maxKey])
        const mediaIds = (await childMemories.toArray()).flatMap((m) => (m.mediaId ? [m.mediaId] : []))
        await db.media.bulkDelete(mediaIds)
        await childMemories.delete()
        await db.children.delete(id)
        const settings = await db.settings.get('app')
        if (settings?.activeChildId === id) {
          const next = await db.children.orderBy('createdAt').first()
          await db.settings.update('app', { activeChildId: next?.id })
        }
      })
    },
  }

  const measurements: MeasurementRepository = {
    listByChild: (childId) => db.measurements.where('[childId+date]').between([childId, Dexie.minKey], [childId, Dexie.maxKey]).toArray(),
    get: (id) => db.measurements.get(id),
    async create(input) {
      const measurement: Measurement = { ...input, id: newId(), createdAt: new Date().toISOString() }
      await db.measurements.add(measurement)
      return measurement
    },
    async update(id, patch) {
      await db.measurements.update(id, patch)
    },
    async remove(id) {
      await db.measurements.delete(id)
    },
  }

  const milestones: MilestoneRepository = {
    listByChild: (childId) => db.milestones.where('childId').equals(childId).toArray(),
    async set(childId, milestoneId, status, achievedAt) {
      const id = `${childId}:${milestoneId}`
      if (status === null) return void (await db.milestones.delete(id))
      await db.milestones.put({
        id,
        childId,
        milestoneId,
        status,
        achievedAt: status === 'achieved' ? achievedAt : undefined,
        updatedAt: new Date().toISOString(),
      })
    },
  }

  const memories: MemoryRepository = {
    listByChild: (childId) =>
      db.memories.where('[childId+date]').between([childId, Dexie.minKey], [childId, Dexie.maxKey]).reverse().sortBy('date'),
    count: () => db.memories.count(),
    get: (id) => db.memories.get(id),
    async create(input) {
      const memory: Memory = { ...input, id: newId(), createdAt: new Date().toISOString() }
      await db.memories.add(memory)
      return memory
    },
    async update(id, patch) {
      await db.memories.update(id, patch)
    },
    async remove(id) {
      await db.transaction('rw', db.memories, db.media, async () => {
        const memory = await db.memories.get(id)
        if (memory?.mediaId) await db.media.delete(memory.mediaId)
        await db.memories.delete(id)
      })
    },
  }

  const vaccines: VaccineRepository = {
    listByChild: (childId) => db.vaccines.where('childId').equals(childId).toArray(),
    async set(childId, interventionIds, doneAt) {
      const ids = interventionIds.map((interventionId) => `${childId}:${interventionId}`)
      if (doneAt === null) return db.vaccines.bulkDelete(ids)
      const updatedAt = new Date().toISOString()
      await db.vaccines.bulkPut(
        interventionIds.map((interventionId, i) => ({ id: ids[i], childId, interventionId, doneAt, updatedAt })),
      )
    },
  }

  const media: MediaRepository = {
    get: (id) => db.media.get(id),
    async save(blob, thumb) {
      const item = { id: newId(), blob, thumb, mime: blob.type, createdAt: new Date().toISOString() }
      await db.media.add(item)
      return item
    },
    async remove(id) {
      await db.media.delete(id)
    },
  }

  const settings: SettingsRepository = {
    async get() {
      const row = await db.settings.get('app')
      if (!row) return { ...DEFAULT_SETTINGS }
      const { key: _key, ...rest } = row
      return { ...DEFAULT_SETTINGS, ...rest }
    },
    async update(patch) {
      const current = await settings.get()
      await db.settings.put({ ...current, ...patch, key: 'app' })
    },
  }

  const dataTables = () => [db.children, db.measurements, db.milestones, db.memories, db.vaccines, db.media]

  const backup: BackupRepository = {
    async dump() {
      return db.transaction('r', [...dataTables(), db.settings], async () => ({
        children: await db.children.toArray(),
        measurements: await db.measurements.toArray(),
        milestones: await db.milestones.toArray(),
        memories: await db.memories.toArray(),
        vaccines: await db.vaccines.toArray(),
        media: await db.media.toArray(),
        settings: await settings.get(),
      }))
    },

    async counts() {
      const [children, memories, photos, measurements] = await Promise.all([
        db.children.count(),
        db.memories.count(),
        db.media.count(),
        db.measurements.count(),
      ])
      return { children, memories, photos, measurements }
    },

    async restore(dump, mode) {
      await db.transaction('rw', [...dataTables(), db.settings], async () => {
        const current = await settings.get()
        if (mode === 'replace') await Promise.all(dataTables().map((table) => table.clear()))

        await db.children.bulkPut(dump.children)
        await db.measurements.bulkPut(dump.measurements)
        await db.milestones.bulkPut(dump.milestones)
        await db.memories.bulkPut(dump.memories)
        await db.vaccines.bulkPut(dump.vaccines)
        await db.media.bulkPut(dump.media)

        // Remplacement : réglages de la sauvegarde. Fusion : réglages actuels, complétés par ceux de la sauvegarde
        // (utile depuis l'écran d'accueil d'un nouveau téléphone). L'état de protection du stockage reste celui du téléphone.
        const definedCurrent = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== undefined))
        const next: Settings = mode === 'replace' ? { ...dump.settings } : { ...dump.settings, ...definedCurrent }
        next.persisted = current.persisted
        const childIds = new Set((await db.children.toArray()).map((c) => c.id))
        if (!next.activeChildId || !childIds.has(next.activeChildId)) next.activeChildId = dump.children[0]?.id ?? [...childIds][0]
        await db.settings.put({ ...next, key: 'app' })
      })
    },
  }

  return { children, measurements, milestones, memories, vaccines, media, settings, backup }
}
