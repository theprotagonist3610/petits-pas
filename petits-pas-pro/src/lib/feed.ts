import { createFeedService } from '@petits-pas/shared/feed'
import { supabase } from './supabase'

export const feed = createFeedService(supabase)
