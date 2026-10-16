import { createContext, useContext, type ReactNode } from 'react'
import { usePlatform, type Platform } from '@petits-pas/shared/platform'
import { supabase } from '@/lib/supabase'
import { setSpecialties } from '@/lib/format'

interface PlatformState {
  /** `undefined` pendant le chargement, ou si la lecture a échoué (libellés d'origine en secours). */
  platform: Platform | undefined
  reload(): Promise<void>
}

const PlatformContext = createContext<PlatformState | null>(null)

/** Paramètres de la plateforme (devise, tarifs, spécialités, mise en veille), lus au démarrage. */
export function PlatformProvider({ children }: { children: ReactNode }) {
  const { platform, error, reload } = usePlatform(supabase)

  // Avant le rendu des écrans, pour qu'ils affichent tout de suite les bons libellés.
  if (platform) setSpecialties(platform.specialties)

  // Rendu dès que les paramètres sont lus (ou en échec : on continue avec les libellés d'origine).
  if (!platform && !error) return null
  return <PlatformContext.Provider value={{ platform, reload: () => reload(true) }}>{children}</PlatformContext.Provider>
}

export function usePlatformSettings(): PlatformState {
  const state = useContext(PlatformContext)
  if (!state) throw new Error('usePlatformSettings doit être utilisé dans <PlatformProvider>.')
  return state
}
