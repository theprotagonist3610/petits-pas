import { useEffect, useSyncExternalStore } from 'react'
import type { Theme } from '@/data/types'
import { useSettings } from '@/data/hooks'

const STORAGE_KEY = 'petits-pas:theme'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function subscribeSystem(onChange: () => void) {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Thème du téléphone, mis à jour s'il change (mode sombre automatique le soir, par exemple). */
export function useSystemTheme(): Theme {
  return useSyncExternalStore(subscribeSystem, () => (darkQuery().matches ? 'dark' : 'light'))
}

/** Thème affiché : celui choisi dans les réglages, sinon celui du téléphone. */
export function useTheme(): Theme {
  const settings = useSettings()
  const system = useSystemTheme()
  return settings?.theme ?? system
}

/**
 * Applique le thème à la page. Le choix est aussi recopié dans localStorage, lu par index.html
 * avant le chargement de l'application (les réglages, dans IndexedDB, arrivent trop tard).
 */
export function ThemeSync() {
  const settings = useSettings()
  const theme = useTheme()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    if (!settings) return
    try {
      if (settings.theme) localStorage.setItem(STORAGE_KEY, settings.theme)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Stockage indisponible : le thème s'appliquera simplement un peu plus tard au démarrage.
    }
  }, [settings])
  return null
}
