import { toAuthErrorCode, type AuthErrorCode } from '@petits-pas/shared/errors'

/** Erreurs affichées dans Petits Pas Pro. */
export type ProErrorCode = AuthErrorCode | 'not_operational' | 'already_taken' | 'type_not_offered' | 'past_date' | 'invalid_code' | 'email_exists' | 'wrong_secret_code' | 'nothing_to_pay' | 'payout_in_progress'

/** Codes propres à la base Petits Pas (fonction claim_consultation). */
const PRO_DB_CODES: Record<string, ProErrorCode> = {
  PP401: 'not_operational',
  PP403: 'type_not_offered',
  PP409: 'already_taken',
  PP422: 'past_date',
  // Code TOTP refusé par Supabase Auth.
  mfa_verification_failed: 'invalid_code',
  mfa_challenge_expired: 'invalid_code',
}

export function toProErrorCode(error: unknown): ProErrorCode {
  // Reconnue par son message (WrongSecretCodeError) : importer la classe tirerait la cryptographie dans le chargement initial.
  if (error instanceof Error && error.message === 'wrong_secret_code') return 'wrong_secret_code'
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && PRO_DB_CODES[code]) return PRO_DB_CODES[code]
  return toAuthErrorCode(error)
}

const MESSAGES: Record<ProErrorCode, string> = {
  not_configured: 'Le service n’est pas configuré.',
  network: 'Pas de connexion internet. Réessayez.',
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Adresse e-mail non confirmée : utilisez le lien d’invitation reçu.',
  email_taken: 'Un compte existe déjà avec cet e-mail.',
  email_exists: 'Un compte existe déjà avec cet e-mail.',
  invalid_email: 'Adresse e-mail non valide.',
  weak_password: 'Mot de passe trop simple : mélangez lettres, chiffres et symboles.',
  same_password: 'Choisissez un mot de passe différent de l’ancien.',
  rate_limited: 'Trop de tentatives. Patientez quelques minutes.',
  signup_disabled: 'Les inscriptions sont fermées.',
  session_expired: 'Votre session a expiré : reconnectez-vous.',
  invalid_data: 'Certaines informations ne sont pas valides.',
  duplicate_consultation: 'Une demande identique est déjà en cours.',
  maintenance: 'La plateforme est en maintenance : les nouvelles actions sont suspendues.',
  not_operational: 'Votre compte n’est pas encore vérifié, ou la double authentification n’est pas active.',
  already_taken: 'Cette demande vient d’être prise par un confrère ou annulée par le parent.',
  type_not_offered: 'Vous ne proposez pas ce type de consultation (voir Mon profil).',
  past_date: 'Choisissez une date et une heure à venir.',
  invalid_code: 'Code incorrect ou expiré. Vérifiez l’heure de votre téléphone et réessayez.',
  wrong_secret_code: 'Code secret incorrect.',
  nothing_to_pay: 'Aucun montant disponible pour l’instant.',
  payout_in_progress: 'Une demande de paiement est déjà en cours, ou cette demande a déjà été traitée.',
  unknown: 'Une erreur est survenue. Réessayez dans un instant.',
}

export const errorMessage = (code: ProErrorCode) => MESSAGES[code]

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: ProErrorCode }

/** Exécute un appel et transforme toute erreur (réseau, base, Auth) en `Result`. */
export async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run()
  } catch (error) {
    return { ok: false, error: toProErrorCode(error) }
  }
}

export const fail = (error: unknown) => ({ ok: false, error: toProErrorCode(error) }) as const
export const done = <T>(data: T) => ({ ok: true, data }) as const
