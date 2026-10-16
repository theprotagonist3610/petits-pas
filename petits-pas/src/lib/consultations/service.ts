import type { SupabaseClient } from '@supabase/supabase-js'
import type { Child, CountryCode, Sex } from '@/data/types'
import { chronologicalAge } from '@/lib/age'
import { isValidPhone } from '@petits-pas/shared/validation'
import { toAuthErrorCode } from '@petits-pas/shared/errors'
import type { AuthResult } from '@/lib/auth/types'
import type {
  ConsultationRow,
  ConsultationStatus,
  ConsultationType,
  Currency,
  Database,
  PaymentStatus,
  ProfessionalRow,
  RequestableSpecialty,
  Specialty,
} from '@petits-pas/shared/database.types'

export type { ConsultationStatus, ConsultationType, RequestableSpecialty, Specialty }

/*
 * Données d'enfants : minimisation (protection des données personnelles).
 * Le prénom, la date de naissance et l'identifiant de l'enfant ne quittent jamais le téléphone.
 * Une demande ne transmet que son âge en mois, son sexe et une empreinte (childRef) qui permet
 * d'appliquer la règle « un spécialiste à la fois par enfant » sans révéler qui il est.
 */


export const REASON_MAX_LENGTH = 2000

/** Demande de consultation telle que l'affiche l'application. */
export interface Consultation {
  id: string
  type: ConsultationType
  status: ConsultationStatus
  /** Spécialiste demandé (absent pour les demandes antérieures à ce choix). */
  requestedSpecialty?: RequestableSpecialty
  /** Empreinte de l'enfant ; absent : demande pour le parent lui-même. */
  childRef?: string
  /** Âge de l'enfant en mois au moment de la demande. */
  childAgeMonths?: number
  childSex?: Sex
  reason: string
  /** Créneau souhaité par le parent (ISO). */
  preferredAt?: string
  /** Créneau fixé par le professionnel à la confirmation (ISO). */
  scheduledAt?: string
  contactPhone?: string
  professionalNotes?: string
  professional?: { firstName: string; lastName: string; specialty: Specialty; facilityName?: string; city?: string; avatarPath?: string }
  paymentStatus: PaymentStatus
  /** Montant réellement payé (peut différer du tarif). */
  paidAmount?: number
  paidCurrency?: Currency
  createdAt: string
}

/** Enfant concerné par une demande : seules l'empreinte, l'âge et le sexe en sont tirés. */
export interface RequestChild extends Pick<Child, 'birthDate' | 'sex'> {
  /** Empreinte calculée par `childRefFor`. */
  ref: string
}

/** Saisie du formulaire « Nouvelle demande ». */
export interface ConsultationRequest {
  type: ConsultationType | undefined
  specialty: RequestableSpecialty | undefined
  reason: string
  /** Absent : la demande concerne le parent lui-même. */
  child?: RequestChild
  /** Valeur d'un champ datetime-local (heure du téléphone), facultative. */
  preferredAt?: string
  contactPhone: string
  /** Case « J'accepte que ma demande soit transmise à un professionnel de santé ». */
  consent: boolean
  /** Pays choisi dans les réglages : seuls les professionnels de ce pays verront la demande. */
  country?: CountryCode
}

type ConsultationValidationCode =
  | 'required'
  | 'too_long'
  | 'invalid_phone'
  | 'invalid_date'
  | 'already_requested'
  | 'not_allowed'
  | 'consent_required'

/**
 * Empreinte d'un enfant : SHA-256 de « compte:identifiant local ».
 * Stable (même enfant, même empreinte) mais illisible côté serveur, et différente d'un compte à l'autre.
 */
