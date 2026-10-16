import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos } from '.'
import type { Child, Measurement, Memory, MilestoneObservation, Settings, VaccineRecord } from './types'

// Hooks réactifs : seul point couplé à Dexie (liveQuery) côté UI.

export function useChildren(): Child[] | undefined {
  return useLiveQuery(() => repos.children.list(), [])
}

export function useChild(id: string | undefined): Child | undefined {
  return useLiveQuery(() => (id ? repos.children.get(id) : undefined), [id])
}

/**
 * Données d'un enfant. Pendant qu'une nouvelle requête tourne, `useLiveQuery` renvoie encore le résultat
 * de la précédente (par exemple celui calculé avant que l'enfant soit connu) : on ne le rend que s'il
 * concerne bien l'enfant demandé, sinon `undefined` (« en cours de chargement »).
 */
function useChildQuery<T>(childId: string | undefined, query: (childId: string) => Promise<T>): T | undefined {
  const result = useLiveQuery(async () => (childId ? { childId, data: await query(childId) } : undefined), [childId])
  return result?.childId === childId ? result?.data : undefined
}

export function useMeasurements(childId: string | undefined): Measurement[] | undefined {
  return useChildQuery(childId, (id) => repos.measurements.listByChild(id))
}

/** Observations des étapes d'un enfant, indexées par identifiant d'étape. */
export function useMilestoneObservations(childId: string | undefined): Map<string, MilestoneObservation> | undefined {
  return useChildQuery(childId, async (id) => new Map((await repos.milestones.listByChild(id)).map((o) => [o.milestoneId, o])))
}

/** Doses reçues par un enfant, indexées par identifiant d'intervention. */
export function useVaccineRecords(childId: string | undefined): Map<string, VaccineRecord> | undefined {
  return useChildQuery(childId, async (id) => new Map((await repos.vaccines.listByChild(id)).map((r) => [r.interventionId, r])))
}

export function useMemories(childId: string | undefined): Memory[] | undefined {
  return useChildQuery(childId, (id) => repos.memories.listByChild(id))
}

export function useMemoryCount(): number | undefined {
  return useLiveQuery(() => repos.memories.count(), [])
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => repos.settings.get(), [])
}

export function useActiveChild(): { child: Child | undefined; loading: boolean } {
  const settings = useSettings()
  const children = useChildren()
  if (!settings || !children) return { child: undefined, loading: true }
  const child = children.find((c) => c.id === settings.activeChildId) ?? children[0]
  return { child, loading: false }
}

/** URL d'objet pour la miniature (ou l'image complète) d'un média, révoquée au démontage. */
export function useMediaUrl(id: string | undefined, variant: 'thumb' | 'blob' = 'thumb'): string | undefined {
  const media = useLiveQuery(() => (id ? repos.media.get(id) : undefined), [id])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!media) return setUrl(undefined)
    const u = URL.createObjectURL(media[variant])
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [media, variant])
  return url
}
