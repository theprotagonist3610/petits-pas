import { supabase } from '@/lib/supabase/client'
import { createAuthService, type AuthService } from './service'

/** Service d'authentification de l'application, ou `null` si Supabase n'est pas configuré (voir .env.example). */
export const authService: AuthService | null = supabase ? createAuthService(supabase) : null

export { AUTH_CALLBACK_PATH, authCallbackUrl, createAuthService, safeNextPath, type AuthService } from './service'
export { toAuthErrorCode, type AuthErrorCode } from '@petits-pas/shared/errors'
export * from './types'
export * from './validation'
export { GOOGLE_CLIENT_ID, createNonce, loadGoogleIdentity, type GoogleAccountsId } from './googleIdentity'
