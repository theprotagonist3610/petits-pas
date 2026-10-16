import { createClient } from '@supabase/supabase-js'
import type { Database } from '@petits-pas/shared/database.types'

const url: string = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!url || !anonKey) throw new Error('Supabase non configuré : copiez .env.example en .env.local.')

/** Client Supabase de Petits Pas Pro (même projet que l'application parents). */
// Flux par défaut (implicite) et non PKCE : les invitations sont créées côté serveur (fonction
// invite-professional), le navigateur du professionnel n'a donc pas de vérificateur PKCE. supabase-js
// lit la session dans le lien d'invitation ou de réinitialisation, puis l'efface de l'adresse.
export const supabase = createClient<Database>(url, anonKey)
