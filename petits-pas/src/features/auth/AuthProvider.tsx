import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { authService as defaultService, type AccountProfile, type AuthErrorCode, type AuthService, type AuthUser } from '@/lib/auth'

/**
 * - `unavailable` : Supabase n'est pas configuré, l'application fonctionne sans compte.
 * - `loading` : lecture de la session enregistrée sur le téléphone.
 */
export type AuthStatus = 'unavailable' | 'loading' | 'signed_out' | 'signed_in'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  /** Profil parent du compte. `undefined` pendant le chargement ou hors ligne. */
  profile: AccountProfile | null | undefined
  /** Échec du dernier chargement du profil (souvent `network`), sinon `null`. */
  profileError: AuthErrorCode | null
  /** Relit le profil (après une modification, ou au retour du réseau). */
  refreshProfile(): Promise<void>
  /** Service à utiliser par les écrans (connexion, inscription…). `null` si indisponible. */
  service: AuthService | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children, service = defaultService }: { children: ReactNode; service?: AuthService | null }) {
  const [status, setStatus] = useState<AuthStatus>(service ? 'loading' : 'unavailable')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<AccountProfile | null | undefined>()
  const [profileError, setProfileError] = useState<AuthErrorCode | null>(null)

  useEffect(() => {
    if (!service) return
    let active = true
    const apply = (next: AuthUser | null) => {
      if (!active) return
      // Garde le même objet si l'utilisateur n'a pas changé (renouvellement de jeton) : évite de relire le profil.
      setUser((current) => (current?.id === next?.id && current?.email === next?.email ? current : next))
      setStatus(next ? 'signed_in' : 'signed_out')
    }
    void service.currentUser().then(apply, () => apply(null))
    const unsubscribe = service.onChange(apply)
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  const refreshProfile = useCallback(async () => {
    if (!service || !user) {
      setProfile(undefined)
      setProfileError(null)
      return
    }
    const result = await service.getProfile(user.id)
    // Hors ligne : on garde le profil déjà chargé plutôt que de l'effacer.
    if (result.ok) setProfile(result.data)
    setProfileError(result.ok ? null : result.error)
  }, [service, user])

  useEffect(() => {
    setProfile(undefined)
    void refreshProfile()
  }, [refreshProfile])

  return <AuthContext.Provider value={{ status, user, profile, profileError, refreshProfile, service }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth doit être utilisé dans <AuthProvider>.')
  return state
}
