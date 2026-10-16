import { describe, expect, it, vi } from 'vitest'
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, ParentRow } from '@petits-pas/shared/database.types'
import { createAuthService, safeNextPath, toParentUpdate } from './service'
import { isProfileComplete, type SignUpInput } from './types'
import { hasErrors, validateSignIn, validateSignUp } from './validation'
import { createNonce } from './googleIdentity'

const row: ParentRow = {
  id: 'u1',
  last_name: 'Adjovi',
  first_name: 'Afi',
  sex: 'female',
  birth_date: null,
  profession: 'Couturière',
  phone: '+229 01 97 00 00 00',
  email: 'afi@exemple.com',
  country: 'BJ',
  created_at: '',
  updated_at: '',
}

const user = { id: 'u1', email: 'afi@exemple.com', identities: [{}] }

/** Faux client : chaque méthode renvoie ce que le test lui donne, comme supabase-js ({ data, error }). */
function fakeClient(overrides: Record<string, unknown> = {}) {
  const query = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    single: vi.fn(async () => ({ data: row, error: null })),
  }
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signUp: vi.fn(async () => ({ data: { user, session: { user } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user, session: { user } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: { user }, error: null })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
    ...overrides,
  }
  const client = { auth, from: vi.fn(() => query) } as unknown as SupabaseClient<Database>
  return { client, auth, query }
}

const signUpInput: SignUpInput = {
  email: ' afi@exemple.com ',
  password: 'motdepasse',
  lastName: ' Adjovi ',
  firstName: 'Afi',
  sex: 'female',
  phone: '',
  country: 'BJ',
}

describe('service d’authentification', () => {
  it('inscrit le parent avec ses informations de profil nettoyées', async () => {
    const { client, auth } = fakeClient()
    const result = await createAuthService(client).signUp(signUpInput)

    expect(result).toEqual({ ok: true, data: { user: { id: 'u1', email: 'afi@exemple.com' }, needsEmailConfirmation: false } })
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'afi@exemple.com',
      password: 'motdepasse',
      options: {
        data: { last_name: 'Adjovi', first_name: 'Afi', sex: 'female', birth_date: undefined, profession: undefined, phone: undefined, country: 'BJ' },
        emailRedirectTo: undefined,
      },
    })
  })

  it('signale qu’il faut confirmer l’e-mail quand Supabase ne renvoie pas de session', async () => {
    const { client } = fakeClient({ signUp: async () => ({ data: { user, session: null }, error: null }) })
    const result = await createAuthService(client).signUp(signUpInput)
    expect(result.ok && result.data.needsEmailConfirmation).toBe(true)
  })

  it('détecte un e-mail déjà utilisé, même masqué par la confirmation d’e-mail', async () => {
    const masked = fakeClient({ signUp: async () => ({ data: { user: { ...user, identities: [] }, session: null }, error: null }) })
    expect(await createAuthService(masked.client).signUp(signUpInput)).toEqual({ ok: false, error: 'email_taken' })

    const explicit = fakeClient({
      signUp: async () => ({ data: { user: null, session: null }, error: new AuthApiError('User already registered', 422, 'user_already_exists') }),
    })
    expect(await createAuthService(explicit.client).signUp(signUpInput)).toEqual({ ok: false, error: 'email_taken' })
  })

  it('traduit les erreurs de connexion et de réseau en codes affichables', async () => {
    const wrong = fakeClient({
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') }),
    })
    expect(await createAuthService(wrong.client).signIn({ email: 'a@b.co', password: 'x' })).toEqual({ ok: false, error: 'invalid_credentials' })

    const offline = fakeClient({
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) }),
    })
    expect(await createAuthService(offline.client).signIn({ email: 'a@b.co', password: 'x' })).toEqual({ ok: false, error: 'network' })

    const thrown = fakeClient({ signOut: async () => Promise.reject(new TypeError('Failed to fetch')) })
    expect(await createAuthService(thrown.client).signOut()).toEqual({ ok: false, error: 'network' })
  })

  it('lit le profil du parent en camelCase', async () => {
    const { client, query } = fakeClient()
    const result = await createAuthService(client).getProfile('u1')
    expect(query.eq).toHaveBeenCalledWith('id', 'u1')
    expect(result).toEqual({
      ok: true,
      data: { id: 'u1', lastName: 'Adjovi', firstName: 'Afi', sex: 'female', birthDate: undefined, profession: 'Couturière', phone: '+229 01 97 00 00 00', email: 'afi@exemple.com', country: 'BJ' },
    })
  })

  it('met à jour le profil : textes nettoyés, champ vidé effacé, refus de la base traduit', async () => {
    expect(toParentUpdate({ profession: '  ', phone: null, firstName: ' Afi ' })).toEqual({ profession: null, phone: null, first_name: 'Afi' })

    const { client, query } = fakeClient()
    query.single.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'check constraint' } } as never)
    expect(await createAuthService(client).updateProfile('u1', { phone: '12' })).toEqual({ ok: false, error: 'invalid_data' })
  })

  it('transmet les changements de session et permet de se désabonner', () => {
    const unsubscribe = vi.fn()
    let emit: (event: string, session: { user: typeof user } | null) => void = () => {}
    const { client } = fakeClient({
      onAuthStateChange: (cb: typeof emit) => {
        emit = cb
        return { data: { subscription: { unsubscribe } } }
      },
    })
    const listener = vi.fn()
    const stop = createAuthService(client).onChange(listener)
    emit('SIGNED_IN', { user })
    emit('SIGNED_OUT', null)
    expect(listener.mock.calls).toEqual([[{ id: 'u1', email: 'afi@exemple.com' }], [null]])
    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

describe('validation des formulaires', () => {
  it('valide la connexion', () => {
    expect(validateSignIn({ email: 'pas-un-email', password: '' })).toEqual({ email: 'invalid_email', password: 'required' })
    expect(hasErrors(validateSignIn({ email: 'afi@exemple.com', password: 'x' }))).toBe(false)
  })

  it('valide l’inscription', () => {
    expect(validateSignUp(signUpInput, 'motdepasse', '2026-10-15')).toEqual({})
    expect(
      validateSignUp(
        { ...signUpInput, password: 'court', lastName: ' ', sex: undefined, birthDate: '2030-01-01', phone: '123' },
        undefined,
        '2026-10-15',
      ),
    ).toEqual({ password: 'password_too_short', lastName: 'required', sex: 'required', birthDate: 'invalid_date', phone: 'invalid_phone' })
    expect(validateSignUp(signUpInput, 'autre', '2026-10-15')).toEqual({ password: 'password_mismatch' })
  })
})

describe('connexion avec Google', () => {
  it('part chez Google avec la page de retour de l’application', async () => {
    const signInWithOAuth = vi.fn(async () => ({ data: { provider: 'google', url: 'https://accounts.google.com/…' }, error: null }))
    const { client } = fakeClient({ signInWithOAuth })
    expect(await createAuthService(client).signInWithGoogle('/plus')).toEqual({ ok: true, data: undefined })
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: undefined, queryParams: { prompt: 'select_account' } },
    })
  })

  it('signale un fournisseur Google non activé dans Supabase', async () => {
    const { client } = fakeClient({
      signInWithOAuth: async () => ({ data: { provider: 'google', url: null }, error: new AuthApiError('Provider is not enabled', 400, 'provider_disabled') }),
    })
    expect(await createAuthService(client).signInWithGoogle()).toEqual({ ok: false, error: 'signup_disabled' })
  })

  it('ne redirige jamais hors de l’application après la connexion', () => {
    expect(safeNextPath('/consultation')).toBe('/consultation')
    expect(safeNextPath('//pirate.example')).toBe('/')
    expect(safeNextPath('https://pirate.example')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })

  it('demande de compléter un profil créé par Google', () => {
    const fromGoogle = { id: 'u1', lastName: 'Adjovi', firstName: 'Afi', email: 'afi@gmail.com' }
    expect(isProfileComplete(fromGoogle)).toBe(false)
    expect(isProfileComplete({ ...fromGoogle, sex: 'female' })).toBe(true)
  })
})

