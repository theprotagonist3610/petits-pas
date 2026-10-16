import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hasErrors, safeNextPath, validateSignIn, type AuthErrorCode, type SignInInput, type ValidationErrors } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { useAuth } from './AuthProvider'
import { AuthCard, FormAlert, OrDivider, PasswordInput, useAuthText } from './AuthUi'
import { GoogleSignIn } from './GoogleSignIn'

/** Page où aller une fois connecté (`?next=`), « Mon compte » par défaut. */
export function useNextPath(): string {
  const [search] = useSearchParams()
  const next = search.get('next')
  return next ? safeNextPath(next) : '/compte'
}

/** Garde `?next=` quand on passe de la connexion à l'inscription (et inversement). */
export function withNext(path: string, next: string): string {
  return next === '/compte' ? path : `${path}?next=${encodeURIComponent(next)}`
}

export function SignInPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const navigate = useNavigate()
  const next = useNextPath()
  const { status, service } = useAuth()

  const [input, setInput] = useState<SignInInput>({ email: '', password: '' })
  const [errors, setErrors] = useState<ValidationErrors<SignInInput>>({})
  const [error, setError] = useState<AuthErrorCode>()
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (status === 'signed_in' || status === 'unavailable') return <Navigate to={status === 'signed_in' ? next : '/compte'} replace />
  if (status === 'loading' || !service) return null
  const auth = service

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateSignIn(input)
    setErrors(found)
    if (hasErrors(found) || busy) return
    setBusy(true)
    setError(undefined)
    setResent(false)
    const result = await auth.signIn(input)
    setBusy(false)
    if (result.ok) navigate(next, { replace: true })
    else setError(result.error)
  }

  async function resend() {
    const result = await auth.resendConfirmation(input.email, next)
    if (result.ok) setResent(true)
    else setError(result.error)
  }

  return (
    <>
      <PageHeader title={t('auth.signIn.title')} />
      <div className="space-y-4">
        <GoogleSignIn next={next} onError={setError} />
        <OrDivider />
        <AuthCard>
          <form onSubmit={submit} noValidate className="space-y-4">
            {error && <FormAlert>{text.error(error)}</FormAlert>}
            {error === 'email_not_confirmed' && !resent && (
              <Button type="button" variant="secondary" onClick={() => void resend()}>
                {t('auth.signIn.resend')}
              </Button>
            )}
            {resent && <FormAlert tone="success">{t('auth.signIn.resent')}</FormAlert>}

            <Field label={t('auth.email')} error={text.validation(errors.email)}>
              <input
                type="email"
                inputMode="email"
                className={inputClass}
                value={input.email}
                onChange={(e) => setInput({ ...input, email: e.target.value })}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field label={t('auth.password')} error={text.validation(errors.password)}>
              <PasswordInput value={input.password} onChange={(e) => setInput({ ...input, password: e.target.value })} autoComplete="current-password" />
            </Field>
            <Link
              to="/mot-de-passe-oublie"
              state={{ email: input.email }}
              className="inline-block min-h-11 py-2 text-sm font-bold text-sky-brand"
            >
              {t('auth.signIn.forgot')}
            </Link>
            <Button type="submit" disabled={busy}>
              {t('auth.signIn.submit')}
            </Button>
          </form>
        </AuthCard>
        <p className="text-center">
          {t('auth.signIn.noAccount')}{' '}
          <Link to={withNext('/inscription', next)} replace className="font-bold text-sky-brand">
            {t('auth.account.signUp')}
          </Link>
        </p>
      </div>
    </>
  )
}
