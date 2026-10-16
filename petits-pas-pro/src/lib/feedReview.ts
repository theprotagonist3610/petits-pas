import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Nombre de publications de parents en attente de validation (administrateurs), mis à jour en direct. */
export function usePendingPostsCount(enabled: boolean): number | undefined {
  const [count, setCount] = useState<number>()

  useEffect(() => {
    if (!enabled) return
    const load = async () => {
      const { count: n } = await supabase
        .from('feed_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('deleted_at', null)
      setCount(n ?? 0)
    }
    void load()
    const channel = supabase
      .channel('feed-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [enabled])

  return enabled ? count : undefined
}
