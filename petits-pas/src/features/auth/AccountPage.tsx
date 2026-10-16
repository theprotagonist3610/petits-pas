import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isProfileComplete } from '@/lib/auth'
import { countryName } from '@/reference/countries'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { useAuth } from './AuthProvider'
import { AuthCard, FormAlert, OrDivider, useAuthText } from './AuthUi'
import { GoogleSignIn } from './GoogleSignIn'

/** Affiche la page seulement pour un compte connecté ; sinon renvoie vers la connexion, puis ici. */
export function RequireSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'unavailable') return <Navigate to="/compte" replace />
  if (status === 'signed_out') return <Navigate to={`/connexion?next=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

const linkButton = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 font-bold transition-colors'

function SignedOut() {
  const { t } = useTranslation()
  const text = useAuthText()
  const [error, setError] = useState<string>()

  return (
    <div className="space-y-4">
      <AuthCard>
        <p>{t('auth.account.intro')}</p>
        {error && <FormAlert>{error}</FormAlert>}
        <GoogleSignIn next="/compte" oneTap onError={(code) => setError(text.error(code))} />
        <OrDivider />
        <Link to="/connexion" className={`${linkButton} bg-sky-brand text-white shadow-sm active:bg-sky-brand/90`}>
          <Icon name="mail" size={20} /> {t('auth.account.signIn')}
        </Link>
        <Link to="/inscription" className={`${linkButton} border border-line bg-surface text-sky-brand active:bg-sky-soft`}>
          {t('auth.account.signUp')}
        </Link>
      </AuthCard>
      <p className="flex gap-2 px-1 text-sm text-ink-soft">
        <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
        {t('auth.account.offlineNote')}
      </p>
    </div>
  )
}

function MenuLink({ to, icon, children }: { to: string; icon: IconName; children: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 px-4 active:bg-sky-soft">
      <Icon name={icon} size={20} className="text-sky-brand" />
      <span className="flex-1 font-bold">{children}</span>
      <Icon name="chevronRight" size={20} className="text-ink-soft" />
    </Link>
  )
}

function SignedIn() {
  const { t } = useTranslation()
  const text = useAuthText()
  const { user, profile, profileError, service } = useAuth()
  const [error, setError] = useState<string>()

  async function signOut() {
    if (!window.confirm(t('auth.account.signOutConfirm'))) return
    // Empêche One Tap de reconnecter automatiquement ce compte Google.
    window.google?.accounts.id.disableAutoSelect()
    const result = await service!.signOut()
    if (!result.ok) setError(text.error(result.error))
  }

  const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : ''
  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase() : ''
  const details = [profile?.phone, countryName(profile?.country)].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      {profile && !isProfileComplete(profile) && (
        <Link to="/compte/profil" className="flex items-center gap-3 rounded-3xl bg-honey-soft p-4 active:opacity-80">
          <span className="flex-1">
            <span className="block font-extrabold">{t('auth.completeProfile')}</span>
            <span className="block text-sm text-ink-soft">{t('auth.completeProfileText')}</span>
          </span>
          <Icon name="chevronRight" className="shrink-0 text-ink-soft" />
        </Link>
      )}

      <section className="flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-sm">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sky-soft text-lg font-extrabold text-sky-brand">
          {initials || <Icon name="user" />}
        </span>
        <span className="min-w-0">
          {name && <span className="block truncate text-lg font-extrabold">{name}</span>}
          <span className="block truncate text-sm text-ink-soft">{user?.email}</span>
          {details && <span className="block truncate text-sm text-ink-soft">{details}</span>}
          {profile === undefined && profileError && <span className="block text-sm text-ink-soft">{t('auth.account.profileOffline')}</span>}
        </span>
      </section>

      <ul className="overflow-hidden rounded-3xl bg-surface shadow-sm">
        <li>
          <MenuLink to="/compte/profil" icon="edit">
            {t('auth.account.editProfile')}
          </MenuLink>
        </li>
        <li className="border-t border-line">
          <MenuLink to="/compte/mot-de-passe" icon="lock">
            {t('auth.account.changePassword')}
          </MenuLink>
        </li>
      </ul>

      {error && <FormAlert>{error}</FormAlert>}
      <Button variant="secondary" onClick={() => void signOut()}>
        <Icon name="logout" size={20} /> {t('auth.account.signOut')}
      </Button>
    </div>
  )
}

export function AccountPage() {
  const { t } = useTranslation()
  const { status } = useAuth()
  return (
    <>
      <PageHeader title={t('auth.account.title')} />
      {status === 'unavailable' && <AuthCard>{t('auth.account.unavailable')}</AuthCard>}
      {status === 'signed_out' && <SignedOut />}
      {status === 'signed_in' && <SignedIn />}
    </>
  )
}
