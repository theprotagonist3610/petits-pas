import { repos, type Memory, type MemoryInput } from '@/data'

/** Photo du formulaire : conservée, remplacée par une nouvelle, ou retirée. */
export type PhotoChange = { kind: 'keep' } | { kind: 'new'; blob: Blob; thumb: Blob } | { kind: 'remove' }

/** Crée ou met à jour un souvenir ; l'ancienne photo est effacée si elle est remplacée ou retirée. */
export async function saveMemory(input: Omit<MemoryInput, 'mediaId'>, photo: PhotoChange, existing?: Memory): Promise<Memory> {
  let mediaId = existing?.mediaId
  if (photo.kind === 'new') mediaId = (await repos.media.save(photo.blob, photo.thumb)).id
  if (photo.kind === 'remove') mediaId = undefined

  const data: MemoryInput = { ...input, mediaId }
  if (!existing) return repos.memories.create(data)

  await repos.memories.update(existing.id, data)
  if (existing.mediaId && existing.mediaId !== mediaId) await repos.media.remove(existing.mediaId)
  return { ...existing, ...data }
}
