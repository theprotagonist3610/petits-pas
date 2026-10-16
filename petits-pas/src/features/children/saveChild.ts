import { repos, type Child, type ChildInput } from '@/data'

export interface PhotoDraft {
  blob: Blob
  thumb: Blob
}

/** Crée ou met à jour un enfant, en enregistrant sa nouvelle photo et en supprimant l'ancienne. */
export async function saveChild(input: ChildInput, photo: PhotoDraft | undefined, existing?: Child): Promise<Child> {
  const avatarMediaId = photo ? (await repos.media.save(photo.blob, photo.thumb)).id : existing?.avatarMediaId
  const data = { ...input, avatarMediaId }
  if (!existing) return repos.children.create(data)
  await repos.children.update(existing.id, data)
  if (photo && existing.avatarMediaId) await repos.media.remove(existing.avatarMediaId)
  return { ...existing, ...data }
}
