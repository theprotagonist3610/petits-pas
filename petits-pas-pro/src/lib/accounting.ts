import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConsultationType,
  Currency,
  Database,
  PayoutMethod,
  PayoutRequestRow,
  ProfessionalEarningRow,
  Specialty,
} from '@petits-pas/shared/database.types'
import { attempt, done, fail, toProErrorCode, type ProErrorCode, type Result } from './errors'

/** Gain d'une consultation terminée, avec ce qu'il faut pour l'afficher (jamais le motif ni l'enfant). */
export interface Earning extends ProfessionalEarningRow {
  consultation: { type: ConsultationType; requested_specialty: Specialty | null; scheduled_at: string | null } | null
}

export interface PayoutRequest extends PayoutRequestRow {
  professional?: { first_name: string; last_name: string } | null
}

export interface AccountSummary {
  /** Gains pas encore demandés. */
  available: number
  /** Gains dans une demande en attente de paiement. */
  pending: number
  /** Déjà versé. */
  paid: number
}

/** Totaux par devise (une devise en pratique ; plusieurs si l'administrateur en a changé). */
export function summarize(earnings: ProfessionalEarningRow[], payouts: PayoutRequestRow[]): Map<Currency, AccountSummary> {
  const status = new Map(payouts.map((p) => [p.id, p.status]))
  const totals = new Map<Currency, AccountSummary>()
  for (const e of earnings) {
    const t = totals.get(e.currency) ?? { available: 0, pending: 0, paid: 0 }
    const s = e.payout_id ? status.get(e.payout_id) : undefined
    // Gain d'une demande refusée : redevenu disponible (la base a retiré son lien).
    if (!e.payout_id || s === 'rejected') t.available += e.net_amount
    else if (s === 'paid') t.paid += e.net_amount
    else t.pending += e.net_amount
    totals.set(e.currency, t)
  }
  return totals
}

export const PAYOUT_METHODS: Record<PayoutMethod, { label: string; detailsLabel: string; placeholder: string }> = {
  mobile_money: { label: 'Mobile Money', detailsLabel: 'Opérateur et numéro', placeholder: 'MTN MoMo · +229 01 97 00 00 00' },
  bank_transfer: { label: 'Virement bancaire', detailsLabel: 'Banque, titulaire et IBAN / RIB', placeholder: 'Banque, titulaire du compte, numéro de compte' },
}

/** Dans la comptabilité, PP409 veut dire « demande déjà en cours / déjà traitée », pas « prise par un confrère ». */
const accountingError = (error: unknown): ProErrorCode => {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'PP404') return 'nothing_to_pay'
  if (code === 'PP409') return 'payout_in_progress'
  return toProErrorCode(error)
}

export function createAccountingService(client: SupabaseClient<Database>) {
  return {
    earnings: (professionalId: string): Promise<Result<Earning[]>> =>
      attempt(async () => {
        const { data, error } = await client
          .from('professional_earnings')
          .select('*, consultation:consultations(type, requested_specialty, scheduled_at)')
          .eq('professional_id', professionalId)
          .order('earned_at', { ascending: false })
        return error ? fail(error) : done(data as unknown as Earning[])
      }),

    payouts: (professionalId?: string): Promise<Result<PayoutRequest[]>> =>
      attempt(async () => {
        let query = client.from('payout_requests').select('*, professional:professionals(first_name, last_name)').order('requested_at', { ascending: false })
        if (professionalId) query = query.eq('professional_id', professionalId)
        const { data, error } = await query
        return error ? fail(error) : done(data as unknown as PayoutRequest[])
      }),

    /** Demande le paiement de tous les gains disponibles (une demande par devise). */
    requestPayout: (method: PayoutMethod, details: string): Promise<Result<PayoutRequestRow[]>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('request_payout', { p_method: method, p_details: details.trim() })
        return error ? { ok: false, error: accountingError(error) } : done(data)
      }),

    /** Administrateur : versement effectué (référence) ou refus (motif ; les gains redeviennent disponibles). */
    process: (id: string, paid: boolean, text: string): Promise<Result<PayoutRequestRow>> =>
      attempt(async () => {
        const { data, error } = await client.rpc('admin_process_payout', {
          p_id: id,
          p_paid: paid,
          p_reference: paid ? text.trim() || null : null,
          p_reason: paid ? null : text.trim(),
        })
        return error ? { ok: false, error: accountingError(error) } : done(data)
      }),
  }
}
