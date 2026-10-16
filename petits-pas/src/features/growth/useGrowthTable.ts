import { useEffect, useState } from 'react'
import type { GrowthTable, Indicator, IndicatorId } from '@/lib/growth/indicators'

const cache = new Map<IndicatorId, Promise<GrowthTable>>()

/** Charge à la demande la table OMS d'un indicateur (une seule fois par session). */
export function useGrowthTable(indicator: Indicator): GrowthTable | undefined {
  const [table, setTable] = useState<{ id: IndicatorId; data: GrowthTable }>()
  useEffect(() => {
    let cancelled = false
    if (!cache.has(indicator.id)) cache.set(indicator.id, indicator.load())
    void cache.get(indicator.id)!.then((data) => !cancelled && setTable({ id: indicator.id, data }))
    return () => {
      cancelled = true
    }
  }, [indicator])
  return table?.id === indicator.id ? table.data : undefined
}
