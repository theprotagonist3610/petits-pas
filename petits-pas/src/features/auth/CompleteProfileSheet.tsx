import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AccountProfile } from '@/lib/auth'
import { Button } from '@/components/Button'
import { ProfileForm } from './ProfileEditPage'

/**
 * Fenêtre ouverte automatiquement après l'inscription (Google notamment) tant que le profil parent
 * est incomplet. « Plus tard » la ferme jusqu'à la prochaine ouverture de l'application.
 */
export function CompleteProfileSheet({ profile, onClose }: { profile: AccountProfile; onClose: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.focus()
    // Bloque le défilement de la page derrière la fenêtre.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/30">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        className="pb-safe mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-4 outline-none"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <h2 id="complete-profile-title" className="text-xl font-extrabold">
          {profile.firstName ? t('auth.welcome', { name: profile.firstName }) : t('auth.completeProfile')}
        </h2>
        <p className="mt-1 mb-4 text-ink-soft">{t('auth.completeProfileText')}</p>
        <ProfileForm
          key={profile.id}
          profile={profile}
          onSaved={onClose}
          footer={
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('auth.later')}
            </Button>
          }
        />
      </div>
    </div>,
    document.body,
  )
}
