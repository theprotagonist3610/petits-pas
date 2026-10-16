import { useCallback, useSyncExternalStore } from 'react'

/** Espace affiché : exercice (demandes, agenda…) ou administration de la plateforme. */
export type Workspace = 'pro' | 'admin'

const KEY = 'petits-pas-pro:espace'
const EVENT = 'petits-pas-pro:espace'
/** Choix de la session, si le stockage du navigateur est indisponible (navigation privée). */
let inMemory: Workspace | null = null

function read(): Workspace | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'pro' || value === 'admin' ? value : inMemory
  } catch {
    return inMemory
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Espace réellement affiché : le choix mémorisé s'il est possible, sinon le seul disponible. */
export function resolveWorkspace(preferred: Workspace | null, rights: { isAdmin: boolean; canPractice: boolean }): Workspace {
  if (!rights.isAdmin) return 'pro'
  if (!rights.canPractice) return 'admin'
  return preferred ?? 'pro'
}

/** Espace courant (mémorisé sur ce poste) et fonction pour en changer. */
export function useWorkspace(rights: { isAdmin: boolean; canPractice: boolean }): [Workspace, (next: Workspace) => void] {
  const preferred = useSyncExternalStore(subscribe, read, () => null)
  const set = useCallback((next: Workspace) => {
    inMemory = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Stockage indisponible : le choix vaut pour cette page seulement.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [resolveWorkspace(preferred, rights), set]
}
