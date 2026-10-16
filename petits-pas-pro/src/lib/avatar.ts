import { AVATAR_BUCKET } from '@petits-pas/shared/avatars'
import { supabase } from './supabase'
import { attempt, done, fail, type Result } from './errors'

/** Envoie la photo dans le dossier du professionnel, l'enregistre sur sa fiche, puis supprime l'ancienne. */
export function uploadAvatar(userId: string, professionalId: string, photo: Blob, previousPath: string | null): Promise<Result<string>> {
  return attempt(async () => {
    const path = `${userId}/${Date.now()}.${photo.type === 'image/webp' ? 'webp' : 'jpg'}`
    const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, photo, { contentType: photo.type, upsert: false })
    if (upload.error) return fail(upload.error)
    const { error } = await supabase.from('professionals').update({ avatar_path: path }).eq('id', professionalId)
    if (error) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path])
      return fail(error)
    }
    // L'ancienne photo n'est plus utilisée : on ne la garde pas (minimisation).
    if (previousPath) await supabase.storage.from(AVATAR_BUCKET).remove([previousPath])
    return done(path)
  })
}
