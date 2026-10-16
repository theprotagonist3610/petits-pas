import { lazy, Suspense, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isProfileComplete } from '@/lib/auth'
import { useAuth } from './AuthProvider'

const CompleteProfileSheet = lazy(() => import('./CompleteProfileSheet').then((m) => ({ default: m.CompleteProfileSheet })))

const dismissKey = (userId: string) => `petits-pas:profil-plus-tard:${userId}`

function wasDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(userId)) === '1'
  } catch {
    return false
  }
}

/** Ouvre la fenêtre « Complétez votre profil » dès qu'un parent connecté a un profil incomplet. */
export function ProfileCompletionPrompt() {
  const { status, user, profile } = useAuth()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState<string>()

  if (status !== 'signed_in' || !user || !profile || isProfileComplete(profile)) return null
  // Inutile sur la page qui contient déjà le formulaire.
  if (pathname === '/compte/profil' || dismissed === user.id || wasDismissed(user.id)) return null

  function close() {
    try {
      sessionStorage.setItem(dismissKey(user!.id), '1')
    } catch {
      // Stockage indisponible (navigation privée) : la fenêtre restera fermée jusqu'au rechargement.
    }
    setDismissed(user!.id)
  }

  return (
    <Suspense fallback={null}>
      <CompleteProfileSheet profile={profile} onClose={close} />
    </Suspense>
  )
}
