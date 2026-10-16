import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { safeNextPath } from '@/lib/auth'
import { useAuth } from './AuthProvider'

/** Erreur renvoyée par Google ou Supabase dans l'URL de retour (`?error=` ou `#error=`). */
function callbackError(search: URLSearchParams): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  return search.get('error_description') ?? search.get('error') ?? hash.get('error_description') ?? hash.get('error')
}

/**
 * Page de retour après Google ou un lien reçu par e-mail.
 * supabase-js échange tout seul le code de l'URL contre une session ; on attend le résultat puis on repart.
 */
export function AuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const { status } = useAuth()
  const error = callbackError(search)
  const next = safeNextPath(search.get('next'))

  useEffect(() => {
    if (!error && status === 'signed_in') navigate(next, { replace: true })
  }, [error, status, next, navigate])

  // Un refus (« Annuler » chez Google) ou un lien expiré arrive ici sans session.
  const failed = error || status === 'signed_out' || status === 'unavailable'

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <img src="/logo.png" alt="" className="mb-6 size-24" />
      {failed ? (
        <>
          <h1 className="text-xl font-extrabold">{t('auth.callback.failedTitle')}</h1>
          <p className="mt-2 text-ink-soft">{t('auth.callback.failedText')}</p>
          <Link to="/" replace className="mt-6 flex min-h-12 items-center rounded-2xl bg-sky-brand px-6 font-bold text-white">
            {t('auth.callback.back')}
          </Link>
        </>
      ) : (
        <p role="status" className="font-bold text-ink-soft">
          {t('auth.callback.loading')}
        </p>
      )}
    </div>
  )
}