export async function childRefFor(parentId: string, childId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${parentId}:${childId}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Âge en mois au moment de la demande (seule information d'âge transmise). */
export function ageInMonths(birthDate: string, on?: string): number {
  return Math.max(0, Math.min(240, chronologicalAge(birthDate, on).months))
}

/** Demande en cours : elle occupe le spécialiste pour cette personne. */
export const isActive = (c: Pick<Consultation, 'status'>) => c.status === 'pending' || c.status === 'confirmed'


/**
 * Spécialistes déjà demandés (demande en cours) pour cet enfant, ou pour le parent si `childRef` est absent.
 * Règle : une seule demande active par personne et par spécialiste.
 */
export function busySpecialties(consultations: Consultation[], childRef: string | undefined): Set<RequestableSpecialty> {
  return new Set(
    consultations
      .filter((c) => isActive(c) && c.requestedSpecialty && c.childRef === childRef)
      .map((c) => c.requestedSpecialty!),
  )
}

/** Une consultation confirmée et pas encore payée peut être payée (paiement en ligne à venir). */
export const canPay = (c: Pick<Consultation, 'status' | 'paymentStatus'>) => c.status === 'confirmed' && c.paymentStatus === 'unpaid'
/** Le parent peut annuler tant que la consultation n'a pas eu lieu. */
export const canCancel = (c: Consultation) => c.status === 'pending' || c.status === 'confirmed'

/**
 * `existing` : demandes du parent, pour refuser un doublon avant même d'appeler la base.
 * `allowed` : spécialistes proposés pour cette personne (paramètres de la plateforme), si connus.
 */
export function validateConsultationRequest(
  input: ConsultationRequest,
  now: Date = new Date(),
  existing: Consultation[] = [],
  allowed?: RequestableSpecialty[],
): Partial<Record<keyof ConsultationRequest, ConsultationValidationCode>> {
  const errors: Partial<Record<keyof ConsultationRequest, ConsultationValidationCode>> = {}
  const childRef = input.child?.ref
  if (!input.type) errors.type = 'required'
  if (!input.specialty) errors.specialty = 'required'
  else if (allowed && !allowed.includes(input.specialty)) errors.specialty = 'not_allowed'
  else if (busySpecialties(existing, childRef).has(input.specialty)) errors.specialty = 'already_requested'
  if (!input.reason.trim()) errors.reason = 'required'
  else if (input.reason.trim().length > REASON_MAX_LENGTH) errors.reason = 'too_long'
  if (!input.contactPhone.trim()) errors.contactPhone = 'required'
  else if (!isValidPhone(input.contactPhone.trim())) errors.contactPhone = 'invalid_phone'
  if (input.preferredAt) {
    const when = new Date(input.preferredAt)
    if (Number.isNaN(when.getTime()) || when < now) errors.preferredAt = 'invalid_date'
  }
  if (!input.consent) errors.consent = 'consent_required'
  return errors
}

type Row = ConsultationRow & {
  professional: Pick<ProfessionalRow, 'first_name' | 'last_name' | 'specialty' | 'facility_name' | 'city' | 'avatar_path'> | null
}

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined

export function toConsultation(row: Row): Consultation {
  const pro = row.professional
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    requestedSpecialty: orUndefined(row.requested_specialty),
    childRef: orUndefined(row.child_ref),
    childAgeMonths: orUndefined(row.child_age_months),
    childSex: orUndefined(row.child_sex),
    reason: row.reason,
    preferredAt: orUndefined(row.preferred_at),
    scheduledAt: orUndefined(row.scheduled_at),
    contactPhone: orUndefined(row.contact_phone),
    professionalNotes: orUndefined(row.professional_notes),
    professional: pro
      ? {
          firstName: pro.first_name,
          lastName: pro.last_name,
          specialty: pro.specialty,
          facilityName: orUndefined(pro.facility_name),
          city: orUndefined(pro.city),
          avatarPath: orUndefined(pro.avatar_path),
        }
      : undefined,
    paymentStatus: row.payment_status,
    paidAmount: orUndefined(row.paid_amount),
    paidCurrency: orUndefined(row.paid_currency),
    createdAt: row.created_at,
  }
}

const SELECT = '*, professional:professionals(first_name, last_name, specialty, facility_name, city, avatar_path)'

export interface ConsultationService {
  /** Demandes du parent, de la plus récente à la plus ancienne. */
  listMine(parentId: string): Promise<AuthResult<Consultation[]>>
  /** Enregistre la demande, avec le statut « en attente ». */
  create(parentId: string, request: ConsultationRequest): Promise<AuthResult<Consultation>>
  cancel(id: string): Promise<AuthResult<Consultation>>
}

async function attempt<T>(run: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
  try {
    return await run()
  } catch (error) {
    return { ok: false, error: toAuthErrorCode(error) }
  }
}

export function createConsultationService(client: SupabaseClient<Database>, now: () => Date = () => new Date()): ConsultationService {
  return {
    listMine: (parentId) =>
      attempt(async () => {
        const { data, error } = await client
          .from('consultations')
          .select(SELECT)
          .eq('parent_id', parentId)
          .order('created_at', { ascending: false })
        if (error) return { ok: false, error: toAuthErrorCode(error) }
        return { ok: true, data: (data as unknown as Row[]).map(toConsultation) }
      }),

    create: (parentId, request) =>
      attempt(async () => {
        // Sans consentement, rien n'est transmis (la base le refuserait aussi).
        if (!request.consent) return { ok: false, error: 'invalid_data' }
        const at = now()
        const { data, error } = await client
          .from('consultations')
          .insert({
            parent_id: parentId,
            type: request.type!,
            requested_specialty: request.specialty!,
            reason: request.reason.trim(),
            child_ref: request.child?.ref,
            child_age_months: request.child ? ageInMonths(request.child.birthDate, at.toISOString().slice(0, 10)) : undefined,
            child_sex: request.child?.sex,
            preferred_at: request.preferredAt ? new Date(request.preferredAt).toISOString() : undefined,
            contact_phone: request.contactPhone.trim(),
            consent_at: at.toISOString(),
            country: request.country,
          })
          .select(SELECT)
          .single()
        // 23505 : l'index unique de la base refuse une deuxième demande active (même personne, même spécialiste).
        if (error) return { ok: false, error: error.code === '23505' ? 'duplicate_consultation' : toAuthErrorCode(error) }
        return { ok: true, data: toConsultation(data as unknown as Row) }
      }),

    cancel: (id) =>
      attempt(async () => {
        const { data, error } = await client.from('consultations').update({ status: 'cancelled' }).eq('id', id).select(SELECT).single()
        if (error) return { ok: false, error: toAuthErrorCode(error) }
        return { ok: true, data: toConsultation(data as unknown as Row) }
      }),
  }
}
