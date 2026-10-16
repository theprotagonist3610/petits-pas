import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PASSWORD_MIN_LENGTH, type AuthErrorCode, type ValidationCode } from '@/lib/auth'
import { inputClass } from '@/components/Field'
import { Icon } from '@/components/Icon'

/** Messages traduits des codes renvoyés par la boîte à outils d'authentification. */
export function useAuthText() {
  const { t } = useTranslation()
  return {
    error: (code: AuthErrorCode) => t(`auth.errors.${code}`),
    validation: (code: ValidationCode | undefined) => (code ? t(`auth.validation.${code}`, { min: PASSWORD_MIN_LENGTH }) : undefined),
  }
}

/** Logo « G » de Google (couleurs officielles, à ne pas modifier selon la charte Google). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width={20} height={20} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-5 font-bold text-ink shadow-sm transition-colors active:bg-ink/5 disabled:opacity-60"
    >
      <GoogleLogo />
      {t('auth.google')}
    </button>
  )
}

export function OrDivider() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-ink-soft" role="separator">
      <span className="h-px flex-1 bg-line" />
      {t('auth.or')}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative block">
      <input {...props} type={visible ? 'text' : 'password'} className={`${inputClass} pr-12`} autoCapitalize="none" spellCheck={false} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-ink-soft"
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </span>
  )
}

/** Message d'erreur ou de confirmation en haut d'un formulaire, annoncé aux lecteurs d'écran. */
export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl p-3 text-sm font-semibold ${tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-leaf-soft text-leaf'}`}
    >
      {children}
    </p>
  )
}

/** Carte blanche qui regroupe un formulaire, comme sur les autres écrans de l'application. */
export function AuthCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl bg-surface p-4 shadow-sm">
      {title && <h2 className="font-extrabold">{title}</h2>}
      {children}
    </section>
  )
}
