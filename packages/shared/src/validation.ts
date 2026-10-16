const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Chiffres, espaces, points, tirets et parenthèses, avec un « + » initial facultatif. */
const PHONE = /^\+?[\d\s.()-]+$/

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL.test(email)
}

/** 8 à 15 chiffres (norme E.164), indicatif compris. Même règle que la base Supabase. */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').length
  return PHONE.test(phone) && phone.length <= 20 && digits >= 8 && digits <= 15
}
