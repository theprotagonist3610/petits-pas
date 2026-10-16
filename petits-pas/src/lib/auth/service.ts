import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database, ParentRow, ParentSignUpData } from '@petits-pas/shared/database.types'
import { toAuthErrorCode } from '@petits-pas/shared/errors'
import type { AccountProfile, AccountProfilePatch, AuthResult, AuthUser, ProfileInput, SignInInput, SignUpInput } from './types'

/*
 * Pont entre les écrans de connexion / inscription et Supabase.
 * Les écrans n'importent jamais supabase-js : ils appellent ce service, qui renvoie
 * toujours un `AuthResult` (jamais d'exception) avec un code d'erreur traduisible.
 */

export interface AuthService {
  /** Utilisateur de la session enregistrée sur le téléphone (fonctionne hors ligne). */
  currentUser(): Promise<AuthUser | null>
  /** Prévient à chaque connexion, déconnexion ou renouvellement de session. Renvoie la fonction de désabonnement. */
  onChange(listener: (user: AuthUser | null) => void): () => void
  /** `needsEmailConfirmation` : le compte est créé mais le parent doit cliquer le lien reçu par e-mail. */
  /** `next` : page où ramène le lien de confirmation reçu par e-mail. */
  signUp(input: SignUpInput, next?: string): Promise<AuthResult<{ user: AuthUser; needsEmailConfirmation: boolean }>>
  signIn(input: SignInInput): Promise<AuthResult<AuthUser>>
  /**
   * Inscription ou connexion avec Google (même bouton : le compte est créé à la première connexion).
   * En cas de succès, le navigateur part chez Google puis revient sur AUTH_CALLBACK_PATH : rien d'autre à faire.
   * `next` : page de l'application où revenir une fois connecté.
   */
  signInWithGoogle(next?: string): Promise<AuthResult>
  /**
   * Connexion avec le jeton renvoyé par le bouton Google intégré (Google Identity Services).
   * `nonce` : valeur brute dont l'empreinte a été donnée à Google (voir createNonce).
   */
  signInWithGoogleIdToken(token: string, nonce: string): Promise<AuthResult<AuthUser>>
  signOut(): Promise<AuthResult>
  /** Envoie l'e-mail « mot de passe oublié ». Le lien ramène sur `redirectTo`. */
  requestPasswordReset(email: string, redirectTo?: string): Promise<AuthResult>
  /** Nouveau mot de passe, une fois connecté (ou après le lien « mot de passe oublié »). */
  updatePassword(password: string): Promise<AuthResult>
  resendConfirmation(email: string, next?: string): Promise<AuthResult>
  /** Profil du parent ; créé à partir du compte s'il manque (`null` seulement pour un compte professionnel). */
  getProfile(userId: string): Promise<AuthResult<AccountProfile | null>>
  updateProfile(userId: string, patch: AccountProfilePatch): Promise<AuthResult<AccountProfile>>
}

/** Page de l'application qui finalise la connexion au retour de Google ou d'un lien reçu par e-mail. */
export const AUTH_CALLBACK_PATH = '/connexion/retour'

/** Chemin interne sûr où aller après la connexion (jamais une autre origine). */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

/** URL complète de la page de retour, avec la page où revenir ensuite. */
export function authCallbackUrl(next?: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  const path = safeNextPath(next)
  return `${window.location.origin}${AUTH_CALLBACK_PATH}${path === '/' ? '' : `?next=${encodeURIComponent(path)}`}`
}

const toAuthUser = (user: User): AuthUser => ({ id: user.id, email: user.email })

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined
const trimOrUndefined = (value: string | undefined) => value?.trim() || undefined

export function toProfile(row: ParentRow): AccountProfile {
  return {
    id: row.id,
    lastName: row.last_name,
    firstName: row.first_name,
    sex: orUndefined(row.sex),
    birthDate: orUndefined(row.birth_date),
    profession: orUndefined(row.profession),
    phone: orUndefined(row.phone),
    email: orUndefined(row.email),
    country: orUndefined(row.country),
  }
}

const PROFILE_COLUMNS = {
  lastName: 'last_name',
  firstName: 'first_name',
  sex: 'sex',
  birthDate: 'birth_date',
  profession: 'profession',
  phone: 'phone',
  email: 'email',
  country: 'country',
} as const satisfies Record<keyof AccountProfilePatch, keyof ParentRow>

