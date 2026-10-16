import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@petits-pas/shared/database.types'

const url: string = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * Client Supabase, ou `null` si le projet n'est pas configuré (voir .env.example).
 * L'application reste utilisable hors ligne sans compte : seuls les comptes et les consultations en dépendent.
 */
export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        // PKCE : au retour de Google (ou d'un lien reçu par e-mail), l'URL ne porte qu'un code à usage unique,
        // échangé contre la session par supabase-js au chargement de la page (detectSessionInUrl).
        auth: { flowType: 'pkce' },
      })
    : null
