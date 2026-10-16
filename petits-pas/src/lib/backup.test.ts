import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { PetitsPasDB } from '@/data/dexie/db'
import { createDexieRepositories } from '@/data/dexie/repositories'
import { BACKUP_VERSION, BackupError, createBackupZip, readBackupZip, summarize } from './backup'

const freshRepos = () => createDexieRepositories(new PetitsPasDB(`test-${crypto.randomUUID()}`))

/** Un téléphone avec un enfant, une mesure, une étape, un vaccin et un souvenir avec photo. */
async function seededPhone() {
  const repos = freshRepos()
  const child = await repos.children.create({ firstName: 'Awa', birthDate: '2026-01-20', sex: 'female', gestationWeeks: 40 })
  await repos.measurements.create({ childId: child.id, date: '2026-03-01', weightKg: 4.8 })
  await repos.milestones.set(child.id, 'who-sit', 'achieved', '2026-07-10')
  await repos.vaccines.set(child.id, ['bj-bcg', 'bj-hepb'], '2026-01-20')
  const photo = await repos.media.save(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }), new Blob([new Uint8Array([9])], { type: 'image/webp' }))
  await repos.memories.create({ childId: child.id, date: '2026-02-01', title: 'Premier sourire', story: 'Un matin…', mediaId: photo.id })
  await repos.settings.update({ country: 'BJ', activeChildId: child.id, onboardedAt: '2026-01-21T08:00:00Z', persisted: true })
  return { repos, child, photo }
}

const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())]

describe('sauvegarde .zip', () => {
  it('restaure à l’identique sur un nouveau téléphone (photos comprises)', async () => {
    const { repos, child, photo } = await seededPhone()
    const zip = await createBackupZip(await repos.backup.dump(), new Date('2026-10-15T10:00:00Z'))

    const parsed = readBackupZip(zip)
    expect(parsed.exportedAt).toBe('2026-10-15T10:00:00.000Z')
    expect(summarize(parsed.dump)).toEqual({ children: 1, memories: 1, photos: 1, measurements: 1 })

    const newPhone = freshRepos()
    await newPhone.backup.restore(parsed.dump, 'replace')

    expect(await newPhone.children.list()).toEqual([child])
    expect((await newPhone.vaccines.listByChild(child.id)).map((r) => r.interventionId).sort()).toEqual(['bj-bcg', 'bj-hepb'])
    expect((await newPhone.milestones.listByChild(child.id))[0]).toMatchObject({ milestoneId: 'who-sit', achievedAt: '2026-07-10' })
    const restored = await newPhone.media.get(photo.id)
    expect(restored?.mime).toBe('image/webp')
    expect(await bytesOf(restored!.blob)).toEqual([1, 2, 3, 4])
    expect(await bytesOf(restored!.thumb)).toEqual([9])

    const settings = await newPhone.settings.get()
    expect(settings).toMatchObject({ country: 'BJ', activeChildId: child.id, onboardedAt: '2026-01-21T08:00:00Z' })
    // La protection du stockage est propre à chaque téléphone.
    expect(settings.persisted).toBeUndefined()
  })

  it('remplace toutes les données existantes en mode « remplacer »', async () => {
    const { repos } = await seededPhone()
    const zip = await createBackupZip(await repos.backup.dump())
    const other = freshRepos()
    await other.children.create({ firstName: 'Koffi', birthDate: '2023-08-02', sex: 'male', gestationWeeks: 40 })

    await other.backup.restore(readBackupZip(zip).dump, 'replace')
    expect((await other.children.list()).map((c) => c.firstName)).toEqual(['Awa'])
  })

  it('ajoute aux données existantes en mode « fusionner » et garde les réglages du téléphone', async () => {
    const { repos } = await seededPhone()
    const zip = await createBackupZip(await repos.backup.dump())
    const other = freshRepos()
    const koffi = await other.children.create({ firstName: 'Koffi', birthDate: '2023-08-02', sex: 'male', gestationWeeks: 40 })
    await other.settings.update({ country: 'TG', activeChildId: koffi.id, onboardedAt: '2026-05-01T00:00:00Z' })

    await other.backup.restore(readBackupZip(zip).dump, 'merge')
    expect((await other.children.list()).map((c) => c.firstName).sort()).toEqual(['Awa', 'Koffi'])
    expect(await other.settings.get()).toMatchObject({ country: 'TG', activeChildId: koffi.id })
  })

  it('refuse un fichier qui n’est pas une sauvegarde valide', () => {
    const code = (bytes: Uint8Array) => {
      try {
        readBackupZip(bytes)
      } catch (e) {
        return (e as BackupError).code
      }
    }
    expect(code(strToU8('pas un zip'))).toBe('not_zip')
    expect(code(zipSync({ 'photo.jpg': new Uint8Array([1]) }))).toBe('not_backup')
    const future = { format: 'petits-pas-sauvegarde', version: BACKUP_VERSION + 1 }
    expect(code(zipSync({ 'donnees.json': strToU8(JSON.stringify(future)) }))).toBe('newer_version')
    const missingPhoto = {
      format: 'petits-pas-sauvegarde',
      version: 1,
      exportedAt: '',
      children: [],
      measurements: [],
      milestones: [],
      memories: [],
      vaccines: [],
      settings: { locale: 'fr' },
      media: [{ id: 'm', mime: 'image/webp', createdAt: '', file: 'photos/m.webp', thumbFile: 'photos/m-mini.webp' }],
    }
    expect(code(zipSync({ 'donnees.json': strToU8(JSON.stringify(missingPhoto)) }))).toBe('corrupt')
  })
})