/** Convertit un patch camelCase en colonnes ; les textes sont nettoyés, une chaîne vide efface le champ. */
export function toParentUpdate(patch: AccountProfilePatch): Database['public']['Tables']['parents']['Update'] {
  const update: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
    if (!(key in patch)) continue
    const value = patch[key as keyof AccountProfilePatch]
    update[column] = typeof value === 'string' ? value.trim() || (column.endsWith('name') ? '' : null) : value
  }
  return update
}

export function toSignUpData(input: ProfileInput): ParentSignUpData {
  return {
    last_name: input.lastName.trim(),
    first_name: input.firstName.trim(),
    sex: input.sex,
    birth_date: input.birthDate || undefined,
    profession: trimOrUndefined(input.profession),
    phone: trimOrUndefined(input.phone),
    country: input.country,
  }
}

const fail = (error: unknown) => ({ ok: false, error: toAuthErrorCode(error) }) as const
const done = <T>(data: T) => ({ ok: true, data }) as const

/** Exécute un appel et transforme toute exception (réseau coupé…) en `AuthResult`. */
async function attempt<T>(run: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
  try {
    return await run()
  } catch (error) {
    return fail(error)
  }
}

export function createAuthService(client: SupabaseClient<Database>): AuthService {
  const service: AuthService = {
    async currentUser() {
      const { data } = await client.auth.getSession()
      return data.session ? toAuthUser(data.session.user) : null
    },

    onChange(listener) {
      // Pas d'appel Supabase dans ce rappel (risque de blocage côté supabase-js) : on transmet seulement l'utilisateur.
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(session ? toAuthUser(session.user) : null))
      return () => data.subscription.unsubscribe()
    },

    signUp: (input, next) =>
      attempt(async () => {
        const { data, error } = await client.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: { data: toSignUpData(input), emailRedirectTo: authCallbackUrl(next) },
        })
        if (error) return fail(error)
        if (!data.user) return fail(null)
        // Avec la confirmation d'e-mail activée, Supabase ne révèle pas qu'un e-mail est déjà pris :
        // il renvoie un faux utilisateur sans identité.
        if (data.user.identities?.length === 0) return { ok: false, error: 'email_taken' }
        return done({ user: toAuthUser(data.user), needsEmailConfirmation: !data.session })
      }),

    signIn: (input) =>
      attempt(async () => {
        const { data, error } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password })
        return error ? fail(error) : done(toAuthUser(data.user))
      }),

    signInWithGoogle: (next) =>
      attempt(async () => {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          // select_account : laisse choisir le compte quand plusieurs comptes Google sont sur le téléphone.
          options: { redirectTo: authCallbackUrl(next), queryParams: { prompt: 'select_account' } },
        })
        return error ? fail(error) : done(undefined)
      }),

    signInWithGoogleIdToken: (token, nonce) =>
      attempt(async () => {
        const { data, error } = await client.auth.signInWithIdToken({ provider: 'google', token, nonce })
        return error ? fail(error) : done(toAuthUser(data.user))
      }),

    signOut: () =>
      attempt(async () => {
        // `local` : déconnecte ce téléphone même hors ligne, sans toucher aux autres appareils.
        const { error } = await client.auth.signOut({ scope: 'local' })
        return error ? fail(error) : done(undefined)
      }),

    requestPasswordReset: (email, redirectTo = authCallbackUrl()) =>
      attempt(async () => {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        return error ? fail(error) : done(undefined)
      }),

    updatePassword: (password) =>
      attempt(async () => {
        const { error } = await client.auth.updateUser({ password })
        return error ? fail(error) : done(undefined)
      }),

    resendConfirmation: (email, next) =>
      attempt(async () => {
        const { error } = await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authCallbackUrl(next) } })
        return error ? fail(error) : done(undefined)
      }),

    getProfile: (userId) =>
      attempt(async () => {
        const { data, error } = await client.from('parents').select('*').eq('id', userId).maybeSingle()
        if (error) return fail(error)
        if (data) return done(toProfile(data))
        // Compte sans profil parent (créé avant le trigger, par exemple) : la base le crée maintenant.
        const created = await client.rpc('ensure_parent_profile')
        if (created.error) return fail(created.error)
        return done(created.data?.id ? toProfile(created.data) : null)
      }),

    updateProfile: (userId, patch) =>
      attempt(async () => {
        const { data, error } = await client.from('parents').update(toParentUpdate(patch)).eq('id', userId).select('*').single()
        return error ? fail(error) : done(toProfile(data))
      }),
  }
  return service
}
