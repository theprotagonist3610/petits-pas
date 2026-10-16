import { createMessagingService, type PrivateKeyStore } from '@petits-pas/shared/messaging'
import { supabase } from './supabase'

/**
 * Clé privée déverrouillée gardée seulement le temps de l'onglet : sur un ordinateur de cabinet,
 * fermer l'onglet suffit à la retirer (le code secret sera redemandé à la prochaine ouverture).
 */
const sessionStore: PrivateKeyStore = {
  async get(userId) {
    try {
      return sessionStorage.getItem(`petits-pas-pro:cle:${userId}`)
    } catch {
      return null
    }
  },
  async set(userId, privateKey) {
    try {
      sessionStorage.setItem(`petits-pas-pro:cle:${userId}`, privateKey)
    } catch {
      // Stockage indisponible : la clé sera redemandée.
    }
  },
  async clear(userId) {
    try {
      sessionStorage.removeItem(`petits-pas-pro:cle:${userId}`)
    } catch {
      // Rien à effacer.
    }
  },
}

export const messaging = createMessagingService(supabase, sessionStore)
