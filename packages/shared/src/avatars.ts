import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Bucket privé des photos de professionnels (lecture réservée aux utilisateurs connectés). */
export const AVATAR_BUCKET = 'professional-avatars'

/** Durée de validité des liens signés vers les photos. */
const SIGNED_URL_SECONDS = 60 * 60

/** Liens déjà signés, réutilisés tant qu'ils sont valides (une liste de 20 consultations = 1 seule demande par photo). */
const cache = new Map<string, { url: string; expiresAt: number }>()

export async function avatarUrl(client: SupabaseClient<Database>, path: string): Promise<string | null> {
  const cached = cache.get(path)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url
  const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error || !data) return null
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_SECONDS * 1000 })
  return data.signedUrl
}

/** Lien affichable vers la photo d'un professionnel (`undefined` pendant le chargement ou sans photo). */
export function useAvatarUrl(client: SupabaseClient<Database> | null, path: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<{ path: string; url: string }>()
  useEffect(() => {
    if (!client || !path) return
    let active = true
    void avatarUrl(client, path).then((signed) => active && signed && setUrl({ path, url: signed }))
    return () => {
      active = false
    }
  }, [client, path])
  return url && url.path === path ? url.url : undefined
}
