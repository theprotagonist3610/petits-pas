import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, FeedAuthorRole, FeedCommentRow, FeedPostRow } from './database.types'

/*
 * Fil d'actualité, commun à l'application parents et à Petits Pas Pro.
 * Les fonctions lèvent les erreurs (Supabase) : chaque application les traduit.
 */

export const FEED_BUCKET = 'feed-images'
export const FEED_PAGE_SIZE = 20
export const POST_MAX_LENGTH = 3000
export const COMMENT_MAX_LENGTH = 1500

export interface FeedPost extends FeedPostRow {
  /** Nombre de questions et réponses visibles. */
  comments_count: number
}

/** Une question de parent et les réponses des professionnels. */
export interface FeedThread {
  question: FeedCommentRow
  answers: FeedCommentRow[]
}

/** Regroupe les commentaires d'une publication en questions → réponses, dans l'ordre chronologique. */
export function toThreads(comments: FeedCommentRow[]): FeedThread[] {
  const sorted = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const threads = new Map<string, FeedThread>()
  for (const c of sorted) if (!c.reply_to) threads.set(c.id, { question: c, answers: [] })
  for (const c of sorted) if (c.reply_to) threads.get(c.reply_to)?.answers.push(c)
  return [...threads.values()]
}

const SELECT_POSTS = '*, comments:feed_comments(count)'

type PostWithCount = FeedPostRow & { comments: { count: number }[] }
const withCount = (p: PostWithCount): FeedPost => {
  const { comments, ...post } = p
  return { ...post, comments_count: comments[0]?.count ?? 0 }
}

export function createFeedService(client: SupabaseClient<Database>) {
  return {
    /** Publications, de la plus récente à la plus ancienne ; `before` : pour charger la page suivante. */
    async posts(before?: string): Promise<FeedPost[]> {
      let query = client.from('feed_posts').select(SELECT_POSTS).order('created_at', { ascending: false }).limit(FEED_PAGE_SIZE)
      if (before) query = query.lt('created_at', before)
      const { data, error } = await query
      if (error) throw error
      return (data as unknown as PostWithCount[]).map(withCount)
    },

    async comments(postId: string): Promise<FeedCommentRow[]> {
      const { data, error } = await client.from('feed_comments').select('*').eq('post_id', postId).order('created_at')
      if (error) throw error
      return data
    },

    /** Publie (photo facultative, déjà compressée). L'auteur affiché est fixé par la base. */
    async publish(userId: string, role: FeedAuthorRole, body: string, image?: Blob): Promise<void> {
      let imagePath: string | null = null
      if (image) {
        imagePath = `${userId}/${crypto.randomUUID()}.${image.type === 'image/webp' ? 'webp' : 'jpg'}`
        const upload = await client.storage.from(FEED_BUCKET).upload(imagePath, image, { contentType: image.type })
        if (upload.error) throw upload.error
      }
      const { error } = await client.from('feed_posts').insert({ author_role: role, author_name: '', body: body.trim(), image_path: imagePath })
      if (error) {
        if (imagePath) await client.storage.from(FEED_BUCKET).remove([imagePath])
        throw error
      }
    },

    /** Question d'un parent (`replyTo` absent) ou réponse d'un professionnel à une question. */
    async comment(postId: string, role: FeedAuthorRole, body: string, replyTo?: string): Promise<void> {
      const { error } = await client
        .from('feed_comments')
        .insert({ post_id: postId, author_role: role, author_name: '', body: body.trim(), reply_to: replyTo ?? null })
      if (error) throw error
    },

    /** Suppression douce (administrateurs) ; `restore` pour annuler. */
    async setDeleted(kind: 'post' | 'comment', id: string, deleted: boolean): Promise<void> {
      const table = kind === 'post' ? 'feed_posts' : 'feed_comments'
      const { error } = await client.from(table).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id)
      if (error) throw error
    },

    /** Validation par un administrateur : publiée (visible de tous) ou refusée (motif visible par l'auteur). */
    async review(id: string, approve: boolean, reason?: string): Promise<void> {
      const { error } = await client
        .from('feed_posts')
        .update(approve ? { status: 'published' } : { status: 'rejected', rejection_reason: reason?.trim() ?? '' })
        .eq('id', id)
      if (error) throw error
    },

    imageUrl: (path: string) => client.storage.from(FEED_BUCKET).getPublicUrl(path).data.publicUrl,

    /** Nouvelles publications ou commentaires en direct. Renvoie la fonction d'arrêt. */
    subscribe(onChange: () => void): () => void {
      const channel = client
        .channel('feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_comments' }, onChange)
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}

export type FeedService = ReturnType<typeof createFeedService>

/** Fil paginé et mis à jour en direct. */
export function useFeed(service: FeedService | null) {
  const [posts, setPosts] = useState<FeedPost[]>()
  const [error, setError] = useState<unknown>()
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const reload = useCallback(async () => {
    if (!service) return
    try {
      const page = await service.posts()
      setPosts(page)
      setHasMore(page.length === FEED_PAGE_SIZE)
      setError(undefined)
    } catch (e) {
      setError(e)
    }
  }, [service])

  const more = useCallback(async () => {
    if (!service || !posts?.length || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await service.posts(posts[posts.length - 1].created_at)
      setPosts((current) => [...(current ?? []), ...page.filter((p) => !current?.some((c) => c.id === p.id))])
      setHasMore(page.length === FEED_PAGE_SIZE)
    } catch (e) {
      setError(e)
    } finally {
      setLoadingMore(false)
    }
  }, [service, posts, loadingMore])

  useEffect(() => {
    void reload()
    if (!service) return
    return service.subscribe(() => void reload())
  }, [service, reload])

  return { posts, error, hasMore, loadingMore, reload, more }
}
