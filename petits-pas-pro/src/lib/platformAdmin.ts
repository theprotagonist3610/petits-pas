import type { ConsultationType, Currency, Specialty, SpecialtyRow } from '@petits-pas/shared/database.types'
import { specialtyCode } from '@petits-pas/shared/platform'
import { supabase } from './supabase'
import { attempt, done, fail, type Result } from './errors'

/*
 * Modification des paramètres de la plateforme (réservée aux administrateurs : la base le vérifie).
 */

export function saveGeneralSettings(
  patch: { currency?: Currency; maintenance?: boolean; maintenance_message?: string | null; commission_percent?: number },
  adminId: string,
): Promise<Result> {
  return attempt(async () => {
    const { error } = await supabase.from('platform_settings').update({ ...patch, updated_by: adminId }).eq('id', true)
    return error ? fail(error) : done(undefined)
  })
}

export function updateSpecialty(code: Specialty, patch: Partial<Pick<SpecialtyRow, 'label' | 'description' | 'requestable' | 'for_parent' | 'sort_order'>>): Promise<Result> {
  return attempt(async () => {
    const { error } = await supabase.from('specialties').update(patch).eq('code', code)
    return error ? fail(error) : done(undefined)
  })
}

/** Nouvelle spécialité : son code est dérivé du libellé (« Gynécologue » → « gynecologue »). */
export function addSpecialty(label: string, description: string, sortOrder: number): Promise<Result<Specialty>> {
  return attempt(async () => {
    const code = specialtyCode(label)
    if (code.length < 2) return { ok: false, error: 'invalid_data' }
    const { error } = await supabase
      .from('specialties')
      .insert({ code, label: label.trim(), description: description.trim() || null, sort_order: sortOrder })
    return error ? fail(error) : done(code)
  })
}

export interface PriceInput {
  specialty: Specialty
  type: ConsultationType
  /** `null` : pas de tarif (gratuit ou non défini). */
  amount: number | null
}

/** Enregistre la grille des tarifs : les montants saisis sont créés ou mis à jour, les champs vidés sont retirés. */
export function savePrices(prices: PriceInput[]): Promise<Result> {
  return attempt(async () => {
    const set = prices.filter((p) => p.amount !== null).map((p) => ({ specialty: p.specialty, type: p.type, amount: p.amount! }))
    if (set.length) {
      const { error } = await supabase.from('consultation_prices').upsert(set, { onConflict: 'specialty,type' })
      if (error) return fail(error)
    }
    for (const p of prices.filter((x) => x.amount === null)) {
      const { error } = await supabase.from('consultation_prices').delete().eq('specialty', p.specialty).eq('type', p.type)
      if (error) return fail(error)
    }
    return done(undefined)
  })
}

/** Lit un montant saisi (« 15 000 », « 12,50 ») ; `null` si vide, `NaN` si invalide. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s  ]/g, '').replace(',', '.')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : NaN
}
