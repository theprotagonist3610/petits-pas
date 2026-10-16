import { useTranslation } from 'react-i18next'
import { Field } from '@/components/Field'
import { SECRET_CODE_MIN_LENGTH as SECRET_CODE_MIN, checkSecretCode, digitsOnly } from '@petits-pas/shared/messagingRules'
import { PasswordInput } from '@/features/auth/AuthUi'

export type SecretCodeError = 'tooShort' | 'tooSimple' | 'mismatch' | undefined

export function validateSecretCode(code: string, confirmation: string): SecretCodeError {
  const problem = checkSecretCode(code)
  if (problem) return problem === 'too_simple' ? 'tooSimple' : 'tooShort'
  if (code !== confirmation) return 'mismatch'
}

/** Clavier numérique sur téléphone ; seuls les chiffres sont gardés. */
export const numericInputProps = { inputMode: 'numeric', pattern: '[0-9]*' } as const

/** Code secret de messagerie et sa confirmation (champs contrôlés). */
export function SecretCodeFields({
  code,
  confirmation,
  onChange,
  error,
}: {
  code: string
  confirmation: string
  onChange: (value: { code: string; confirmation: string }) => void
  error: SecretCodeError
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field
        label={t('messages.code')}
        hint={t('messages.codeHint', { min: SECRET_CODE_MIN })}
        error={error ? t(`messages.errors.${error}`, { min: SECRET_CODE_MIN }) : undefined}
      >
        <PasswordInput {...numericInputProps} value={code} onChange={(e) => onChange({ code: digitsOnly(e.target.value), confirmation })} autoComplete="new-password" />
      </Field>
      <Field label={t('messages.codeConfirm')}>
        <PasswordInput {...numericInputProps} value={confirmation} onChange={(e) => onChange({ code, confirmation: digitsOnly(e.target.value) })} autoComplete="new-password" />
      </Field>
    </>
  )
}
