import { createFeedService, type FeedService } from '@petits-pas/shared/feed'
import { supabase } from '@/lib/supabase/client'

/** Fil d'actualité, ou `null` si Supabase n'est pas configuré. */
export const feedService: FeedService | null = supabase ? createFeedService(supabase) : null
