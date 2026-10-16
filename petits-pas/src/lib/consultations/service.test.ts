import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@petits-pas/shared/database.types'
import {
  ageInMonths,
  busySpecialties,
  canCancel,
  canPay,
  childRefFor,
  createConsultationService,
  validateConsultationRequest,
  type Consultation,
  type ConsultationRequest,
} from './service'

const REF_AWA = 'a'.repeat(64)
const REF_KOFFI = 'b'.repeat(64)

const row = {
  id: 'c1',
  parent_id: 'u1',
  professional_id: null,
  type: 'teleconsultation',
  status: 'pending',
  requested_specialty: 'pediatric_neurologist',
  child_ref: REF_AWA,
  child_age_months: 7,
  child_sex: 'female',
  reason: 'Fièvre depuis deux jours',
  preferred_at: null,
  scheduled_at: null,
  contact_phone: '+229 01 97 00 00 00',
  professional_notes: null,
  cancelled_at: null,
  consent_at: '2026-10-16T08:00:00.000Z',
  country: 'BJ',
  payment_status: 'unpaid',
  paid_amount: null,
  paid_currency: null,
  created_at: '2026-10-16T08:00:00Z',
  updated_at: '2026-10-16T08:00:00Z',
  professional: null,
}

function fakeClient(result: unknown = { data: row, error: null }) {
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [row], error: null })),
    single: vi.fn(async () => result),
  }
  return { client: { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>, query }
}

const NOW = new Date('2026-10-16T08:00:00.000Z')

const request: ConsultationRequest = {
  type: 'teleconsultation',
  specialty: 'pediatric_neurologist',
  reason: '  Fièvre depuis deux jours  ',
  child: { ref: REF_AWA, birthDate: '2026-03-01', sex: 'female' },
  contactPhone: ' +229 01 97 00 00 00 ',
  consent: true,
  country: 'BJ',
}

const make = (
  childRef: string | undefined,
  requestedSpecialty: Consultation['requestedSpecialty'],
  status: Consultation['status'] = 'pending',
  paymentStatus: Consultation['paymentStatus'] = 'unpaid',
): Consultation => ({ id: crypto.randomUUID(), type: 'appointment', status, reason: 'x', createdAt: '', childRef, requestedSpecialty, paymentStatus })

