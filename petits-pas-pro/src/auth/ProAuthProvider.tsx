import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { isAuthApiError, type User } from '@supabase/supabase-js'
import type { ProfessionalRow } from '@petits-pas/shared/database.types'
import { supabase } from '@/lib/supabase'
import { attempt, done, fail, type Result } from '@/lib/errors'
import { computeGate, type Gate } from '@/lib/gate'

interface ProAuthState {
  gate: Gate
  user: User | null
  /** Fiche professionnelle du compte (null pour un administrateur qui n'exerce pas). */
  professional: ProfessionalRow | null | undefined
  isAdmin: boolean
  /** Professionnel opérationnel (actif, vérifié, double authentification) : accès aux demandes. */
  canPractice: boolean
  refresh(): Promise<void>
  signIn(email: string, password: string): Promise<Result>
  signOut(): Promise<void>
  /** Démarre l'activation de la double authentification : QR code à scanner. */
  enrollTotp(): Promise<Result<{ factorId: string; qrCode: string; secret: string }>>
  /** Vérifie un code TOTP (activation ou connexion). */
  verifyTotp(code: string, factorId?: string): Promise<Result>
  setPassword(password: string): Promise<Result>
  requestPasswordReset(email: string): Promise<Result>
}

const ProAuthContext = createContext<ProAuthState | null>(null)

interface Snapshot {
  user: User | null
  hasTotp: boolean
  aal: 'aal1' | 'aal2' | null
  professional: ProfessionalRow | null | undefined
  isAdmin: boolean | undefined
}

const SIGNED_OUT: Snapshot = { user: null, hasTotp: false, aal: null, professional: undefined, isAdmin: undefined }

/** Lit l'état complet de la session : utilisateur, facteurs, niveau d'authentification, fiche pro. */
async function readSnapshot(): Promise<Snapshot> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return SIGNED_OUT
  // La session gardée dans le navigateur peut avoir été révoquée côté Supabase (compte supprimé ou réinvité,
  // lien d'invitation rouvert…) : on la vérifie auprès du serveur, et on l'efface si elle est refusée.
  const { data: checked, error } = await supabase.auth.getUser()
  if (error) {
    if (isAuthApiError(error) && (error.status === 401 || error.status === 403)) {
      console.warn('Session refusée par Supabase, retour à la connexion :', error.code ?? error.message)
      await supabase.auth.signOut({ scope: 'local' })
      return SIGNED_OUT
    }
    throw error // Réseau coupé : on garde l'état actuel (voir refresh).
  }
  const user = checked.user
  const [factors, level] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()])
  const hasTotp = (factors.data?.totp.length ?? 0) > 0
  const aal = level.data?.currentLevel === 'aal2' ? 'aal2' : level.data?.currentLevel === 'aal1' ? 'aal1' : null
  if (aal !== 'aal2') return { user, hasTotp, aal, professional: undefined, isAdmin: undefined }
  const [pro, admin] = await Promise.all([
    supabase.from('professionals').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('is_admin'),
  ])
  return { user, hasTotp, aal, professional: pro.data ?? null, isAdmin: admin.data === true }
}

export function ProAuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>()

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await readSnapshot())
    } catch {
      setSnapshot((current) => current ?? SIGNED_OUT)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Pas d'appel Supabase directement dans ce rappel (risque de blocage côté supabase-js).
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'TOKEN_REFRESHED') setTimeout(() => void refresh(), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const gate: Gate = snapshot
    ? computeGate({
        signedIn: !!snapshot.user,
        hasTotp: snapshot.hasTotp,
        aal: snapshot.aal,
        professional: snapshot.professional,
        isAdmin: snapshot.isAdmin,
      })
    : 'loading'

  const professional = snapshot?.professional
  const canPractice = gate === 'ready' && !!professional?.is_active && !!professional.verified_at && !!professional.avatar_path

  const value: ProAuthState = {
    gate,
    user: snapshot?.user ?? null,
    professional,
    isAdmin: snapshot?.isAdmin === true,
    canPractice,
    refresh,

    signIn: (email, password) =>
      attempt(async () => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return error ? fail(error) : done(undefined)
      }),

    signOut: async () => {
      await supabase.auth.signOut({ scope: 'local' })
      setSnapshot(SIGNED_OUT)
    },

    enrollTotp: () =>
      attempt(async () => {
        // Un essai précédent non terminé bloquerait la création (nom de facteur déjà pris).
        const { data: factors } = await supabase.auth.mfa.listFactors()
        for (const f of factors?.all ?? []) {
          if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Petits Pas Pro', issuer: 'Petits Pas Pro' })
        if (error) return fail(error)
        return done({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
      }),

    verifyTotp: (code, factorId) =>
      attempt(async () => {
        const id = factorId ?? (await supabase.auth.mfa.listFactors()).data?.totp[0]?.id
        if (!id) return { ok: false, error: 'invalid_code' }
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.replace(/\s/g, '') })
        if (error) return fail(error)
        await refresh()
        return done(undefined)
      }),

    setPassword: (password) =>
      attempt(async () => {
        const { error } = await supabase.auth.updateUser({ password })
        return error ? fail(error) : done(undefined)
      }),

    requestPasswordReset: (email) =>
      attempt(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/activation` })
        return error ? fail(error) : done(undefined)
      }),
  }

  return <ProAuthContext.Provider value={value}>{children}</ProAuthContext.Provider>
}

export function useProAuth(): ProAuthState {
  const state = useContext(ProAuthContext)
  if (!state) throw new Error('useProAuth doit être utilisé dans <ProAuthProvider>.')
  return state
}