describe('bouton Google intégré (jeton d’identité)', () => {
  it('échange le jeton Google et le nonce brut contre une session Supabase', async () => {
    const signInWithIdToken = vi.fn(async () => ({ data: { user, session: { user } }, error: null }))
    const { client } = fakeClient({ signInWithIdToken })
    expect(await createAuthService(client).signInWithGoogleIdToken('jwt-google', 'nonce-brut')).toEqual({
      ok: true,
      data: { id: 'u1', email: 'afi@exemple.com' },
    })
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'jwt-google', nonce: 'nonce-brut' })
  })

  it('donne à Google l’empreinte SHA-256 du nonce, différente à chaque fois', async () => {
    const a = await createNonce()
    const b = await createNonce()
    expect(a.raw).not.toBe(b.raw)
    expect(a.hashed).toMatch(/^[0-9a-f]{64}$/)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.raw))
    expect(a.hashed).toBe(Buffer.from(digest).toString('hex'))
  })
})

describe('profil parent garanti', () => {
  it('crée le profil manquant à la connexion', async () => {
    const { client, query } = fakeClient()
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null } as never)
    const rpc = vi.fn(async () => ({ data: { ...row, sex: null, phone: null }, error: null }))
    Object.assign(client, { rpc })
    const result = await createAuthService(client).getProfile('u1')
    expect(rpc).toHaveBeenCalledWith('ensure_parent_profile')
    expect(result.ok && result.data).toMatchObject({ id: 'u1', firstName: 'Afi', sex: undefined })
    expect(result.ok && isProfileComplete(result.data)).toBe(false)
  })
})
