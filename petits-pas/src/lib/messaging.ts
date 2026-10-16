import { createMessagingService, type PrivateKeyStore } from '@petits-pas/shared/messaging'
import { supabase } from '@/lib/supabase/client'

/** Clé privée déverrouillée, gardée sur le téléphone du parent (appareil personnel). */
const phoneStore: PrivateKeyStore = {
  async get(userId) {
    try {
      return localStorage.getItem(`petits-pas:cle-messagerie:${userId}`)
    } catch {
      return null
    }
  },
  async set(userId, privateKey) {
    try {
      localStorage.setItem(`petits-pas:cle-messagerie:${userId}`, privateKey)
    } catch {
      // Stockage indisponible (navigation privée) : le code secret sera redemandé.
    }
  },
  async clear(userId) {
    try {
      localStorage.removeItem(`petits-pas:cle-messagerie:${userId}`)
    } catch {
      // Rien à effacer.
    }
  },
}

/** Messagerie chiffrée, ou `null` si Supabase n'est pas configuré. */
export const messaging = supabase ? createMessagingService(supabase, phoneStore) : null
