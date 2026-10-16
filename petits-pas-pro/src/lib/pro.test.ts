import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ProfessionalRow } from '@petits-pas/shared/database.types'
import { computeGate } from './gate'
import { createProConsultationService, defaultSlot, groupByDay, upcoming, type ProConsultation } from './consultations'
import { toProErrorCode } from './errors'
import { formatPatient } from './format'
import { checkAvatarFile, squareCrop } from './avatarImage'
import { resolveWorkspace } from '@/auth/workspace'

const pro = { id: 'p1', is_active: true, verified_at: '2026-10-01T00:00:00Z', avatar_path: 'u1/1.webp' } as ProfessionalRow

describe('accès à Petits Pas Pro', () => {
  const base = { signedIn: true, hasTotp: true, aal: 'aal2' as const, professional: pro, isAdmin: false }

  it('impose connexion, puis double authentification, puis compte vérifié', () => {
    expect(computeGate({ ...base, signedIn: false })).toBe('signed_out')
    expect(computeGate({ ...base, hasTotp: false, aal: 'aal1' })).toBe('mfa_enroll')
    expect(computeGate({ ...base, aal: 'aal1' })).toBe('mfa_challenge')
    expect(computeGate({ ...base, professional: undefined })).toBe('loading')
    expect(computeGate(base)).toBe('ready')
  })

  it('exige une photo de profil de tout professionnel, même administrateur, avant le reste', () => {
    expect(computeGate({ ...base, professional: { ...pro, avatar_path: null } })).toBe('photo_required')
    expect(computeGate({ ...base, professional: { ...pro, avatar_path: null, verified_at: null } })).toBe('photo_required')
    expect(computeGate({ ...base, professional: { ...pro, avatar_path: null }, isAdmin: true })).toBe('photo_required')
  })

  it('bloque un compte non vérifié, désactivé ou non professionnel ; laisse passer un administrateur', () => {
    expect(computeGate({ ...base, professional: { ...pro, verified_at: null } })).toBe('pending')
    expect(computeGate({ ...base, professional: { ...pro, is_active: false } })).toBe('pending')
    expect(computeGate({ ...base, professional: null })).toBe('not_professional')
    expect(computeGate({ ...base, professional: null, isAdmin: true })).toBe('ready')
  })
})

const row = {
  id: 'c1',
  type: 'teleconsultation',
  status: 'pending',
  requested_specialty: 'pediatrician',
  child_ref: 'a'.repeat(64),
  child_age_months: 7,
  child_sex: 'female',
  reason: 'Fièvre',
  preferred_at: null,
  scheduled_at: null,
  professional_notes: null,
  country: 'BJ',
  professional_id: null,
  created_at: '2026-10-16T08:00:00Z',
}

function fakeClient(rpcResult: unknown) {
  const rpc = vi.fn(async () => rpcResult)
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('consultations côté professionnel', () => {
  it('prend en charge et confirme en un seul appel atomique', async () => {
    const { client, rpc } = fakeClient({
      data: { ...row, status: 'confirmed', professional_id: 'p1', scheduled_at: '2026-10-20T10:00:00.000Z' },
      error: null,
    })
    const result = await createProConsultationService(client).claim('c1', new Date('2026-10-20T10:00:00.000Z'), '  Apportez le carnet  ')
    expect(rpc).toHaveBeenCalledWith('claim_consultation', { p_id: 'c1', p_scheduled_at: '2026-10-20T10:00:00.000Z', p_note: 'Apportez le carnet' })
    expect(result).toMatchObject({ ok: true, data: { status: 'confirmed', forChild: true, childAgeMonths: 7 } })
  })

  it('signale clairement une demande déjà prise par un confrère', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'PP409', message: 'déjà prise' } })
    expect(await createProConsultationService(client).claim('c1', new Date())).toEqual({ ok: false, error: 'already_taken' })
    expect(toProErrorCode({ code: 'PP401' })).toBe('not_operational')
    expect(toProErrorCode({ code: 'PP403' })).toBe('type_not_offered')
    expect(toProErrorCode({ code: 'PP422' })).toBe('past_date')
  })

  it('ne lit que le prénom, le nom et le téléphone du parent', async () => {
    const { client, rpc } = fakeClient({ data: [{ first_name: 'Afi', last_name: 'Adjovi', phone: '+229 01 97 00 00 00' }], error: null })
    expect(await createProConsultationService(client).contact('c1')).toEqual({
      ok: true,
      data: { firstName: 'Afi', lastName: 'Adjovi', phone: '+229 01 97 00 00 00' },
    })
    expect(rpc).toHaveBeenCalledWith('consultation_contact', { p_id: 'c1' })
  })
})

