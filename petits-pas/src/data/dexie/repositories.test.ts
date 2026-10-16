import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { PetitsPasDB } from './db'
import { createDexieRepositories } from './repositories'

const input = { firstName: 'Awa', birthDate: '2026-03-01', sex: 'female' as const, gestationWeeks: 40 }

describe('repositories Dexie', () => {
  let repos: ReturnType<typeof createDexieRepositories>

  beforeEach(() => {
    repos = createDexieRepositories(new PetitsPasDB(`test-${crypto.randomUUID()}`))
  })

  it('crée et liste les enfants par ordre de création', async () => {
    const a = await repos.children.create(input)
    const b = await repos.children.create({ ...input, firstName: 'Koffi', sex: 'male' })
    expect((await repos.children.list()).map((c) => c.id)).toEqual([a.id, b.id])
  })

  it('renvoie des réglages par défaut puis les fusionne', async () => {
    expect(await repos.settings.get()).toEqual({ locale: 'fr' })
    await repos.settings.update({ country: 'BJ' })
    await repos.settings.update({ persisted: true })
    expect(await repos.settings.get()).toEqual({ locale: 'fr', country: 'BJ', persisted: true })
  })

  it("supprime l'enfant, sa photo, et bascule l'enfant actif", async () => {
    const photo = await repos.media.save(new Blob(['a']), new Blob(['b']))
    const a = await repos.children.create({ ...input, avatarMediaId: photo.id })
    const b = await repos.children.create({ ...input, firstName: 'Koffi' })
    await repos.settings.update({ activeChildId: a.id })

    await repos.children.remove(a.id)

    expect(await repos.children.get(a.id)).toBeUndefined()
    expect(await repos.media.get(photo.id)).toBeUndefined()
    expect((await repos.settings.get()).activeChildId).toBe(b.id)
  })

  it("liste les mesures d'un enfant par date et les supprime avec lui", async () => {
    const a = await repos.children.create(input)
    const b = await repos.children.create(input)
    await repos.measurements.create({ childId: a.id, date: '2026-05-01', weightKg: 5 })
    await repos.measurements.create({ childId: a.id, date: '2026-04-01', weightKg: 4 })
    await repos.measurements.create({ childId: b.id, date: '2026-04-15', weightKg: 6 })

    expect((await repos.measurements.listByChild(a.id)).map((m) => m.date)).toEqual(['2026-04-01', '2026-05-01'])

    await repos.children.remove(a.id)
    expect(await repos.measurements.listByChild(a.id)).toEqual([])
    expect(await repos.measurements.listByChild(b.id)).toHaveLength(1)
  })

  it('liste les souvenirs du plus récent au plus ancien et supprime leur photo avec eux', async () => {
    const a = await repos.children.create(input)
    const photo = await repos.media.save(new Blob(['p']), new Blob(['t']))
    const first = await repos.memories.create({ childId: a.id, date: '2026-03-02', title: 'Premier sourire', story: '', mediaId: photo.id })
    await repos.memories.create({ childId: a.id, date: '2026-06-10', title: 'Premiers pas', story: '' })
    await repos.memories.create({ childId: a.id, date: '2025-12-20', title: 'Échographie', story: '' })

    expect((await repos.memories.listByChild(a.id)).map((m) => m.title)).toEqual(['Premiers pas', 'Premier sourire', 'Échographie'])

    await repos.memories.remove(first.id)
    expect(await repos.media.get(photo.id)).toBeUndefined()
    expect(await repos.memories.listByChild(a.id)).toHaveLength(2)
  })

  it("supprime les souvenirs et leurs photos avec l'enfant", async () => {
    const a = await repos.children.create(input)
    const photo = await repos.media.save(new Blob(['p']), new Blob(['t']))
    await repos.memories.create({ childId: a.id, date: '2026-03-02', title: 'Bain', story: '', mediaId: photo.id })
    await repos.children.remove(a.id)
    expect(await repos.memories.listByChild(a.id)).toEqual([])
    expect(await repos.media.get(photo.id)).toBeUndefined()
  })

  it('enregistre plusieurs doses à la fois, les efface, et les supprime avec l’enfant', async () => {
    const a = await repos.children.create(input)
    await repos.vaccines.set(a.id, ['bj-hepb', 'bj-bcg', 'bj-vpo-0'], '2026-03-01')
    await repos.vaccines.set(a.id, ['bj-bcg'], '2026-03-03')
    const byId = new Map((await repos.vaccines.listByChild(a.id)).map((r) => [r.interventionId, r.doneAt]))
    expect(byId).toEqual(new Map([['bj-hepb', '2026-03-01'], ['bj-bcg', '2026-03-03'], ['bj-vpo-0', '2026-03-01']]))

    await repos.vaccines.set(a.id, ['bj-hepb'], null)
    expect(await repos.vaccines.listByChild(a.id)).toHaveLength(2)

    await repos.children.remove(a.id)
    expect(await repos.vaccines.listByChild(a.id)).toEqual([])
  })

  it('enregistre, remplace et efface le statut des étapes', async () => {
    const a = await repos.children.create(input)
    await repos.milestones.set(a.id, 'who-sit', 'achieved', '2026-09-01')
    await repos.milestones.set(a.id, 'cdc-2m-social-1', 'emerging', '2026-09-01')
    expect(await repos.milestones.listByChild(a.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ milestoneId: 'who-sit', status: 'achieved', achievedAt: '2026-09-01' }),
        // La date n'est conservée que pour une étape acquise.
        expect.objectContaining({ milestoneId: 'cdc-2m-social-1', status: 'emerging', achievedAt: undefined }),
      ]),
    )

    await repos.milestones.set(a.id, 'who-sit', null)
    expect((await repos.milestones.listByChild(a.id)).map((o) => o.milestoneId)).toEqual(['cdc-2m-social-1'])

    await repos.children.remove(a.id)
    expect(await repos.milestones.listByChild(a.id)).toEqual([])
  })
})
