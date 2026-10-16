import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AdminConsultationRow,
  AdminParentRow,
  AdminStats,
  ConsultationRow,
  ConsultationStatus,
  CountryCode,
  Currency,
  PaymentMethod,
  Database,
  ProfessionalRow,
  Specialty,
} from '@petits-pas/shared/database.types'
import { attempt, done, fail, type ProErrorCode, type Result } from './errors'

export interface Invitation {
  email: string
  first_name: string
  last_name: string
  specialty: Specialty
  country: CountryCode
  license_number?: string
  facility_name?: string
  city?: string
  phone?: string
  offers_teleconsultation: boolean
  offers_appointment: boolean
  /** Numéro d'ordre déjà vérifié par l'administrateur. */
  verified: boolean
}

/** Fiche professionnelle de l'administrateur lui-même. */
export type OwnProfessional = Omit<Invitation, 'email' | 'verified'>

/** Paiement constaté par l'administrateur (montant réel : il peut différer du tarif). */
export interface PaymentInput {
  amount: number
  currency: Currency
  method: PaymentMethod
  reference: string
  /** Date du paiement (AAAA-MM-JJ), aujourd'hui par défaut. */
  paidOn?: string
}

export interface ProfessionalPatch {
  isActive?: boolean
  verified?: boolean
  specialty?: Specialty
  country?: CountryCode
  licenseNumber?: string
}

/** Erreurs renvoyées par la fonction serveur invite-professional. */
const INVITE_ERRORS: Record<string, ProErrorCode> = {
  email_exists: 'email_exists',
  invalid_email: 'invalid_email',
  not_admin: 'not_operational',
  missing_name: 'invalid_data',
  invalid_specialty: 'invalid_data',
  invalid_country: 'invalid_data',
  invalid_professional: 'invalid_data',
}

/** Taille d'une page dans les listes d'administration. */
export const ADMIN_PAGE_SIZE = 50

/** Une page de résultats et le nombre total (pour « Voir plus »). */
export interface Page<T> {
  rows: T[]
  total: number
}

const toPage = <T extends { total_count: number }>(rows: T[]): Page<T> => ({ rows, total: rows[0]?.total_count ?? 0 })

export function createAdminService(client: SupabaseClient<Database>) {
  return {
    stats: (): Promise<Result<AdminStats>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_stats')
        return error ? fail(error) : done(data)
      }),

    listConsultations: (status: ConsultationStatus | null, offset = 0): Promise<Result<Page<AdminConsultationRow>>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_list_consultations', { p_status: status, p_limit: ADMIN_PAGE_SIZE, p_offset: offset })
        return error ? fail(error) : done(toPage(data))
      }),

    listParents: (search: string, offset = 0): Promise<Result<Page<AdminParentRow>>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_list_parents', { p_search: search.trim() || null, p_limit: ADMIN_PAGE_SIZE, p_offset: offset })
        return error ? fail(error) : done(toPage(data))
      }),

    listProfessionals: (): Promise<Result<ProfessionalRow[]>> =>
      attempt(async () => {
        const { data, error } = await client.from('professionals').select('*').order('last_name')
        return error ? fail(error) : done(data)
      }),

    invite: (invitation: Invitation): Promise<Result<ProfessionalRow>> =>
      attempt(async () => {
        const { data, error } = await client.functions.invoke<{ professional: ProfessionalRow }>('invite-professional', { body: invitation })
        if (error) {
          const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
          return { ok: false, error: INVITE_ERRORS[body?.error] ?? (error instanceof FunctionsHttpError ? 'unknown' : 'network') }
        }
        return done(data!.professional)
      }),

    becomeProfessional: (input: OwnProfessional): Promise<Result<ProfessionalRow>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_become_professional', {
          p_first_name: input.first_name,
          p_last_name: input.last_name,
          p_specialty: input.specialty,
          p_country: input.country,
          p_license_number: input.license_number || null,
          p_facility_name: input.facility_name || null,
          p_city: input.city || null,
          p_phone: input.phone || null,
          p_offers_teleconsultation: input.offers_teleconsultation,
          p_offers_appointment: input.offers_appointment,
        })
        return error ? fail(error) : done(data)
      }),

    recordPayment: (consultationId: string, input: PaymentInput): Promise<Result<ConsultationRow>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_record_payment', {
          p_consultation_id: consultationId,
          p_status: 'paid',
          p_amount: input.amount,
          p_currency: input.currency,
          p_method: input.method,
          p_reference: input.reference.trim() || null,
          p_paid_at: input.paidOn ? new Date(`${input.paidOn}T12:00:00`).toISOString() : null,
        })
        return error ? fail(error) : done(data)
      }),

    refund: (consultationId: string, reference: string): Promise<Result<ConsultationRow>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_record_payment', {
          p_consultation_id: consultationId,
          p_status: 'refunded',
          p_reference: reference.trim() || null,
        })
        if (error && (error as { code?: string }).code === 'PP409') return { ok: false, error: 'payout_in_progress' }
        return error ? fail(error) : done(data)
      }),

    update: (id: string, patch: ProfessionalPatch): Promise<Result<ProfessionalRow>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_update_professional', {
          p_id: id,
          p_is_active: patch.isActive ?? null,
          p_verified: patch.verified ?? null,
          p_specialty: patch.specialty ?? null,
          p_country: patch.country ?? null,
          p_license_number: patch.licenseNumber ?? null,
        })
        return error ? fail(error) : done(data)
      }),
  }
}
