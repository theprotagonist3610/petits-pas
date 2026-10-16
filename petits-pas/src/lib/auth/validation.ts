import { isValidEmail, isValidPhone } from '@petits-pas/shared/validation'
import type { ProfileInput, SignInInput, SignUpInput } from './types'

/** Longueur minimale du mot de passe (Supabase accepte 6 par défaut : on demande un peu plus). */
export const PASSWORD_MIN_LENGTH = 8

/** Erreurs de saisie. Chaque code a son message dans `auth.validation` (i18n). */
export type ValidationCode = 'required' | 'invalid_email' | 'password_too_short' | 'password_mismatch' | 'invalid_phone' | 'invalid_date'

export type ValidationErrors<T> = Partial<Record<keyof T, ValidationCode>>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateEmail(email: string): ValidationCode | undefined {
  if (!email.trim()) return 'required'
  if (!isValidEmail(email.trim())) return 'invalid_email'
}

export function validateNewPassword(password: string, confirmation?: string): ValidationCode | undefined {
  if (!password) return 'required'
  if (password.length < PASSWORD_MIN_LENGTH) return 'password_too_short'
  if (confirmation !== undefined && confirmation !== password) return 'password_mismatch'
}

export function validateSignIn(input: SignInInput): ValidationErrors<SignInInput> {
  const errors: ValidationErrors<SignInInput> = {}
  const email = validateEmail(input.email)
  if (email) errors.email = email
  if (!input.password) errors.password = 'required'
  return errors
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function validateProfile(input: ProfileInput, today: string = todayISO()): ValidationErrors<ProfileInput> {
  const errors: ValidationErrors<ProfileInput> = {}
  if (!input.lastName.trim()) errors.lastName = 'required'
  if (!input.firstName.trim()) errors.firstName = 'required'
  if (!input.sex) errors.sex = 'required'
  if (input.birthDate && (!ISO_DATE.test(input.birthDate) || input.birthDate > today)) errors.birthDate = 'invalid_date'
  if (input.phone?.trim() && !isValidPhone(input.phone.trim())) errors.phone = 'invalid_phone'
  return errors
}

/** `passwordConfirmation` : à fournir si le formulaire demande de retaper le mot de passe. */
export function validateSignUp(input: SignUpInput, passwordConfirmation?: string, today: string = todayISO()): ValidationErrors<SignUpInput> {
  const errors: ValidationErrors<SignUpInput> = validateProfile(input, today)
  const email = validateEmail(input.email)
  if (email) errors.email = email
  const password = validateNewPassword(input.password, passwordConfirmation)
  if (password) errors.password = password
  return errors
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0
