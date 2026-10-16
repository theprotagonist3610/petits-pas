import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/Icon'
import { RestorePanel } from './RestorePanel'

/** Premier lancement sur un nouveau téléphone : restaurer avant (à la place de) l'accueil. */
export function RestoreWelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <div className="flex h-14 items-center">
        <button
          onClick={() => navigate('/bienvenue', { replace: true })}
          aria-label={t('common.back')}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5"
        >
          <Icon name="back" />
        </button>
      </div>
      <img src="/logo.png" alt="" className="mx-auto mb-4 size-24" />
      <h1 className="mb-2 text-2xl font-extrabold">{t('backup.welcomeTitle')}</h1>
      <p className="mb-6 leading-relaxed text-ink-soft">{t('backup.welcomeText')}</p>
      <RestorePanel fresh onRestored={() => navigate('/', { replace: true })} />
    </div>
  )
}