const make = (id: string, status: ProConsultation['status'], scheduledAt?: string): ProConsultation => ({
  id,
  type: 'appointment',
  status,
  forChild: true,
  reason: 'x',
  createdAt: '2026-10-01T00:00:00Z',
  scheduledAt,
  paymentStatus: 'unpaid',
})

describe('agenda', () => {
  it('garde les consultations confirmées du jour et à venir, triées par horaire', () => {
    const now = new Date(2026, 9, 16, 15, 0)
    const list = [
      make('demain', 'confirmed', new Date(2026, 9, 17, 9, 0).toISOString()),
      make('ce-matin', 'confirmed', new Date(2026, 9, 16, 9, 0).toISOString()),
      make('hier', 'confirmed', new Date(2026, 9, 15, 9, 0).toISOString()),
      make('terminee', 'completed', new Date(2026, 9, 17, 8, 0).toISOString()),
    ]
    expect(upcoming(list, now).map((c) => c.id)).toEqual(['ce-matin', 'demain'])
    expect(groupByDay(upcoming(list, now)).map(([day]) => day)).toEqual(['2026-10-16', '2026-10-17'])
  })

  it('propose le moment souhaité par le parent, sinon la prochaine heure pleine', () => {
    const now = new Date(2026, 9, 16, 14, 25)
    expect(defaultSlot({ preferredAt: new Date(2026, 9, 18, 10, 0).toISOString() }, now)).toEqual(new Date(2026, 9, 18, 10, 0))
    expect(defaultSlot({ preferredAt: new Date(2026, 9, 15, 10, 0).toISOString() }, now)).toEqual(new Date(2026, 9, 16, 15, 0))
    expect(defaultSlot({}, now)).toEqual(new Date(2026, 9, 16, 15, 0))
  })

  it('décrit le patient sans jamais l’identifier', () => {
    expect(formatPatient(true, 7, 'female')).toBe('Fille, 7 mois')
    expect(formatPatient(true, 27, 'male')).toBe('Garçon, 2 ans et 3 mois')
    expect(formatPatient(true, 36, 'male')).toBe('Garçon, 3 ans')
    expect(formatPatient(false, undefined, undefined)).toBe('Le parent')
  })
})

describe('photo de profil', () => {
  it('découpe un carré centré, en gardant le haut d’un portrait (le visage)', () => {
    expect(squareCrop(1200, 800)).toEqual({ sx: 200, sy: 0, side: 800 })
    expect(squareCrop(800, 1200)).toEqual({ sx: 0, sy: 100, side: 800 })
    expect(squareCrop(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 })
  })

  it('refuse ce qui n’est pas une image, ou une image trop lourde', () => {
    expect(checkAvatarFile({ type: 'image/jpeg', size: 3_000_000 })).toBeUndefined()
    expect(checkAvatarFile({ type: 'application/pdf', size: 1000 })).toBe('not_image')
    expect(checkAvatarFile({ type: 'image/png', size: 20 * 1024 * 1024 })).toBe('too_large')
  })
})

describe('espace affiché (administrateur qui exerce aussi)', () => {
  it('garde le choix mémorisé quand les deux espaces sont possibles', () => {
    expect(resolveWorkspace(null, { isAdmin: true, canPractice: true })).toBe('pro')
    expect(resolveWorkspace('admin', { isAdmin: true, canPractice: true })).toBe('admin')
  })

  it('impose le seul espace disponible', () => {
    expect(resolveWorkspace('admin', { isAdmin: false, canPractice: true })).toBe('pro')
    expect(resolveWorkspace('pro', { isAdmin: true, canPractice: false })).toBe('admin')
  })
})
