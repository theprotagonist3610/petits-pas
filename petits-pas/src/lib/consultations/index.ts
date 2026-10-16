import { supabase } from '@/lib/supabase/client'
import { createConsultationService, type ConsultationService } from './service'

/** Service des consultations, ou `null` si Supabase n'est pas configuré. */
export const consultationService: ConsultationService | null = supabase ? createConsultationService(supabase) : null

export * from './service'
