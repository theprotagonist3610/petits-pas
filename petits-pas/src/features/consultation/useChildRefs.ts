import { useEffect, useState } from 'react'
import type { Child } from '@/data/types'
import { childRefFor } from '@/lib/consultations'

/**
 * Empreintes des enfants du téléphone pour ce compte (identifiant d'enfant → empreinte).
 * Permet de reconnaître « ses » enfants dans les demandes, qui ne contiennent ni prénom ni identifiant.
 */
export function useChildRefs(parentId: string | undefined, children: Child[] | undefined): Map<string, string> | undefined {
  const [refs, setRefs] = useState<{ key: string; map: Map<string, string> }>()
  const key = `${parentId}|${children?.map((c) => c.id).join(',')}`

  useEffect(() => {
    if (!parentId || !children) return
    let active = true
    void Promise.all(children.map(async (c) => [c.id, await childRefFor(parentId, c.id)] as const)).then((entries) => {
      if (active) setRefs({ key, map: new Map(entries) })
    })
    return () => {
      active = false
    }
  }, [key, parentId, children])

  return refs?.key === key ? refs.map : undefined
}
