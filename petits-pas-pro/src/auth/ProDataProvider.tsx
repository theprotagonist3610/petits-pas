import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { consultations as service } from '@/lib/services'
import type { ProConsultation } from '@/lib/consultations'
import type { ProErrorCode } from '@/lib/errors'
import { useProAuth } from './ProAuthProvider'

interface ProData {
  /** Demandes libres de sa spécialité et de son pays. */
  queue: ProConsultation[] | undefined
  /** Ses consultations. */
  mine: ProConsultation[] | undefined
  error: ProErrorCode | undefined
  refresh(): Promise<void>
}

const ProDataContext = createContext<ProData | null>(null)

/** Filet de sécurité si le temps réel est coupé (réseau du cabinet, mise en veille). */
const POLL_MS = 60_000

export function ProDataProvider({ children }: { children: ReactNode }) {
  const { canPractice, professional } = useProAuth()
  const professionalId = canPractice ? professional?.id : undefined
  const [queue, setQueue] = useState<ProConsultation[]>()
  const [mine, setMine] = useState<ProConsultation[]>()
  const [error, setError] = useState<ProErrorCode>()

  const refresh = useCallback(async () => {
    if (!professionalId) return
    const [q, m] = await Promise.all([service.listQueue(), service.listMine(professionalId)])
    if (q.ok) setQueue(q.data)
    if (m.ok) setMine(m.data)
    setError(!q.ok ? q.error : !m.ok ? m.error : undefined)
  }, [professionalId])

  useEffect(() => {
    if (!professionalId) return
    void refresh()
    // Temps réel : toute demande créée, prise ou annulée (visible selon les règles d'accès) relance la lecture.
    const channel = supabase
      .channel('pro-consultations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultations' }, () => void refresh())
      .subscribe()
    const timer = setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      void supabase.removeChannel(channel)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [professionalId, refresh])

  return <ProDataContext.Provider value={{ queue, mine, error, refresh }}>{children}</ProDataContext.Provider>
}

export function useProData(): ProData {
  const state = useContext(ProDataContext)
  if (!state) throw new Error('useProData doit être utilisé dans <ProDataProvider>.')
  return state
}
