import { isAuthError, isAuthRetryableFetchError, isAuthSessionMissingError, isAuthWeakPasswordError } from '@supabase/supabase-js'

/** Erreurs présentées au parent. Chaque code a son message dans `auth.errors` (i18n). */
export type AuthErrorCode =
  | 'not_configured'
  | 'network'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'invalid_email'
  | 'weak_password'
  | 'same_password'
  | 'rate_limited'
  | 'signup_disabled'
  | 'session_expired'
  | 'invalid_data'
  | 'duplicate_consultation'
  | 'maintenance'
  | 'unknown'

const AUTH_CODES: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'email_taken',
  email_exists: 'email_taken',
  email_address_invalid: 'invalid_email',
  weak_password: 'weak_password',
  same_password: 'same_password',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  over_sms_send_rate_limit: 'rate_limited',
  signup_disabled: 'signup_disabled',
  email_provider_disabled: 'signup_disabled',
  provider_disabled: 'signup_disabled',
  oauth_provider_not_supported: 'signup_disabled',
  session_not_found: 'session_expired',
  session_expired: 'session_expired',
  refresh_token_not_found: 'session_expired',
  refresh_token_already_used: 'session_expired',
  validation_failed: 'invalid_data',
}

/** Codes Postgres / PostgREST : contraintes CHECK, format de date, jeton expiré. */
const DB_CODES: Record<string, AuthErrorCode> = {
  '23514': 'invalid_data',
  '22P02': 'invalid_data',
  '22007': 'invalid_data',
  '22008': 'invalid_data',
  '23502': 'invalid_data',
  PP503: 'maintenance',
  PGRST301: 'session_expired',
  PGRST303: 'session_expired',
}

/** Traduit n'importe quelle erreur (Auth, base de données, réseau) en code affichable. */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  if (isAuthRetryableFetchError(error)) return 'network'
  if (isAuthWeakPasswordError(error)) return 'weak_password'
  if (isAuthSessionMissingError(error)) return 'session_expired'
  if (isAuthError(error)) return (error.code && AUTH_CODES[error.code]) || (error.status === 0 ? 'network' : 'unknown')
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return 'network'
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && DB_CODES[code]) return DB_CODES[code]
  return 'unknown'
}
