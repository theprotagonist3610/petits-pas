import type { CountryCode, Sex } from '@/data/types'
import type { AuthErrorCode } from '@petits-pas/shared/errors'

/** Utilisateur connecté (sous-ensemble de l'utilisateur Supabase utile à l'application). */
export interface AuthUser {
  id: string
  email?: string
}

/** Profil du parent titulaire du compte (table `parents`), en camelCase comme le reste de l'application. */
export interface AccountProfile {
  id: string
  lastName: string
  firstName: string
  sex?: Sex
  birthDate?: string
  profession?: string
  phone?: string
  /** E-mail du compte, copié à l'inscription. Le changer ici ne change pas l'identifiant de connexion. */
  email?: string
  country?: CountryCode
}

/** Champs modifiables du profil ; `null` efface un champ facultatif. */
export type AccountProfilePatch = {
  [K in keyof Omit<AccountProfile, 'id'>]?: AccountProfile[K] | null
}

/**
 * Profil suffisant pour l'application. Après une inscription Google, seuls le nom et l'e-mail sont connus :
 * l'écran de profil doit alors demander le reste (le sexe au minimum).
 */
export function isProfileComplete(profile: AccountProfile | null | undefined): boolean {
  return !!profile && !!profile.lastName.trim() && !!profile.firstName.trim() && !!profile.sex
}

export interface SignInInput {
  email: string
  password: string
}

/** Informations du parent demandées à l'inscription et sur l'écran de profil. */
export interface ProfileInput {
  lastName: string
  firstName: string
  sex: Sex | undefined
  birthDate?: string
  profession?: string
  phone?: string
  country?: CountryCode
}

export interface SignUpInput extends SignInInput, ProfileInput {}

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: AuthErrorCode }
