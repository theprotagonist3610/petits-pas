import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConsultationEventRow,
  ConsultationRow,
  ConsultationStatus,
  ConsultationType,
  CountryCode,
  Currency,
  Database,
  PaymentStatus,
  RequestableSpecialty,
  Sex,
} from '@petits-pas/shared/database.types'
import { attempt, done, fail, type Result } from './errors'

/** Demande vue par le professionnel : jamais de prénom ni de date de naissance d'enfant. */
export interface ProConsultation {
  id: string
  type: ConsultationType
  status: ConsultationStatus
  requestedSpecialty?: RequestableSpecialty
  /** Présent : la demande concerne un enfant ; absent : le parent lui-même. */
  forChild: boolean
  childAgeMonths?: number
  childSex?: Sex
  reason: string
  preferredAt?: string
  scheduledAt?: string
  professionalNotes?: string
  country?: CountryCode
  professionalId?: string
  paymentStatus: PaymentStatus
  /** Montant réellement payé par le parent (base de votre gain). */
  paidAmount?: number
  paidCurrency?: Currency
  createdAt: string
}

export interface ParentContact {
  firstName: string
  lastName: string
  phone?: string
}

export interface ConsultationEvent {
  event: ConsultationEventRow['event']
  actorRole: ConsultationEventRow['actor_role']
  createdAt: string
}

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined

/** Colonnes lues par le professionnel : ni le téléphone ni l'identité du parent (voir `contact`). */
type ProRow = Pick<
  ConsultationRow,
  | 'id'
  | 'type'
  | 'status'
  | 'requested_specialty'
  | 'child_ref'
  | 'child_age_months'
  | 'child_sex'
  | 'reason'
  | 'preferred_at'
  | 'scheduled_at'
  | 'professional_notes'
  | 'country'
  | 'professional_id'
  | 'payment_status'
  | 'paid_amount'
  | 'paid_currency'
  | 'created_at'
>

export function toProConsultation(row: ProRow): ProConsultation {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requestedSpecialty: orUndefined(row.requested_specialty),
    forChild: row.child_ref !== null,
    childAgeMonths: orUndefined(row.child_age_months),
    childSex: orUndefined(row.child_sex),
    reason: row.reason,
    preferredAt: orUndefined(row.preferred_at),
    scheduledAt: orUndefined(row.scheduled_at),
    professionalNotes: orUndefined(row.professional_notes),
    country: orUndefined(row.country),
    professionalId: orUndefined(row.professional_id),
    paymentStatus: row.payment_status,
    paidAmount: orUndefined(row.paid_amount),
    paidCurrency: orUndefined(row.paid_currency),
    createdAt: row.created_at,
  }
}

const COLUMNS =
  'id, type, status, requested_specialty, child_ref, child_age_months, child_sex, reason, preferred_at, scheduled_at, professional_notes, country, professional_id, payment_status, paid_amount, paid_currency, created_at'

export interface ProConsultationService {
  /** Demandes libres de sa spécialité et de son pays (filtrées par la base), la plus ancienne en premier. */
  listQueue(): Promise<Result<ProConsultation[]>>
  /** Ses consultations (confirmées, terminées, annulées). */
  listMine(professionalId: string): Promise<Result<ProConsultation[]>>
  get(id: string): Promise<Result<ProConsultation | null>>
  /** Prendre et confirmer en une seule opération (un seul professionnel peut réussir). */
  claim(id: string, scheduledAt: Date, note?: string): Promise<Result<ProConsultation>>
  complete(id: string, note?: string): Promise<Result<ProConsultation>>
  /** Annulation par le professionnel : le motif est communiqué au parent. */
  cancel(id: string, reason: string): Promise<Result<ProConsultation>>
  contact(id: string): Promise<Result<ParentContact | null>>
  events(id: string): Promise<Result<ConsultationEvent[]>>
}

export function createProConsultationService(client: SupabaseClient<Database>): ProConsultationService {
  const update = (id: string, patch: Database['public']['Tables']['consultations']['Update']) =>
    attempt(async () => {
      const { data, error } = await client.from('consultations').update(patch).eq('id', id).select(COLUMNS).single()
      return error ? fail(error) : done(toProConsultation(data as ProRow))
    })

  return {
    listQueue: () =>
      attempt(async () => {
        const { data, error } = await client
          .from('consultations')
          .select(COLUMNS)
          .is('professional_id', null)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
        return error ? fail(error) : done((data as ProRow[]).map(toProConsultation))
      }),

    listMine: (professionalId) =>
      attempt(async () => {
        const { data, error } = await client
          .from('consultations')
          .select(COLUMNS)
          .eq('professional_id', professionalId)
          .order('scheduled_at', { ascending: true, nullsFirst: false })
        return error ? fail(error) : done((data as ProRow[]).map(toProConsultation))
      }),

    get: (id) =>
      attempt(async () => {
        const { data, error } = await client.from('consultations').select(COLUMNS).eq('id', id).maybeSingle()
        return error ? fail(error) : done(data ? toProConsultation(data as ProRow) : null)
      }),

    claim: (id, scheduledAt, note) =>
      attempt(async () => {
        const { data, error } = await client.rpc('claim_consultation', {
          p_id: id,
          p_scheduled_at: scheduledAt.toISOString(),
          p_note: note?.trim() || null,
        })
        return error ? fail(error) : done(toProConsultation(data))
      }),

    complete: (id, note) => update(id, note?.trim() ? { status: 'completed', professional_notes: note.trim() } : { status: 'completed' }),

    cancel: (id, reason) => update(id, { status: 'cancelled', professional_notes: reason.trim() }),

    contact: (id) =>
      attempt(async () => {
        const { data, error } = await client.rpc('consultation_contact', { p_id: id })
        if (error) return fail(error)
        const row = data[0]
        return done(row ? { firstName: row.first_name, lastName: row.last_name, phone: orUndefined(row.phone) } : null)
      }),

    events: (id) =>
      attempt(async () => {
        const { data, error } = await client
          .from('consultation_events')
          .select('event, actor_role, created_at')
          .eq('consultation_id', id)
          .order('created_at', { ascending: true })
        if (error) return fail(error)
        return done(data.map((e) => ({ event: e.event, actorRole: e.actor_role, createdAt: e.created_at })))
      }),
  }
}

/** Consultations du jour et à venir, triées par horaire. */
export function upcoming(consultations: ProConsultation[], now: Date = new Date()): ProConsultation[] {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  return consultations
    .filter((c) => c.status === 'confirmed' && c.scheduledAt && new Date(c.scheduledAt) >= startOfDay)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
}

/** Regroupe des consultations par jour (clé AAAA-MM-JJ, heure locale). */
export function groupByDay(consultations: ProConsultation[]): [string, ProConsultation[]][] {
  const groups = new Map<string, ProConsultation[]>()
  for (const c of consultations) {
    const d = new Date(c.scheduledAt ?? c.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.entries()]
}

/** Horaire proposé par défaut : le moment souhaité par le parent s'il est à venir, sinon la prochaine heure pleine. */
export function defaultSlot(c: Pick<ProConsultation, 'preferredAt'>, now: Date = new Date()): Date {
  if (c.preferredAt && new Date(c.preferredAt) > now) return new Date(c.preferredAt)
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}
