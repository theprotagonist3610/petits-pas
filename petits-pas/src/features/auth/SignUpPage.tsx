import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hasErrors, validateSignUp, type AuthErrorCode, type SignUpInput, type ValidationErrors } from '@/lib/auth'
import { useSettings } from '@/data/hooks'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { useAuth } from './AuthProvider'
import { AuthCard, FormAlert, OrDivider, PasswordInput, useAuthText } from './AuthUi'
import { GoogleSignIn } from './GoogleSignIn'
import { ProfileFields } from './ProfileFields'
import { useNextPath, withNext } from './SignInPage'

function CheckEmail({ email, next }: { email: string; next: string }) {
  const { t } = useTranslation()
  const text = useAuthText()
  const { service } = useAuth()
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<AuthErrorCode>()

  async function resend() {
    const result = await service!.resendConfirmation(email, next)
    if (result.ok) setResent(true)
    else setError(result.error)
  }

  return (
    <AuthCard>
      <span className="flex size-14 items-center justify-center rounded-full bg-sky-soft text-sky-brand">
        <Icon name="mail" size={28} />
      </span>
      <h2 className="text-xl font-extrabold">{t('auth.signUp.checkEmailTitle')}</h2>
      <p>{t('auth.signUp.checkEmailText', { email })}</p>
      {error && <FormAlert>{text.error(error)}</FormAlert>}
      {resent ? (
        <FormAlert tone="success">{t('auth.signIn.resent')}</FormAlert>
      ) : (
        <Button variant="secondary" onClick={() => void resend()}>
          {t('auth.signIn.resend')}
        </Button>
      )}
    </AuthCard>
  )
}

export function SignUpPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const navigate = useNavigate()
  const next = useNextPath()
  const settings = useSettings()
  const { status, service } = useAuth()

  const [input, setInput] = useState<SignUpInput>({
    email: '',
    password: '',
    lastName: '',
    firstName: '',
    sex: undefined,
    country: settings?.country,
  })
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<ValidationErrors<SignUpInput>>({})
  const [error, setError] = useState<AuthErrorCode>()
  const [sentTo, setSentTo] = useState<string>()
  const [busy, setBusy] = useState(false)

  // Inscription terminée sans confirmation d'e-mail : la session arrive, on repart.
  if (status === 'signed_in' && !sentTo) return <Navigate to={next} replace />
  if (status === 'unavailable') return <Navigate to="/compte" replace />
  if (status === 'loading' || !service) return null
  const auth = service

  const update = (patch: Partial<SignUpInput>) => setInput((current) => ({ ...current, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateSignUp(input, confirmation)
    setErrors(found)
    if (hasErrors(found)) {
      // Amène le premier champ en erreur à l'écran (formulaire long sur petit téléphone).
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], .text-red-600')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
      return
    }
    if (busy) return
    setBusy(true)
    setError(undefined)
    const result = await auth.signUp(input, next)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    if (result.data.needsEmailConfirmation) setSentTo(input.email.trim())
    else navigate(next, { replace: true })
  }

  return (
    <>
      <PageHeader title={t('auth.signUp.title')} />
      {sentTo ? (
        <CheckEmail email={sentTo} next={next} />
      ) : (
        <div className="space-y-4">
          <GoogleSignIn next={next} context="signup" onError={setError} />
          <OrDivider />
          <form onSubmit={submit} noValidate className="space-y-4">
            <AuthCard title={t('auth.signUp.identity')}>
              <ProfileFields value={input} onChange={update} errors={errors} />
            </AuthCard>

            <AuthCard title={t('auth.signUp.credentials')}>
              <Field label={t('auth.email')} error={text.validation(errors.email)}>
                <input
                  type="email"
                  inputMode="email"
                  className={inputClass}
                  value={input.email}
                  onChange={(e) => update({ email: e.target.value })}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label={t('auth.password')} hint={text.validation('password_too_short')} error={text.validation(errors.password)}>
                <PasswordInput value={input.password} onChange={(e) => update({ password: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label={t('auth.passwordConfirm')}>
                <PasswordInput value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
              </Field>
            </AuthCard>

            <p className="flex gap-2 px-1 text-sm text-ink-soft">
              <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
              {t('auth.signUp.privacy')}
            </p>
            {error && <FormAlert>{text.error(error)}</FormAlert>}
            <Button type="submit" disabled={busy}>
              {t('auth.signUp.submit')}
            </Button>
          </form>
          <p className="text-center">
            {t('auth.signUp.hasAccount')}{' '}
            <Link to={withNext('/connexion', next)} replace className="font-bold text-sky-brand">
              {t('auth.account.signIn')}
            </Link>
          </p>
        </div>
      )}
    </>
  )
}
