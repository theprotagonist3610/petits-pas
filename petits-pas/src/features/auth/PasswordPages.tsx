import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authCallbackUrl, validateEmail, validateNewPassword, type AuthErrorCode, type ValidationCode } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { useAuth } from './AuthProvider'
import { AuthCard, FormAlert, PasswordInput, useAuthText } from './AuthUi'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const location = useLocation()
  const { status, service } = useAuth()
  const [email, setEmail] = useState<string>((location.state as { email?: string } | null)?.email ?? '')
  const [invalid, setInvalid] = useState<ValidationCode>()
  const [error, setError] = useState<AuthErrorCode>()
  const [sentTo, setSentTo] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (status === 'unavailable') return <Navigate to="/compte" replace />
  if (!service) return null
  const auth = service

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateEmail(email)
    setInvalid(found)
    if (found || busy) return
    setBusy(true)
    setError(undefined)
    // Le lien reçu connecte le parent puis l'amène sur l'écran « Nouveau mot de passe ».
    const result = await auth.requestPasswordReset(email, authCallbackUrl('/compte/mot-de-passe'))
    setBusy(false)
    if (result.ok) setSentTo(email.trim())
    else setError(result.error)
  }

  return (
    <>
      <PageHeader title={t('auth.forgot.title')} />
      <AuthCard>
        {sentTo ? (
          <FormAlert tone="success">{t('auth.forgot.sent', { email: sentTo })}</FormAlert>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <p>{t('auth.forgot.text')}</p>
            {error && <FormAlert>{text.error(error)}</FormAlert>}
            <Field label={t('auth.email')} error={text.validation(invalid)}>
              <input
                type="email"
                inputMode="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('auth.forgot.submit')}
            </Button>
          </form>
        )}
      </AuthCard>
    </>
  )
}

/** Choix d'un nouveau mot de passe (compte connecté, ou arrivée par le lien « mot de passe oublié »). */
export function NewPasswordPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const { service } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [invalid, setInvalid] = useState<ValidationCode>()
  const [error, setError] = useState<AuthErrorCode>()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateNewPassword(password, confirmation)
    setInvalid(found)
    if (found || busy) return
    setBusy(true)
    setError(undefined)
    const result = await service!.updatePassword(password)
    setBusy(false)
    if (result.ok) setDone(true)
    else setError(result.error)
  }

  return (
    <>
      <PageHeader title={t('auth.newPassword.title')} />
      <AuthCard>
        {done ? (
          <>
            <FormAlert tone="success">{t('auth.newPassword.done')}</FormAlert>
            <Link to="/compte" replace className="flex min-h-12 items-center justify-center rounded-2xl bg-sky-brand font-bold text-white">
              {t('auth.account.title')}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {error && <FormAlert>{text.error(error)}</FormAlert>}
            <Field label={t('auth.password')} hint={text.validation('password_too_short')} error={text.validation(invalid)}>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label={t('auth.passwordConfirm')}>
              <PasswordInput value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" disabled={busy}>
              {t('auth.newPassword.submit')}
            </Button>
          </form>
        )}
      </AuthCard>
    </>
  )
}
