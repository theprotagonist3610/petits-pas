/*
 * Règles de la messagerie sans dépendance : importables partout sans charger la cryptographie
 * (libsodium, Argon2), qui reste dans les écrans de messagerie chargés à la demande.
 */

/**
 * Longueur minimale du code secret, uniquement en chiffres (plus facile à retenir).
 * 8 chiffres au moins : la clé privée chiffrée est sur le serveur, et un code plus court
 * se devinerait trop vite en cas de vol de la base, malgré Argon2.
 */
export const SECRET_CODE_MIN_LENGTH = 8

/** Durée d'ouverture du canal, à partir de la confirmation (imposée par la base). */
export const CONVERSATION_DAYS = 10

export type SecretCodeProblem = 'not_numeric' | 'too_short' | 'too_simple'

/** Ne garde que les chiffres d'une saisie (espaces, tirets… ignorés). */
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** Codes évidents : un seul chiffre répété, ou suite croissante / décroissante (12345678, 98765432…). */
function isTrivial(code: string): boolean {
  if (/^(\d)\1+$/.test(code)) return true
  const steps = [...code].slice(1).map((d, i) => (Number(d) - Number(code[i]) + 10) % 10)
  return steps.every((s) => s === 1) || steps.every((s) => s === 9)
}

/** Vérifie un nouveau code secret : chiffres uniquement, assez long, pas évident. */
export function checkSecretCode(code: string): SecretCodeProblem | undefined {
  if (!/^\d*$/.test(code)) return 'not_numeric'
  if (code.length < SECRET_CODE_MIN_LENGTH) return 'too_short'
  if (isTrivial(code)) return 'too_simple'
}