describe('demandes de consultation', () => {
  it('ne transmet ni le prénom ni la date de naissance : seulement âge en mois, sexe, empreinte et consentement', async () => {
    const { client, query } = fakeClient()
    const result = await createConsultationService(client, () => NOW).create('u1', request)
    expect(query.insert).toHaveBeenCalledWith({
      parent_id: 'u1',
      type: 'teleconsultation',
      requested_specialty: 'pediatric_neurologist',
      reason: 'Fièvre depuis deux jours',
      child_ref: REF_AWA,
      child_age_months: 7,
      child_sex: 'female',
      preferred_at: undefined,
      contact_phone: '+229 01 97 00 00 00',
      consent_at: '2026-10-16T08:00:00.000Z',
      country: 'BJ',
    })
    const sent = JSON.stringify((query.insert.mock.calls as unknown[][])[0][0])
    expect(sent).not.toContain('2026-03-01')
    expect(sent).not.toMatch(/first_name|birth/)
    expect(result).toMatchObject({ ok: true, data: { id: 'c1', childRef: REF_AWA, childAgeMonths: 7, childSex: 'female' } })
  })

  it('n’envoie rien sans consentement', async () => {
    const { client, query } = fakeClient()
    expect(await createConsultationService(client).create('u1', { ...request, consent: false })).toEqual({ ok: false, error: 'invalid_data' })
    expect(query.insert).not.toHaveBeenCalled()
    expect(validateConsultationRequest({ ...request, consent: false }, NOW)).toEqual({ consent: 'consent_required' })
  })

  it('calcule l’empreinte de l’enfant comme la migration SQL : stable, propre au compte, illisible', async () => {
    const ref = await childRefFor('u1', 'enfant-awa')
    expect(ref).toBe(createHash('sha256').update('u1:enfant-awa').digest('hex'))
    expect(await childRefFor('u1', 'enfant-awa')).toBe(ref)
    expect(await childRefFor('u2', 'enfant-awa')).not.toBe(ref)
    expect(ref).not.toContain('awa')
  })

  it('donne l’âge en mois à la date de la demande', () => {
    expect(ageInMonths('2026-03-01', '2026-10-16')).toBe(7)
    expect(ageInMonths('2026-03-01', '2026-03-20')).toBe(0)
  })

  it('liste les demandes du parent, de la plus récente à la plus ancienne', async () => {
    const { client, query } = fakeClient()
    const result = await createConsultationService(client).listMine('u1')
    expect(query.eq).toHaveBeenCalledWith('parent_id', 'u1')
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.ok && result.data.map((c) => c.id)).toEqual(['c1'])
  })

  it('traduit un refus de la base (motif vide, par exemple)', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23514', message: 'check constraint' } })
    expect(await createConsultationService(client).create('u1', request)).toEqual({ ok: false, error: 'invalid_data' })
  })

  it('valide le formulaire', () => {
    const now = new Date('2026-10-16T10:00:00')
    expect(validateConsultationRequest(request, now)).toEqual({})
    expect(
      validateConsultationRequest(
        { type: undefined, specialty: undefined, reason: '   ', contactPhone: '12', preferredAt: '2026-10-15T09:00', consent: true },
        now,
      ),
    ).toEqual({ type: 'required', specialty: 'required', reason: 'required', contactPhone: 'invalid_phone', preferredAt: 'invalid_date' })
    expect(validateConsultationRequest({ ...request, reason: 'a'.repeat(2001) }, now)).toEqual({ reason: 'too_long' })
  })

  it('n’affiche « Payer » que pour une consultation confirmée', () => {
    const statuses: Consultation['status'][] = ['pending', 'confirmed', 'cancelled', 'completed']
    expect(statuses.map((s) => canPay(make(undefined, undefined, s)))).toEqual([false, true, false, false])
    // Déjà payée : plus de bouton « Payer ».
    expect(canPay(make(undefined, undefined, 'confirmed', 'paid'))).toBe(false)
    expect(statuses.map((s) => canCancel(make(undefined, undefined, s)))).toEqual([true, true, false, false])
  })

  it('une seule demande active par enfant et par spécialiste : 3 au plus par enfant', () => {
    const now = new Date('2026-10-16T10:00:00')
    const existing = [
      make(REF_AWA, 'pediatrician'),
      make(REF_AWA, 'general_practitioner', 'confirmed'),
      make(REF_AWA, 'pediatric_neurologist', 'cancelled'),
      make(REF_KOFFI, 'pediatric_neurologist'),
      make(undefined, 'general_practitioner'),
    ]
    expect([...busySpecialties(existing, REF_AWA)].sort()).toEqual(['general_practitioner', 'pediatrician'])
    expect([...busySpecialties(existing, undefined)]).toEqual(['general_practitioner'])

    // Deuxième pédiatre pour Awa : refusé ; neuropédiatre (l'ancienne demande est annulée) : accepté.
    expect(validateConsultationRequest({ ...request, specialty: 'pediatrician' }, now, existing)).toEqual({ specialty: 'already_requested' })
    expect(validateConsultationRequest({ ...request, specialty: 'pediatric_neurologist' }, now, existing)).toEqual({})
    // Les demandes d'Awa ne bloquent pas Koffi.
    const koffi = { ...request, child: { ref: REF_KOFFI, birthDate: '2024-01-01', sex: 'male' as const } }
    expect(validateConsultationRequest({ ...koffi, specialty: 'pediatrician' }, now, existing)).toEqual({})
  })

  it('« Pour moi » : seulement les spécialistes autorisés par la plateforme, une demande active au plus', () => {
    const now = new Date('2026-10-16T10:00:00')
    const forMe = { ...request, child: undefined }
    // Liste fournie par les paramètres de la plateforme (spécialités « aussi pour le parent »).
    const forParent = ['general_practitioner']
    expect(validateConsultationRequest({ ...forMe, specialty: 'pediatrician' }, now, [], forParent)).toEqual({ specialty: 'not_allowed' })
    expect(validateConsultationRequest({ ...forMe, specialty: 'general_practitioner' }, now, [], forParent)).toEqual({})
    const mine = make(undefined, 'general_practitioner', 'confirmed')
    expect(validateConsultationRequest({ ...forMe, specialty: 'general_practitioner' }, now, [mine])).toEqual({ specialty: 'already_requested' })
  })

  it('traduit le refus de doublon de la base en message clair', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    expect(await createConsultationService(client).create('u1', request)).toEqual({ ok: false, error: 'duplicate_consultation' })
  })
})
