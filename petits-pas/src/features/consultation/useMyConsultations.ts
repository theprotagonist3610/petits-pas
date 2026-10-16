import { useCallback, useEffect, useState } from 'react'
import { consultationService, type Consultation } from '@/lib/consultations'
import type { AuthErrorCode } from '@/lib/auth'

/** Demandes du parent connecté, relues au retour sur l'application (le statut change côté professionnel). */
export function useMyConsultations(parentId: string | undefined) {
  const [items, setItems] = useState<Consultation[]>()
  const [error, setError] = useState<AuthErrorCode>()

  const refresh = useCallback(async () => {
    if (!parentId || !consultationService) return
    const result = await consultationService.listMine(parentId)
    if (result.ok) setItems(result.data)
    setError(result.ok ? undefined : result.error)
  }, [parentId])

  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  const replace = (updated: Consultation) => setItems((current) => current?.map((c) => (c.id === updated.id ? updated : c)))
  return { items, error, refresh, replace }
}
