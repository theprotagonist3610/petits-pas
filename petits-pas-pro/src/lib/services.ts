import { supabase } from './supabase'
import { createProConsultationService } from './consultations'
import { createAdminService } from './admin'
import { createAccountingService } from './accounting'

export const consultations = createProConsultationService(supabase)
export const admin = createAdminService(supabase)
export const accounting = createAccountingService(supabase)
